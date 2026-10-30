/**
 * Paso 2: demuestra el OWNER discordante en el candidato compuesto anterior
 * y comprueba una puerta aislada contra la raíz. Solo Firebase Emulator.
 * No cambia reglas versionadas, clientes, datos reales ni permisos desplegados.
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
  'Esta prueba exige Firebase Emulator, nunca una base real.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const previous = buildMembershipIdentityProposalRules(
  buildPrivateCatalogReadProposalRules(
    buildThreeDocumentRecoveryMarkerProposalRules(staged)));
const guarded = buildOwnerRootIdentityProposalRules(previous);
assert.notEqual(guarded, previous);
assert.notEqual(guarded, staged);
const business = (id, uid) => ({
  restaurantId: id, ownerUserId: uid, registrationContractVersion: 3,
  branding: { restaurantName: id },
});
const membership = (id, uid, role = 'OWNER') => ({
  restaurantId: id, userId: uid, role, active: true,
});
const profile = id => ({
  businessId: id, restaurantId: id, businessType: 'restaurant',
  branding: { restaurantName: id }, published: true,
  updatedAt: '2026-10-30T00:00:00.000Z',
});
const root = id => 'businesses/' + id;
const memberPath = (id, uid) => 'businessMemberships/' + id + '_' + uid;
const catalog = id => 'businesses/' + id + '/catalog/menu_catalog';
const register = (db, id, uid) => {
  const batch = writeBatch(db);
  batch.set(doc(db, root(id)), business(id, uid));
  batch.set(doc(db, memberPath(id, uid)), membership(id, uid));
  batch.set(doc(db, 'businessHandleReservations', id),
    { businessId: id, ownerUserId: uid });
  return batch.commit();
};

async function scenario(rules, protectedOwner, suffix) {
  const env = await initializeTestEnvironment({
    projectId: 'gioteautomatizo-owner-root-' + suffix,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  const signed = uid => env.authenticatedContext(uid).firestore();
  const a = 'owner-root-a-' + suffix;
  const b = 'owner-root-b-' + suffix;
  const aliceId = 'owner-root-alice';
  const bobId = 'owner-root-bob';
  const alice = signed(aliceId);
  const bob = signed(bobId);
  const manager = signed('owner-root-manager');
  const superAdmin = signed('owner-root-superadmin');
  const check = protectedOwner ? assertFails : assertSucceeds;
  try {
    await assertSucceeds(register(alice, a, aliceId));
    await assertSucceeds(register(bob, b, bobId));
    // El menú de B existe pero todavía NO está publicado: su lectura debe
    // requerir una membresía realmente autorizada, no solo UID/tenant.
    await assertSucceeds(setDoc(doc(bob, catalog(b)), {
      businessId: b, items: [{ id: 'private-b', price: 12 }],
    }));
    // SOLO el administrador del emulador simula un OWNER histórico discordante.
    // El documento tiene clave, tenant y UID correctos, pero no coincide con
    // businesses/{b}.ownerUserId: es la brecha que faltaba en la composición.
    await env.withSecurityRulesDisabled(async context => {
      const admin = context.firestore();
      await setDoc(doc(admin, memberPath(b, aliceId)), membership(b, aliceId));
      await setDoc(doc(admin, 'businesses', b, 'employees', 'existing'), {
        restaurantId: b, userId: 'existing', role: 'CASHIER', active: true,
      });
      await setDoc(doc(admin, 'platformAdmins', 'owner-root-superadmin'), { active: true });
      await setDoc(doc(admin, memberPath(b, 'owner-root-manager')),
        membership(b, 'owner-root-manager', 'MANAGER'));
    });
    // Leer la propia ficha corrupta no debe interpretarse como permiso OWNER.
    await assertSucceeds(getDoc(doc(alice, memberPath(b, aliceId))));
    await check(getDoc(doc(alice, root(b))));
    await check(getDoc(doc(alice, catalog(b))));
    await check(updateDoc(doc(alice, root(b)), {
      branding: { restaurantName: 'intrusion' },
    }));
    await check(updateDoc(doc(alice, root(b)), { employeeUserIds: [aliceId] }));
    await check(setDoc(doc(alice, 'publicBusinessProfiles', b), profile(b)));
    await check(getDoc(doc(alice, 'businesses', b, 'employees', 'existing')));
    await check(setDoc(doc(alice, 'businesses', b, 'employees', 'intruder'), {
      restaurantId: b, userId: 'intruder', role: 'CASHIER', active: true,
    }));
    await check(setDoc(doc(alice, catalog(b)), { businessId: b, items: [] }));

    // La nueva puerta no debe bloquear a propietarios reales ni al personal
    // legítimo con MANAGER; este último nunca puede hacerse OWNER.
    await assertSucceeds(getDoc(doc(alice, root(a))));
    await assertSucceeds(getDoc(doc(bob, root(b))));
    await assertSucceeds(getDoc(doc(bob, catalog(b))));
    await assertSucceeds(setDoc(doc(bob, 'publicBusinessProfiles', b), profile(b)));
    await assertSucceeds(getDoc(doc(manager, root(b))));
    await assertSucceeds(getDoc(doc(manager, catalog(b))));
    await assertSucceeds(setDoc(doc(manager, catalog(b)), { businessId: b, items: [] }));
    await assertFails(updateDoc(doc(manager, root(b)), {
      branding: { restaurantName: 'manager-cannot-own' },
    }));
    await assertSucceeds(getDoc(doc(superAdmin, root(b))));

    // Legado con ownerUserId coherente funciona aunque carezca de marcador 3.
    // Legado sin propietario verificable no obtiene privilegios OWNER por una
    // ficha histórica; NO se asigna propietario automáticamente.
    const legacy = 'owner-root-legacy-' + suffix;
    const orphan = 'owner-root-unverified-' + suffix;
    await env.withSecurityRulesDisabled(async context => {
      const admin = context.firestore();
      await setDoc(doc(admin, root(legacy)), {
        restaurantId: legacy, ownerUserId: aliceId,
      });
      await setDoc(doc(admin, memberPath(legacy, aliceId)), membership(legacy, aliceId));
      await setDoc(doc(admin, root(orphan)), { restaurantId: orphan });
      await setDoc(doc(admin, memberPath(orphan, aliceId)), membership(orphan, aliceId));
    });
    await assertSucceeds(getDoc(doc(alice, root(legacy))));
    await check(getDoc(doc(alice, root(orphan))));
    await check(setDoc(doc(alice, 'publicBusinessProfiles', orphan), profile(orphan)));
    if (protectedOwner) {
      console.log('PASS (propuesta NO desplegada): OWNER discordante/sin raíz verificable no lee menú privado ni autoriza raíz, perfil, empleados o catálogo; OWNER auténtico, MANAGER y Super Admin conservan acceso.');
      console.warn('PENDIENTE: inventario y tratamiento manual de raíces históricas sin ownerUserId; límites de lecturas get/exists, consultas list y revisión independiente antes de cualquier corte.');
    } else {
      console.warn('PENDIENTE SEGURIDAD (candidato compuesto anterior): OWNER con UID/tenant correctos pero raíz de otro propietario puede leer menú privado y leer/escribir B; OWNER sin propietario verificable también obtiene permisos.');
    }
  } finally {
    await env.cleanup();
  }
}
await scenario(previous, false, 'baseline');
await scenario(guarded, true, 'guarded');
console.warn('PENDIENTE: STAGED y reglas desplegadas no cambiaron; paso 2 requiere inventario, aprobación de seguridad y recorrido manual A/B Android/iPad.');
