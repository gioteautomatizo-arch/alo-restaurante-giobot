/**
 * Captura paginada, SOLO Firestore Emulator, de turnos y comprobantes para
 * diagnosticar un corte de Caja. Nunca es autoridad de cierre ni de despliegue.
 * La doble lectura detecta cambios observables, NO crea una instantánea atómica.
 */
import { auditShiftCutoverCompatibility } from './shiftCutoverCompatibilityPreflight.mjs';

const validBusiness = (x) => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(x);
const MAX_ROWS = 200;
const denied = (code, capture = {}) => ({
  status: 'BLOCKED', canActivate: false, canCloseCash: false,
  inventoryComplete: false, issues: ['CUTOVER_APPROVAL_REQUIRED', code].sort(),
  capture: { stable: false, scope: 'NESTED_EMULATOR_ONLY_NOT_ATOMIC', ...capture },
});
const version = (doc) => {
  const t = doc.updateTime;
  return t ? `${t.seconds}:${t.nanoseconds}` : 'NO_UPDATE_TIME';
};

/** Enumera por ID, sin filtros de tenant que puedan ocultar filas discordantes. */
async function readAll(collection, pageSize) {
  const rows = [];
  const seen = new Set();
  let last = null;
  let pages = 0;
  for (;;) {
    const q = collection.orderBy('__name__').limit(pageSize);
    const snap = await (last ? q.startAfter(last).get() : q.get());
    pages++;
    if (snap.empty) break;
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) return { error: 'PAGINATION_DUPLICATE_OR_UNSTABLE', pages };
      if (rows.length >= MAX_ROWS) return { error: 'HISTORY_LIMIT_EXCEEDED', pages };
      seen.add(doc.id);
      rows.push({ id: doc.id, data: doc.data(), version: version(doc) });
    }
    if (snap.size < pageSize) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return { rows, pages };
}
const sameVersion = (a, b) => a.length === b.length &&
  a.every((x, i) => x.id === b[i].id && x.version === b[i].version);

/**
 * afterFirstPass es una inyección EXCLUSIVA de pruebas para provocar cambios
 * entre recorridos. No se conecta a rutas, UI ni Firebase de producción.
 */
export async function captureShiftCutoverEmulatorInventory({
  db, businessId, pageSize = 25, afterFirstPass,
} = {}) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('EMULATOR_ONLY');
  }
  if (!db || typeof db.collection !== 'function' || !validBusiness(businessId) ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      (afterFirstPass !== undefined && typeof afterFirstPass !== 'function')) {
    throw new TypeError('INVALID_CAPTURE_INPUT');
  }
  const capture = { stable: false, scope: 'NESTED_EMULATOR_ONLY_NOT_ATOMIC',
    shifts: 0, authority: 0, receipts: 0, pages: { shifts: 0, authority: 0 } };
  try {
    const root = db.collection('businesses').doc(businessId);
    const firstRoot = await root.get();
    if (!firstRoot.exists || firstRoot.data()?.restaurantId !== businessId) {
      return denied('BUSINESS_NOT_FOUND_OR_MISMATCH', capture);
    }
    const shiftsRef = root.collection('shifts');
    const authorityRef = root.collection('shiftAuthority');
    const firstShifts = await readAll(shiftsRef, pageSize);
    if (firstShifts.error) return denied(firstShifts.error, { ...capture, pages: { ...capture.pages, shifts: firstShifts.pages } });
    const firstAuthority = await readAll(authorityRef, pageSize);
    if (firstAuthority.error) return denied(firstAuthority.error, { ...capture, pages: { shifts: firstShifts.pages, authority: firstAuthority.pages } });
    capture.shifts = firstShifts.rows.length;
    capture.authority = firstAuthority.rows.length;
    capture.pages = { shifts: firstShifts.pages, authority: firstAuthority.pages };
    if (afterFirstPass) await afterFirstPass();
    const secondShifts = await readAll(shiftsRef, pageSize);
    if (secondShifts.error) return denied(secondShifts.error, capture);
    const secondAuthority = await readAll(authorityRef, pageSize);
    if (secondAuthority.error) return denied(secondAuthority.error, capture);
    const secondRoot = await root.get();
    if (!secondRoot.exists || secondRoot.data()?.restaurantId !== businessId ||
        version(firstRoot) !== version(secondRoot) ||
        !sameVersion(firstShifts.rows, secondShifts.rows) ||
        !sameVersion(firstAuthority.rows, secondAuthority.rows)) {
      return denied('INVENTORY_CHANGED_DURING_READ', capture);
    }
    const issues = new Set();
    let currentLock = null;
    const receipts = [];
    for (const row of secondAuthority.rows) {
      if (row.id === 'current') {
        currentLock = row.data;
      } else if (row.id.startsWith('closed-')) {
        if (row.id !== 'closed-' + row.data?.shiftId) issues.add('RECEIPT_DOCUMENT_ID_MISMATCH');
        receipts.push({ ...row.data, id: row.id });
      } else {
        issues.add('UNKNOWN_AUTHORITY_DOCUMENT');
      }
    }
    capture.stable = true;
    capture.receipts = receipts.length;
    const audit = auditShiftCutoverCompatibility({
      businessId,
      shifts: secondShifts.rows.map((row) => ({ ...row.data, id: row.id })),
      currentLock,
      receipts,
      // La doble lectura NO demuestra completitud histórica ni instantánea atómica.
      inventoryComplete: false,
    });
    return {
      ...audit, inventoryComplete: false,
      issues: [...new Set([...audit.issues, ...issues])].sort(),
      capture,
    };
  } catch {
    // Fallos de permisos, red o lectura NO se interpretan como Caja vacía.
    return denied('READ_FAILED', capture);
  }
}
