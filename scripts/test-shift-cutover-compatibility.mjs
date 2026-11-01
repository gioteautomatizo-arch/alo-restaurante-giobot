import assert from 'node:assert/strict';
import { auditShiftCutoverCompatibility as audit } from '../src/lib/shiftCutoverCompatibilityPreflight.mjs';

const businessId = 'tenant-a';
const sid = 'srv-' + 'a'.repeat(32);
const at = '2026-10-31T13:00:00.000Z';
const end = '2026-10-31T14:00:00.000Z';
const modernOpen = { id: sid, businessId, status: 'abierto', openedAt: at,
  openedByUid: 'owner-a', openRequestId: 'open-request-a' };
const lock = { businessId, status: 'abierto', shiftId: sid,
  actorUid: 'owner-a', requestId: 'open-request-a' };
const modernClosed = { ...modernOpen, status: 'cerrado', closedAt: end,
  closedByUid: 'owner-a', closeRequestId: 'close-request-a' };
const receipt = { businessId, shiftId: sid, actorUid: 'owner-a',
  requestId: 'close-request-a', closedAt: end };
const run = (shifts, currentLock = null, receipts = [], inventoryComplete = true) =>
  audit({ businessId, shifts, currentLock, receipts, inventoryComplete });
const has = (result, code) => assert.ok(result.issues.includes(code), `${code}: ${result.issues.join(',')}`);
const blocked = (result) => { assert.equal(result.status, 'BLOCKED'); assert.equal(result.canActivate, false);
  assert.equal(result.canCloseCash, false); has(result, 'CUTOVER_APPROVAL_REQUIRED'); };

blocked(run([], null, []));
has(run([], null, [], false), 'INVENTORY_NOT_PROVEN_COMPLETE');
const cleanOpen = run([modernOpen], lock);
blocked(cleanOpen);
assert.deepEqual(cleanOpen.summary, { legacyOpen: 0, legacyClosed: 0, serverOpen: 1, serverClosed: 0, unknown: 0 });
assert.deepEqual(cleanOpen.issues, ['CUTOVER_APPROVAL_REQUIRED']);
const cleanClosed = run([modernClosed], null, [receipt]);
blocked(cleanClosed);
assert.deepEqual(cleanClosed.issues, ['CUTOVER_APPROVAL_REQUIRED']);
assert.ok(cleanClosed.requiredExternalChecks.includes('HISTORICAL_PAYMENT_EVIDENCE'));

