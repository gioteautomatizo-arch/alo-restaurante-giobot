/**
 * Auth Emulator real + Firestore Emulator, sin rutas HTTP montadas ni datos reales.
 * Los tokens ID proceden de signInWithCustomToken del emulador, NO de un mock.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createShiftAuthorityHttpHandlers } from '../src/lib/shiftAuthorityHttpHandlers.mjs';

const projectId = 'gioteautomatizo-shift-real-auth-test';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'ALTO: Firestore Emulator requerido');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099', 'ALTO: Auth Emulator requerido');
const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
assert(!serverSource.includes('shiftAuthorityHttpHandlers') && !/\\/api\\/shifts?\\b/.test(serverSource),
  'No montar rutas de Caja antes del corte autorizado');

const app = initializeApp({ projectId }, 'shift-real-auth');
const auth = getAuth(app);
const db = getFirestore(app);
const root = id => db.collection('businesses').doc(id);
const membership = (id, uid) => db.collection('businessMemberships').doc(id + '_' + uid);
let clock = new Date('2026-10-31T13:00:00.000Z');
const handlers = createShiftAuthorityHttpHandlers({ auth, db, now: () => clock });
const call = async (kind, token, body) => {
  const response = {
    statusCode: 200, data: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.data = value; return this; },
  };
  await handlers[kind]({
    headers: token ? { authorization: 'Bearer ' + token } : {},
    body,
  }, response);
  return { code: response.statusCode, data: response.data };
};
const open = (businessId, requestId) => ({ businessId, requestId, initialCashFund: 100 });
const close = (businessId, shiftId, requestId) =>
  ({ businessId, shiftId, requestId, countedCash: 100 });

async function issueIdToken(user) {
  const customToken = await auth.createCustomToken(user.uid);
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator-only',
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  assert.equal(response.ok, true, 'Auth Emulator debe emitir ID token');
  const data = await response.json();
  assert.equal(typeof data.idToken, 'string');
  assert.equal((await auth.verifyIdToken(data.idToken, true)).uid, user.uid,
    'Firebase Admin debe verificar un token real del emulador con checkRevoked');
  return data.idToken;
}

try {
  const [alice, bob, cashier, outsider] = await Promise.all(
    ['alice', 'bob', 'cashier', 'outsider'].map(name => auth.createUser({
      email: name + '@shift-real-auth.example.test', emailVerified: true, displayName: name,
    })),
  );
  const [aliceToken, bobToken, cashierToken, outsiderToken] = await Promise.all(
    [alice, bob, cashier, outsider].map(issueIdToken),
  );
  for (const [id, owner] of [['tenant-a', alice], ['tenant-b', bob]]) {
    await root(id).set({ restaurantId: id, ownerUserId: owner.uid });
    await membership(id, owner.uid).set({
      restaurantId: id, userId: owner.uid, role: 'OWNER', active: true,
    });
  }
  await membership('tenant-a', cashier.uid).set({
    restaurantId: 'tenant-a', userId: cashier.uid, role: 'CASHIER', active: true,
  });

  assert.equal((await call('open', null, open('tenant-a', 'request-open-a'))).code, 401);
  assert.equal((await call('open', 'forged.token', open('tenant-a', 'request-open-a'))).code, 401);
  assert.equal((await call('open', outsiderToken, open('tenant-a', 'request-open-a'))).code, 403);
  assert.equal((await call('open', aliceToken, open('tenant-b', 'request-foreign-a'))).code, 403);
  assert.equal((await call('open', aliceToken, {
    ...open('tenant-a', 'request-open-a'), actorUid: bob.uid,
  })).code, 400, 'No aceptar identidad inyectada por cliente');

  const a = await call('open', aliceToken, open('tenant-a', 'request-open-a'));
  assert.equal(a.code, 201, JSON.stringify(a));
  assert.match(a.data.shiftId, /^srv-[0-9a-f]{32}$/);
  const storedA = (await root('tenant-a').collection('shifts').doc(a.data.shiftId).get()).data();
  assert.equal(storedA.openedByUid, alice.uid);
  assert.equal(storedA.openedByName, 'alice');
  assert.equal(storedA.openedAt, clock.toISOString());
  assert.equal((await call('open', aliceToken, open('tenant-a', 'request-open-a'))).code, 200);
  assert.equal((await call('open', cashierToken, open('tenant-a', 'request-cashier-a'))).code, 409);

  const b = await call('open', bobToken, open('tenant-b', 'request-open-b'));
  assert.equal(b.code, 201, JSON.stringify(b));
  assert.notEqual(b.data.shiftId, a.data.shiftId);

  // Firebase Auth Emulator marca el usuario deshabilitado: verifyIdToken(token, true)
  // debe rechazar el token emitido previamente, sin tocar sus membresías Firestore.
  await auth.updateUser(bob.uid, { disabled: true });
  assert.equal((await call('close', bobToken, close('tenant-b', b.data.shiftId, 'request-close-b'))).code, 401,
    'El token de usuario deshabilitado no debe autorizar cierre');
  assert.equal((await root('tenant-b').collection('shifts').doc(b.data.shiftId).get()).data().status,
    'abierto', 'No cerrar turno al fallar Auth');
  await auth.updateUser(bob.uid, { disabled: false });
  const refreshedBobToken = await issueIdToken(bob);

  clock = new Date('2026-10-31T14:00:00.000Z');
  assert.equal((await call('close', aliceToken, close('tenant-b', b.data.shiftId, 'request-cross-a'))).code, 403);
  const closedA = await call('close', aliceToken, close('tenant-a', a.data.shiftId, 'request-close-a'));
  assert.equal(closedA.code, 200, JSON.stringify(closedA));
  assert.equal(closedA.data.status, 'closed');
  assert.equal(closedA.data.totalSales, 0);
  assert.equal(closedA.data.expectedCash, 100);
  assert.equal((await call('close', aliceToken, close('tenant-a', a.data.shiftId, 'request-close-a'))).data.status,
    'already_closed', 'Reintento real Auth idempotente');
  assert.equal((await call('close', cashierToken, close('tenant-a', a.data.shiftId, 'request-cashier-close'))).code,
    409, 'No permitir segundo cierre con otra identidad');

  const closedB = await call('close', refreshedBobToken,
    close('tenant-b', b.data.shiftId, 'request-close-b'));
  assert.equal(closedB.code, 200, JSON.stringify(closedB));
  assert.equal(closedB.data.status, 'closed');
  assert.equal((await root('tenant-b').collection('shifts').doc(b.data.shiftId).get()).data().closedByUid,
    bob.uid);
  console.log('PASS: tokens ID reales de Auth Emulator, usuario deshabilitado, A/B, inyección, apertura, cierre e idempotencia.');
  console.log('PENDIENTE: sin endpoint, reglas server-only, conciliación histórica/MIXTO, migración ni Auth producción.');
} finally {
  await deleteApp(app);
}
