/**
 * Ensayo exclusivamente con Firestore Emulator de una reserva create-only.
 * No registra rutas, no activa Admin SDK en producción y no toca datos reales.
 * El UID del responsable se simula como identidad previamente verificada.
 */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { reserveEmployeeCreateOnly } from './employee-create-only-proposal.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'Esta prueba exige Firestore Emulator; nunca ejecutar con datos reales.');
const app = initializeApp({ projectId: 'gioteautomatizo-employee-create-only-test' });
const db = getFirestore(app);
const roots = db.collection('businesses');
const memberships = db.collection('businessMemberships');
const a = 'tenant-create-a';
const b = 'tenant-create-b';
const memberRef = (businessId, uid) => memberships.doc(businessId + '_' + uid);
const employee = (uid, role = 'WAITER', name = uid) => ({
  userId: uid, role, name, email: uid + '@example.test',
  createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z',
});
const reserve = (businessId, managerUid, input) =>
  reserveEmployeeCreateOnly({ db, businessId, managerUid, employee: input });
const index = async businessId => (await roots.doc(businessId).get()).data().employeeUserIds ?? [];
const member = (businessId, uid, role = 'OWNER', active = true) =>
  ({ restaurantId: businessId, userId: uid, role, active });

try {
  await Promise.all([
    roots.doc(a).set({ restaurantId: a, ownerUserId: 'alice', employeeUserIds: [] }),
    roots.doc(b).set({ restaurantId: b, ownerUserId: 'bob', employeeUserIds: [] }),
    memberRef(a, 'alice').set(member(a, 'alice')),
    memberRef(b, 'bob').set(member(b, 'bob')),
    memberRef(a, 'lead').set(member(a, 'lead', 'MANAGER')),
    memberRef(a, 'revoked').set(member(a, 'revoked', 'ADMIN', false)),
    memberRef(a, 'pretend-owner').set(member(a, 'pretend-owner')),
  ]);

  // Alta válida y separación estricta de índices A/B.
  await reserve(a, 'alice', employee('staff-a'));
  await reserve(b, 'bob', employee('staff-b', 'CASHIER'));
  assert.deepEqual(await index(a), ['staff-a']);
  assert.deepEqual(await index(b), ['staff-b']);
  assert.equal((await memberRef(a, 'staff-b').get()).exists, false);
  assert.equal((await memberRef(b, 'staff-a').get()).exists, false);

  // Colisión histórica no indexada: la precondición create() impide reemplazar
  // el documento incluso si el índice raíz no menciona ese UID.
  const historical = { ...member(a, 'legacy', 'CASHIER'), name: 'HISTORICO-INTACTO',
    email: 'legacy@example.test', createdAt: '2020-01-01' };
  await memberRef(a, 'legacy').set(historical);
  await assert.rejects(reserve(a, 'alice', employee('legacy', 'WAITER', 'SOBRESCRITURA')));
  assert.deepEqual((await memberRef(a, 'legacy').get()).data(), historical);
  assert.equal((await index(a)).includes('legacy'), false,
    'Una reserva fallida tampoco puede alterar el índice');

  // Colisión indexada: falla antes de escribir y conserva la ficha original.
  const original = (await memberRef(a, 'staff-a').get()).data();
  await assert.rejects(reserve(a, 'alice', employee('staff-a', 'ADMIN', 'RECREAR')),
    /ya indexado/);
  assert.deepEqual((await memberRef(a, 'staff-a').get()).data(), original);

  // Admin SDK ignora reglas: la propuesta debe denegar por sí misma accesos
  // de otra cuenta, rol insuficiente, revocación y propietario discordante.
  await assert.rejects(reserve(b, 'alice', employee('cross-a-to-b')), /sin membresía/);
  await assert.rejects(reserve(a, 'outsider', employee('outsider-target')), /sin membresía/);
  await assert.rejects(reserve(a, 'revoked', employee('revoked-target')), /sin membresía/);
  await assert.rejects(reserve(a, 'pretend-owner', employee('false-owner-target')), /propietario/);
  await assert.rejects(reserve(a, 'lead', employee('lead-admin', 'ADMIN')), /no puede asignar/);
  await assert.rejects(reserve(a, 'alice', employee('global-role', 'SUPER_ADMIN')), /Datos de alta/);
  assert.deepEqual(await index(b), ['staff-b']);
  for (const uid of ['cross-a-to-b', 'outsider-target', 'revoked-target',
    'false-owner-target', 'lead-admin', 'global-role']) {
    assert.equal((await memberRef(a, uid).get()).exists, false);
    assert.equal((await memberRef(b, uid).get()).exists, false);
  }

  // Índice corrupto: fallar cerrado y no crear membresía.
  await roots.doc('tenant-corrupt').set({
    restaurantId: 'tenant-corrupt', ownerUserId: 'corrupt-owner',
    employeeUserIds: ['duplicado', 'duplicado'],
  });
  await memberRef('tenant-corrupt', 'corrupt-owner')
    .set(member('tenant-corrupt', 'corrupt-owner'));
  await assert.rejects(reserve('tenant-corrupt', 'corrupt-owner', employee('new-corrupt')),
    /Índice de empleados inconsistente/);
  assert.equal((await memberRef('tenant-corrupt', 'new-corrupt').get()).exists, false);

  // Dos altas simultáneas del mismo UID: solo una reserva puede confirmarse;
  // el perdedor no sobrescribe la ficha ni duplica el índice.
  const race = await Promise.allSettled([
    reserve(a, 'alice', employee('racing', 'WAITER', 'Primer intento')),
    reserve(a, 'alice', employee('racing', 'CASHIER', 'Segundo intento')),
  ]);
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1,
    'Solo una creación concurrente debe confirmarse');
  assert.equal(race.filter(result => result.status === 'rejected').length, 1,
    'La creación competidora debe rechazarse');
  const saved = (await memberRef(a, 'racing').get()).data();
  assert(['Primer intento', 'Segundo intento'].includes(saved.name));
  assert.equal((await index(a)).filter(uid => uid === 'racing').length, 1);
  assert.deepEqual(await index(b), ['staff-b'], 'La carrera A no afecta B');

  console.log('PASS (propuesta aislada): create-only evita sobrescribir membresía histórica sin índice, rollback de índice, permisos A/B y carrera concurrente.');
  console.log('PENDIENTE: no hay endpoint ni verificación de ID token, ni atomicidad Auth/Firestore; el cliente sigue usando set y STAGED sigue sin permitir get ausente.');
} finally {
  await deleteApp(app);
}
