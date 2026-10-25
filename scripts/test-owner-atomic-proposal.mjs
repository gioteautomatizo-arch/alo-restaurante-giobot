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

const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const anchor = '        && !exists(/databases/$(database)/documents/businesses/$(businessId));';
assert.equal(staged.split(anchor).length, 2,
  'ALTO: el bloque de alta cambió; revisar la propuesta antes de ejecutarla.');

const membershipPath = '/databases/$(database)/documents/businessMemberships/$(businessId + \'_\' + request.auth.uid)';
const replacement = `        && !exists(/databases/$(database)/documents/businesses/$(businessId))
        && existsAfter(${membershipPath})
        && getAfter(${membershipPath}).data.restaurantId == businessId
        && getAfter(${membershipPath}).data.userId == request.auth.uid
        && getAfter(${membershipPath}).data.role == 'OWNER'
        && getAfter(${membershipPath}).data.active == true;`;
const proposedRules = staged.replace(anchor, replacement);
assert.notEqual(proposedRules, staged);

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

  console.log('PASS (propuesta aislada): alta atómica de dos tenants, reserva huérfana denegada, OWNER/rol/UID/tenant/estado validados.');
  console.log('PENDIENTE: revisión humana del cambio de reglas, compatibilidad y autorización; ninguna regla se modificó ni desplegó.');
} finally {
  await env.cleanup();
}
