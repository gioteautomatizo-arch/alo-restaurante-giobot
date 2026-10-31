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
// Interceptar exclusivamente el punto entre lectura de raíces y revalidación.
// La mutación ocurre realmente en Firestore Emulator, no en un mock de datos.
const originalGetAll = db.getAll.bind(db);
let afterRootsRead = null;
let rootReads = 0;
db.getAll = async (...refs) => {
  const snapshots = await originalGetAll(...refs);
  if (refs.length && refs.every(ref => ref.parent.id === 'businesses')) rootReads++;
  if (afterRootsRead && refs.length && refs.every(ref => ref.parent.id === 'businesses')) {
    const action = afterRootsRead;
    afterRootsRead = null;
    await action();
  }
  return snapshots;
};
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

  // Un OWNER histórico sin propietario verificable no puede pasar la puerta
  // opt-in. El cliente heredado sigue intacto hasta un corte autorizado.
  await db.collection('businesses').doc(a).update({ ownerUserId: FieldValue.delete() });
  const historicalOwner = await call(aliceToken);
  assert.equal(historicalOwner.status, 409, 'OWNER histórico sin ownerUserId exige revisión');
  assert.equal('businesses' in historicalOwner.data, false, 'Sin lista parcial para OWNER histórico');
  assert.deepEqual(ids(await call(bobToken)), [b], 'La raíz histórica de A no bloquea a B');
  await db.collection('businesses').doc(a).update({ ownerUserId: alice.uid });
  assert.deepEqual(ids(await call(aliceToken)), [a, b], 'OWNER válido recupera el listado');

  // Simular un cambio de propietario DESPUÉS de la primera lectura de raíces
  // pero ANTES de responder. La revalidación final debe rechazar la lista.
  for (const [label, mutate] of [
    ['cambio de propietario en vuelo', () =>
      db.collection('businesses').doc(a).update({ ownerUserId: bob.uid })],
    ['propietario eliminado en vuelo', () =>
      db.collection('businesses').doc(a).update({ ownerUserId: FieldValue.delete() })],
  ]) {
    afterRootsRead = mutate;
    const staleOwner = await call(aliceToken);
    assert.equal(staleOwner.status, 409, label + ': no autorizar snapshot OWNER obsoleto');
    assert.equal('businesses' in staleOwner.data, false, label + ': no devolver tarjetas parciales');
    await db.collection('businesses').doc(a).update({ ownerUserId: alice.uid });
    assert.deepEqual(ids(await call(aliceToken)), [a, b], label + ': recuperación tras restaurar OWNER');
    assert.deepEqual(ids(await call(bobToken)), [b], label + ': B permanece aislado');
  }

  // Una ficha mal asociada nunca sale en JSON, ni se devuelve lista parcial.
  await ref(b, alice.uid).set({ ...member(b, alice.uid), restaurantId: a });
  const corrupt = await call(aliceToken);
  assert.equal(corrupt.status, 409);
  assert.equal('businesses' in corrupt.data, false);
  assert.equal(JSON.stringify(corrupt.data).includes('Negocio B'), false);
  assert.deepEqual(ids(await call(bobToken)), [b], 'Anomalía de A no afecta a B');
  await ref(b, alice.uid).set(member(b, alice.uid, 'WAITER'));

  // SUPER_ADMIN es un rol de plataforma, nunca una membresía tenant.
  // Admin SDK ignora las reglas: el endpoint debe rechazarlo por sí mismo,
  // antes de consultar raíces y sin entregar la tarjeta válida de A.
  const beforeForgedRole = rootReads;
  await ref(b, alice.uid).set(member(b, alice.uid, 'SUPER_ADMIN'));
  const forgedGlobalRole = await call(aliceToken);
  assert.equal(forgedGlobalRole.status, 409, 'SUPER_ADMIN tenant debe bloquear listado');
  assert.equal('businesses' in forgedGlobalRole.data, false, 'Sin lista parcial para rol global forjado');
  assert.equal(rootReads, beforeForgedRole, 'No consultar raíces con membresía de rol global');
  assert.deepEqual(ids(await call(bobToken)), [b], 'OWNER legítimo de B conserva acceso');
  await ref(b, alice.uid).set(member(b, alice.uid, 'WAITER'));
  assert.deepEqual(ids(await call(aliceToken)), [a, b], 'Empleado legítimo recupera listado');

  // El mismo contrato debe rechazar el rol global en la membresía OWNER.
  await ref(a, alice.uid).set(member(a, alice.uid, 'SUPER_ADMIN'));
  const forgedOwner = await call(aliceToken);
  assert.equal(forgedOwner.status, 409, 'Rol global no sustituye OWNER de A');
  assert.equal('businesses' in forgedOwner.data, false);
  await ref(a, alice.uid).set(member(a, alice.uid, 'OWNER'));
  assert.deepEqual(ids(await call(aliceToken)), [a, b], 'OWNER legítimo vuelve a funcionar');

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

  // La consulta inicial puede leer WAITER activo antes de una revocación,
  // borrado o cambio de rol. Ninguno debe producir lista parcial ni exponer B.
  for (const [label, mutation] of [
    ['revocación en vuelo', () => ref(b, alice.uid).update({ active: false })],
    ['cambio de rol en vuelo', () => ref(b, alice.uid).update({ role: 'MANAGER' })],
    ['rol global forjado en vuelo', () => ref(b, alice.uid).update({ role: 'SUPER_ADMIN' })],
    ['borrado en vuelo', () => ref(b, alice.uid).delete()],
  ]) {
    await ref(b, alice.uid).set(member(b, alice.uid, 'WAITER'));
    afterRootsRead = mutation;
    const stale = await call(aliceToken);
    assert.equal(stale.status, 409, label + ': rechazar snapshot obsoleto');
    assert.equal('businesses' in stale.data, false, label + ': nunca devolver lista parcial');
    assert.equal(JSON.stringify(stale.data).includes('Negocio B'), false, label + ': sin datos de B');
    assert.deepEqual(ids(await call(bobToken)), [b], label + ': B conserva su acceso');
    await ref(b, alice.uid).set(member(b, alice.uid, 'WAITER'));
    assert.deepEqual(ids(await call(aliceToken)), [a, b], label + ': recuperación tras restaurar permisos');
  }

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

  console.log('PASS (API opt-in NO activada): Auth, A/B, salida mínima, OWNER/raíz estrictos, rol global tenant rechazado antes de raíces y durante revalidación, legado sin ownerUserId bloqueado, revocación/rol/borrado, recuperación y límite 100 en emuladores.');
  console.warn('PENDIENTE: revisión manual de OWNER históricos, costos de lecturas adicionales, reglas efectivas y corte compatible con clientes antiguos; la revalidación no es atómica.');
} finally {
  afterRootsRead = null;
  db.getAll = originalGetAll;
  delete process.env.ENABLE_SECURE_BUSINESS_LIST;
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}
