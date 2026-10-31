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

// SUPER_ADMIN se acredita únicamente mediante platformAdmins/{uid};
// una membresía tenant con ese rol no concede acceso al directorio privado.
const ROLES = new Set([
  'OWNER', 'ADMIN', 'MANAGER', 'CASHIER',
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
      const ownerBusinessIds = new Set<string>();
      // Conservar el rol observado para detectar revocaciones o cambios de rol
      // durante la lectura de las raíces (Admin SDK ignora las reglas).
      const membershipsToRecheck: Array<{ id: string; businessId: string; role: string }> = [];
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
        membershipsToRecheck.push({ id: snap.id, businessId, role: data.role });
        if (data.role === 'OWNER') ownerBusinessIds.add(businessId);
      }
      if (!businessIds.length) return res.status(200).json({ businesses: [] });

      const roots = await db.getAll(...businessIds.map(id => db.collection('businesses').doc(id)));
      const businesses = [];
      // Un empleado puede consultar un tenant ajeno solo si la raíz apunta
      // a una membresía OWNER válida de ese tenant. Verificarla con Admin SDK
      // al final, sin exponerla al cliente ni consultar todos los usuarios.
      const foreignOwners: Array<{ businessId: string; ownerUid: string }> = [];
      for (let index = 0; index < roots.length; index++) {
        const snap = roots[index];
        const data = snap.data();
        if (!snap.exists || !data || data.restaurantId !== businessIds[index] ||
            !data.branding || typeof data.branding.restaurantName !== 'string' ||
            typeof data.branding.publicSlug !== 'string' ||
            (data.branding.logoUrl !== undefined && typeof data.branding.logoUrl !== 'string') ||
            // La raíz debe tener propietario verificable también para EMPLEADOS.
            // Si el propio UID figura como propietario, su rol debe ser OWNER:
            // no entregar una tarjeta con propiedad/rol contradictorios.
            typeof data.ownerUserId !== 'string' ||
            !data.ownerUserId.trim() || data.ownerUserId.includes('/') ||
            (ownerBusinessIds.has(businessIds[index])
              ? data.ownerUserId !== uid
              : data.ownerUserId === uid)) {
          return fail(res, 409, 'No pudimos validar todos los negocios de tu cuenta.');
        }
        if (!ownerBusinessIds.has(businessIds[index])) {
          foreignOwners.push({ businessId: businessIds[index], ownerUid: data.ownerUserId });
        }
        // El selector solo necesita ID, nombre, slug y logo. Nunca devolver la
        // raíz completa (instrucciones privadas de IA, configuración u otros
        // campos añadidos en el futuro), incluso a miembros de rol CLIENT.
        businesses.push({
          restaurantId: businessIds[index],
          branding: {
            restaurantName: data.branding.restaurantName,
            publicSlug: data.branding.publicSlug,
            ...(data.branding.logoUrl !== undefined ? { logoUrl: data.branding.logoUrl } : {}),
          },
        });
      }
      // Una revocación puede ocurrir después de la consulta inicial. Leer de
      // nuevo las fichas exactas antes de responder y fallar cerrado si alguna
      // desapareció, cambió de rol/tenant/UID o dejó de estar activa.
      // Esto reduce la ventana, pero NO es una transacción/snapshot atómico:
      // otra revocación posterior a esta lectura aún requiere reglas seguras.
      const currentMemberships = await db.getAll(...membershipsToRecheck.map(
        ({ id }) => db.collection('businessMemberships').doc(id)
      ));
      if (currentMemberships.length !== membershipsToRecheck.length) {
        return fail(res, 409, 'Los permisos cambiaron durante la consulta. Reintenta.');
      }
      for (let index = 0; index < currentMemberships.length; index++) {
        const current = currentMemberships[index];
        const expected = membershipsToRecheck[index];
        const data = current.data();
        if (!current.exists || current.id !== expected.id || !data ||
            data.userId !== uid || data.restaurantId !== expected.businessId ||
            data.active !== true || data.role !== expected.role ||
            !ROLES.has(data.role)) {
          return fail(res, 409, 'Los permisos cambiaron durante la consulta. Reintenta.');
        }
      }
      // La raíz también puede cambiar para un EMPLEADO después de construir
      // su tarjeta. Revalidar TODOS los tenants, no solo los OWNER: no devolver
      // una tarjeta de B si su raíz desapareció, cambió de identidad o de
      // branding durante la consulta. Es una defensa, NO un snapshot atómico.
      const currentRoots = await db.getAll(...businessIds.map(
        id => db.collection('businesses').doc(id)
      ));
      if (currentRoots.length !== businessIds.length) {
        return fail(res, 409, 'Los negocios cambiaron durante la consulta. Reintenta.');
      }
      for (let index = 0; index < currentRoots.length; index++) {
        const current = currentRoots[index];
        const data = current.data();
        const original = roots[index].data();
        const id = businessIds[index];
        if (!current.exists || current.id !== id || !data || !original ||
            data.restaurantId !== id ||
            data.ownerUserId !== original.ownerUserId ||
            !data.branding ||
            data.branding.restaurantName !== original.branding.restaurantName ||
            data.branding.publicSlug !== original.branding.publicSlug ||
            data.branding.logoUrl !== original.branding.logoUrl ||
            typeof data.ownerUserId !== 'string' ||
            !data.ownerUserId.trim() || data.ownerUserId.includes('/') ||
            (ownerBusinessIds.has(id)
              ? data.ownerUserId !== uid
              : data.ownerUserId === uid)) {
          return fail(res, 409, 'Un negocio cambió durante la consulta. Reintenta.');
        }
      }
      // El propietario de un negocio donde el solicitante es EMPLEADO debe
      // conservar una membresía OWNER activa y asociada a ese mismo tenant.
      // Esta lectura adicional es acotada (máximo una por tenant empleado,
      // MAX_MEMBERSHIPS=100) y ocurre tras la revalidación de raíces/roles.
      // No es atómica: la revisión independiente y las reglas siguen siendo
      // imprescindibles antes de activar el endpoint privado.
      if (foreignOwners.length) {
        const ownerMemberships = await db.getAll(...foreignOwners.map(
          ({ businessId, ownerUid }) =>
            db.collection('businessMemberships').doc(businessId + '_' + ownerUid)
        ));
        if (ownerMemberships.length !== foreignOwners.length) {
          return fail(res, 409, 'No pudimos validar los propietarios de tus negocios.');
        }
        for (let index = 0; index < ownerMemberships.length; index++) {
          const snap = ownerMemberships[index];
          const expected = foreignOwners[index];
          const data = snap.data();
          if (!snap.exists || snap.id !== expected.businessId + '_' + expected.ownerUid ||
              !data || data.restaurantId !== expected.businessId ||
              data.userId !== expected.ownerUid || data.role !== 'OWNER' ||
              data.active !== true) {
            return fail(res, 409, 'El propietario de un negocio requiere revisión.');
          }
        }
      }
      return res.status(200).json({ businesses });
    } catch (error) {
      console.error('[business-directory/list] No se pudo completar la consulta privada:', error);
      return fail(res, 503, 'No pudimos cargar tus negocios. Intenta de nuevo.');
    }
  });
}
