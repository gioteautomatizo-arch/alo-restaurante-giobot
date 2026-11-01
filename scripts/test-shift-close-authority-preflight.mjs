/** Solo Firestore Emulator y datos ficticios; NO endpoints ni datos reales. */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { openShiftPreflight } from '../src/lib/shiftOpenAuthorityPreflight.mjs';
import { closeShiftPreflight, ShiftCloseDenied } from '../src/lib/shiftCloseAuthorityPreflight.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'ALTO: solo emulador local');
const app = initializeApp({ projectId: 'gioteautomatizo-shift-close-preflight-test' }, 'shift-close-preflight');
const db = getFirestore(app);
const root = (id) => db.collection('businesses').doc(id);
const member = (id, uid) => db.collection('businessMemberships').doc(id + '_' + uid);
const open = (id, uid, req, at = '2026-10-31T13:00:00.000Z') =>
  openShiftPreflight({ db, businessId: id, actorUid: uid, requestId: req,
    initialCashFund: 100, openedByName: 'Prueba', openedAt: at });
const close = (id, uid, shiftId, req, extra = {}) =>
  closeShiftPreflight({ db, businessId: id, actorUid: uid, shiftId, requestId: req,
    closedAt: '2026-10-31T14:00:00.000Z', countedCash: 136.5,
    closedByName: 'Cajero ficticio', ...extra });
const denied = (promise, code) => assert.rejects(promise,
  (error) => error instanceof ShiftCloseDenied && error.code === code);
