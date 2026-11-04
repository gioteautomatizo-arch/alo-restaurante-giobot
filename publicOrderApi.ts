/**
 * Candidato HTTP de pedidos públicos. 404 por defecto.
 *
 * NO habilitar sin cortar la escritura pública directa en reglas, configurar
 * App Check en el cliente, límites distribuidos contra abuso y ensayar rollback.
 * Firebase Admin omite reglas: los importes SOLO salen del catálogo confiable.
 */
import type { Express, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { commitTrustedPublicOrder } from './publicOrderAuthorityTransaction';

type VerifiedApp = { appId: string };
export interface PublicOrderApiDependencies {
  firestore?: () => Firestore;
  verifyAppCheck?: (token: string) => Promise<VerifiedApp>;
}

const MAX_BODY_BYTES = 8_192;
const MAX_PER_INSTANCE_MINUTE = 25;
// No sustituye rate limiting compartido entre instancias: solo defensa local.
const instanceLimits = new Map<string, { count: number; until: number }>();

function allowLocally(appId: string, businessId: unknown, ip: string): boolean {
  if (typeof businessId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(businessId)) return false;
  const key = createHash('sha256').update(appId + '\0' + businessId + '\0' + ip).digest('hex');
  const now = Date.now();
  const found = instanceLimits.get(key);
  if (!found || found.until <= now) {
    if (instanceLimits.size >= 2000) instanceLimits.clear();
    instanceLimits.set(key, { count: 1, until: now + 60_000 });
    return true;
  }
  found.count++;
  return found.count <= MAX_PER_INSTANCE_MINUTE;
}

function services() {
  if (getApps().length === 0) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const credential = json ? cert(JSON.parse(json)) : applicationDefault();
    initializeApp({ credential, projectId: process.env.FIREBASE_PROJECT_ID || undefined });
  }
  return { db: getFirestore(), appCheck: getAppCheck() };
}
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

export function registerPublicOrderApi(app: Express, deps: PublicOrderApiDependencies = {}): void {
  app.post('/api/public-orders', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'X-Firebase-AppCheck');

    if (process.env.ENABLE_SECURE_PUBLIC_ORDER_API !== 'true') {
      return fail(res, 404, 'Pedidos por API no activados.');
    }
    const allowedAppIds = (process.env.PUBLIC_ORDER_ALLOWED_APP_IDS || '')
      .split(',').map(id => id.trim()).filter(Boolean);
    if (!allowedAppIds.length) {
      return fail(res, 503, 'Falta configurar la protección de la API.');
    }
    const token = req.header('X-Firebase-AppCheck') || '';
    if (token.length < 8 || token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      return fail(res, 401, 'Verificación de aplicación requerida.');
    }
    let verified: VerifiedApp;
    try {
      verified = await (deps.verifyAppCheck || ((v: string) => services().appCheck.verifyToken(v)))(token);
    } catch {
      return fail(res, 401, 'Verificación de aplicación inválida.');
    }
    if (!verified || typeof verified.appId !== 'string' || !allowedAppIds.includes(verified.appId)) {
      return fail(res, 403, 'Aplicación no autorizada.');
    }
    if (!req.is('application/json') || !req.body || typeof req.body !== 'object' ||
        Array.isArray(req.body) || Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_BODY_BYTES) {
      return fail(res, 400, 'Formato de pedido inválido.');
    }
    // El IP se usa solo para una barrera temporal local, nunca como identidad.
    // La beta pública aún exige cuota centralizada a prueba de múltiples instancias.
    if (!allowLocally(verified.appId, req.body.businessId, req.ip || req.socket.remoteAddress || 'unknown')) {
      return fail(res, 429, 'Demasiados intentos. Prueba más tarde.');
    }

    try {
      const result = await commitTrustedPublicOrder((deps.firestore || (() => services().db))(), req.body);
      // No devolver customerName, catálogo, credenciales ni documentos internos.
      return res.status(result.created ? 201 : 200).json({
        orderId: result.orderId, code: result.code,
        total: result.total, created: result.created, items: result.items,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      if (reason.startsWith('PEDIDO_NO_VALIDO:')) return fail(res, 400, 'Pedido no válido o catálogo no disponible.');
      if (reason.startsWith('CONFLICTO_INTENTO:') || reason.startsWith('CONFLICTO_ID:') ||
          reason.startsWith('INTEGRIDAD_PEDIDO:')) {
        return fail(res, 409, 'El pedido cambió. Revisa el intento antes de reenviar.');
      }
      // Nunca registrar la solicitud ni información personal del comprador.
      return fail(res, 503, 'No se pudo confirmar el pedido. Consulta su estado antes de reintentar.');
    }
  });
}
