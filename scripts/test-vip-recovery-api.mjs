/**
 * Pruebas de integración del backend VIP con datos ficticios.
 * Ejecutar exclusivamente con Firebase Firestore Emulator. Nunca producción.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import { getApps, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { registerVipRecoveryApi } from '../vipRecoveryApi.ts';
import { computeVipDocId, computePinHash } from '../src/lib/vipCrypto.ts';

const projectId = 'gioteautomatizo-vip-api-test';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'PROHIBIDO ejecutar contra Firebase real; iniciar Firestore Emulator.');
process.env.FIREBASE_PROJECT_ID = projectId;
if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();
const businessA = 'vip-test-a';
const businessB = 'vip-test-b';
const unpublished = 'vip-test-hidden';
const phone = '5512340001', pin = '4382';
const expiredPhone = '5512340002', legacyPhone = '5512340003';
const lockPhone = '5512340004';
for (const id of [businessA, businessB, unpublished]) {
  await db.collection('publicBusinessProfiles').doc(id).set({
    businessId: id, restaurantId: id, published: id !== unpublished,
    branding: { restaurantName: id, vipEnabled: true },
  });
}
const app = express();
app.use(express.json());
registerVipRecoveryApi(app);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

async function api(path, { method = 'POST', body, token } = {}) {
  const response = await fetch(base + path, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, payload };
}
function register(businessId, number = phone, passcode = pin, extra = {}) {
  return api('/api/vip/register', {
    body: { businessId, phone: number, pin: passcode,
      customerName: 'Persona ficticia', ...extra },
  });
}
function recover(businessId, number = phone, passcode = pin) {
  return api('/api/vip/recover', { body: { businessId, phone: number, pin: passcode } });
}
async function profile(businessId, token) {
  return api('/api/vip/profile?businessId=' + encodeURIComponent(businessId),
    { method: 'GET', token });
}
try {
  const inactive = await register(unpublished);
  assert.equal(inactive.status, 404, 'VIP de negocio sin publicar denegado');

  const a = await register(businessA, phone, pin, {
    stamps: 50, totalOrders: 900, rewardAvailable: true,
    pendingStampsToValidate: 99, pinHash: 'fake', memberId: 'VIP-INYECTADO',
  });
  assert.equal(a.status, 201, JSON.stringify(a.payload));
  assert.equal(a.payload.profile.restaurantId, businessA);
  assert.equal(a.payload.profile.stamps, 0);
  assert.equal(a.payload.profile.totalOrders, 0);
  assert.equal(a.payload.profile.rewardAvailable, false);
  assert.equal(a.payload.profile.pendingStampsToValidate, 0);
  assert(!('pinHash' in a.payload.profile), 'el hash de PIN no debe salir de la API');
  assert.notEqual(a.payload.profile.memberId, 'VIP-INYECTADO');

  const b = await register(businessB);
  assert.equal(b.status, 201, JSON.stringify(b.payload));
  assert.notEqual(a.payload.profile.id, b.payload.profile.id, 'dos negocios distintos = perfiles separados');

  const storedA = await db.collection('vip_profiles').doc(a.payload.profile.id).get();
  const storedB = await db.collection('vip_profiles').doc(b.payload.profile.id).get();
  assert.equal(storedA.data().restaurantId, businessA);
  assert.equal(storedB.data().restaurantId, businessB);
  assert.equal(storedA.data().stamps, 0);
  assert.equal(storedA.data().pendingStampsToValidate, 0);
  assert.equal(storedA.data().pinHash, await computePinHash(pin, phone));

  const auditA = await db.collection('businesses').doc(businessA)
    .collection('auditLog').doc('vip_register_' + await computeVipDocId(phone, pin)).get();
  assert.equal(auditA.exists, true, 'registro VIP crea notificación del negocio');
  const auditB = await db.collection('businesses').doc(businessB)
    .collection('auditLog').doc('vip_register_' + await computeVipDocId(phone, pin)).get();
  assert.equal(auditB.exists, true);

  const duplicate = await register(businessA);
  assert.equal(duplicate.status, 409, 'registro repetido no reinicia sellos');

  const wrongPin = await recover(businessA, phone, '1111');
  assert.equal(wrongPin.status, 401);
  const foundA = await recover(businessA);
  assert.equal(foundA.status, 200);
  assert.equal(foundA.payload.profile.id, a.payload.profile.id);
  assert(!('pinHash' in foundA.payload.profile));
  const foundB = await recover(businessB);
  assert.equal(foundB.status, 200);
  assert.equal(foundB.payload.profile.id, b.payload.profile.id);

  assert.equal((await profile(businessB, foundA.payload.sessionToken)).status, 401,
    'sesión A no debe leer negocio B');
  assert.equal((await profile(businessA, foundB.payload.sessionToken)).status, 401);
  assert.equal((await profile(businessA, foundA.payload.sessionToken)).status, 200);
  assert.equal((await profile(businessA, null)).status, 401);

  const blockedUpdate = await api('/api/vip/profile', {
    method: 'PATCH', token: foundA.payload.sessionToken,
    body: { businessId: businessA, updates: {
      customerName: 'Nombre nuevo', address: '', reference: '',
      preferredPayment: 'efectivo', preferredOrderType: 'pickup', stamps: 99,
    } },
  });
  assert.equal(blockedUpdate.status, 400, 'el cliente nunca modifica sus sellos');

  const crossWrite = await api('/api/vip/profile', {
    method: 'PATCH', token: foundA.payload.sessionToken,
    body: { businessId: businessB, updates: {
      customerName: 'Intento ajeno', address: '', reference: '',
      preferredPayment: 'efectivo', preferredOrderType: 'pickup',
    } },
  });
  assert.equal(crossWrite.status, 401);

  const validEdit = await api('/api/vip/profile', {
    method: 'PATCH', token: foundA.payload.sessionToken,
    body: { businessId: businessA, updates: {
      customerName: 'Cambio permitido', address: 'Dirección ficticia',
      reference: '', preferredPayment: 'efectivo', preferredOrderType: 'pickup',
    } },
  });
  assert.equal(validEdit.status, 200);
  assert.equal(validEdit.payload.profile.customerName, 'Cambio permitido');
  assert.equal(validEdit.payload.profile.stamps, 0);
  assert(!('pinHash' in validEdit.payload.profile));

  const exp = await register(businessA, expiredPhone);
  assert.equal(exp.status, 201);
  const expiredHash = createHash('sha256').update(exp.payload.sessionToken).digest('hex');
  await db.collection('vip_sessions').doc(expiredHash).update({ expiresAt: Date.now() - 10 });
  assert.equal((await profile(businessA, exp.payload.sessionToken)).status, 401,
    'sesión caducada');
  const expiredPatch = await api('/api/vip/profile', {
    method: 'PATCH', token: exp.payload.sessionToken,
    body: { businessId: businessA, updates: {
      customerName: 'No editar', address: '', reference: '',
      preferredPayment: 'efectivo', preferredOrderType: 'pickup',
    } },
  });
  assert.equal(expiredPatch.status, 401);

  // Compatibilidad del identificador heredado de Calientito: no se renombra.
  const legacyId = await computeVipDocId(legacyPhone, pin);
  await db.collection('vip_profiles').doc(legacyId).set({
    restaurantId: 'alo-restaurante', memberId: 'VIP-LEGADO',
    customerName: 'Perfil legado', phone: legacyPhone,
    pinHash: await computePinHash(pin, legacyPhone),
    stamps: 4, totalOrders: 7, rewardAvailable: false,
  });
  const legacy = await recover('alo-restaurante', legacyPhone);
  assert.equal(legacy.status, 200, JSON.stringify(legacy.payload));
  assert.equal(legacy.payload.profile.id, legacyId);
  assert.equal(legacy.payload.profile.stamps, 4, 'los sellos heredados no se reinician');
  assert.equal(legacy.payload.profile.totalOrders, 7);
  assert.equal(legacy.payload.profile.memberId, 'VIP-LEGADO');

  // Tarjeta histórica de Calientito sin restaurantId: recuperación y edición sin reiniciar sellos.
  const olderPhone = '5512340005';
  const olderId = await computeVipDocId(olderPhone, pin);
  await db.collection('vip_profiles').doc(olderId).set({
    memberId: 'VIP-SIN-TENANT', customerName: 'Tarjeta antigua',
    phone: olderPhone, pinHash: await computePinHash(pin, olderPhone),
    stamps: 3, totalOrders: 11, rewardAvailable: true,
  });
  const oldRecovered = await recover('alo-restaurante', olderPhone);
  assert.equal(oldRecovered.status, 200, JSON.stringify(oldRecovered.payload));
  assert.equal(oldRecovered.payload.profile.restaurantId, 'alo-restaurante');
  assert.equal(oldRecovered.payload.profile.stamps, 3);
  assert.equal(oldRecovered.payload.profile.totalOrders, 11);
  assert.equal(oldRecovered.payload.profile.rewardAvailable, true);
  assert.equal((await profile(businessA, oldRecovered.payload.sessionToken)).status, 401);
  const oldEdited = await api('/api/vip/profile', {
    method: 'PATCH', token: oldRecovered.payload.sessionToken,
    body: { businessId: 'alo-restaurante', updates: {
      customerName: 'Tarjeta antigua verificada', address: '', reference: '',
      preferredPayment: 'efectivo', preferredOrderType: 'pickup',
    } },
  });
  assert.equal(oldEdited.status, 200);
  assert.equal(oldEdited.payload.profile.stamps, 3);
  const persistedOlder = await db.collection('vip_profiles').doc(olderId).get();
  assert.equal(persistedOlder.data().stamps, 3);
  assert.equal(persistedOlder.data().restaurantId, undefined, 'no hay migración automática');
  assert.equal((await profile('alo-restaurante', oldRecovered.payload.sessionToken)).status, 200);

  for (let i = 0; i < 5; i++) {
    const attempt = await recover(businessA, lockPhone, '4000');
    assert.equal(attempt.status, 401);
  }
  assert.equal((await recover(businessA, lockPhone, '4000')).status, 429,
    'bloqueo de PIN por teléfono y negocio');
  // Un bloqueo contra A no debe bloquear el teléfono en B.
  assert.equal((await recover(businessB, lockPhone, '4000')).status, 401);

  console.log('PASS VIP: alta, registros duplicados, PIN incorrecto, bloqueo, perfiles por negocio,');
  console.log('sesiones, caducidad, protección de sellos, legado Calientito y privacidad de hash.');
} finally {
  await new Promise(resolve => server.close(resolve));
  await Promise.all(getApps().map(firebaseApp => deleteApp(firebaseApp)));
}
