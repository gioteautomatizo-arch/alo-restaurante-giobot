/**
 * Paso 2: matriz de compatibilidad de clientes y reglas de alta.
 * Solo Firebase Emulator y reglas derivadas en memoria. No modifica
 * registerBusiness, staged rules, datos reales ni despliega reglas.
 *
 * Cliente actual = negocio + OWNER (2 documentos).
 * Candidato = negocio + OWNER + reserva permanente (3 documentos).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { buildAtomicOwnerAndPermanentHandleProposalRules } from './owner-atomic-proposal-rules.mjs';

const projectId = 'gioteautomatizo-registration-version-matrix-test';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'Esta prueba requiere Firestore Emulator aislado; nunca usar Firestore real.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposed = buildAtomicOwnerAndPermanentHandleProposalRules(staged);
const phase = process.argv[2];
assert(['staged', 'candidate', 'rollback'].includes(phase),
  'Indicar fase staged, candidate o rollback dentro del mismo emulador.');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules: phase === 'candidate' ? proposed : staged, host: '127.0.0.1', port: 8080 },
});
const signed = uid => env.authenticatedContext(uid).firestore();
const business = (id, uid) => ({
  restaurantId: id, ownerUserId: uid, branding: { restaurantName: id },
});
const membership = (id, uid) => ({
  restaurantId: id, userId: uid, role: 'OWNER', active: true,
});
const reservation = (id, uid) => ({ businessId: id, ownerUserId: uid });
const root = id => 'businesses/' + id;
const owner = (id, uid) => 'businessMemberships/' + id + '_' + uid;
const handle = id => 'businessHandleReservations/' + id;

function registration(db, id, uid, version) {
  const batch = writeBatch(db);
  batch.set(doc(db, root(id)), business(id, uid));
  batch.set(doc(db, owner(id, uid)), membership(id, uid));
  if (version === 3) batch.set(doc(db, handle(id)), reservation(id, uid));
  return batch.commit();
}

async function assertNoPartialDocuments(paths, label) {
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    for (const path of paths) {
      const snap = await getDoc(doc(admin, path));
      assert.equal(snap.exists(), false, label + ': ' + path);
    }
  });
}

try {
  const alice = signed('matrix-alice');
  const bob = signed('matrix-bob');
  const legacyId = 'matrix-legacy-two-docs';
  const stagedThreeId = 'matrix-staged-three-docs';

  if (phase === 'staged') {
  // Fase 1: staged acepta el cliente vigente, pero rechaza el futuro batch
  // de tres documentos porque no tiene permiso de crear reservas.
  await assertSucceeds(registration(alice, legacyId, 'matrix-alice', 2));
  await assertSucceeds(getDoc(doc(alice, root(legacyId))));
  await assertNoPartialDocuments([handle(legacyId)], 'staged no crea reserva');
  await assertFails(registration(bob, stagedThreeId, 'matrix-bob', 3));
  await assertNoPartialDocuments([
    root(stagedThreeId), owner(stagedThreeId, 'matrix-bob'), handle(stagedThreeId),
  ], 'staged rechaza los tres documentos sin escritura parcial');

  console.log('PASS fase staged: cliente de dos documentos aceptado; tres rechazado sin escrituras parciales.');
  } else if (phase === 'candidate') {
  // Fase 2: el mismo emulador conserva los documentos de la fase anterior.
  // Se cargan reglas candidatas SOLO para este proceso de prueba.
  // Un negocio histórico sin reserva no se protege automáticamente.
  await assertSucceeds(getDoc(doc(alice, root(legacyId))));
  await assertFails(getDoc(doc(bob, root(legacyId))));
  await assertFails(setDoc(doc(alice, handle(legacyId)),
    reservation(legacyId, 'matrix-alice')));
  await assertNoPartialDocuments([handle(legacyId)],
    'histórico no queda protegido automáticamente');

  const proposedTwoId = 'matrix-proposed-two-docs';
  await assertFails(registration(alice, proposedTwoId, 'matrix-alice', 2));
  await assertNoPartialDocuments([
    root(proposedTwoId), owner(proposedTwoId, 'matrix-alice'), handle(proposedTwoId),
  ], 'propuesta rechaza cliente vigente sin escritura parcial');

  const proposedThreeId = 'matrix-proposed-three-docs';
  await assertSucceeds(registration(bob, proposedThreeId, 'matrix-bob', 3));
  await assertSucceeds(getDoc(doc(bob, root(proposedThreeId))));
  await assertFails(getDoc(doc(alice, root(proposedThreeId))));
  await assertFails(getDoc(doc(bob, handle(proposedThreeId))));
  await env.withSecurityRulesDisabled(async context => {
    const snap = await getDoc(doc(context.firestore(), handle(proposedThreeId)));
    assert.equal(snap.data()?.ownerUserId, 'matrix-bob');
  });

  console.log('PASS fase candidate: cliente de tres documentos aceptado; dos rechazado; histórico sin backfill no protegido.');
  } else {
  // Fase 3: reglas staged cargadas de nuevo en el mismo emulador.
  // Los datos candidatos sobreviven, pero los clientes de tres documentos
  // vuelven a fallar y los antiguos pueden crear altas sin reserva.
  await assertSucceeds(getDoc(doc(bob, root(proposedThreeId))));
  const rollbackThreeId = 'matrix-rollback-three-docs';
  await assertFails(registration(bob, rollbackThreeId, 'matrix-bob', 3));
  await assertNoPartialDocuments([
    root(rollbackThreeId), owner(rollbackThreeId, 'matrix-bob'), handle(rollbackThreeId),
  ], 'rollback rechaza cliente candidato sin escritura parcial');
  const rollbackTwoId = 'matrix-rollback-two-docs';
  await assertSucceeds(registration(alice, rollbackTwoId, 'matrix-alice', 2));
  await assertNoPartialDocuments([handle(rollbackTwoId)],
    'rollback permite otra alta sin reserva');

  console.log('PASS fase rollback (solo emulador): staged acepta de nuevo 2/rechaza 3; datos candidatos sobreviven.');
  }
  console.warn('PENDIENTE: no existe una fase de reglas comprobada que permita convivir ambos clientes sin riesgo. Planificar versionado, pestañas antiguas y reversión antes de desplegar.');
  console.warn('PENDIENTE: negocios históricos sin reserva siguen desprotegidos ante borrados privilegiados; backfill requiere inventario, respaldo, revisión y autorización.');
} finally {
  await env.cleanup();
}
