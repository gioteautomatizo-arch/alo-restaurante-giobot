// Paso 2: ensayo de snapshot/borrado/restauración SOLO en Firestore Emulator.
// Datos sintéticos A/B. NO exporta ni toca Firebase real, Auth, cobros o secretos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { auditBusinessMembershipInventory } from './business-membership-inventory-preflight.mjs';

const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-restore-rehearsal-test',
  firestore: {
    rules: readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'),
    host: '127.0.0.1', port: 8080,
  },
});
const a = 'restore-test-a', b = 'restore-test-b';
const ownerA = 'restore-owner-a', ownerB = 'restore-owner-b', staffA = 'restore-staff-a';
const business = (id, uid) => ({
  restaurantId: id, ownerUserId: uid,
  // El snapshot sintético debe reflejar el índice que usa el alta actual.
  employeeUserIds: id === a ? [staffA] : [],
  branding: { restaurantName: 'Prueba ' + id, publicSlug: id },
});
const membership = (id, uid, role) => ({ restaurantId: id, userId: uid, role, active: true });
const catalog = (id, price) => ({
  businessId: id, items: [{ id: 'dish-' + id, name: 'Platillo de prueba', price }],
});
const profile = (id, published) => ({
  businessId: id, restaurantId: id, published,
  branding: { restaurantName: 'Prueba ' + id }, updatedAt: '2026-10-29T00:00:00Z',
});
const documents = [
  { path: `businesses/${a}`, data: business(a, ownerA) },
  { path: `businesses/${b}`, data: business(b, ownerB) },
  { path: `businessMemberships/${a}_${ownerA}`, data: membership(a, ownerA, 'OWNER') },
  { path: `businessMemberships/${a}_${staffA}`, data: membership(a, staffA, 'WAITER') },
  { path: `businessMemberships/${b}_${ownerB}`, data: membership(b, ownerB, 'OWNER') },
  { path: `businesses/${a}/catalog/menu_catalog`, data: catalog(a, 27) },
  { path: `businesses/${b}/catalog/menu_catalog`, data: catalog(b, 39) },
  { path: `publicBusinessProfiles/${a}`, data: profile(a, true) },
  { path: `publicBusinessProfiles/${b}`, data: profile(b, false) },
];
const signed = uid => env.authenticatedContext(uid).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();
const adminOperation = async callback => env.withSecurityRulesDisabled(async context => callback(context.firestore()));
const snapshot = async () => {
  // withSecurityRulesDisabled resuelve void: conservar el resultado fuera del callback.
  const records = [];
  await adminOperation(async db => {
    for (const { path } of documents) {
      const snap = await getDoc(doc(db, path));
      assert(snap.exists(), 'Falta documento en snapshot sintético');
      records.push({ path, data: snap.data() });
    }
  });
  return records;
};
const auditSnapshot = records => {
  const roots = records.filter(record => /^businesses\/[^/]+$/.test(record.path));
  const members = records.filter(record => /^businessMemberships\/[^/]+$/.test(record.path));
  return auditBusinessMembershipInventory({
    coverage: {
      businesses: { complete: true, documentCount: roots.length, pagesRead: 1 },
      businessMemberships: { complete: true, documentCount: members.length, pagesRead: 1 },
    },
    businesses: roots.map(record => ({ docId: record.path.split('/')[1], ...record.data })),
    memberships: members.map(record => ({ docId: record.path.split('/')[1], ...record.data })),
  });
};
const batchWrite = async (records, operation) => adminOperation(async db => {
  const batch = writeBatch(db);
  for (const { path, data } of records) {
    if (operation === 'delete') batch.delete(doc(db, path));
    else batch.set(doc(db, path), data);
  }
  await batch.commit();
});

