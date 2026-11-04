/**
 * Métricas públicas resumidas y panel privado; deshabilitado por defecto.
 * La autenticación del voto y del Super Admin se verifica en el servidor.
 */
import type { Express, Request, Response } from 'express';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { ENGAGEMENT_BUSINESS_ID, countBusinessVisit, rateBusiness, publicBusinessRating,
  platformBusinessMetrics, requireEngagementSalt } from './businessEngagementService';

type VerifiedApp = { appId: string };
type VerifiedUser = { uid: string };
export interface EngagementApiDependencies {
  firestore?: () => Firestore;
  verifyAppCheck?: (token: string) => Promise<VerifiedApp>;
  verifyIdToken?: (token: string) => Promise<VerifiedUser>;
}
function resources() {
  if (!getApps().length) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    initializeApp({
      credential: json ? cert(JSON.parse(json)) : applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || undefined,
    });
  }
  return { db: getFirestore(), check: getAppCheck(), auth: getAuth() };
}
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const active = () => process.env.ENABLE_BUSINESS_ENGAGEMENT_API === 'true';
const allowedIds = () => (process.env.ENGAGEMENT_ALLOWED_APP_IDS || '')
  .split(',').map(v => v.trim()).filter(Boolean);

async function verifyApp(req: Request, deps: EngagementApiDependencies): Promise<string | null> {
  const token = req.header('X-Firebase-AppCheck') || '';
  if (token.length < 8 || token.length > 4096) return null;
  try {
    const verified = await (deps.verifyAppCheck || ((t: string) => resources().check.verifyToken(t)))(token);
    return verified?.appId && allowedIds().includes(verified.appId) ? verified.appId : null;
  } catch { return null; }
}
async function verifyUser(req: Request, deps: EngagementApiDependencies): Promise<string | null> {
  const match = /^Bearer ([A-Za-z0-9._~-]{20,8192})$/.exec(req.header('Authorization') || '');
  if (!match) return null;
  try {
    const verified = await (deps.verifyIdToken || ((t: string) => resources().auth.verifyIdToken(t)))(match[1]);
    return verified?.uid || null;
  } catch { return null; }
}

export function registerBusinessEngagementApi(app: Express, deps: EngagementApiDependencies = {}): void {
  app.use('/api/engagement', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!active()) return fail(res, 404, 'Métricas aún no activadas.');
    if (!allowedIds().length || !process.env.ENGAGEMENT_TRACKING_SINCE ||
        !process.env.ENGAGEMENT_HASH_SALT || process.env.ENGAGEMENT_HASH_SALT.length < 32)
      return fail(res, 503, 'Métricas sin configurar.');
    next();
  });

  app.post('/api/engagement/platform/metrics', async (req, res) => {
    const ids = req.body?.businessIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 ||
        !ids.every(v => typeof v === 'string' && ENGAGEMENT_BUSINESS_ID.test(v)))
      return fail(res, 400, 'Lista de negocios inválida.');
    const uid = await verifyUser(req, deps);
    if (!uid) return fail(res, 401, 'Acceso requerido.');
    try {
      const db = (deps.firestore || (() => resources().db))();
      const admin = await db.doc('platformAdmins/' + uid).get();
      if (!admin.exists || admin.data()?.active === false)
        return fail(res, 403, 'Solo administrador de plataforma.');
      const metrics = await platformBusinessMetrics(db, ids);
      return res.json({ trackingSince: process.env.ENGAGEMENT_TRACKING_SINCE, metrics });
    } catch {
      return fail(res, 503, 'No se pudieron leer las métricas.');
    }
  });

  app.get('/api/engagement/:businessId/rating', async (req, res) => {
    try {
      return res.json(await publicBusinessRating((deps.firestore || (() => resources().db))(), req.params.businessId));
    } catch (error) {
      return fail(res, error instanceof Error && error.message === 'NEGOCIO_NO_PUBLICADO' ? 404 : 503,
        'Calificaciones no disponibles.');
    }
  });

  app.post('/api/engagement/:businessId/visit', async (req, res) => {
    if (!ENGAGEMENT_BUSINESS_ID.test(req.params.businessId) || !req.body ||
        Object.keys(req.body).length !== 1 || typeof req.body.sessionId !== 'string' ||
        !/^[a-f0-9]{32}$/.test(req.body.sessionId))
      return fail(res, 400, 'Visita inválida.');
    const appId = await verifyApp(req, deps);
    if (!appId) return fail(res, 401, 'Verificación de aplicación requerida.');
    try {
      const result = await countBusinessVisit((deps.firestore || (() => resources().db))(), {
        businessId: req.params.businessId, sessionId: req.body.sessionId,
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        appId, salt: requireEngagementSalt(process.env.ENGAGEMENT_HASH_SALT),
      });
      return res.status(result.counted ? 201 : 200).json(result);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'NEGOCIO_NO_PUBLICADO') return fail(res, 404, 'Negocio no publicado.');
      if (code === 'LIMITE_VISITAS') return fail(res, 429, 'Demasiadas visitas.');
      return fail(res, 503, 'No se pudo medir la visita.');
    }
  });

  app.put('/api/engagement/:businessId/rating', async (req, res) => {
    if (!ENGAGEMENT_BUSINESS_ID.test(req.params.businessId) || !req.body ||
        Object.keys(req.body).length !== 1 || !Number.isInteger(req.body.stars) ||
        req.body.stars < 1 || req.body.stars > 5)
      return fail(res, 400, 'Elige de 1 a 5 estrellas.');
    if (!(await verifyApp(req, deps))) return fail(res, 401, 'Aplicación no verificada.');
    const uid = await verifyUser(req, deps);
    if (!uid) return fail(res, 401, 'Inicia sesión para calificar.');
    try {
      const result = await rateBusiness((deps.firestore || (() => resources().db))(), {
        businessId: req.params.businessId, uid, stars: req.body.stars,
        salt: requireEngagementSalt(process.env.ENGAGEMENT_HASH_SALT),
      });
      return res.json(result);
    } catch (error) {
      return fail(res, error instanceof Error && error.message === 'NEGOCIO_NO_PUBLICADO' ? 404 : 503,
        'No se pudo guardar la calificación.');
    }
  });
}
