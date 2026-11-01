/** Captura transaccional de lectura: SOLO Firebase Admin + Firestore Emulator A/B. */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { captureAtomicCashReadSetEmulator as capture } from '../src/lib/shiftAtomicCashReadSetEmulator.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'ALTO: solo emulador local');
const app = initializeApp({ projectId: 'gioteautomatizo-atomic-cash-readset-test' }, 'atomic-cash-readset');
const db = getFirestore(app);
const root = (id) => db.collection('businesses').doc(id);
const shifts = (id) => root(id).collection('shifts');
const authority = (id) => root(id).collection('shiftAuthority');
const expenses = (id) => root(id).collection('expenses');
const vault = (id) => root(id).collection('vault');
const orders = db.collection('restaurant_orders');
const payments = db.collection('table_payments');
const at = '2026-10-31T13:00:00.000Z';
const end = '2026-10-31T14:00:00.000Z';
const sidA = 'srv-' + 'a'.repeat(32);
const sidB = 'srv-' + 'b'.repeat(32);
const blocked = (r) => {
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.inventoryComplete, false);
  assert.equal(r.reconciled, false);
  assert.equal(r.canCloseCash, false);
  assert.equal(r.canActivate, false);
  assert.ok(!JSON.stringify(r).includes('owner-a@example.com'), 'no revelar datos personales');
};
const issue = (r, code) => assert.ok(r.issues.includes(code), `Falta ${code}: ${r.issues}`);
try {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  await assert.rejects(capture({ db, businessId: 'tenant-a' }), /EMULATOR_ONLY/);
  process.env.FIRESTORE_EMULATOR_HOST = host;
  await assert.rejects(capture({ db, businessId: 'tenant-a', maxRows: 0 }), /INVALID_CAPTURE_INPUT/);
  await assert.rejects(capture({ db, businessId: 'tenant-a', maxRows: 201 }), /INVALID_CAPTURE_INPUT/);
  await assert.rejects(capture({ db, businessId: 'tenant/a' }), /INVALID_CAPTURE_INPUT/);

  for (const id of ['tenant-a', 'tenant-b']) {
    await root(id).set({ restaurantId: id, ownerUserId: 'owner-' + id,
      email: 'owner-a@example.com' });
  }
  await shifts('tenant-a').doc(sidA).set({ businessId: 'tenant-a', status: 'cerrado',
    openedAt: at, closedAt: end, openedByUid: 'owner-a', openRequestId: 'open-a-123',
    closedByUid: 'owner-a', closeRequestId: 'close-a-123' });
  await authority('tenant-a').doc('closed-' + sidA).set({
    businessId: 'tenant-a', shiftId: sidA, actorUid: 'owner-a',
    requestId: 'close-a-123', closedAt: end,
  });
  await shifts('tenant-b').doc(sidB).set({ businessId: 'tenant-b', status: 'abierto',
    openedAt: at, openedByUid: 'owner-b', openRequestId: 'open-b-123' });
  await authority('tenant-b').doc('current').set({ businessId: 'tenant-b',
    status: 'abierto', shiftId: sidB, actorUid: 'owner-b', requestId: 'open-b-123' });
  await orders.doc('order-a').set({ restaurantId: 'tenant-a', orderType: 'pickup',
    billingStatus: 'PAGADO', status: 'ENTREGADO', paidAt: at, total: 40 });
  await orders.doc('table-order-a').set({ restaurantId: 'tenant-a', orderType: 'dine_in',
    billingStatus: 'PAGADO', status: 'ENTREGADO', paidAt: at, total: 90,
    paymentId: 'payment-a' });
  await orders.doc('order-b').set({ restaurantId: 'tenant-b', orderType: 'delivery',
    billingStatus: 'PAGADO', status: 'ENTREGADO', paidAt: at, total: 30 });
  await payments.doc('payment-a').set({ restaurantId: 'tenant-a', status: 'PAGADO',
    createdAt: at, total: 90, subtotal: 90, discountAmount: 0, tipAmount: 0,
    paymentMethod: 'MIXTO', orderIds: ['table-order-a'],
    paymentBreakdown: [{ method: 'EFECTIVO', amount: 30 }, { method: 'TARJETA', amount: 60 }] });
  await expenses('tenant-a').doc('expense-a').set({ businessId: 'tenant-a',
    createdAt: at, amount: 10, paidWith: 'efectivo_caja' });
  await vault('tenant-a').doc('vault-a').set({ businessId: 'tenant-a',
    createdAt: at, amount: 5, kind: 'deposito' });
  await expenses('tenant-b').doc('expense-b').set({ businessId: 'tenant-b',
    createdAt: at, amount: 2, paidWith: 'otro' });

  const a = await capture({ db, businessId: 'tenant-a' });
  blocked(a);
  assert.equal(a.capture.atomicReadSet, true);
  assert.deepEqual(a.capture.counts, { shifts: 1, authority: 1, orders: 2,
    payments: 1, expenses: 1, vault: 1 });
  assert.deepEqual(a.capture.otherTenant, { orders: 1, payments: 0 });
  issue(a, 'CUTOVER_APPROVAL_REQUIRED');
  issue(a, 'ATOMIC_READ_SET_NOT_HISTORICAL_PROOF');
  issue(a, 'INVENTORY_NOT_PROVEN_COMPLETE');
  assert.equal(a.issues.includes('TABLE_PAYMENT_NOT_RECIPROCAL'), false);
  assert.equal(a.issues.includes('TABLE_PAYMENT_MIXED_BREAKDOWN_UNVERIFIED'), false);
  const b = await capture({ db, businessId: 'tenant-b' });
  blocked(b);
  assert.equal(b.capture.atomicReadSet, true);
  assert.deepEqual(b.capture.counts, { shifts: 1, authority: 1, orders: 1,
    payments: 0, expenses: 1, vault: 0 });
  assert.equal(b.capture.otherTenant.orders, 2);
  assert.equal(b.issues.includes('SHIFT_TENANT_MISMATCH'), false);

  // Los globales huérfanos no pueden quedar invisibles por un where(tenant).
  await orders.doc('orphan').set({ billingStatus: 'PAGADO', paidAt: at, total: 70 });
  issue(await capture({ db, businessId: 'tenant-a' }), 'ORDERS_TENANT_ID_MISSING_OR_INVALID');
  await orders.doc('orphan').delete();
  await payments.doc('payment-a').update({ paymentBreakdown: [{ method: 'EFECTIVO', amount: 30 }] });
  issue(await capture({ db, businessId: 'tenant-a' }), 'TABLE_PAYMENT_MIXED_BREAKDOWN_UNVERIFIED');
  await payments.doc('payment-a').update({ paymentBreakdown: [
    { method: 'EFECTIVO', amount: 30 }, { method: 'TARJETA', amount: 60 }] });
  await orders.doc('table-order-a').update({ paymentId: 'otro-pago' });
  issue(await capture({ db, businessId: 'tenant-a' }), 'TABLE_PAYMENT_NOT_RECIPROCAL');
  await orders.doc('table-order-a').update({ paymentId: 'payment-a' });
  await expenses('tenant-a').doc('expense-a').update({ businessId: 'tenant-b' });
  issue(await capture({ db, businessId: 'tenant-a' }), 'EXPENSES_TENANT_MISMATCH');
  await expenses('tenant-a').doc('expense-a').update({ businessId: 'tenant-a' });
  await authority('tenant-a').doc('closed-' + sidA).update({ shiftId: sidB });
  issue(await capture({ db, businessId: 'tenant-a' }), 'RECEIPT_DOCUMENT_ID_MISMATCH');
  await authority('tenant-a').doc('closed-' + sidA).update({ shiftId: sidA });
  await root('tenant-a').update({ restaurantId: 'tenant-b' });
  issue(await capture({ db, businessId: 'tenant-a' }), 'BUSINESS_NOT_FOUND_OR_MISMATCH');
  await root('tenant-a').update({ restaurantId: 'tenant-a' });

  // El límite debe fallar cerrado, no truncar el universo de pedidos.
  const over = await capture({ db, businessId: 'tenant-a', maxRows: 2 });
  blocked(over);
  issue(over, 'ORDERS_HISTORY_LIMIT_EXCEEDED');
  assert.equal(over.capture.atomicReadSet, false);
  const fail = await capture({ db: { collection() {}, runTransaction: async () => {
    throw new Error('ABORTED');
  } }, businessId: 'tenant-a' });
  blocked(fail);
  issue(fail, 'TRANSACTION_READ_FAILED');
  assert.equal(fail.capture.atomicReadSet, false);

  assert.equal((await orders.doc('order-a').get()).data().total, 40);
  assert.equal((await root('tenant-a').get()).data().restaurantId, 'tenant-a');
  console.log('PASS: captura transaccional ACOTADA en Firestore Emulator, A/B, seis fuentes, huérfanos, MIXTO, límites y fail-closed.');
  console.log('PENDIENTE: historial externo, comprobantes reales, autoridad cliente-servidor, reglas desplegadas y Android/iPad; NO conciliar ni activar Caja.');
} finally {
  await deleteApp(app);
}
