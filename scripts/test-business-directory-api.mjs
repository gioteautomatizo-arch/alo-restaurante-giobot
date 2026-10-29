// Solo Firebase Auth + Firestore Emulator: sin cuentas, reglas ni datos reales.
import assert from 'node:assert/strict';
import express from 'express';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { registerBusinessDirectoryApi } from '../businessDirectoryApi.ts';

process.env.FIREBASE_PROJECT_ID = 'gioteautomatizo-secure-business-list-test';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
delete process.env.ENABLE_SECURE_BUSINESS_LIST;
if (!getApps().length) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
const auth = getAuth();
const db = getFirestore();
const unique = Date.now().toString(36);
const [alice, bob, visitor] = await Promise.all(['alice', 'bob', 'visitor'].map(name =>
  auth.createUser({ email: name + '-' + unique + '@example.test', emailVerified: true })));
const a = 'dir-test-a', b = 'dir-test-b';
const root = (id, name) => ({
  restaurantId: id, ownerUserId: id === a ? alice.uid : bob.uid,
  branding: { restaurantName: name, publicSlug: id },
  assistant: { name: 'Giobot', customInstructions: 'PRIVADO-NO-DEVOLVER' },
  privateSettings: { apiToken: 'PRIVADO-NO-DEVOLVER' }, features: {},
});
const member = (id, uid, role = 'OWNER', active = true) =>
  ({ restaurantId: id, userId: uid, role, active });
