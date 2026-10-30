/**
 * Paso 2: ensaya límites de acceso de reglas con lotes reales bajo las
 * cuatro propuestas compuestas SOLO EN MEMORIA. Firebase Emulator únicamente.
 * No mide lecturas facturadas ni prueba reglas desplegadas.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { buildThreeDocumentRecoveryMarkerProposalRules } from './owner-atomic-proposal-rules.mjs';
import { buildPrivateCatalogReadProposalRules } from './catalog-private-read-proposal-rules.mjs';
import { buildMembershipIdentityProposalRules } from './membership-identity-proposal-rules.mjs';
import { buildOwnerRootIdentityProposalRules } from './owner-root-identity-proposal-rules.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: ejecutar solo con Firebase Emulator local.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const composed = buildOwnerRootIdentityProposalRules(
  buildMembershipIdentityProposalRules(
    buildPrivateCatalogReadProposalRules(
      buildThreeDocumentRecoveryMarkerProposalRules(staged))));
assert.notEqual(composed, staged);
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-owner-batch-budget-test',
  firestore: { rules: composed, host: '127.0.0.1', port: 8080 },
});
const signed = uid => env.authenticatedContext(uid).firestore();
const root = id => 'businesses/' + id;
const membership = (id, uid) => 'businessMemberships/' + id + '_' + uid;
const catalog = (id, name) => 'businesses/' + id + '/catalog/' + name;
const member = (id, uid, role = 'OWNER') =>
  ({ restaurantId: id, userId: uid, role, active: true });
const register = (db, id, uid) => {
  const batch = writeBatch(db);
  batch.set(doc(db, root(id)), {
    restaurantId: id, ownerUserId: uid, registrationContractVersion: 3,
    branding: { restaurantName: id },
  });
  batch.set(doc(db, membership(id, uid)), member(id, uid));
  batch.set(doc(db, 'businessHandleReservations', id),
    { businessId: id, ownerUserId: uid });
  return batch.commit();
};
const menu = (id, item) => ({
  businessId: id, items: [{ id: item, price: 20, available: true }],
});
try {
  const a = 'batch-budget-a', b = 'batch-budget-b';
  const aliceId = 'batch-budget-alice', bobId = 'batch-budget-bob';
  const staffId = 'batch-budget-manager';
  const alice = signed(aliceId), bob = signed(bobId);
  const manager = signed(staffId);
  const visitor = env.unauthenticatedContext().firestore();
  await assertSucceeds(register(alice, a, aliceId));
  await assertSucceeds(register(bob, b, bobId));

  // Seis escrituras relacionadas en un solo lote; si excede el presupuesto
  // de reglas, debe fallar en lugar de ocultar el rechazo como PASS.
  const setup = writeBatch(alice);
  setup.set(doc(alice, membership(a, staffId)), member(a, staffId, 'MANAGER'));
  setup.set(doc(alice, 'businesses', a, 'employees', staffId), {
    restaurantId: a, userId: staffId, role: 'MANAGER', active: true,
  });
  setup.update(doc(alice, root(a)), { employeeUserIds: [staffId] });
  setup.set(doc(alice, catalog(a, 'menu_catalog')), menu(a, 'a-original'));
  setup.set(doc(alice, catalog(a, 'menu_import_draft')), {
    businessId: a, items: [], sourceImageUrl: 'https://example.test/private-a.png',
  });
  setup.set(doc(alice, 'publicBusinessProfiles', a), {
    businessId: a, restaurantId: a, businessType: 'restaurant',
    branding: { restaurantName: a }, published: true,
    updatedAt: '2026-10-30T00:00:00.000Z',
  });
  await assertSucceeds(setup.commit());
  const setupB = writeBatch(bob);
  setupB.set(doc(bob, catalog(b, 'menu_catalog')), menu(b, 'b-original'));
  setupB.set(doc(bob, catalog(b, 'menu_import_draft')), {
    businessId: b, items: [], sourceImageUrl: 'https://example.test/private-b.png',
  });
  await assertSucceeds(setupB.commit());

  await assertSucceeds(getDoc(doc(visitor, catalog(a, 'menu_catalog'))));
  await assertFails(getDoc(doc(visitor, catalog(a, 'menu_import_draft'))));
  await assertFails(getDoc(doc(visitor, catalog(b, 'menu_catalog'))));
  await assertSucceeds(getDoc(doc(manager, catalog(a, 'menu_import_draft'))));
  await assertFails(getDoc(doc(manager, catalog(b, 'menu_import_draft'))));
  await assertFails(getDoc(doc(bob, catalog(a, 'menu_import_draft'))));

  // Solo el administrador del emulador siembra una ficha OWNER B discordante.
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), membership(b, aliceId)),
      member(b, aliceId));
  });
  await assertFails(getDoc(doc(alice, root(b))));
  await assertFails(getDoc(doc(alice, catalog(b, 'menu_import_draft'))));

  // Un lote A válido + B prohibido no puede dejar escrituras parciales.
  const mixed = writeBatch(alice);
  mixed.update(doc(alice, catalog(a, 'menu_catalog')),
    { items: [{ id: 'a-not-committed', price: 1 }] });
  mixed.update(doc(alice, catalog(b, 'menu_catalog')),
    { items: [{ id: 'b-intrusion', price: 1 }] });
  mixed.update(doc(alice, root(b)), { branding: { restaurantName: 'intrusion' } });
  await assertFails(mixed.commit());
  const aMenu = await assertSucceeds(getDoc(doc(alice, catalog(a, 'menu_catalog'))));
  const bMenu = await assertSucceeds(getDoc(doc(bob, catalog(b, 'menu_catalog'))));
  const bRoot = await assertSucceeds(getDoc(doc(bob, root(b))));
  assert.equal(aMenu.data().items[0].id, 'a-original');
  assert.equal(bMenu.data().items[0].id, 'b-original');
  assert.equal(bRoot.data().branding.restaurantName, b);

  await assertSucceeds(updateDoc(doc(alice, catalog(a, 'menu_import_draft')),
    { items: [{ id: 'safe-a' }] }));
  await assertSucceeds(updateDoc(doc(alice, membership(a, staffId)),
    { active: false }));
  await assertFails(getDoc(doc(manager, catalog(a, 'menu_import_draft'))));
  await assertSucceeds(getDoc(doc(bob, catalog(b, 'menu_import_draft'))));
  console.log('PASS (emulador): altas 3-doc A/B, lote de seis escrituras, catálogo/perfil, roles, lote cruzado denegado sin escrituras parciales y revocación.');
  console.warn('PENDIENTE: costos exactos, lotes mayores, reglas STAGED/desplegadas, históricos y revisión visual Android/iPad.');
} finally {
  await env.cleanup();
}
