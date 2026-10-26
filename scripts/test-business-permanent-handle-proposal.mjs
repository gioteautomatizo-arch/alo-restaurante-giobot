/**
 * Propuesta de registro permanente de IDs (solo reglas en memoria y emulador).
 * NO modifica reglas versionadas, datos reales ni el registro de producción.
 * Diagnósticos PENDIENTE significan riesgos no corregidos/desplegados.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { buildAtomicOwnerAndPermanentHandleProposalRules } from './owner-atomic-proposal-rules.mjs';

const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposed = buildAtomicOwnerAndPermanentHandleProposalRules(staged);
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-permanent-handle-proposal-test',
  firestore: { rules: proposed, host: '127.0.0.1', port: 8080 },
});
const signed = uid => env.authenticatedContext(uid).firestore();
const business = (id, uid) => ({
  restaurantId: id, ownerUserId: uid, branding: { restaurantName: id },
});
const member = (id, uid) => ({ restaurantId: id, userId: uid, role: 'OWNER', active: true });
const reservation = (id, uid) => ({ businessId: id, ownerUserId: uid });
const businessPath = id => 'businesses/' + id;
const memberPath = (id, uid) => 'businessMemberships/' + id + '_' + uid;
const reservationPath = id => 'businessHandleReservations/' + id;

async function register(db, id, uid, options = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, businessPath(id)), business(id, uid));
  batch.set(doc(db, memberPath(id, uid)), member(id, uid));
  if (!options.skipReservation) {
    batch.set(doc(db, reservationPath(id)), options.reservation ?? reservation(id, uid));
  }
  return batch.commit();
}

try {
  const alice = signed('reserve-alice');
  const bob = signed('reserve-bob');

  // La versión anterior del cliente (batch de dos documentos) no cumple el
  // nuevo contrato: requiere migración explícita, no activar sin coordinarla.
  await assertFails(register(alice, 'old-client-no-reservation', 'reserve-alice',
    { skipReservation: true }));
  await assertFails(setDoc(doc(alice, reservationPath('orphan-reservation')),
    reservation('orphan-reservation', 'reserve-alice')));
  await assertFails(setDoc(doc(alice, businessPath('orphan-business')),
    business('orphan-business', 'reserve-alice')));
  await assertFails(register(alice, 'wrong-reservation', 'reserve-alice', {
    reservation: reservation('wrong-reservation', 'reserve-bob'),
  }));

  // Dos propietarios legítimos, con tres documentos en el mismo batch.
  await assertSucceeds(register(alice, 'reserved-a', 'reserve-alice'));
  await assertSucceeds(register(bob, 'reserved-b', 'reserve-bob'));
  await assertFails(getDoc(doc(bob, businessPath('reserved-a'))));
  await assertFails(getDoc(doc(alice, businessPath('reserved-b'))));
  await assertFails(getDoc(doc(alice, reservationPath('reserved-a'))));

  // La reserva es inmutable e ilegible incluso para el propietario.
  await assertFails(updateDoc(doc(alice, reservationPath('reserved-a')),
    { ownerUserId: 'reserve-bob' }));
  await assertFails(deleteDoc(doc(alice, reservationPath('reserved-a'))));
  await assertFails(deleteDoc(doc(alice, businessPath('reserved-a'))));
  await assertFails(register(bob, 'reserved-a', 'reserve-bob'));

  await assertSucceeds(setDoc(doc(alice, 'businesses/reserved-a/catalog/menu_catalog'), {
    businessId: 'reserved-a', items: [{ id: 'a-private', price: 18 }],
  }));

  // Ni siquiera el borrado privilegiado del documento raíz permite reabrir
  // el handle, porque la reserva persistente sigue existiendo.
  await env.withSecurityRulesDisabled(async context => {
    await deleteDoc(doc(context.firestore(), businessPath('reserved-a')));
  });
  await assertFails(register(bob, 'reserved-a', 'reserve-bob'));
  await assertFails(register(alice, 'reserved-a', 'reserve-alice'));
  await assertFails(getDoc(doc(bob, 'businesses/reserved-a/catalog/menu_catalog')));
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    assert.equal((await getDoc(doc(admin, businessPath('reserved-a')))).exists(), false);
    assert.equal((await getDoc(doc(admin, reservationPath('reserved-a')))).data()?.ownerUserId,
      'reserve-alice');
    assert.equal((await getDoc(doc(admin, memberPath('reserved-a', 'reserve-bob')))).exists(),
      false);
  });

  // Un negocio LEGADO sin reserva aún puede ser borrado por Admin SDK.
  // Si no se hizo backfill, otro propietario puede registrar el ID y ver
  // datos antiguos. La propuesta exige inventario/migración previa.
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    await setDoc(doc(admin, businessPath('legacy-unreserved')),
      business('legacy-unreserved', 'reserve-alice'));
    await setDoc(doc(admin, memberPath('legacy-unreserved', 'reserve-alice')),
      member('legacy-unreserved', 'reserve-alice'));
    await setDoc(doc(admin, 'businesses/legacy-unreserved/catalog/menu_catalog'), {
      businessId: 'legacy-unreserved', items: [{ id: 'legacy-private', price: 20 }],
    });
    await deleteDoc(doc(admin, businessPath('legacy-unreserved')));
  });
  await assertSucceeds(register(bob, 'legacy-unreserved', 'reserve-bob'));
  const exposed = await assertSucceeds(
    getDoc(doc(bob, 'businesses/legacy-unreserved/catalog/menu_catalog')));
  assert.equal(exposed.data()?.items?.[0]?.id, 'legacy-private');
  console.warn('PENDIENTE: ID histórico sin reserva y borrado privilegiado aún permite exposición; requiere backfill auditado.');

  // El Admin SDK también puede borrar una reserva: las reglas no lo limitan.
  // La política operativa debe prohibirlo y conservar respaldos.
  console.warn('PENDIENTE: Admin SDK ignora reglas; nunca borrar reservas ni reutilizar IDs, incluso en cierres.');
  console.warn('PENDIENTE: el cliente registerBusiness actual crea dos documentos; antes de aplicar la propuesta debe migrarse a tres y verificarse.');
  console.log('PASS (solo propuesta en emulador): reserva inmutable, batch de tres, no re-alta tras borrado privilegiado con reserva, aislamiento y regresiones negativas.');
} finally {
  await env.cleanup();
}
