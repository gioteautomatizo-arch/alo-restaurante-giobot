/**
 * Paso 2: prueba las consultas list de businessMemberships con las cuatro
 * propuestas compuestas SOLO EN MEMORIA. Datos sintéticos en Firestore Emulator.
 * Un listado por UID puede devolver una ficha histórica incoherente: ese
 * diagnóstico PENDIENTE no constituye una corrección ni autoriza despliegue.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { buildThreeDocumentRecoveryMarkerProposalRules } from './owner-atomic-proposal-rules.mjs';
import { buildPrivateCatalogReadProposalRules } from './catalog-private-read-proposal-rules.mjs';
import { buildMembershipIdentityProposalRules } from './membership-identity-proposal-rules.mjs';
import { buildOwnerRootIdentityProposalRules } from './owner-root-identity-proposal-rules.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: este ensayo solo puede ejecutarse en Firestore Emulator local.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const rules = buildOwnerRootIdentityProposalRules(
  buildMembershipIdentityProposalRules(
    buildPrivateCatalogReadProposalRules(
      buildThreeDocumentRecoveryMarkerProposalRules(staged))));

const A = 'list-a';
const B = 'list-b';
const member = (businessId, userId, role, active = true) => ({
  restaurantId: businessId, userId, role, active,
});
const listForUid = (db, uid) => query(collection(db, 'businessMemberships'),
  where('userId', '==', uid), where('active', '==', true));
const listForTenant = (db, businessId) => query(collection(db, 'businessMemberships'),
  where('restaurantId', '==', businessId));
const ids = snapshot => snapshot.docs.map(d => d.id).sort();

const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-membership-list-composed',
  firestore: { rules, host: '127.0.0.1', port: 8080 },
});
try {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const dana = env.authenticatedContext('dana').firestore();
  const charlie = env.authenticatedContext('charlie').firestore();
  const visitor = env.unauthenticatedContext().firestore();

  await env.withSecurityRulesDisabled(async ctx => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, 'businesses', A), { restaurantId: A, ownerUserId: 'alice' });
    await setDoc(doc(admin, 'businesses', B), { restaurantId: B, ownerUserId: 'bob' });
    for (const [id, data] of [
      [A + '_alice', member(A, 'alice', 'OWNER')],
      [B + '_bob', member(B, 'bob', 'OWNER')],
      [B + '_alice', member(B, 'alice', 'MANAGER')],
      [B + '_charlie', member(B, 'charlie', 'CASHIER')],
      [A + '_dana', member(A, 'dana', 'CASHIER')],
    ]) await setDoc(doc(admin, 'businessMemberships', id), data);
  });

  // La consulta real del selector debe funcionar con dos tenants legítimos.
  assert.deepEqual(ids(await assertSucceeds(getDocs(listForUid(alice, 'alice')))),
    [A + '_alice', B + '_alice']);
  assert.deepEqual(ids(await assertSucceeds(getDocs(listForUid(bob, 'bob')))),
    [B + '_bob']);
  assert.deepEqual(ids(await assertSucceeds(getDocs(listForTenant(alice, A)))),
    [A + '_alice', A + '_dana']);
  assert.deepEqual(ids(await assertSucceeds(getDocs(listForTenant(alice, B)))),
    [B + '_alice', B + '_bob', B + '_charlie']);
  assert.deepEqual(ids(await assertSucceeds(getDocs(listForTenant(bob, B)))),
    [B + '_alice', B + '_bob', B + '_charlie']);
  await assertFails(getDocs(listForTenant(bob, A)));
  await assertFails(getDocs(listForTenant(dana, B)));
  await assertFails(getDocs(listForTenant(visitor, A)));
  await assertFails(getDocs(collection(bob, 'businessMemberships')));
  await assertFails(getDocs(query(collection(dana, 'businessMemberships'),
    where('userId', '==', 'bob'))));
  await assertFails(getDoc(doc(dana, 'businesses', B)));

  // OWNER con clave/UID correctos pero dueño raíz distinto: list por UID
  // sigue entregando su propia ficha; NO debe habilitar raíz ni listado B.
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'businessMemberships', B + '_alice'),
      member(B, 'alice', 'OWNER'));
  });
  const ownerList = await assertSucceeds(getDocs(listForUid(alice, 'alice')));
  assert.deepEqual(ids(ownerList), [A + '_alice', B + '_alice']);
  assert.equal(ownerList.docs.find(s => s.id === B + '_alice').data().role, 'OWNER');
  await assertSucceeds(getDoc(doc(alice, 'businessMemberships', B + '_alice')));
  await assertFails(getDoc(doc(alice, 'businesses', B)));
  await assertFails(getDocs(listForTenant(alice, B)));
  await assertFails(updateDoc(doc(alice, 'businesses', B), { name: 'No permitido' }));
  await assertSucceeds(getDoc(doc(alice, 'businesses', A)));
  await assertSucceeds(getDoc(doc(bob, 'businesses', B)));

  // La consulta por UID puede devolver una ficha cuyo ID no corresponde a
  // restaurantId_userId. El get individual reforzado sí debe rechazarla.
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'businessMemberships', A + '_dana'),
      member(B, 'dana', 'CASHIER'));
  });
  const malformedList = await assertSucceeds(getDocs(listForUid(dana, 'dana')));
  assert.deepEqual(ids(malformedList), [A + '_dana']);
  assert.notEqual(malformedList.docs[0].id,
    malformedList.docs[0].data().restaurantId + '_' + malformedList.docs[0].data().userId);
  await assertFails(getDoc(doc(dana, 'businessMemberships', A + '_dana')));
  await assertFails(getDoc(doc(dana, 'businesses', A)));
  await assertFails(getDoc(doc(dana, 'businesses', B)));

  // Una revocación debe desaparecer del selector activo; el titular aún
  // puede consultar su ficha individual para conocer la revocación.
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'businessMemberships', B + '_charlie'),
      member(B, 'charlie', 'CASHIER', false));
  });
  assert.deepEqual(ids(await assertSucceeds(getDocs(listForUid(charlie, 'charlie')))), []);
  await assertSucceeds(getDoc(doc(charlie, 'businessMemberships', B + '_charlie')));
  await assertFails(getDoc(doc(charlie, 'businesses', B)));

  console.log('PASS (propuesta NO desplegada): list por UID y tenant A/B legítimos; consultas cruzadas, OWNER/raíz discordante y get de objetivo mal asociado bloqueados.');
  console.warn('PENDIENTE: list por UID aún devuelve membresías históricas con identidad de documento o OWNER/raíz incoherentes. Exigir inventario, validación cliente y revisión de contrato de lectura antes del corte.');
} finally {
  await env.cleanup();
}
