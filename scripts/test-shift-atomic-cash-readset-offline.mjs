/** Prueba offline del adaptador de lectura: Firestore Admin SIMULADO, sin red ni escrituras. */
import assert from 'node:assert/strict';
import { captureAtomicCashReadSetEmulator as capture } from '../src/lib/shiftAtomicCashReadSetEmulator.mjs';

const at = '2026-10-31T13:00:00.000Z';
const store = {
  'businesses/tenant-a': { restaurantId: 'tenant-a' },
  'businesses/tenant-b': { restaurantId: 'tenant-b' },
  'businesses/tenant-a/shifts': {},
  'businesses/tenant-a/shiftAuthority': {},
  'businesses/tenant-a/expenses': {},
  'businesses/tenant-a/vault': {},
  'businesses/tenant-b/shifts': {},
  'businesses/tenant-b/shiftAuthority': {},
  'businesses/tenant-b/expenses': {},
  'businesses/tenant-b/vault': {},
  restaurant_orders: {
    a: { restaurantId: 'tenant-a', orderType: 'pickup', billingStatus: 'PAGADO', paidAt: at, total: 10 },
    b: { restaurantId: 'tenant-b', orderType: 'delivery', billingStatus: 'PAGADO', paidAt: at, total: 20 },
  },
  table_payments: {},
};
let transactions = 0;
const collection = (path) => ({
  doc: (id) => ({ path: path + '/' + id, collection: (name) => collection(path + '/' + id + '/' + name) }),
  orderBy: (field) => {
    assert.equal(field, '__name__');
    return { limit: (n) => ({ path, limit: n }) };
  },
});
const db = {
  collection,
  runTransaction: async (fn) => {
    transactions++;
    return fn({ get: async (ref) => {
      if (ref.limit === undefined) {
        const data = store[ref.path];
        return { exists: Boolean(data), data: () => data };
      }
      const docs = Object.entries(store[ref.path] ?? {}).sort(([a], [b]) => a.localeCompare(b))
        .slice(0, ref.limit).map(([id, data]) => ({ id, data: () => data }));
      return { size: docs.length, docs };
    } });
  },
};
const previous = process.env.FIRESTORE_EMULATOR_HOST;
try {
  delete process.env.FIRESTORE_EMULATOR_HOST;
  await assert.rejects(capture({ db, businessId: 'tenant-a' }), /EMULATOR_ONLY/);
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  await assert.rejects(capture({ db, businessId: 'tenant-a', maxRows: -1 }), /INVALID_CAPTURE_INPUT/);
  const a = await capture({ db, businessId: 'tenant-a' });
  assert.equal(a.status, 'BLOCKED');
  assert.equal(a.canActivate, false);
  assert.equal(a.canCloseCash, false);
  assert.equal(a.reconciled, false);
  assert.equal(a.inventoryComplete, false);
  assert.equal(a.capture.atomicReadSet, true);
  assert.equal(a.capture.counts.orders, 1);
  assert.equal(a.capture.otherTenant.orders, 1);
  assert.ok(a.issues.includes('HISTORICAL_EVIDENCE_PENDING'));
  const b = await capture({ db, businessId: 'tenant-b' });
  assert.equal(b.capture.counts.orders, 1);
  assert.equal(b.capture.otherTenant.orders, 1);
  store.restaurant_orders.orphan = { billingStatus: 'PAGADO', paidAt: at, total: 30 };
  const orphan = await capture({ db, businessId: 'tenant-a' });
  assert.ok(orphan.issues.includes('ORDERS_TENANT_ID_MISSING_OR_INVALID'));
  const capped = await capture({ db, businessId: 'tenant-a', maxRows: 2 });
  assert.ok(capped.issues.includes('ORDERS_HISTORY_LIMIT_EXCEEDED'));
  assert.equal(capped.capture.atomicReadSet, false);
  delete store.restaurant_orders.orphan;
  store['businesses/tenant-a/expenses'].foreign = {
    businessId: 'tenant-b', createdAt: at, amount: 5, paidWith: 'efectivo_caja' };
  const foreignExpense = await capture({ db, businessId: 'tenant-a' });
  assert.ok(foreignExpense.issues.includes('EXPENSES_TENANT_MISMATCH'));
  assert.equal(foreignExpense.issues.includes('EXPENSES_TENANT_MISMATCH_OR_MISSING'), false);
  delete store['businesses/tenant-a/expenses'].foreign;
  store['businesses/tenant-a/vault'].foreign = {
    businessId: 'tenant-b', createdAt: at, amount: 5, kind: 'deposito' };
  const foreignVault = await capture({ db, businessId: 'tenant-a' });
  assert.ok(foreignVault.issues.includes('VAULT_TENANT_MISMATCH'));
  assert.equal(foreignVault.issues.includes('VAULT_TENANT_MISMATCH_OR_MISSING'), false);
  delete store['businesses/tenant-a/vault'].foreign;
  const sid = 'srv-' + 'c'.repeat(32);
  store['businesses/tenant-a/shifts'][sid] = { businessId: 'tenant-a', status: 'cerrado',
    openedAt: at, closedAt: at, openedByUid: 'owner-a', openRequestId: 'open-a',
    closedByUid: 'owner-a', closeRequestId: 'close-a' };
  store['businesses/tenant-a/shiftAuthority']['closed-' + sid] = {
    businessId: 'tenant-b', shiftId: sid, actorUid: 'owner-a', requestId: 'close-a', closedAt: at };
  const foreignReceipt = await capture({ db, businessId: 'tenant-a' });
  assert.ok(foreignReceipt.issues.includes('AUTHORITY_TENANT_MISMATCH'));
  assert.ok(foreignReceipt.issues.includes('SERVER_CLOSED_WITHOUT_RECEIPT'));
  delete store['businesses/tenant-a/shiftAuthority']['closed-' + sid];
  store['businesses/tenant-a/shifts'][sid].status = 'abierto';
  store['businesses/tenant-a/shiftAuthority'].current = {
    businessId: 'tenant-b', status: 'abierto', shiftId: sid,
    actorUid: 'owner-a', requestId: 'open-a' };
  const foreignLock = await capture({ db, businessId: 'tenant-a' });
  assert.ok(foreignLock.issues.includes('AUTHORITY_TENANT_MISMATCH'));
  assert.ok(foreignLock.issues.includes('SERVER_OPEN_WITHOUT_LOCK'));
  delete store['businesses/tenant-a/shiftAuthority'].current;
  store['businesses/tenant-a/shifts'][sid].businessId = 'tenant-b';
  const foreignShift = await capture({ db, businessId: 'tenant-a' });
  assert.ok(foreignShift.issues.includes('SHIFTS_TENANT_MISMATCH'));
  assert.equal(foreignShift.issues.includes('SERVER_OPEN_WITHOUT_LOCK'), false);
  delete store['businesses/tenant-a/shifts'][sid];
  store['businesses/tenant-a'].restaurantId = 'tenant-b';
  assert.ok((await capture({ db, businessId: 'tenant-a' })).issues.includes('BUSINESS_NOT_FOUND_OR_MISMATCH'));
  store['businesses/tenant-a'].restaurantId = 'tenant-a';
  const broken = await capture({ db: { collection, runTransaction: async () => {
    throw new Error('simulated permission error');
  } }, businessId: 'tenant-a' });
  assert.ok(broken.issues.includes('TRANSACTION_READ_FAILED'));
  assert.equal(broken.capture.atomicReadSet, false);
  assert.ok(transactions >= 4);
  console.log('PASS: adaptador transaccional simulado A/B, huérfanos, límites y fail-closed (NO Firestore Emulator).');
  console.log('PENDIENTE: prueba real de transacción en Firebase Emulator, historial y conciliación de Caja.');
} finally {
  if (previous === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
  else process.env.FIRESTORE_EMULATOR_HOST = previous;
}
