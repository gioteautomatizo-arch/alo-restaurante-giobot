/**
 * Candidato de lectura privada de negocios. Inactivo por defecto en servidor:
 * no sustituir la consulta directa de membresías sin un corte coordinado de
 * cliente, reglas y revisión del inventario histórico.
 *
 * El Admin SDK omite reglas Firestore: toda autorización debe comprobarse aquí.
 */
import type { Express, Request, Response } from 'express';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ROLES = new Set([
  'SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'CASHIER',
  'WAITER', 'KITCHEN', 'EMPLOYEE', 'CLIENT',
]);
const MAX_MEMBERSHIPS = 100;
const safeBusinessId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(id);
const fail = (res: Response, status: number, error: string) =>
  res.status(status).json({ error });

function services() {
  if (!getApps().length) {
    const serviceJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const credential = serviceJson ? cert(JSON.parse(serviceJson)) : applicationDefault();
    initializeApp({ credential, projectId: process.env.FIREBASE_PROJECT_ID || undefined });
  }
  return { db: getFirestore(), adminAuth: getAuth() };
}

async function authenticated(req: Request): Promise<string | null> {
  const bearer = /^Bearer ([-A-Za-z0-9_.]+)$/.exec(req.header('authorization') || '');
  if (!bearer) return null;
  // Verificar revocación: un token antiguo no autoriza una lista privada.
  const decoded = await services().adminAuth.verifyIdToken(bearer[1], true);
  return decoded.uid || null;
}

export function registerBusinessDirectoryApi(app: Express): void {
  app.get('/api/businesses/mine', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');
    if (process.env.ENABLE_SECURE_BUSINESS_LIST !== 'true') {
      return fail(res, 404, 'Listado seguro no activado.');
    }
    let uid: string | null;
    try {
      uid = await authenticated(req);
    } catch {
      return fail(res, 401, 'Sesión inválida. Vuelve a iniciar sesión.');
    }
    if (!uid) return fail(res, 401, 'Inicia sesión para consultar tus negocios.');

    try {
      const { db } = services();
      // Solo se consulta en servidor. Jamás devolver documentos de membresía
      // al navegador, ni siquiera los corruptos que satisfagan esta consulta.
      const memberships = await db.collection('businessMemberships')
        .where('userId', '==', uid).where('active', '==', true)
        .limit(MAX_MEMBERSHIPS + 1).get();
      if (memberships.size > MAX_MEMBERSHIPS) {
        return fail(res, 409, 'No pudimos validar todas las membresías de tu cuenta.');
      }
      const businessIds: string[] = [];
      const seen = new Set<string>();
      for (const snap of memberships.docs) {
        const data = snap.data();
        const businessId = data.restaurantId;
        if (!safeBusinessId(businessId) ||
            snap.id !== businessId + '_' + uid ||
            data.userId !== uid || data.active !== true ||
            !ROLES.has(data.role) || seen.has(businessId)) {
          // Fallar cerrado, no devolver lista parcial ni datos de otros tenants.
          return fail(res, 409, 'Una membresía requiere revisión antes de cargar tus negocios.');
        }
        seen.add(businessId);
        businessIds.push(businessId);
      }
      if (!businessIds.length) return res.status(200).json({ businesses: [] });

      const roots = await db.getAll(...businessIds.map(id => db.collection('businesses').doc(id)));
      const businesses = [];
      for (let index = 0; index < roots.length; index++) {
        const snap = roots[index];
        const data = snap.data();
        if (!snap.exists || !data || data.restaurantId !== businessIds[index] ||
            !data.branding || typeof data.branding.restaurantName !== 'string' ||
            typeof data.branding.publicSlug !== 'string') {
          return fail(res, 409, 'No pudimos validar todos los negocios de tu cuenta.');
        }
        businesses.push(data);
      }
      return res.status(200).json({ businesses });
    } catch (error) {
      console.error('[business-directory/list] No se pudo completar la consulta privada:', error);
      return fail(res, 503, 'No pudimos cargar tus negocios. Intenta de nuevo.');
    }
  });
}
