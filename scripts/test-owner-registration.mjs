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

  console.log('PASS: registro atómico, propietario inmutable, roles de empleados y aislamiento de negocios.');
} finally {
  await env.cleanup();
}
