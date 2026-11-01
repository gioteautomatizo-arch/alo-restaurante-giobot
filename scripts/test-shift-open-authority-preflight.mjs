/** Solo Firebase Emulator y datos ficticios; NO se llama a un endpoint real. */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { openShiftPreflight, ShiftOpenDenied } from '../src/lib/shiftOpenAuthorityPreflight.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'ALTO: solo emulador local');
const projectId = 'gioteautomatizo-shift-open-preflight-test';
const app = initializeApp({ projectId }, 'shift-open-preflight');
const db = getFirestore(app);
const at = '2026-10-31T13:00:00.000Z';
const open = (businessId, actorUid, requestId, initialCashFund = 100) =>
  openShiftPreflight({ db, businessId, actorUid, requestId, initialCashFund, openedByName: 'Persona ficticia', openedAt: at });
const denied = async (promise, code) => assert.rejects(promise, (error) => error instanceof ShiftOpenDenied && error.code === code);
const root = (id) => db.collection('businesses').doc(id);
const membership = (id, uid) => db.collection('businessMemberships').doc(id + '_' + uid);
try {
  await root('tenant-a').set({ restaurantId: 'tenant-a', ownerUserId: 'owner-a' });
  await root('tenant-b').set({ restaurantId: 'tenant-b', ownerUserId: 'owner-b' });
  await membership('tenant-a', 'owner-a').set({ restaurantId: 'tenant-a', userId: 'owner-a', role: 'OWNER', active: true });
  await membership('tenant-b', 'owner-b').set({ restaurantId: 'tenant-b', userId: 'owner-b', role: 'OWNER', active: true });
  await membership('tenant-a', 'cashier-a').set({ restaurantId: 'tenant-a', userId: 'cashier-a', role: 'CASHIER', active: true });
  await membership('tenant-a', 'revoked-a').set({ restaurantId: 'tenant-a', userId: 'revoked-a', role: 'CASHIER', active: false });
  await membership('tenant-a', 'waiter-a').set({ restaurantId: 'tenant-a', userId: 'waiter-a', role: 'WAITER', active: true });
  await denied(open('tenant-a', 'owner-b', 'request-foreign'), 'FORBIDDEN');
  await denied(open('tenant-a', 'revoked-a', 'request-revoked'), 'FORBIDDEN');
  await denied(open('tenant-a', 'waiter-a', 'request-waiter'), 'FORBIDDEN');
  await denied(open('tenant-a', 'owner-a', 'request-invalid', -1), 'INVALID_INPUT');
  await denied(open('tenant-a', 'owner-a', 'request-invalid', 1.001), 'INVALID_INPUT');
  await denied(open('tenant-a', 'owner-a', 'bad'), 'INVALID_INPUT');
  assert.equal((await root('tenant-a').collection('shifts').get()).size, 0);

  // Dos cajeros/propietarios compiten por un candado único; exactamente uno abre.
  const competing = await Promise.allSettled([
    open('tenant-a', 'owner-a', 'request-owner-a'),
    open('tenant-a', 'cashier-a', 'request-cashier-a'),
  ]);
  const successful = competing.filter((x) => x.status === 'fulfilled');
  const rejected = competing.filter((x) => x.status === 'rejected');
  assert.equal(successful.length, 1, JSON.stringify(competing));
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'OPEN_SHIFT_EXISTS_OR_LOCK_UNVERIFIED');
  const lock = (await root('tenant-a').collection('shiftAuthority').doc('current').get()).data();
  assert.equal(successful[0].value.shiftId, lock.shiftId);
  assert.equal((await open('tenant-a', lock.actorUid, lock.requestId)).status, 'already_open');
  assert.equal((await root('tenant-a').collection('shifts').get()).size, 1);
  await denied(open('tenant-a', 'owner-a', 'request-new-after'), 'OPEN_SHIFT_EXISTS_OR_LOCK_UNVERIFIED');

  // El negocio B no comparte candado, historial ni UID con A.
  assert.equal((await open('tenant-b', 'owner-b', 'request-owner-b')).status, 'opened');
  assert.equal((await root('tenant-b').collection('shifts').get()).size, 1);
  await membership('tenant-b', 'owner-b').update({ active: false });
  await denied(open('tenant-b', 'owner-b', 'request-owner-b'), 'FORBIDDEN');

  // Un turno legado sin candado no debe crear un segundo turno.
  await root('tenant-c').set({ restaurantId: 'tenant-c', ownerUserId: 'owner-c' });
  await membership('tenant-c', 'owner-c').set({ restaurantId: 'tenant-c', userId: 'owner-c', role: 'OWNER', active: true });
  await root('tenant-c').collection('shifts').doc('legacy').set({ businessId: 'tenant-c', status: 'abierto', openedAt: at });
  await denied(open('tenant-c', 'owner-c', 'request-owner-c'), 'OPEN_SHIFT_EXISTS_OR_LOCK_UNVERIFIED');
  assert.equal((await root('tenant-c').collection('shifts').get()).size, 1);
  // Los históricos sin identidad no se pueden pasar por alto.
  await root('tenant-d').set({ restaurantId: 'tenant-d', ownerUserId: 'owner-d' });
  await membership('tenant-d', 'owner-d').set({ restaurantId: 'tenant-d', userId: 'owner-d', role: 'OWNER', active: true });
  await root('tenant-d').collection('shifts').doc('legacy').set({ status: 'cerrado' });
  await denied(open('tenant-d', 'owner-d', 'request-owner-d'), 'HISTORY_REVIEW_REQUIRED');
  console.log('PASS: preflight de apertura Admin A/B, rol, revocación, idempotencia, concurrencia y legado (emulador).');
  console.log('PENDIENTE: no hay endpoint autenticado, corte de Caja ni reglas cliente desplegadas; apertura preflight NO habilitada.');
} finally { await deleteApp(app); }