try {
  for (const id of ['tenant-a', 'tenant-b']) {
    const uid = 'owner-' + id.slice(-1);
    await root(id).set({ restaurantId: id, ownerUserId: uid });
    await member(id, uid).set({ restaurantId: id, userId: uid, role: 'OWNER', active: true });
  }
  await member('tenant-a', 'cashier-a').set({
    restaurantId: 'tenant-a', userId: 'cashier-a', role: 'CASHIER', active: true,
  });
  await member('tenant-a', 'revoked-a').set({
    restaurantId: 'tenant-a', userId: 'revoked-a', role: 'CASHIER', active: false,
  });
  const a = (await open('tenant-a', 'owner-a', 'open-request-a')).shiftId;
  const b = (await open('tenant-b', 'owner-b', 'open-request-b')).shiftId;
  await denied(close('tenant-a', 'owner-b', a, 'close-foreign-a'), 'FORBIDDEN');
  await denied(close('tenant-a', 'revoked-a', a, 'close-revoked-a'), 'FORBIDDEN');
  await denied(close('tenant-a', 'owner-a', b, 'close-wrong-id'), 'SHIFT_NOT_FOUND');
  await denied(close('tenant-a', 'owner-a', a, 'bad'), 'INVALID_INPUT');
  await denied(close('tenant-a', 'owner-a', a, 'close-invalid-money', { countedCash: 1.001 }), 'INVALID_MONEY');
  await denied(close('tenant-a', 'owner-a', a, 'close-before-open', {
    closedAt: '2026-10-31T12:00:00.000Z',
  }), 'INVALID_CLOSE_TIME');

  const orders = db.collection('restaurant_orders');
  await orders.doc('order-a-cash').set({
    restaurantId: 'tenant-a', billingStatus: 'PAGADO', status: 'ENTREGADO',
    orderType: 'pickup', total: 50, paymentMethod: 'efectivo',
    paidAt: '2026-10-31T13:10:00.000Z',
  });
  await orders.doc('order-a-card').set({
    restaurantId: 'tenant-a', billingStatus: 'PAGADO', status: 'ENTREGADO',
    orderType: 'delivery', total: 20, paymentMethod: 'tarjeta',
    paidAt: '2026-10-31T13:11:00.000Z',
  });
  await root('tenant-a').collection('expenses').doc('expense-a').set({
    businessId: 'tenant-a', amount: 10, paidWith: 'efectivo_caja',
    createdAt: '2026-10-31T13:20:00.000Z',
  });
  await root('tenant-a').collection('vault').doc('deposit-a').set({
    businessId: 'tenant-a', kind: 'deposito', amount: 5,
    createdAt: '2026-10-31T13:21:00.000Z',
  });
  await root('tenant-a').collection('vault').doc('withdraw-a').set({
    businessId: 'tenant-a', kind: 'retiro', amount: 2,
    createdAt: '2026-10-31T13:22:00.000Z',
  });
  // B tiene ventas propias: no deben contaminar A.
  await orders.doc('order-b').set({
    restaurantId: 'tenant-b', billingStatus: 'PAGADO', status: 'ENTREGADO',
    orderType: 'pickup', total: 90, paymentMethod: 'efectivo',
    paidAt: '2026-10-31T13:10:00.000Z',
  });
  await orders.doc('order-a-card').update({ paymentMethod: 'MIXTO' });
  await denied(close('tenant-a', 'owner-a', a, 'close-mixed-a'), 'PAYMENT_METHOD_REVIEW_REQUIRED');
  await orders.doc('order-a-card').update({ paymentMethod: 'tarjeta' });
  await orders.doc('order-a-cash').update({ paidAt: null });
  await denied(close('tenant-a', 'owner-a', a, 'close-undated-a'), 'UNVERIFIED_DATE');
  await orders.doc('order-a-cash').update({ paidAt: '2026-10-31T13:10:00.000Z' });
  await root('tenant-a').collection('expenses').doc('expense-a').update({ amount: -1 });
  await denied(close('tenant-a', 'owner-a', a, 'close-bad-expense'), 'INVALID_MONEY');
  await root('tenant-a').collection('expenses').doc('expense-a').update({ amount: 10 });
  await db.collection('table_payments').doc('payment-a').set({
    restaurantId: 'tenant-a', status: 'PAGADO', total: 30,
    paymentMethod: 'MIXTO', createdAt: '2026-10-31T13:30:00.000Z',
  });
  await denied(close('tenant-a', 'owner-a', a, 'close-table-a'), 'TABLE_PAYMENTS_REVIEW_REQUIRED');
  await db.collection('table_payments').doc('payment-a').delete();

  // Dos cajeros compiten: exactamente un cierre y un recibo.
  const competing = await Promise.allSettled([
    close('tenant-a', 'owner-a', a, 'close-owner-a'),
    close('tenant-a', 'cashier-a', a, 'close-cashier-a'),
  ]);
  const good = competing.filter((x) => x.status === 'fulfilled');
  const bad = competing.filter((x) => x.status === 'rejected');
  assert.equal(good.length, 1, JSON.stringify(competing));
  assert.equal(bad.length, 1, JSON.stringify(competing));
  assert.equal(bad[0].reason.code, 'SHIFT_ALREADY_CLOSED');
  assert.equal(good[0].value.totalSales, 70);
  assert.equal(good[0].value.expectedCash, 137);
  assert.equal(good[0].value.cashDifference, -0.5);
  assert.equal(good[0].value.count, 2);
  const stored = (await root('tenant-a').collection('shifts').doc(a).get()).data();
  assert.equal(stored.status, 'cerrado');
  assert.equal((await root('tenant-a').collection('shiftAuthority').doc('current').get()).exists, false);
  assert.equal((await root('tenant-a').collection('shiftAuthority').doc('closed-' + a).get()).exists, true);
  assert.equal((await close('tenant-a', stored.closedByUid, a, stored.closeRequestId)).status, 'already_closed');
  await denied(close('tenant-a', 'owner-a', a, 'close-different-retry'), 'SHIFT_ALREADY_CLOSED');

  assert.equal((await root('tenant-b').collection('shifts').doc(b).get()).data().status, 'abierto');
  await member('tenant-b', 'owner-b').update({ active: false });
  await denied(close('tenant-b', 'owner-b', b, 'close-revoked-b'), 'FORBIDDEN');
  await member('tenant-b', 'owner-b').update({ active: true });
  const bClosed = await close('tenant-b', 'owner-b', b, 'close-owner-b', { countedCash: 190 });
  assert.equal(bClosed.totalSales, 90);
  assert.equal(bClosed.expectedCash, 190);

  // Candado liberado: otra apertura sin sobrescribir el recibo del turno anterior.
  const next = (await open('tenant-a', 'owner-a', 'open-request-a-next',
    '2026-10-31T15:00:00.000Z')).shiftId;
  assert.notEqual(next, a);
  assert.equal((await root('tenant-a').collection('shiftAuthority').doc('current').get()).data().shiftId, next);
  assert.equal((await close('tenant-a', stored.closedByUid, a, stored.closeRequestId)).status, 'already_closed');
  assert.equal((await root('tenant-a').collection('shiftAuthority').doc('current').get()).data().shiftId, next);
  console.log('PASS: cierre Admin aislado A/B, centavos, mesa/MIXTO/fechas, roles, concurrencia, recibo idempotente y reapertura.');
  console.log('PENDIENTE: STAGED permite escrituras cliente; sin endpoint, conciliación histórica ni autoridad contable en producción.');
} finally { await deleteApp(app); }
