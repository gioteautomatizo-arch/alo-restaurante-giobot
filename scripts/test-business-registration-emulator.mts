// Integración real con Firebase Auth/Firestore emulados y API Express local.
// No usa credenciales, cuentas, reglas desplegadas ni datos de producción.
import assert from 'node:assert/strict';
import express from 'express';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, reload, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, terminate } from 'firebase/firestore';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const projectId = 'gioteautomatizo-registration-e2e-test';
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.ENABLE_BUSINESS_INVITES = 'true';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'Se requiere emulador Firestore');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099', 'Se requiere emulador Auth');

const clientApp = initializeApp({
  apiKey: 'emulator-only-key', authDomain: 'localhost', projectId,
  appId: '1:123456789:web:registration-e2e',
});
const { auth, db } = await import('../src/lib/firebase.ts');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const { registerBusiness, getBusinessesForUser, getBusinessForUser } = await import('../src/lib/businessAuthService.ts');
const { setBusinessPublication } = await import('../src/lib/businessPublicProfileService.ts');
const { registerBusinessInviteApi } = await import('../businessInviteApi.ts');
const adminApp = initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);

const idA = 'beta-e2e-a';
const idB = 'beta-e2e-b';
const password = 'EmulatorOnlyPass123!';
const aEmail = 'owner-a@beta.example.test';
const bEmail = 'owner-b@beta.example.test';
const employeeEmail = 'employee@beta.example.test';
const signup = (handle, email, type) => registerBusiness({
  businessName: 'Prueba ' + handle, handle, email, password, businessType: type,
});
const deny = async (promise, label) => {
  await assert.rejects(promise, error => (error as { code?: string })?.code === 'permission-denied', label);
};
let server;
try {
  // Paso 2: el flujo de alta del cliente crea Auth, tenant, OWNER y catálogo.
  const a = await signup(idA, aEmail, 'restaurant');
  const uidA = a.membership.userId;
  assert.equal(a.tenant.restaurantId, idA);
  assert.equal((await getDoc(doc(db, 'businessMemberships', idA + '_' + uidA))).data()?.role, 'OWNER');
  const catalogA = await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'));
  assert(catalogA.exists() && catalogA.data().items.length > 0, 'Catálogo A sembrado');
  assert.deepEqual((await getBusinessesForUser(uidA)).map(x => x.restaurantId), [idA]);
  await setBusinessPublication(idA, a.tenant, true);
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idA))).data()?.published, true);

  await signOut(auth);
  const b = await signup(idB, bEmail, 'ghost-kitchen');
  const uidB = b.membership.userId;
  assert.notEqual(uidA, uidB);
  assert.equal((await getDoc(doc(db, 'businessMemberships', idB + '_' + uidB))).data()?.role, 'OWNER');
  assert((await getDoc(doc(db, 'businesses', idB, 'catalog', 'menu_catalog'))).exists(), 'Catálogo B sembrado');
  assert.deepEqual((await getBusinessesForUser(uidB)).map(x => x.restaurantId), [idB]);
  await deny(getDoc(doc(db, 'businesses', idA)), 'B no lee configuración privada de A');
  await deny(getDoc(doc(db, 'businessMemberships', idA + '_' + uidA)), 'B no lee OWNER de A');
  await deny(setDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'), {
    businessId: idA, sourceLabel: 'Cruce', items: [], updatedAt: '', updatedBy: uidB,
  }), 'B no sobrescribe catálogo A');
  await deny(setDoc(doc(db, 'publicBusinessProfiles', idA), {
    businessId: idA, restaurantId: idA, published: false, branding: { restaurantName: 'Cruce' }, updatedAt: '',
  }), 'B no despublica A');
  await deny(setBusinessPublication(idA, a.tenant, false), 'B no publica A');
  await deny(getBusinessForUser(uidB, idA), 'B no puede resolver el tenant privado A');
  await setBusinessPublication(idB, b.tenant, true);
  await setBusinessPublication(idB, b.tenant, false);
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idB))).data()?.published, false);

  // Un handle ocupado no debe sobrescribir al propietario anterior ni crear
  // una membresía cruzada. El segundo dueño conserva su sesión y negocio.
  await deny(signup(idA, bEmail, 'ghost-kitchen'), 'No reutilizar el identificador del negocio A');
  assert.equal(auth.currentUser?.uid, uidB, 'El fallo no cambia la cuenta B');
  assert.deepEqual((await getBusinessesForUser(uidB)).map(x => x.restaurantId), [idB]);
  assert.equal((await getDoc(doc(db, 'businesses', idB))).data()?.ownerUserId, uidB);
  assert.equal((await getDoc(doc(db, 'businesses', idB, 'catalog', 'menu_catalog'))).exists(), true);
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idA))).data()?.published, true);

  // La publicación de A solo expone su ficha/menú públicos; B despublicado
  // y ambas configuraciones privadas siguen protegidos sin autenticación.
  await signOut(auth);
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idA))).data()?.published, true);
  assert((await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).exists());
  await deny(getDoc(doc(db, 'publicBusinessProfiles', idB)), 'B despublicado no es público');
  await deny(getDoc(doc(db, 'businesses', idB, 'catalog', 'menu_catalog')), 'Catálogo B privado');
  await deny(getDoc(doc(db, 'businesses', idA)), 'Configuración A nunca es pública');
  await signInWithEmailAndPassword(auth, bEmail, password);
  assert.equal(auth.currentUser?.uid, uidB);

  // API real de invitaciones contra el mismo proyecto emulado; sin endpoints externos.
  const app = express();
  app.use(express.json());
  registerBusinessInviteApi(app);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = async (path: string, body: unknown, token?: string, method = 'POST') => {
    const response = await fetch(origin + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const bToken = await getIdToken(auth.currentUser, true);
  assert.equal((await call('/api/business-invites?businessId=' + idA, undefined, bToken, 'GET')).status, 403);
  assert.equal((await call('/api/business-invites', {
    businessId: idA, email: employeeEmail, name: 'Persona de prueba', role: 'KITCHEN',
  }, bToken)).status, 403);

  await signInWithEmailAndPassword(auth, aEmail, password);
  const aToken = await getIdToken(auth.currentUser, true);
  const invitation = await call('/api/business-invites', {
    businessId: idA, email: employeeEmail, name: 'Persona de prueba', role: 'KITCHEN',
  }, aToken);
  assert.equal(invitation.status, 201, JSON.stringify(invitation));
  assert.equal((await call('/api/business-invites/preview', { token: invitation.data.token })).status, 200);

  await signOut(auth);
  const staff = await createUserWithEmailAndPassword(auth, employeeEmail, password);
  await adminAuth.updateUser(staff.user.uid, { emailVerified: true });
  await reload(auth.currentUser);
  const staffToken = await getIdToken(auth.currentUser, true);
  const accepted = await call('/api/business-invites/accept', { token: invitation.data.token }, staffToken);
  assert.equal(accepted.status, 200, JSON.stringify(accepted));
  assert.equal((await call('/api/business-invites/accept', { token: invitation.data.token }, staffToken)).status, 410);
  assert.equal((await getDoc(doc(db, 'businessMemberships', idA + '_' + staff.user.uid))).data()?.role, 'KITCHEN');
  assert((await getDoc(doc(db, 'businesses', idA))).exists(), 'Empleado accede a A');
  assert.deepEqual((await getBusinessesForUser(staff.user.uid)).map(x => x.restaurantId), [idA]);
  await deny(updateDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'), {
    sourceLabel: 'Modificación sin permiso',
  }), 'Empleado KITCHEN no modifica catálogo A');
  await deny(getDoc(doc(db, 'businesses', idB)), 'Empleado A no accede a B');
  await assert.rejects(setBusinessPublication(idA, a.tenant, false), /propietario/, 'Empleado no publica A');

  await signInWithEmailAndPassword(auth, aEmail, password);
  await updateDoc(doc(db, 'businessMemberships', idA + '_' + staff.user.uid), { active: false });
  await signInWithEmailAndPassword(auth, employeeEmail, password);
  await deny(getDoc(doc(db, 'businesses', idA)), 'Empleado revocado pierde acceso privado');
  await deny(getDoc(doc(db, 'businesses', idB)), 'Revocado tampoco accede a B');
  assert.deepEqual(await getBusinessesForUser(staff.user.uid), [], 'Empleado revocado sin negocios activos');
  // Recuperación de sesión: ambos propietarios conservan únicamente su tenant.
  await signInWithEmailAndPassword(auth, aEmail, password);
  assert.deepEqual((await getBusinessesForUser(uidA)).map(x => x.restaurantId), [idA]);
  await signInWithEmailAndPassword(auth, bEmail, password);
  assert.deepEqual((await getBusinessesForUser(uidB)).map(x => x.restaurantId), [idB]);
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idA))).data()?.published, true);
  console.log('PASS: dos tenants, colisión de handle, visibilidad pública/privada, roles, invitación, revocación y recuperación de sesión en emuladores.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await signOut(auth).catch(() => {});
  await terminate(db);
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}
