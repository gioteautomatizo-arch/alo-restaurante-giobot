/**
 * Inventario de solo lectura para la transición de Caja cliente -> autoridad Admin.
 * NO consulta Firebase, NO modifica turnos y NUNCA autoriza un despliegue/cierre.
 * `inventoryComplete` es una declaración del llamador, NO una prueba de completitud.
 */
const serverShiftId = /^srv-[0-9a-f]{32}$/;
const validId = (v) => typeof v === 'string' && v.length > 0 && !v.includes('/');
const validIso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) &&
  Date.parse(v) > 0 && new Date(v).toISOString() === v;
const requiredExternalChecks = Object.freeze([
  'AUTH_EMULATOR_REAL_TOKENS', 'CLIENT_VERSION_CUTOVER_AND_ROLLBACK',
  'DEPLOYED_RULES_AND_SERVER_ONLY_WRITES', 'HISTORICAL_PAYMENT_EVIDENCE',
  'ATOMIC_SOURCE_AUTHORITY', 'ANDROID_IPAD_MANUAL_REVIEW',
]);

/** Recibe filas ya materializadas y filtradas por negocio; nunca confía en ese filtro. */
export function auditShiftCutoverCompatibility({
  businessId, shifts, currentLock = null, receipts, inventoryComplete = false,
} = {}) {
  if (!validId(businessId) || !Array.isArray(shifts) || !Array.isArray(receipts) ||
      (currentLock !== null && (typeof currentLock !== 'object' || Array.isArray(currentLock)))) {
    throw new TypeError('INVALID_INVENTORY');
  }
  const issues = new Set(['CUTOVER_APPROVAL_REQUIRED']);
  const add = (code) => issues.add(code);
  if (inventoryComplete !== true) add('INVENTORY_NOT_PROVEN_COMPLETE');
  if (shifts.length > 200 || receipts.length > 200) add('HISTORY_LIMIT_EXCEEDED');
  const summary = { legacyOpen: 0, legacyClosed: 0, serverOpen: 0, serverClosed: 0, unknown: 0 };
  const seenShifts = new Set();
  const byId = new Map();
  const openIds = [];
  for (const row of shifts) {
    if (!row || typeof row !== 'object' || !validId(row.id)) { add('INVALID_SHIFT_ID'); summary.unknown++; continue; }
    if (seenShifts.has(row.id)) add('DUPLICATE_SHIFT_ID');
    seenShifts.add(row.id);
    if (row.businessId !== businessId) {
      add('SHIFT_TENANT_MISMATCH');
      // Un turno ajeno nunca cuenta como propio ni puede validar candados/recibos.
      continue;
    }
    const server = serverShiftId.test(row.id);
    if (row.status !== 'abierto' && row.status !== 'cerrado') { add('UNKNOWN_SHIFT_STATUS'); summary.unknown++; continue; }
    summary[(server ? 'server' : 'legacy') + (row.status === 'abierto' ? 'Open' : 'Closed')]++;
    if (!validIso(row.openedAt)) add('UNVERIFIED_OPEN_DATE');
    if (row.status === 'abierto') openIds.push(row.id);
    if (row.status === 'cerrado' && (!validIso(row.closedAt) ||
        (validIso(row.openedAt) && validIso(row.closedAt) && Date.parse(row.closedAt) < Date.parse(row.openedAt)))) {
      add('UNVERIFIED_CLOSE_DATE');
    }
    if (server && (!validId(row.openedByUid) || !validId(row.openRequestId))) add('SERVER_SHIFT_AUTHORITY_MISSING');
    if (server && row.status === 'cerrado' && (!validId(row.closedByUid) || !validId(row.closeRequestId))) {
      add('SERVER_CLOSE_AUTHORITY_MISSING');
    }
    byId.set(row.id, row);
  }
  if (summary.legacyOpen > 0) add('LEGACY_OPEN_SHIFT_REQUIRES_MANUAL_HANDOFF');
  if (summary.legacyClosed > 0) add('LEGACY_HISTORY_REQUIRES_REVIEW');
  if (openIds.length > 1) add('MULTIPLE_OPEN_SHIFTS');
  if (currentLock !== null && currentLock.businessId !== businessId) add('LOCK_TENANT_MISMATCH');
  // Un candado ajeno equivale a ausencia de candado propio, no a autoridad válida.
  const ownLock = currentLock?.businessId === businessId ? currentLock : null;
  if (ownLock !== null) {
    if (ownLock.status !== 'abierto' || !serverShiftId.test(ownLock.shiftId ?? '') ||
        !validId(ownLock.actorUid) || !validId(ownLock.requestId)) add('LOCK_INVALID');
    const open = byId.get(ownLock.shiftId);
    if (!open || open.status !== 'abierto' || open.openedByUid !== ownLock.actorUid ||
        open.openRequestId !== ownLock.requestId) add('LOCK_SHIFT_MISMATCH');
  }
  if (summary.serverOpen > 0 && ownLock === null) add('SERVER_OPEN_WITHOUT_LOCK');
  if (ownLock !== null && openIds.length !== 1) add('LOCK_WITHOUT_SINGLE_OPEN_SHIFT');
  const seenReceipts = new Set();
  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== 'object' || !validId(receipt.shiftId)) { add('INVALID_RECEIPT'); continue; }
    if (receipt.businessId !== businessId) {
      add('RECEIPT_TENANT_MISMATCH');
      // Un recibo ajeno no puede cubrir un cierre propio.
      continue;
    }
    if (seenReceipts.has(receipt.shiftId)) add('DUPLICATE_CLOSE_RECEIPT');
    seenReceipts.add(receipt.shiftId);
    const shift = byId.get(receipt.shiftId);
    if (!shift || !serverShiftId.test(receipt.shiftId) || shift.status !== 'cerrado') {
      add('ORPHAN_OR_LEGACY_RECEIPT');
    } else if (receipt.actorUid !== shift.closedByUid || receipt.requestId !== shift.closeRequestId ||
               receipt.closedAt !== shift.closedAt) {
      add('RECEIPT_SHIFT_MISMATCH');
    }
  }
  for (const row of shifts) {
    if (row && serverShiftId.test(row.id ?? '') && row.status === 'cerrado' && !seenReceipts.has(row.id)) {
      add('SERVER_CLOSED_WITHOUT_RECEIPT');
    }
  }
  return {
    status: 'BLOCKED', canActivate: false, canCloseCash: false,
    issues: [...issues].sort(), summary,
    requiredExternalChecks: [...requiredExternalChecks],
  };
}