try {
  await batchWrite(documents, 'set');
  const before = await snapshot();
  assert.equal(auditSnapshot(before).status, 'READY_FOR_INDEPENDENT_REVIEW',
    'Inventario sintético coherente antes de simular pérdida');

  // Un snapshot cruzado o incompleto NO puede pasar el preflight de restauración.
  const tampered = structuredClone(before);
  tampered.find(item => item.path === `businessMemberships/${b}_${ownerB}`).data.restaurantId = a;
  assert.equal(auditSnapshot(tampered).status, 'BLOCKED', 'Snapshot cruzado bloqueado');
  const incomplete = before.filter(item => item.path !== `businessMemberships/${a}_${ownerA}`);
  assert.equal(auditSnapshot(incomplete).status, 'BLOCKED', 'Snapshot sin OWNER bloqueado');
  const unindexed = structuredClone(before);
  unindexed.find(item => item.path === `businesses/${a}`).data.employeeUserIds = [];
  assert.equal(auditSnapshot(unindexed).status, 'BLOCKED',
    'Snapshot con membresía histórica no indexada debe bloquear restauración');
  const staleIndex = structuredClone(before);
  staleIndex.find(item => item.path === `businesses/${b}`).data.employeeUserIds = [staffA];
  assert.equal(auditSnapshot(staleIndex).status, 'BLOCKED',
    'Snapshot con índice de empleado de otro negocio debe bloquear restauración');

  await assertSucceeds(getDoc(doc(signed(ownerA), 'businesses', a)));
  await assertSucceeds(getDoc(doc(signed(ownerB), 'businesses', b)));
  await assertSucceeds(getDoc(doc(signed(staffA), 'businesses', a)));
  await assertFails(getDoc(doc(signed(ownerA), 'businesses', b)));
  await assertFails(getDoc(doc(signed(ownerB), 'businesses', a)));
  await assertFails(getDoc(doc(signed(staffA), 'businesses', b)));
  await assertSucceeds(getDoc(doc(anonymous(), 'publicBusinessProfiles', a)));
  await assertFails(getDoc(doc(anonymous(), 'publicBusinessProfiles', b)));

  // Simular pérdida completa de los documentos A/B en el emulador.
  await batchWrite(before, 'delete');
  await adminOperation(async db => {
    for (const { path } of before) {
      assert.equal((await getDoc(doc(db, path))).exists(), false, 'Borrado de ensayo incompleto');
    }
  });
  // Restauración interrumpida: solo raíces; no se debe conceder acceso sin membresías.
  await batchWrite(before.filter(item => /^businesses\/[^/]+$/.test(item.path)), 'set');
  await assertFails(getDoc(doc(signed(ownerA), 'businesses', a)));
  await assertFails(getDoc(doc(signed(ownerB), 'businesses', b)));

  // Completar la restauración de los documentos restantes en un batch de ensayo.
  await batchWrite(before.filter(item => !/^businesses\/[^/]+$/.test(item.path)), 'set');
  const after = await snapshot();
  assert.deepEqual(after, before, 'Restauración debe conservar íntegramente todos los documentos');
  assert.equal(auditSnapshot(after).status, 'READY_FOR_INDEPENDENT_REVIEW');
  await assertSucceeds(getDoc(doc(signed(ownerA), 'businesses', a)));
  await assertSucceeds(getDoc(doc(signed(ownerB), 'businesses', b)));
  await assertSucceeds(getDoc(doc(signed(staffA), 'businesses', a)));
  await assertFails(getDoc(doc(signed(ownerA), 'businesses', b)));
  await assertFails(getDoc(doc(signed(ownerB), 'businesses', a)));
  await assertFails(getDoc(doc(signed(staffA), 'businesses', b)));
  await assertSucceeds(getDoc(doc(anonymous(), 'publicBusinessProfiles', a)));
  await assertFails(getDoc(doc(anonymous(), 'publicBusinessProfiles', b)));
  await assertSucceeds(getDoc(doc(signed(ownerA), 'businesses', a, 'catalog', 'menu_catalog')));
  await assertFails(getDoc(doc(signed(ownerA), 'businesses', b, 'catalog', 'menu_catalog')));

  // Revocar personal restaurado no puede abrir acceso a otro negocio.
  await assertSucceeds(updateDoc(doc(signed(ownerA), 'businessMemberships', `${a}_${staffA}`), { active: false }));
  await assertFails(getDoc(doc(signed(staffA), 'businesses', a)));
  await assertSucceeds(getDoc(doc(signed(ownerB), 'businesses', b)));
  console.log('PASS: restauración sintética A/B en Firestore Emulator, igualdad de 9 documentos, snapshot cruzado/incompleto/no indexado rechazado, recuperación y revocación sin acceso cruzado.');
  console.warn('PENDIENTE: respaldo/restauración REALES, reglas desplegadas, Auth, VIP, pagos, Cloudinary y revisión visual Android/iPad.');
} finally {
  await env.cleanup();
}
