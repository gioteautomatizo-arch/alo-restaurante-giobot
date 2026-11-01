/**
 * PRE-FLIGHT AISLADO: apertura transaccional desde un contexto Firebase Admin
 * autenticado por un servidor. NO registrar como endpoint ni activar en producción.
 * La regla staged todavía permite escrituras cliente; este módulo NO las corrige.
 * No incluye cierre: no se puede cerrar Caja hasta tener conciliación atómica.
 */
import { createHash } from 'node:crypto';

const safeBusinessId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(value);
const safeUid = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const safeRequestId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(value);
const safeMoney = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
  Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
const safeIso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value && Date.parse(value) > 0;
const permittedRoles = new Set(['OWNER', 'ADMIN', 'MANAGER', 'CASHIER']);

export class ShiftOpenDenied extends Error {
  constructor(code) { super(code); this.name = 'ShiftOpenDenied'; this.code = code; }
}
const deny = (code) => { throw new ShiftOpenDenied(code); };

/**
 * actorUid debe provenir de verifyIdToken(token, true) en servidor, NUNCA del body.
 * db es Firebase Admin Firestore conectado a un emulador en los tests.
 * Todas las lecturas relevantes y la escritura de candado/turno son una transacción.
 */
export async function openShiftPreflight({ db, businessId, actorUid, requestId, initialCashFund, openedByName, openedAt }) {
  if (!db || typeof db.runTransaction !== 'function' || !safeBusinessId(businessId) ||
      !safeUid(actorUid) || !safeRequestId(requestId) || !safeMoney(initialCashFund) ||
      !safeIso(openedAt) || typeof openedByName !== 'string' ||
      !openedByName.trim() || openedByName.trim().length > 100) deny('INVALID_INPUT');
  const root = db.collection('businesses').doc(businessId);
  const member = db.collection('businessMemberships').doc(businessId + '_' + actorUid);
  // Documento único por tenant: serializa dos aperturas simultáneas.
  const lock = root.collection('shiftAuthority').doc('current');
  const shiftId = 'srv-' + createHash('sha256').update(businessId + ':' + actorUid + ':' + requestId).digest('hex').slice(0, 32);
  const shift = root.collection('shifts').doc(shiftId);
  const type = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false,
    timeZone: 'America/Mexico_City' }).format(new Date(openedAt))) < 15 ? 'AM' : 'PM';
  return db.runTransaction(async (tx) => {
    const [rootSnap, memberSnap, lockSnap, shiftsSnap] = await Promise.all([
      tx.get(root), tx.get(member), tx.get(lock),
      tx.get(root.collection('shifts').limit(201)),
    ]);
    const tenant = rootSnap.data();
    const membership = memberSnap.data();
    if (!rootSnap.exists || tenant?.restaurantId !== businessId ||
        !memberSnap.exists || membership?.restaurantId !== businessId ||
        membership?.userId !== actorUid || membership?.active !== true ||
        !permittedRoles.has(membership?.role) ||
        (membership.role === 'OWNER' && tenant.ownerUserId !== undefined && tenant.ownerUserId !== actorUid)) {
      deny('FORBIDDEN');
    }
    if (shiftsSnap.size > 200) deny('HISTORY_REVIEW_REQUIRED');
    const rows = shiftsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (rows.some((s) => s.businessId !== businessId || !['abierto', 'cerrado'].includes(s.status))) {
      deny('HISTORY_REVIEW_REQUIRED');
    }
    const open = rows.filter((s) => s.status === 'abierto');
    if (lockSnap.exists) {
      const value = lockSnap.data();
      if (value?.businessId === businessId && value?.status === 'abierto' &&
          value?.actorUid === actorUid && value?.requestId === requestId &&
          value?.shiftId === shiftId && open.length === 1 && open[0].id === shiftId) {
        return { shiftId, status: 'already_open' };
      }
      deny('OPEN_SHIFT_EXISTS_OR_LOCK_UNVERIFIED');
    }
    if (open.length > 0) deny('OPEN_SHIFT_EXISTS_OR_LOCK_UNVERIFIED');
    const shiftData = {
      id: shiftId, businessId, status: 'abierto', shiftType: type, openedAt,
      openedByName: openedByName.trim(), openedByUid: actorUid,
      initialCashFund, openRequestId: requestId, createdAt: openedAt, updatedAt: openedAt,
    };
    tx.create(shift, shiftData);
    tx.create(lock, { businessId, status: 'abierto', shiftId, actorUid, requestId, createdAt: openedAt });
    return { shiftId, status: 'opened' };
  });
}
