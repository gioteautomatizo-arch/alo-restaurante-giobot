/**
 * Paso 2: composición de dos propuestas de reglas SOLO EN MEMORIA:
 * alta OWNER 3-doc + reserva permanente + identidad de membresías + borradores privados.
 * Datos ficticios y Firebase Emulator. No toca reglas versionadas, usuarios
 * reales, cuentas de cobro ni activa el cliente candidato.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { buildThreeDocumentRecoveryMarkerProposalRules } from './owner-atomic-proposal-rules.mjs';
import { buildPrivateCatalogReadProposalRules } from './catalog-private-read-proposal-rules.mjs';
import { buildMembershipIdentityProposalRules } from './membership-identity-proposal-rules.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'Esta prueba exige Firestore Emulator, nunca una base real.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const composed = buildMembershipIdentityProposalRules(
  buildPrivateCatalogReadProposalRules(
    buildThreeDocumentRecoveryMarkerProposalRules(staged)));
assert.notEqual(composed, staged, 'Las reglas compuestas no pueden ser staged sin cambios');
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-owner-draft-composed-test',
  firestore: { rules: composed, host: '127.0.0.1', port: 8080 },
});
const signed = uid => env.authenticatedContext(uid).firestore();
const path = (id, docId) => 'businesses/' + id + '/catalog/' + docId;
const ownerPath = (id, uid) => 'businessMemberships/' + id + '_' + uid;
const root = id => 'businesses/' + id;
const reservation = id => 'businessHandleReservations/' + id;
const business = (id, uid, version = 3) => ({
  restaurantId: id, ownerUserId: uid, branding: { restaurantName: id },
  ...(version === 3 ? { registrationContractVersion: 3 } : {}),
});
const member = (id, uid, role = 'OWNER', active = true) => ({
  restaurantId: id, userId: uid, role, active,
});
const register = (db, id, uid, version) => {
  const batch = writeBatch(db);
  batch.set(doc(db, root(id)), business(id, uid, version));
  batch.set(doc(db, ownerPath(id, uid)), member(id, uid));
  if (version === 3) batch.set(doc(db, reservation(id)), { businessId: id, ownerUserId: uid });
  return batch.commit();
};
const publishedProfile = id => ({
  businessId: id, restaurantId: id, businessType: 'restaurant',
  branding: { restaurantName: id }, published: true,
  updatedAt: '2026-10-30T00:00:00.000Z',
});
try {
  const alice = signed('combined-alice');
  const bob = signed('combined-bob');
  const manager = signed('combined-manager');
  const cashier = signed('combined-cashier');
  const visitor = env.unauthenticatedContext().firestore();
  const idA = 'combined-tenant-a';
  const idB = 'combined-tenant-b';

  await assertSucceeds(register(alice, idA, 'combined-alice', 3));
  await assertSucceeds(register(bob, idB, 'combined-bob', 3));
  await assertFails(register(alice, 'combined-old-client', 'combined-alice', 2));
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    for (const p of [root('combined-old-client'), ownerPath('combined-old-client', 'combined-alice')]) {
      assert.equal((await getDoc(doc(admin, p))).exists(), false, 'Sin escrituras parciales: ' + p);
    }
    for (const [id, uid] of [[idA, 'combined-alice'], [idB, 'combined-bob']]) {
      assert.equal((await getDoc(doc(admin, reservation(id)))).data()?.ownerUserId, uid);
    }
  });
  await assertFails(getDoc(doc(alice, reservation(idA))));
  await assertFails(getDoc(doc(bob, root(idA))));
  await assertFails(getDoc(doc(alice, root(idB))));

  for (const [db, id] of [[alice, idA], [bob, idB]]) {
    await assertSucceeds(setDoc(doc(db, path(id, 'menu_catalog')),
      { businessId: id, items: [{ id: id + '-product', price: 12 }] }));
    await assertSucceeds(setDoc(doc(db, path(id, 'menu_import_draft')),
      { businessId: id, sourceImageUrl: 'https://example.test/private.png', items: [] }));
  }
  await assertFails(getDoc(doc(visitor, path(idA, 'menu_catalog'))));
  await assertFails(getDoc(doc(visitor, path(idA, 'menu_import_draft'))));
  await assertFails(getDoc(doc(visitor, path(idB, 'menu_catalog'))));
  await assertFails(getDoc(doc(bob, path(idA, 'menu_import_draft'))));
  await assertFails(getDoc(doc(alice, path(idB, 'menu_import_draft'))));
  await assertSucceeds(getDoc(doc(alice, path(idA, 'menu_import_draft'))));
  await assertSucceeds(getDoc(doc(bob, path(idB, 'menu_import_draft'))));

  await assertSucceeds(setDoc(doc(alice, ownerPath(idA, 'combined-manager')),
    member(idA, 'combined-manager', 'MANAGER')));
  await assertSucceeds(setDoc(doc(alice, ownerPath(idA, 'combined-cashier')),
    member(idA, 'combined-cashier', 'CASHIER')));
  await assertSucceeds(getDoc(doc(manager, path(idA, 'menu_import_draft'))));
  await assertFails(getDoc(doc(cashier, path(idA, 'menu_import_draft'))));
  await assertSucceeds(getDoc(doc(cashier, path(idA, 'menu_catalog'))));
  await assertFails(getDoc(doc(manager, path(idB, 'menu_import_draft'))));

  
  // Composición de tres propuestas: la protección del borrador NO debe
  // ocultar accesos indebidos a raíz, publicación, personal o catálogo.
  // Solo el administrador del emulador siembra membresías históricas corruptas.
  const malformedMemberPath = ownerPath(idB, 'combined-alice');
  const malformedCases = [
    ['tenant-cruzado', member(idA, 'combined-alice')],
    ['uid-cruzado', member(idB, 'combined-bob')],
    ['rol-invalido', member(idB, 'combined-alice', 'ROOT')],
    ['revocada', member(idB, 'combined-alice', 'OWNER', false)],
  ];
  for (const [label, data] of malformedCases) {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), malformedMemberPath), data);
    });
    await assertFails(getDoc(doc(alice, root(idB))));
    await assertFails(updateDoc(doc(alice, root(idB)), {
      branding: { restaurantName: 'intrusion-' + label },
    }));
    await assertFails(setDoc(doc(alice, 'publicBusinessProfiles', idB), publishedProfile(idB)));
    await assertFails(setDoc(doc(alice, 'businesses', idB, 'employees', 'intrusion-' + label),
      { restaurantId: idB, userId: 'intrusion-' + label, role: 'CASHIER', active: true }));
    await assertFails(setDoc(doc(alice, path(idB, 'menu_catalog')),
      { businessId: idB, items: [{ id: 'intrusion-' + label, price: 1 }] }));
    // El negocio A del mismo usuario sigue accesible.
    await assertSucceeds(getDoc(doc(alice, root(idA))));
  }
  // Un miembro legítimo de A y B debe conservar acceso interno a ambos,
  // pero MANAGER no puede apropiarse de la raíz ni publicar como OWNER.
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), malformedMemberPath),
      member(idB, 'combined-alice', 'MANAGER'));
  });
  await assertSucceeds(getDoc(doc(alice, root(idB))));
  await assertSucceeds(setDoc(doc(alice, path(idB, 'menu_catalog')),
    { businessId: idB, items: [{ id: 'legitimate-manager', price: 12 }] }));
  await assertFails(updateDoc(doc(alice, root(idB)), {
    branding: { restaurantName: 'manager-not-owner' },
  }));
  await assertFails(setDoc(doc(alice, 'publicBusinessProfiles', idB), publishedProfile(idB)));
  await assertSucceeds(getDoc(doc(bob, root(idB))));


  await assertSucceeds(setDoc(doc(alice, 'publicBusinessProfiles', idA), publishedProfile(idA)));
  await assertSucceeds(getDoc(doc(visitor, path(idA, 'menu_catalog'))));
  await assertFails(getDoc(doc(visitor, path(idA, 'menu_import_draft'))));
  await assertFails(getDoc(doc(visitor, path(idB, 'menu_catalog'))));
  await assertFails(getDoc(doc(visitor, path(idA, 'internal_future_draft'))));

  await assertSucceeds(updateDoc(doc(alice, ownerPath(idA, 'combined-manager')), { active: false }));
  await assertFails(getDoc(doc(manager, path(idA, 'menu_import_draft'))));
  await assertSucceeds(getDoc(doc(visitor, path(idA, 'menu_catalog'))));

  // Ni un perfil publicado legitima un catálogo con businessId de otro tenant.
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path(idA, 'menu_catalog')),
      { businessId: idB, items: [{ id: 'cross-tenant', price: 999 }] });
  });
  await assertFails(getDoc(doc(visitor, path(idA, 'menu_catalog'))));
  await assertFails(getDoc(doc(alice, path(idA, 'menu_catalog'))));

  // Una raíz histórica sin marcador 3-doc se mantiene legible por su OWNER;
  // eso NO significa que se haya migrado o reservado el identificador.
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    await setDoc(doc(admin, root('combined-legacy')), business('combined-legacy', 'combined-legacy-owner', 2));
    await setDoc(doc(admin, ownerPath('combined-legacy', 'combined-legacy-owner')),
      member('combined-legacy', 'combined-legacy-owner'));
  });
  await assertSucceeds(getDoc(doc(signed('combined-legacy-owner'), root('combined-legacy'))));
  await assertFails(getDoc(doc(bob, root('combined-legacy'))));
  console.log('PASS (tres propuestas SOLO en emulador): alta 3-doc A/B, rechazo 2-doc, borradores privados, publicación, identidad de membresías, denegación de raíz/perfil/empleados/catalogo a fichas cruzadas, roles, revocación y legado.');
  console.warn('PENDIENTE: staged aún permite OWNER huérfano, borradores publicados y altas sin reserva; NO se desplegó la propuesta.');
  console.warn('PENDIENTE: la consulta list de membresías aún puede devolver registros históricos mal asociados; revisar inventario/backfill, identidad OWNER/root, compatibilidad de clientes, reglas efectivas y validación visual Android/iPad.');
} finally {
  await env.cleanup();
}