const ref = (id, uid) => db.collection('businessMemberships').doc(id + '_' + uid);
await Promise.all([
  db.collection('businesses').doc(a).set(root(a, 'Negocio A')),
  db.collection('businesses').doc(b).set(root(b, 'Negocio B')),
  ref(a, alice.uid).set(member(a, alice.uid)),
  ref(b, bob.uid).set(member(b, bob.uid)),
]);
async function token(user) {
  const custom = await auth.createCustomToken(user.uid);
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  assert.equal(response.ok, true, 'Auth Emulator debe emitir token');
  return (await response.json()).idToken;
}
const [aliceToken, bobToken, visitorToken] = await Promise.all([token(alice), token(bob), token(visitor)]);
const app = express();
registerBusinessDirectoryApi(app);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
async function call(bearer) {
  const response = await fetch(origin + '/api/businesses/mine', {
    headers: bearer ? { Authorization: 'Bearer ' + bearer } : {},
  });
  return {
    status: response.status, data: await response.json(),
    cache: response.headers.get('cache-control'),
  };
}
const ids = result => result.data.businesses?.map(item => item.restaurantId).sort();
try {
  assert.equal((await call(aliceToken)).status, 404, 'Ruta inactiva por defecto');
  process.env.ENABLE_SECURE_BUSINESS_LIST = 'true';
  assert.equal((await call()).status, 401, 'Sin sesión');
  assert.equal((await call('invalid.token')).status, 401, 'Token falsificado');
  const ownA = await call(aliceToken);
  assert.equal(ownA.status, 200, JSON.stringify(ownA));
  assert.deepEqual(ids(ownA), [a]);
  assert.deepEqual(Object.keys(ownA.data.businesses[0]).sort(), ['branding', 'restaurantId']);
  assert.deepEqual(Object.keys(ownA.data.businesses[0].branding).sort(), ['publicSlug', 'restaurantName']);
  assert.equal(JSON.stringify(ownA.data).includes('PRIVADO-NO-DEVOLVER'), false,
    'El selector no debe filtrar instrucciones IA ni campos privados de la raíz');
  assert.equal(ownA.cache, 'no-store', 'Sin cachear datos privados');
  assert.deepEqual(ids(await call(bobToken)), [b], 'B no debe ver A');
  assert.deepEqual(ids(await call(visitorToken)), [], 'Sin membresías no hay negocios');

  // Una membresía real en dos negocios permite listar ambos, sin mezclar cuentas.
  await ref(b, alice.uid).set(member(b, alice.uid, 'WAITER'));
  const employeeList = await call(aliceToken);
  assert.deepEqual(ids(employeeList), [a, b]);
  assert.equal(JSON.stringify(employeeList.data).includes('PRIVADO-NO-DEVOLVER'), false,
    'Un empleado de B tampoco recibe configuración interna');

  // OWNER de A no puede presentar una raíz cuyo propietario explícito sea B.
  await db.collection('businesses').doc(a).update({ ownerUserId: bob.uid });
  assert.equal((await call(aliceToken)).status, 409, 'OWNER y raíz discordantes');
  await db.collection('businesses').doc(a).update({ ownerUserId: alice.uid });
  assert.deepEqual(ids(await call(aliceToken)), [a, b], 'Recuperación del OWNER');

  // El campo OWNER es opcional en raíces históricas; no bloquear su lectura.
  await db.collection('businesses').doc(a).update({ ownerUserId: FieldValue.delete() });
  assert.deepEqual(ids(await call(aliceToken)), [a, b], 'Raíz histórica sin ownerUserId');
  await db.collection('businesses').doc(a).update({ ownerUserId: alice.uid });

  // Una ficha mal asociada nunca sale en JSON, ni se devuelve lista parcial.
  await ref(b, alice.uid).set({ ...member(b, alice.uid), restaurantId: a });
  const corrupt = await call(aliceToken);
  assert.equal(corrupt.status, 409);
  assert.equal('businesses' in corrupt.data, false);
  assert.equal(JSON.stringify(corrupt.data).includes('Negocio B'), false);
  assert.deepEqual(ids(await call(bobToken)), [b], 'Anomalía de A no afecta a B');
  await ref(b, alice.uid).set(member(b, alice.uid, 'WAITER'));

  await ref(b, alice.uid).set({ ...member(b, alice.uid), role: 'ROL_FALSO' });
  assert.equal((await call(aliceToken)).status, 409, 'Rol histórico inválido');
  await ref(b, alice.uid).set(member(b, alice.uid, 'WAITER'));

  // Rechazar raíz huérfana/discordante sin entregar datos de A.
  await db.collection('businesses').doc(b).delete();
  assert.equal((await call(aliceToken)).status, 409, 'Raíz ausente');
  await db.collection('businesses').doc(b).set({ ...root(b, 'Negocio B'), restaurantId: a });
  assert.equal((await call(aliceToken)).status, 409, 'Raíz de otro tenant');
  await db.collection('businesses').doc(b).set(root(b, 'Negocio B'));
  assert.deepEqual(ids(await call(aliceToken)), [a, b], 'Recuperación de raíz válida');

  await db.collection('businesses').doc(b).update({ 'branding.logoUrl': 123 });
  assert.equal((await call(aliceToken)).status, 409, 'Logo inválido no debe pasar al cliente');
  await db.collection('businesses').doc(b).set({ ...root(b, 'Negocio B'), branding: {
    restaurantName: 'Negocio B', publicSlug: b, logoUrl: 'https://example.test/logo.png',
  }});
  const withLogo = await call(aliceToken);
  assert.equal(withLogo.status, 200);
  assert.equal(withLogo.data.businesses.find(item => item.restaurantId === b).branding.logoUrl,
    'https://example.test/logo.png', 'Logo opcional válido conservado');

  await ref(b, alice.uid).update({ active: false });
  assert.deepEqual(ids(await call(aliceToken)), [a], 'Revocación sin datos del tenant B');
  assert.deepEqual(ids(await call(bobToken)), [b]);

  // Límite sin paginación: jamás devolver los primeros 100 como lista parcial.
  const batch = db.batch();
  for (let i = 0; i < 101; i++) {
    const id = 'overflow-' + String(i).padStart(3, '0');
    batch.set(ref(id, visitor.uid), member(id, visitor.uid, 'EMPLOYEE'));
  }
  await batch.commit();
  const overflow = await call(visitorToken);
  assert.equal(overflow.status, 409);
  assert.equal('businesses' in overflow.data, false);

  console.log('PASS (API opt-in NO activada): Auth, A/B, salida mínima sin campos privados, OWNER/raíz, compatibilidad histórica, roles, revocación, errores y límite 100 en emuladores.');
} finally {
  delete process.env.ENABLE_SECURE_BUSINESS_LIST;
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}
