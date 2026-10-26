/**
 * Diagnóstico aislado: borrar y volver a registrar un businessId puede
 * reutilizar membresías/subcolecciones anteriores. NO despliega reglas.
 *
 * Primera fase: reproduce la exposición en staged con datos sintéticos.
 * Segunda fase: prueba una propuesta en memoria que bloquea delete del cliente.
 * Tercera fase: demuestra el límite de borrados privilegiados sin limpieza.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { buildAtomicOwnerAndNoClientDeleteProposalRules } from './owner-atomic-proposal-rules.mjs';

const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const candidate = buildAtomicOwnerAndNoClientDeleteProposalRules(staged);
let env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-handle-reuse-proposal-test',
  firestore: { rules: staged, host: '127.0.0.1', port: 8080 },
});
const signed = uid => env.authenticatedContext(uid).firestore();
const business = (id, uid) => ({ restaurantId: id, ownerUserId: uid, branding: { restaurantName: id } });
const member = (id, uid) => ({ restaurantId: id, userId: uid, role: 'OWNER', active: true });

async function register(db, id, uid) {
  const batch = writeBatch(db);
  batch.set(doc(db, `businesses/${id}`), business(id, uid));
  batch.set(doc(db, `businessMemberships/${id}_${uid}`), member(id, uid));
  await assertSucceeds(batch.commit());
}

try {
  const alice = signed('reuse-alice');
  const bob = signed('reuse-bob');
  const id = 'reused-handle-staged';
  await register(alice, id, 'reuse-alice');
  await assertSucceeds(setDoc(doc(alice, `businesses/${id}/catalog/menu_catalog`), {
    businessId: id, items: [{ id: 'old-private', name: 'Solo de Alice', price: 10 }],
  }));
  // Staged: la eliminación no limpia membresías ni subcolecciones.
  await assertSucceeds(deleteDoc(doc(alice, `businesses/${id}`)));
  await register(bob, id, 'reuse-bob');
  const staleOwnerRead = await assertSucceeds(getDoc(doc(alice, `businesses/${id}`)));
  assert.equal(staleOwnerRead.data()?.ownerUserId, 'reuse-bob');
  const newOwnerReadsOldCatalog = await assertSucceeds(getDoc(doc(bob, `businesses/${id}/catalog/menu_catalog`)));
  assert.equal(newOwnerReadsOldCatalog.data()?.items?.[0]?.id, 'old-private');
  await assertSucceeds(updateDoc(doc(alice, `businesses/${id}`), {
    'branding.restaurantName': 'Alterado por OWNER anterior',
  }));
  assert.equal((await assertSucceeds(getDoc(doc(bob, `businesses/${id}`)))).data()?.branding?.restaurantName,
    'Alterado por OWNER anterior');
  console.warn('PENDIENTE (staged): OWNER anterior accede y modifica nuevo tenant tras borrar/reutilizar ID; nuevo OWNER ve catálogo antiguo.');

  // Propuesta estrictamente en memoria: no permitir delete cliente de businesses.
  await env.clearFirestore();
  await env.cleanup();
  env = await initializeTestEnvironment({
    projectId: 'gioteautomatizo-handle-reuse-proposal-test',
    firestore: { rules: candidate, host: '127.0.0.1', port: 8080 },
  });
  const carol = signed('reuse-carol');
  const dave = signed('reuse-dave');
  const protectedId = 'protected-handle';
  await register(carol, protectedId, 'reuse-carol');
  await assertFails(deleteDoc(doc(carol, `businesses/${protectedId}`)));
  const second = writeBatch(dave);
  second.set(doc(dave, `businesses/${protectedId}`), business(protectedId, 'reuse-dave'));
  second.set(doc(dave, `businessMemberships/${protectedId}_reuse-dave`), member(protectedId, 'reuse-dave'));
  await assertFails(second.commit());
  await assertFails(getDoc(doc(dave, `businesses/${protectedId}`)));
  assert.equal((await assertSucceeds(getDoc(doc(carol, `businesses/${protectedId}`)))).data()?.ownerUserId,
    'reuse-carol');

  // Límite que NO resuelve el bloqueo de delete cliente: un borrado con Admin
  // SDK omitiendo limpieza/tombstone todavía permite reusar el mismo handle.
  await assertSucceeds(setDoc(doc(carol, `businesses/${protectedId}/catalog/menu_catalog`), {
    businessId: protectedId, items: [{ id: 'privileged-old', name: 'Privado previo', price: 99 }],
  }));
  await env.withSecurityRulesDisabled(async context => {
    await deleteDoc(doc(context.firestore(), `businesses/${protectedId}`));
  });
  await register(dave, protectedId, 'reuse-dave');
  assert.equal((await assertSucceeds(getDoc(doc(carol, `businesses/${protectedId}`)))).data()?.ownerUserId,
    'reuse-dave');
  assert.equal((await assertSucceeds(getDoc(doc(dave, `businesses/${protectedId}/catalog/menu_catalog`)))).data()?.items?.[0]?.id,
    'privileged-old');
  console.warn('PENDIENTE (propuesta): borrado privilegiado sin limpieza/tombstone permite reutilización y mezcla de datos.');
  console.log('PASS: reproducción staged y bloqueo de delete cliente en propuesta aislada; NO equivale a reglas corregidas/desplegadas.');
} finally {
  await env.cleanup();
}
