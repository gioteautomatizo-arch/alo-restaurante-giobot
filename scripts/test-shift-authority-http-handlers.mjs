/**
 * Contrato HTTP sin red pública: Auth verificado simulado + Firestore Admin Emulator.
 * Ninguna ruta se registra ni se usa Firebase real.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createShiftAuthorityHttpHandlers } from '../src/lib/shiftAuthorityHttpHandlers.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'ALTO: solo emulador local');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
assert(!server.includes('shiftAuthorityHttpHandlers') && !/\/api\/shifts?\b/.test(server),
  'No montar endpoints de Caja sin migración de cliente/reglas y revisión humana');

const app = initializeApp({ projectId: 'gioteautomatizo-shift-http-boundary-test' }, 'shift-http-boundary');
const db = getFirestore(app);
const root = (id) => db.collection('businesses').doc(id);
const member = (id, uid) => db.collection('businessMemberships').doc(id + '_' + uid);
const tokens = new Map([
  ['owner-a-token', { uid: 'owner-a', name: 'Propietaria A' }],
  ['owner-b-token', { uid: 'owner-b', name: 'Propietario B' }],
  ['cashier-a-token', { uid: 'cashier-a', email: 'cashier-a@example.test' }],
  ['revoked-a-token', { uid: 'revoked-a', name: 'Revocada' }],
]);
const verified = [];
const auth = {
  async verifyIdToken(token, checkRevoked) {
    verified.push({ token, checkRevoked });
    assert.equal(checkRevoked, true, 'Verificar revocación en cada petición');
    if (token === 'revoked-a-token' || !tokens.has(token)) throw new Error('invalid/revoked');
    return tokens.get(token);
  },
};
let now = new Date('2026-10-31T13:00:00.000Z');
const handlers = createShiftAuthorityHttpHandlers({ auth, db, now: () => now });
const call = async (method, token, body, header = token ? 'Bearer ' + token : undefined) => {
  const res = {
    code: 200, payload: null,
    status(code) { this.code = code; return this; },
    json(value) { this.payload = value; return this; },
  };
  await handlers[method]({ headers: { authorization: header }, body }, res);
  const { status: state, ...payload } = res.payload;
  return { httpState: state, status: res.code, ...payload };
};
const open = (tenant, requestId = 'open-request-a') =>
  ({ businessId: tenant, requestId, initialCashFund: 100 });
const close = (tenant, shiftId, requestId = 'close-request-a') =>
  ({ businessId: tenant, shiftId, requestId, countedCash: 150 });

try {
  for (const [id, uid] of [['tenant-a', 'owner-a'], ['tenant-b', 'owner-b']]) {
    await root(id).set({ restaurantId: id, ownerUserId: uid });
    await member(id, uid).set({ restaurantId: id, userId: uid, role: 'OWNER', active: true });
  }
  await member('tenant-a', 'cashier-a').set({
    restaurantId: 'tenant-a', userId: 'cashier-a', role: 'CASHIER', active: true,
  });

  assert.equal((await call('open', null, open('tenant-a'))).status, 401);
  assert.equal((await call('open', 'revoked-a-token', open('tenant-a'))).status, 401);
  assert.equal((await call('open', 'invalid-token', open('tenant-a'))).status, 401);
  assert.equal((await call('open', 'owner-a-token', open('tenant-a'), 'Basic token')).status, 401);
  assert.equal((await call('open', 'owner-a-token', { ...open('tenant-a'), actorUid: 'owner-b' })).status, 400);
  assert.equal((await call('open', 'owner-a-token', { ...open('tenant-a'), openedAt: '2099-01-01T00:00:00Z' })).status, 400);
  assert.equal((await call('open', 'owner-a-token', { ...open('tenant-a'), initialCashFund: 1.001 })).status, 400);
  assert.equal((await call('open', 'owner-a-token', open('tenant-b', 'open-foreign-a'))).status, 403);

  const a = await call('open', 'owner-a-token', open('tenant-a'));
  assert.equal(a.status, 201);
  assert.match(a.shiftId, /^srv-[0-9a-f]{32}$/);
  const storedA = (await root('tenant-a').collection('shifts').doc(a.shiftId).get()).data();
  assert.equal(storedA.openedByUid, 'owner-a');
  assert.equal(storedA.openedByName, 'Propietaria A');
  assert.equal(storedA.openedAt, now.toISOString(), 'Hora proviene exclusivamente del servidor');
  assert.equal((await call('open', 'owner-a-token', open('tenant-a'))).status, 200);
  assert.equal((await call('open', 'cashier-a-token', open('tenant-a', 'open-cashier-a'))).status, 409);

  const b = await call('open', 'owner-b-token', open('tenant-b', 'open-request-b'));
  assert.equal(b.status, 201);
  assert.notEqual(b.shiftId, a.shiftId);
  await db.collection('table_payments').doc('table-b').set({
    restaurantId: 'tenant-b', status: 'PAGADO', total: 12,
    createdAt: '2026-10-31T13:10:00.000Z',
  });
  await db.collection('restaurant_orders').doc('pickup-a').set({
    restaurantId: 'tenant-a', billingStatus: 'PAGADO', status: 'ENTREGADO',
    orderType: 'pickup', total: 50, paymentMethod: 'MIXTO',
    paidAt: '2026-10-31T13:10:00.000Z',
  });
  now = new Date('2026-10-31T14:00:00.000Z');
  assert.equal((await call('close', 'owner-a-token', { ...close('tenant-a', a.shiftId), salesCash: 999 })).status, 400);
  assert.equal((await call('close', 'owner-a-token', { ...close('tenant-a', a.shiftId), actorUid: 'owner-b' })).status, 400);
  assert.equal((await call('close', 'owner-a-token', { ...close('tenant-a', a.shiftId), closedAt: '2099-01-01T00:00:00Z' })).status, 400);
  assert.equal((await call('close', 'owner-a-token', close('tenant-a', 'legacy-id'))).status, 400);
  assert.equal((await call('close', 'owner-b-token', close('tenant-a', a.shiftId))).status, 403);
  assert.equal((await call('close', 'revoked-a-token', close('tenant-a', a.shiftId))).status, 401);
  assert.equal((await call('close', 'owner-a-token', close('tenant-a', a.shiftId))).status, 422,
    'MIXTO sin conciliación nunca autoriza cierre');

  await db.collection('restaurant_orders').doc('pickup-a').update({ paymentMethod: 'efectivo' });
  // Dos peticiones de distintos cajeros compiten en una sola transacción.
  const results = await Promise.all([
    call('close', 'owner-a-token', close('tenant-a', a.shiftId, 'close-owner-a')),
    call('close', 'cashier-a-token', close('tenant-a', a.shiftId, 'close-cashier-a')),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const winner = results.find((r) => r.status === 200);
  assert.equal(winner.totalSales, 50);
  assert.equal(winner.expectedCash, 150);
  const storedClosed = (await root('tenant-a').collection('shifts').doc(a.shiftId).get()).data();
  assert.equal(storedClosed.closedAt, now.toISOString());
  assert(['owner-a', 'cashier-a'].includes(storedClosed.closedByUid));
  assert.equal(storedClosed.closedByName,
    storedClosed.closedByUid === 'owner-a' ? 'Propietaria A' : 'cashier-a@example.test');
  const winningToken = storedClosed.closedByUid === 'owner-a' ? 'owner-a-token' : 'cashier-a-token';
  assert.equal((await call('close', winningToken,
    close('tenant-a', a.shiftId, storedClosed.closeRequestId))).status, 200,
  'Reintento idéntico es idempotente');
  assert.equal((await call('close', winningToken,
    close('tenant-a', a.shiftId, 'different-request'))).status, 409);
  assert.equal((await root('tenant-b').collection('shifts').doc(b.shiftId).get()).data().status, 'abierto');
  assert(verified.length > 0 && verified.every((x) => x.checkRevoked === true));
  console.log('PASS: contrato HTTP aislado Auth revocado, UID/hora/nombre servidor, A/B, inyección, MIXTO, concurrencia e idempotencia.');
  console.log('PENDIENTE: sin rutas montadas, sin tokens Auth reales, sin reglas server-only ni conciliación histórica/despliegue.');
} finally {
  await deleteApp(app);
}
