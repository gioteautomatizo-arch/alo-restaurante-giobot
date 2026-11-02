/**
 * Paso 2: evidencia de semántica OR entre matches solapados.
 * SOLO Firebase Emulator con datos ficticios. El segundo ruleset es
 * intencionalmente INSEGURO para demostrar el bypass; jamás desplegarlo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { buildThreeDocumentRecoveryMarkerProposalRules } from './owner-atomic-proposal-rules.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: ejecutar solo contra Firebase Emulator en 127.0.0.1:8080.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const candidate = buildThreeDocumentRecoveryMarkerProposalRules(staged);
const catchAll = '    match /{document=**} {';
assert.equal(candidate.split(catchAll).length, 2, 'ALTO: cambió la estructura del ruleset.');
const intentionallyUnsafe = candidate.replace(catchAll,
  `    // SOLO TEST: este match concede por OR aun si otro match lo prohíbe.
    match /{collection}/{id} {
      allow get, create: if true;
    }
` + catchAll);

const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-registration-overlap-test',
  firestore: { rules: candidate, host: '127.0.0.1', port: 8080 },
});
try {
  const alice = env.authenticatedContext('overlap-alice').firestore();
  const bob = env.authenticatedContext('overlap-bob').firestore();
  const id = 'overlap-tenant-a';
  const business = (tenant, owner) => ({
    restaurantId: tenant, ownerUserId: owner,
    registrationContractVersion: 3, branding: { restaurantName: tenant },
  });
  const registration = writeBatch(alice);
  registration.set(doc(alice, 'businesses/' + id), business(id, 'overlap-alice'));
  registration.set(doc(alice, 'businessMemberships/' + id + '_overlap-alice'), {
    restaurantId: id, userId: 'overlap-alice', role: 'OWNER', active: true,
  });
  registration.set(doc(alice, 'businessHandleReservations/' + id), {
    businessId: id, ownerUserId: 'overlap-alice',
  });
  await assertSucceeds(registration.commit());
  await assertFails(getDoc(doc(bob, 'businessHandleReservations/' + id)));
  await assertFails(setDoc(doc(bob, 'businesses/overlap-orphan'),
    business('overlap-orphan', 'overlap-bob')));

  // No existe env.loadFirestoreRules en RulesTestEnvironment. Inicializar
  // otro proyecto de emulador evita cambiar las reglas del proyecto seguro.
  // Este ruleset intencionalmente inseguro JAMÁS se escribe ni despliega.
  const unsafeEnv = await initializeTestEnvironment({
    projectId: 'gioteautomatizo-registration-overlap-unsafe-test',
    firestore: { rules: intentionallyUnsafe, host: '127.0.0.1', port: 8080 },
  });
  try {
    // Sembrar una reserva ajena solo con privilegios del emulador. El proyecto
    // inseguro tiene datos ficticios independientes del proyecto candidato.
    await unsafeEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'businessHandleReservations/' + id), {
        businessId: id, ownerUserId: 'overlap-alice',
      });
    });
    const attacker = unsafeEnv.authenticatedContext('overlap-bob').firestore();
    const leaked = await assertSucceeds(getDoc(doc(attacker, 'businessHandleReservations/' + id)));
    assert.equal(leaked.data()?.ownerUserId, 'overlap-alice',
      'El match genérico permite leer la reserva de un tercero');
    await assertSucceeds(setDoc(doc(attacker, 'businesses/overlap-orphan'),
      business('overlap-orphan', 'overlap-bob')));
    await unsafeEnv.withSecurityRulesDisabled(async context => {
      const admin = context.firestore();
      assert.equal((await getDoc(doc(admin, 'businesses/overlap-orphan'))).exists(), true);
      assert.equal((await getDoc(doc(admin, 'businessMemberships/overlap-orphan_overlap-bob'))).exists(), false,
        'El match solapado permite crear una raíz sin OWNER');
      assert.equal((await getDoc(doc(admin, 'businessHandleReservations/overlap-orphan'))).exists(), false,
        'El match solapado permite crear una raíz sin reserva');
    });
  } finally {
    await unsafeEnv.cleanup();
  }
  console.log('PASS (diagnóstico aislado): reglas candidatas niegan el bypass; match solapado deliberadamente permisivo lo reproduce por OR.');
  console.warn('PENDIENTE: revisión independiente del corte; no se modificaron ni desplegaron reglas reales.');
} finally {
  await env.cleanup();
}
