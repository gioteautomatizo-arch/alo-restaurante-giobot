/** Solo Firebase Admin + Firestore Emulator, negocios ficticios A/B. */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { captureAccountingSourcesEmulator as capture } from '../src/lib/shiftAccountingSourcesEmulatorInventory.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'Solo emulador');
const app = initializeApp({ projectId: 'gioteautomatizo-accounting-sources-test' }, 'accounting-sources-test');
const db = getFirestore(app);
const root = (id) => db.collection('businesses').doc(id);
const orders = db.collection('restaurant_orders');
const payments = db.collection('table_payments');
const expenses = (id) => root(id).collection('expenses');
const vault = (id) => root(id).collection('vault');
const at = '2026-10-31T13:00:00.000Z';
const blocked = (r) => {
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.inventoryComplete, false);
  assert.equal(r.reconciled, false);
  assert.equal(r.canCloseCash, false);
  assert.equal(r.canActivate, false);
};
const issue = (r, code) => assert.ok(r.issues.includes(code), `Falta ${code}: ${r.issues}`);
try {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  await assert.rejects(capture({ db, businessId: 'tenant-a' }), /EMULATOR_ONLY/);
  process.env.FIRESTORE_EMULATOR_HOST = host;
  await assert.rejects(capture({ db, businessId: 'tenant-a', pageSize: 0 }), /INVALID_CAPTURE_INPUT/);
  await assert.rejects(capture({ db, businessId: 'tenant-a', pageSize: 51 }), /INVALID_CAPTURE_INPUT/);
  for (const id of ['tenant-a', 'tenant-b']) {
    await root(id).set({ restaurantId: id, ownerUserId: 'owner-' + id });
  }
  await orders.doc('order-a').set({ restaurantId: 'tenant-a', billingStatus: 'PAGADO',
    paidAt: at, total: 90, orderType: 'pickup' });
  await orders.doc('order-b').set({ restaurantId: 'tenant-b', billingStatus: 'PAGADO',
    paidAt: at, total: 300, orderType: 'delivery' });
  await payments.doc('payment-a').set({ restaurantId: 'tenant-a', status: 'PAGADO',
    createdAt: at, total: 90, paymentMethod: 'MIXTO',
    orderIds: ['table-order-a'], subtotal: 90, discountAmount: 0, tipAmount: 0,
    paymentBreakdown: [{ method: 'EFECTIVO', amount: 30 }, { method: 'TARJETA', amount: 60 }] });
  await orders.doc('table-order-a').set({ restaurantId: 'tenant-a',
    orderType: 'dine_in', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paidAt: at, paymentId: 'payment-a', total: 90 });
  await payments.doc('payment-b').set({ restaurantId: 'tenant-b', status: 'PAGADO',
    createdAt: at, total: 300, paymentMethod: 'EFECTIVO' });
  await expenses('tenant-a').doc('expense-a').set({ businessId: 'tenant-a',
    createdAt: at, amount: 20, paidWith: 'efectivo_caja' });
  await vault('tenant-a').doc('vault-a').set({ businessId: 'tenant-a',
    createdAt: at, amount: 10, kind: 'deposito' });
  await expenses('tenant-b').doc('expense-b').set({ businessId: 'tenant-b',
    createdAt: at, amount: 100, paidWith: 'efectivo_caja' });
  const a = await capture({ db, businessId: 'tenant-a', pageSize: 1 });
  blocked(a);
  assert.equal(a.capture.stable, true);
  assert.deepEqual(a.capture.counts, { orders: 2, payments: 1, expenses: 1, vault: 1 });
  assert.deepEqual(a.capture.otherTenant, { orders: 1, payments: 1 });
  assert.ok(a.capture.pages.orders >= 2);
  assert.ok(a.capture.pages.payments >= 2);
  issue(a, 'NOT_ATOMIC_SNAPSHOT');
  issue(a, 'HISTORICAL_EVIDENCE_PENDING');
  assert.equal(a.issues.includes('TABLE_PAYMENT_MIXED_BREAKDOWN_UNVERIFIED'), false);
  assert.equal(a.issues.includes('TABLE_PAYMENT_NOT_RECIPROCAL'), false);
  assert.equal(a.issues.includes('TABLE_PAYMENT_AMOUNT_MISMATCH'), false);
  const b = await capture({ db, businessId: 'tenant-b', pageSize: 2 });
  blocked(b);
  assert.deepEqual(b.capture.counts, { orders: 1, payments: 1, expenses: 1, vault: 0 });
  assert.equal(b.capture.otherTenant.orders, 1);

  await orders.doc('orphan').set({ billingStatus: 'PAGADO', paidAt: at, total: 40 });
  issue(await capture({ db, businessId: 'tenant-a', pageSize: 2 }),
    'ORDERS_TENANT_ID_MISSING_OR_INVALID');
  await orders.doc('orphan').delete();

  await payments.doc('payment-a').update({ paymentBreakdown: [{ method: 'EFECTIVO', amount: 30 }] });
  issue(await capture({ db, businessId: 'tenant-a' }), 'TABLE_PAYMENT_MIXED_BREAKDOWN_UNVERIFIED');
  await payments.doc('payment-a').update({
    paymentBreakdown: [{ method: 'EFECTIVO', amount: 30 }, { method: 'TARJETA', amount: 60 }],
  });
  await orders.doc('order-a').update({ paidAt: 'fecha-invalida' });
  issue(await capture({ db, businessId: 'tenant-a' }), 'PAID_ORDER_DATE_OR_AMOUNT_UNVERIFIED');
  await orders.doc('order-a').update({ paidAt: at });
  await expenses('tenant-a').doc('expense-a').update({ businessId: 'tenant-b' });
  issue(await capture({ db, businessId: 'tenant-a' }), 'EXPENSES_TENANT_MISMATCH');
  await expenses('tenant-a').doc('expense-a').update({ businessId: 'tenant-a' });

  await orders.doc('table-order-a').update({ paymentId: 'otra-referencia' });
  issue(await capture({ db, businessId: 'tenant-a' }), 'TABLE_PAYMENT_NOT_RECIPROCAL');
  await orders.doc('table-order-a').update({ paymentId: 'payment-a' });
  await payments.doc('payment-a').update({ orderIds: ['table-order-a', 'table-order-a'] });
  issue(await capture({ db, businessId: 'tenant-a' }), 'TABLE_PAYMENT_ORDER_DUPLICATE');
  await payments.doc('payment-a').update({ orderIds: ['table-order-a'] });
  await payments.doc('payment-a').update({ subtotal: 91 });
  issue(await capture({ db, businessId: 'tenant-a' }), 'TABLE_PAYMENT_AMOUNT_MISMATCH');
  await payments.doc('payment-a').update({ subtotal: 90 });
  await expenses('tenant-a').doc('expense-a').update({ paidWith: 'metodo-desconocido' });
  issue(await capture({ db, businessId: 'tenant-a' }), 'EXPENSES_AMOUNT_OR_METHOD_UNVERIFIED');
  await expenses('tenant-a').doc('expense-a').update({ paidWith: 'efectivo_caja' });
  await vault('tenant-a').doc('vault-a').update({ kind: 'tipo-desconocido' });
  issue(await capture({ db, businessId: 'tenant-a' }), 'VAULT_AMOUNT_OR_KIND_UNVERIFIED');
  await vault('tenant-a').doc('vault-a').update({ kind: 'deposito' });

  const changed = await capture({ db, businessId: 'tenant-a', pageSize: 1,
    afterFirstPass: () => payments.doc('payment-a').update({ total: 91 }),
  });
  blocked(changed);
  assert.equal(changed.capture.stable, false);
  issue(changed, 'SOURCES_CHANGED_DURING_READ');
  await payments.doc('payment-a').update({ total: 90 });
  issue(await capture({ db, businessId: 'missing' }), 'BUSINESS_NOT_FOUND_OR_MISMATCH');
  const failed = await capture({ db: { collection: () => ({ doc: () => ({
    get: async () => { throw new Error('denied'); },
  }) }) }, businessId: 'tenant-a' });
  blocked(failed);
  issue(failed, 'READ_FAILED');

  const batch = db.batch();
  for (let i = 0; i < 201; i++) {
    batch.set(orders.doc('overflow-' + String(i).padStart(3, '0')), {
      restaurantId: 'tenant-b', billingStatus: 'PENDIENTE',
    });
  }
  await batch.commit();
  const overflow = await capture({ db, businessId: 'tenant-a', pageSize: 25 });
  blocked(overflow);
  issue(overflow, 'ORDERS_HISTORY_LIMIT_EXCEEDED');
  assert.equal(overflow.capture.stable, false);
  assert.equal((await orders.doc('order-a').get()).data().restaurantId, 'tenant-a');
  console.log('PASS: inventario contable A/B, páginas globales sin filtro, identidades ausentes, MIXTO, fechas, carreras y fail-closed.');
  console.log('PENDIENTE: snapshot atómico, conciliación histórica, comprobantes, reglas desplegadas y Android/iPad. NO activar Caja.');
} finally {
  await deleteApp(app);
}
