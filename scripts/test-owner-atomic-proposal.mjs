/**
 * Propuesta aislada para impedir reservar businesses/{id} sin OWNER en el
 * mismo batch. NO modifica ni despliega reglas de Firestore.
 *
 * Este experimento parte del archivo staged versionado, aplica una sola
 * sustitución en memoria y valida los casos positivos y negativos en emulador.
 * El guard de migración mantiene protegido el bloque /businesses original.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { buildAtomicOwnerProposalRules } from './owner-atomic-proposal-rules.mjs';

const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposedRules = buildAtomicOwnerProposalRules(staged);

const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-atomic-owner-proposal-test',
  firestore: { rules: proposedRules, host: '127.0.0.1', port: 8080 },
});
const signed = (uid) => env.authenticatedContext(uid).firestore();
const business = (id, uid) => ({ restaurantId: id, ownerUserId: uid, branding: { restaurantName: id } });
const member = (id, uid, role = 'OWNER', active = true) =>
  ({ restaurantId: id, userId: uid, role, active });

try {
  const alice = signed('alice');
  const bob = signed('bob');

  // La reserva huérfana que staged acepta actualmente debe quedar denegada.
  await assertFails(setDoc(doc(alice, 'businesses/orphan'), business('orphan', 'alice')));
  // Verificar ausencia con privilegios exclusivos del emulador: el usuario
  // aún no tiene membresía y correctamente no puede leer ese documento.
  await env.withSecurityRulesDisabled(async (context) => {
    const missing = await getDoc(doc(context.firestore(), 'businesses/orphan'));
    assert.equal(missing.exists(), false);
  });

  // No debe ser posible crear primero la membresía y después el negocio.
  await assertFails(setDoc(doc(alice, 'businessMemberships/early_alice'), member('early', 'alice')));
  await assertFails(setDoc(doc(alice, 'businesses/early'), business('early', 'alice')));

  // Alta legítima: negocio y OWNER propio en una única operación atómica.
  const signup = writeBatch(alice);
  signup.set(doc(alice, 'businesses/tenant-a'), business('tenant-a', 'alice'));
  signup.set(doc(alice, 'businessMemberships/tenant-a_alice'), member('tenant-a', 'alice'));
  await assertSucceeds(signup.commit());
  assert.equal((await assertSucceeds(getDoc(doc(alice, 'businesses/tenant-a')))).exists(), true);
  await assertFails(getDoc(doc(bob, 'businesses/tenant-a')));

  // El OWNER debe ser el usuario autenticado, estar activo y pertenecer al tenant.
  for (const [id, membership] of [
    ['wrong-role', member('wrong-role', 'alice', 'ADMIN')],
    ['inactive', member('inactive', 'alice', 'OWNER', false)],
    ['wrong-tenant', member('different', 'alice')],
    ['wrong-user', member('wrong-user', 'bob')],
  ]) {
    const batch = writeBatch(alice);
    batch.set(doc(alice, `businesses/${id}`), business(id, 'alice'));
    batch.set(doc(alice, `businessMemberships/${id}_alice`), membership);
    await assertFails(batch.commit());
  }

  // La membresía de un tercero no puede suplantar la del propietario.
  const impersonation = writeBatch(bob);
  impersonation.set(doc(bob, 'businesses/impersonation'), business('impersonation', 'alice'));
  impersonation.set(doc(bob, 'businessMemberships/impersonation_bob'), member('impersonation', 'bob'));
  await assertFails(impersonation.commit());

  // Otro propietario también puede registrarse sin compartir datos privados.
  const second = writeBatch(bob);
  second.set(doc(bob, 'businesses/tenant-b'), business('tenant-b', 'bob'));
  second.set(doc(bob, 'businessMemberships/tenant-b_bob'), member('tenant-b', 'bob'));
  await assertSucceeds(second.commit());
  await assertFails(getDoc(doc(alice, 'businesses/tenant-b')));
  await assertFails(getDoc(doc(bob, 'businesses/tenant-a')));

  // Compatibilidad: una reserva huérfana anterior a la propuesta, con dueño
  // identificado, puede recuperar su OWNER; un tercero no puede reclamarla.
  // No crea datos reales: la reserva heredada se simula solo como admin emulado.
  await env.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    await setDoc(doc(admin, 'businesses/legacy-orphan'), business('legacy-orphan', 'alice'));
    await setDoc(doc(admin, 'businesses/legacy-without-owner'), {
      restaurantId: 'legacy-without-owner', branding: { restaurantName: 'Legado' },
    });
  });
  await assertFails(setDoc(doc(bob, 'businessMemberships/legacy-orphan_bob'),
    member('legacy-orphan', 'bob')));
  await assertSucceeds(setDoc(doc(alice, 'businessMemberships/legacy-orphan_alice'),
    member('legacy-orphan', 'alice')));
  assert.equal((await assertSucceeds(getDoc(doc(alice, 'businesses/legacy-orphan')))).exists(), true);
  // Un negocio histórico sin ownerUserId NO admite autorreclamación de OWNER.
  // Requiere una migración revisada, nunca asignación automática por el cliente.
  await assertFails(setDoc(doc(alice, 'businessMemberships/legacy-without-owner_alice'),
    member('legacy-without-owner', 'alice')));

  // Dos propietarios compiten por el mismo identificador: uno gana, y el
  // batch perdedor no puede dejar una membresía de OWNER suelta.
  const raceId = 'simultaneous-handle';
  const raceAlice = writeBatch(alice);
  raceAlice.set(doc(alice, 'businesses/' + raceId), business(raceId, 'alice'));
  raceAlice.set(doc(alice, 'businessMemberships/' + raceId + '_alice'), member(raceId, 'alice'));
  const raceBob = writeBatch(bob);
  raceBob.set(doc(bob, 'businesses/' + raceId), business(raceId, 'bob'));
  raceBob.set(doc(bob, 'businessMemberships/' + raceId + '_bob'), member(raceId, 'bob'));
  const raceResults = await Promise.allSettled([raceAlice.commit(), raceBob.commit()]);
  assert.equal(raceResults.filter(result => result.status === 'fulfilled').length, 1,
    'Solo un propietario puede reservar el mismo handle');
  assert.equal(raceResults.filter(result => result.status === 'rejected').length, 1,
    'La segunda alta concurrente debe rechazarse');

  // Un batch con membresía inválida no debe dejar negocio ni OWNER parcial.
  const rollback = writeBatch(alice);
  rollback.set(doc(alice, 'businesses/atomic-rollback'), business('atomic-rollback', 'alice'));
  rollback.set(doc(alice, 'businessMemberships/atomic-rollback_alice'),
    member('atomic-rollback', 'alice', 'MANAGER'));
  await assertFails(rollback.commit());
  await env.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    const winner = (await getDoc(doc(admin, 'businesses/' + raceId))).data()?.ownerUserId;
    assert(['alice', 'bob'].includes(winner), 'La reserva concurrente tiene dueño válido');
    assert.equal((await getDoc(doc(admin, 'businessMemberships/' + raceId + '_' + winner))).exists(), true);
    assert.equal((await getDoc(doc(admin, 'businessMemberships/' + raceId + '_' +
      (winner === 'alice' ? 'bob' : 'alice')))).exists(), false);
    assert.equal((await getDoc(doc(admin, 'businesses/atomic-rollback'))).exists(), false);
    assert.equal((await getDoc(doc(admin, 'businessMemberships/atomic-rollback_alice'))).exists(), false);
    assert.equal((await getDoc(doc(admin, 'businessMemberships/legacy-without-owner_alice'))).exists(), false);
  });

  console.log('PASS (propuesta aislada): alta atómica, colisión concurrente y rollback, recuperación heredada controlada, OWNER/rol/UID/tenant/estado validados.');
  console.log('PENDIENTE: revisión humana del cambio de reglas, compatibilidad y autorización; ninguna regla se modificó ni desplegó.');
} finally {
  await env.cleanup();
}