has(run([{ id: 'old-open', businessId, status: 'abierto', openedAt: at }]), 'LEGACY_OPEN_SHIFT_REQUIRES_MANUAL_HANDOFF');
has(run([{ id: 'old-closed', businessId, status: 'cerrado', openedAt: at, closedAt: end }]), 'LEGACY_HISTORY_REQUIRES_REVIEW');
has(run([{ ...modernOpen, businessId: 'tenant-b' }], lock), 'SHIFT_TENANT_MISMATCH');
has(run([{ ...modernOpen, openedAt: 'bad' }], lock), 'UNVERIFIED_OPEN_DATE');
has(run([{ ...modernClosed, closedAt: at.replace('13:', '12:') }], null, [receipt]), 'UNVERIFIED_CLOSE_DATE');
has(run([modernOpen, { ...modernOpen }], lock), 'DUPLICATE_SHIFT_ID');
has(run([modernOpen, { ...modernOpen, id: 'legacy-2' }], lock), 'MULTIPLE_OPEN_SHIFTS');
has(run([{ ...modernOpen, status: 'pagado' }]), 'UNKNOWN_SHIFT_STATUS');
has(run([modernOpen]), 'SERVER_OPEN_WITHOUT_LOCK');
has(run([], lock), 'LOCK_SHIFT_MISMATCH');
has(run([modernOpen], { ...lock, businessId: 'tenant-b' }), 'LOCK_TENANT_MISMATCH');
has(run([modernOpen], { ...lock, requestId: 'different' }), 'LOCK_SHIFT_MISMATCH');
has(run([modernClosed]), 'SERVER_CLOSED_WITHOUT_RECEIPT');
has(run([modernClosed], null, [{ ...receipt, businessId: 'tenant-b' }]), 'RECEIPT_TENANT_MISMATCH');
// Aislamiento también dentro del auditor puro (no depender del filtrado externo).
const foreignLock = run([modernOpen], { ...lock, businessId: 'tenant-b' });
has(foreignLock, 'LOCK_TENANT_MISMATCH');
has(foreignLock, 'SERVER_OPEN_WITHOUT_LOCK');
assert.equal(foreignLock.summary.serverOpen, 1);
const foreignReceipt = run([modernClosed], null, [{ ...receipt, businessId: 'tenant-b' }]);
has(foreignReceipt, 'RECEIPT_TENANT_MISMATCH');
has(foreignReceipt, 'SERVER_CLOSED_WITHOUT_RECEIPT');
const foreignShift = run([{ ...modernOpen, businessId: 'tenant-b' }], lock);
has(foreignShift, 'SHIFT_TENANT_MISMATCH');
assert.equal(foreignShift.summary.serverOpen, 0, 'un turno de B no se cuenta como abierto en A');
has(foreignShift, 'LOCK_SHIFT_MISMATCH');
const mixedTenants = run([modernClosed, { ...modernOpen, id: 'srv-' + 'b'.repeat(32),
  businessId: 'tenant-b' }], null, [{ ...receipt, businessId: 'tenant-b' }, receipt]);
assert.equal(mixedTenants.summary.serverClosed, 1);
assert.equal(mixedTenants.summary.serverOpen, 0);
has(mixedTenants, 'SHIFT_TENANT_MISMATCH');
has(mixedTenants, 'RECEIPT_TENANT_MISMATCH');
assert.equal(mixedTenants.issues.includes('DUPLICATE_CLOSE_RECEIPT'), false,
  'un recibo ajeno no debe contaminar el índice de recibos propios');
assert.equal(mixedTenants.issues.includes('SERVER_CLOSED_WITHOUT_RECEIPT'), false,
  'un recibo propio válido sí cubre el cierre propio');

has(run([modernClosed], null, [{ ...receipt, requestId: 'wrong' }]), 'RECEIPT_SHIFT_MISMATCH');
has(run([], null, [receipt]), 'ORPHAN_OR_LEGACY_RECEIPT');
has(run([modernClosed], null, [receipt, receipt]), 'DUPLICATE_CLOSE_RECEIPT');
has(run(Array.from({ length: 201 }, (_, i) => ({ id: 'legacy-' + i, businessId,
  status: 'cerrado', openedAt: at, closedAt: end }))), 'HISTORY_LIMIT_EXCEEDED');
assert.throws(() => audit({ businessId, shifts: null, receipts: [] }), /INVALID_INVENTORY/);
assert.throws(() => audit({ businessId: '', shifts: [], receipts: [] }), /INVALID_INVENTORY/);
const a = [modernOpen];
const before = JSON.stringify(a);
run(a, lock);
assert.equal(JSON.stringify(a), before, 'la auditoría no modifica datos');
const b = audit({ businessId: 'tenant-b', shifts: [{ ...modernOpen, businessId: 'tenant-b' }],
  currentLock: { ...lock, businessId: 'tenant-b' }, receipts: [], inventoryComplete: true });
blocked(b);
assert.equal(b.summary.serverOpen, 1);
assert.equal(run([modernOpen], lock).summary.serverOpen, 1);
console.log('PASS: inventario de corte de Caja A/B, legado, candados, recibos y fallos cerrados (solo datos sintéticos).');
console.log('PENDIENTE: corte cliente/servidor, reglas efectivas, comprobantes históricos/MIXTO y validación manual; NO activar Caja.');
