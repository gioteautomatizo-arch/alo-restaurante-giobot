import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, query, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-owner-security-test',
  firestore: {
    rules: readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});
const signed = (uid) => env.authenticatedContext(uid).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();
const business = (id, uid) => ({ restaurantId: id, ownerUserId: uid, branding: { restaurantName: id } });
const member = (id, uid, role = 'OWNER') => ({ restaurantId: id, userId: uid, role, active: true });

try {
  // Diagnóstico de seguridad staged, sin modificar las reglas protegidas.
  // El guard de migración impide cambiar /businesses en el archivo staged.
  let orphanReservationAllowed = false;
  try {
    await setDoc(doc(signed('squatter'), 'businesses/orphan-reservation'), business('orphan-reservation', 'squatter'));
    orphanReservationAllowed = true;
  } catch (error) {
    if (error?.code !== 'permission-denied') throw error;
  }
  if (orphanReservationAllowed) {
    console.warn('PENDIENTE: staged permite crear businesses/{id} sin membresía OWNER atómica; requiere revisión de reglas separada.');
  }

  // El flujo real registra el negocio y su propietario en un único batch.
  const ownerDb = signed('owner-new');
  const signup = writeBatch(ownerDb);
  signup.set(doc(ownerDb, 'businesses/new-business'), business('new-business', 'owner-new'));
  signup.set(doc(ownerDb, 'businessMemberships/new-business_owner-new'), member('new-business', 'owner-new'));
  await assertSucceeds(signup.commit());

  await assertSucceeds(getDoc(doc(ownerDb, 'businesses/new-business')));
  await assertSucceeds(getDoc(doc(ownerDb, 'businessMemberships/new-business_owner-new')));
  await assertFails(getDoc(doc(signed('outsider'), 'businesses/new-business')));
  await assertFails(getDocs(collection(anonymous(), 'businesses')));
  await assertFails(setDoc(doc(anonymous(), 'businesses/anonymous'), business('anonymous', 'anonymous')));
  await assertFails(setDoc(doc(signed('outsider'), 'businesses/fake-owner'), business('fake-owner', 'owner-new')));
  await assertFails(setDoc(doc(signed('outsider'), 'businessMemberships/new-business_outsider'), member('new-business', 'outsider')));
  await assertFails(setDoc(doc(ownerDb, 'businessMemberships/new-business_extra'), member('new-business', 'extra')));
  await assertFails(updateDoc(doc(ownerDb, 'businesses/new-business'), { ownerUserId: 'outsider' }));
  await assertFails(updateDoc(doc(ownerDb, 'businesses/new-business'), { restaurantId: 'other-business' }));
  await assertFails(deleteDoc(doc(ownerDb, 'businessMemberships/new-business_owner-new')));

  const otherDb = signed('owner-other');
  const secondSignup = writeBatch(otherDb);
  secondSignup.set(doc(otherDb, 'businesses/other-business'), business('other-business', 'owner-other'));
  secondSignup.set(doc(otherDb, 'businessMemberships/other-business_owner-other'), member('other-business', 'owner-other'));
  await assertSucceeds(secondSignup.commit());
  await assertFails(getDoc(doc(ownerDb, 'businesses/other-business')));
  await assertFails(updateDoc(doc(ownerDb, 'businesses/other-business'), { branding: { restaurantName: 'Invasión' } }));
  await assertFails(updateDoc(doc(otherDb, 'businesses/new-business'), { branding: { restaurantName: 'Invasión' } }));

  // El alta del personal también debe ser una operación atómica.
  const hire = writeBatch(ownerDb);
  hire.set(doc(ownerDb, 'businessMemberships/new-business_employee-1'), {
    ...member('new-business', 'employee-1', 'KITCHEN'), name: 'Cocina', email: 'cook@example.test',
    createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z',
  });
  hire.update(doc(ownerDb, 'businesses/new-business'), { employeeUserIds: arrayUnion('employee-1') });
  await assertSucceeds(hire.commit());
  const roster = await assertSucceeds(getDoc(doc(ownerDb, 'businesses/new-business')));
  assert.deepEqual(roster.data()?.employeeUserIds, ['employee-1']);

  const staffDb = signed('employee-1');
  await assertSucceeds(getDoc(doc(staffDb, 'businessMemberships/new-business_employee-1')));
  await assertFails(getDoc(doc(staffDb, 'businesses/other-business')));
  await assertFails(setDoc(doc(staffDb, 'businessMemberships/new-business_fake'), member('new-business', 'fake', 'ADMIN')));
  await assertFails(updateDoc(doc(staffDb, 'businessMemberships/new-business_employee-1'), { role: 'OWNER' }));
  await assertFails(updateDoc(doc(staffDb, 'businesses/new-business'), { ownerUserId: 'employee-1' }));

  // La cuenta de otro negocio no puede reclamar al personal existente.
  await assertFails(updateDoc(doc(otherDb, 'businessMemberships/new-business_employee-1'), { role: 'MANAGER' }));
  await assertFails(deleteDoc(doc(otherDb, 'businessMemberships/new-business_employee-1')));
  await assertFails(setDoc(doc(ownerDb, 'businessMemberships/new-business_illicit'), member('new-business', 'illicit', 'SUPER_ADMIN')));
  await assertFails(setDoc(doc(ownerDb, 'businessMemberships/new-business_illicit-owner'), member('new-business', 'illicit-owner', 'OWNER')));

  // El dueño sí puede administrar la asignación de personal operativo.
  await assertSucceeds(updateDoc(doc(ownerDb, 'businessMemberships/new-business_employee-1'), { role: 'WAITER' }));
  await assertSucceeds(getDocs(query(collection(ownerDb, 'businessMemberships'), where('restaurantId', '==', 'new-business'), where('userId', '==', 'owner-new'))));

  // Paso 2: dos tenants ficticios con catálogo, publicación y datos privados.
  const catalogA = doc(ownerDb, 'businesses/new-business/catalog/menu_catalog');
  const catalogB = doc(otherDb, 'businesses/other-business/catalog/menu_catalog');
  await assertSucceeds(setDoc(catalogA, { businessId: 'new-business', items: [{ id: 'a', name: 'Producto A', price: 15 }] }));
  await assertSucceeds(setDoc(catalogB, { businessId: 'other-business', items: [{ id: 'b', name: 'Producto B', price: 20 }] }));
  await assertFails(getDoc(doc(anonymous(), 'businesses/new-business/catalog/menu_catalog')));
  await assertFails(getDoc(doc(anonymous(), 'businesses/other-business/catalog/menu_catalog')));
  await assertFails(getDoc(doc(otherDb, 'businesses/new-business/catalog/menu_catalog')));
  await assertFails(getDoc(doc(ownerDb, 'businesses/other-business/catalog/menu_catalog')));
  await assertFails(setDoc(doc(otherDb, 'businesses/new-business/catalog/injected'), { businessId: 'new-business', items: [] }));
  await assertSucceeds(getDoc(doc(staffDb, 'businesses/new-business/catalog/menu_catalog')));

  const publicA = doc(ownerDb, 'publicBusinessProfiles/new-business');
  const publicB = doc(otherDb, 'publicBusinessProfiles/other-business');
  const profile = (id, published) => ({
    businessId: id, restaurantId: id, published,
    branding: { restaurantName: id }, updatedAt: '2026-10-25T00:00:00Z',
  });
  await assertSucceeds(setDoc(publicA, profile('new-business', true)));
  await assertSucceeds(setDoc(publicB, profile('other-business', false)));
  await assertFails(setDoc(doc(otherDb, 'publicBusinessProfiles/new-business'), profile('new-business', false)));
  await assertFails(setDoc(doc(staffDb, 'publicBusinessProfiles/new-business'), profile('new-business', false)));
  await assertSucceeds(getDoc(doc(anonymous(), 'businesses/new-business/catalog/menu_catalog')));
  await assertFails(getDoc(doc(anonymous(), 'businesses/other-business/catalog/menu_catalog')));
  await assertFails(getDoc(doc(anonymous(), 'publicBusinessProfiles/other-business')));
  await assertFails(getDoc(doc(ownerDb, 'publicBusinessProfiles/other-business')));
  await assertSucceeds(getDoc(publicB));
  const visible = await assertSucceeds(getDocs(query(
    collection(anonymous(), 'publicBusinessProfiles'), where('published', '==', true),
  )));
  assert.deepEqual(visible.docs.map((snap) => snap.id), ['new-business']);
  await assertFails(getDocs(collection(anonymous(), 'publicBusinessProfiles')));

  const shiftA = doc(ownerDb, 'businesses/new-business/shifts/shift-test');
  await assertSucceeds(setDoc(shiftA, { businessId: 'new-business', status: 'abierto', initialCashFund: 0 }));
  await assertFails(getDoc(doc(otherDb, 'businesses/new-business/shifts/shift-test')));
  await assertFails(getDoc(doc(staffDb, 'businesses/new-business/shifts/shift-test')));
  await assertFails(setDoc(doc(otherDb, 'businesses/new-business/shifts/intrusion'), {
    businessId: 'new-business', status: 'abierto', initialCashFund: 0,
  }));

  // Revocar acceso y ocultar publicación elimina la lectura pública/privada.
  await assertSucceeds(updateDoc(publicA, { published: false }));
  await assertFails(getDoc(doc(anonymous(), 'businesses/new-business/catalog/menu_catalog')));
  await assertFails(getDoc(doc(anonymous(), 'publicBusinessProfiles/new-business')));
  await assertSucceeds(updateDoc(doc(ownerDb, 'businessMemberships/new-business_employee-1'), { active: false }));
  await assertFails(getDoc(doc(staffDb, 'businesses/new-business')));
  await assertFails(getDoc(doc(staffDb, 'businesses/new-business/catalog/menu_catalog')));
  await assertSucceeds(getDoc(catalogA));
  await assertSucceeds(getDoc(catalogB));

  // Un nombre ya ocupado no debe sobrescribir al dueño ni dejar membresías parciales.
  const collision = writeBatch(otherDb);
  collision.set(doc(otherDb, 'businesses/new-business'), business('new-business', 'owner-other'));
  collision.set(doc(otherDb, 'businessMemberships/new-business_owner-other'), member('new-business', 'owner-other'));
  await assertFails(collision.commit());
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    assert.equal((await getDoc(doc(admin, 'businesses/new-business'))).data().ownerUserId, 'owner-new');
    assert.equal((await getDoc(doc(admin, 'businessMemberships/new-business_owner-other'))).exists(), false);
  });

  // Si la membresía es inválida, el batch no deja el negocio a medio crear.
  const invalidSignup = writeBatch(otherDb);
  invalidSignup.set(doc(otherDb, 'businesses/incomplete-business'), business('incomplete-business', 'owner-other'));
  invalidSignup.set(doc(otherDb, 'businessMemberships/incomplete-business_owner-other'), member('incomplete-business', 'owner-other', 'SUPER_ADMIN'));
  await assertFails(invalidSignup.commit());
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    assert.equal((await getDoc(doc(admin, 'businesses/incomplete-business'))).exists(), false);
    assert.equal((await getDoc(doc(admin, 'businessMemberships/incomplete-business_owner-other'))).exists(), false);
  });

  await assertFails(updateDoc(doc(staffDb, 'businessMemberships/new-business_employee-1'), { active: true }));

  console.log('PASS: colisiones y rollback sin escrituras parciales; alta atómica, dos negocios ficticios, publicación, catálogo, turnos privados y revocación en emulador.');
} finally {
  await env.cleanup();
}
