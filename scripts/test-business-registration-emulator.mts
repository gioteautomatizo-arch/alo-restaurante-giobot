// Integración real con Firebase Auth/Firestore emulados y API Express local.
// No usa credenciales, cuentas, reglas desplegadas ni datos de producción.
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { buildAtomicOwnerProposalRules } from './owner-atomic-proposal-rules.mjs';
import { registerThroughOnboardingUI } from './business-onboarding-emulator-ui.mjs';
import { saveBrandingThroughUI, addCatalogProductThroughUI } from './business-management-emulator-ui.mjs';
import { publishBusinessThroughUI, publishAndHideBusinessThroughUI, assertForeignWorkspaceDeniedThroughUI, assertStaffCannotPublishThroughUI } from './business-publication-emulator-ui.mjs';
import {
  acceptInviteThroughUI, createInviteThroughEmployeesUI, deactivateEmployeeThroughUI, inspectEmployeesUI,
} from './business-invites-emulator-ui.mjs';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, reload, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, setDoc, updateDoc, terminate } from 'firebase/firestore';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const projectId = 'gioteautomatizo-registration-e2e-test';
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.ENABLE_BUSINESS_INVITES = 'true';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'Se requiere emulador Firestore');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099', 'Se requiere emulador Auth');

// Segunda ejecución opcional: prueba el flujo REAL del cliente y de invitaciones
// con la propuesta OWNER atómica, derivada solo en memoria. No altera staged.
if (process.env.TEST_ATOMIC_OWNER_PROPOSAL === '1') {
  const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
  const isolatedRules = buildAtomicOwnerProposalRules(staged);
  const testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: isolatedRules, host: '127.0.0.1', port: 8080 },
  });
  await testEnvironment.cleanup();
  console.log('Propuesta OWNER atómica cargada solo en emulador para integración completa.');
}


const clientApp = initializeApp({
  apiKey: 'emulator-only-key', authDomain: 'localhost', projectId,
  appId: '1:123456789:web:registration-e2e',
});
const { auth, db } = await import('../src/lib/firebase.ts');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const { registerBusiness, getBusinessesForUser, getBusinessForUser, getBusinessMembership } = await import('../src/lib/businessAuthService.ts');
const { setBusinessPublication, syncPublicProfileIfNeeded, getBusinessPublicationStatus } = await import('../src/lib/businessPublicProfileService.ts');
const { saveBusinessCatalog, seedBusinessCatalogIfMissing, subscribeToBusinessCatalog } = await import('../src/lib/businessCatalogService.ts');
const { listBusinessEmployees, updateBusinessEmployee } = await import('../src/lib/businessEmployeeService.ts');
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
  // Paso 2: las seis pantallas React reales llaman al servicio de alta con Auth/Firestore emulados.
  // Después se comprueban tenant, OWNER, catálogo y el resto del recorrido real.
  const a = await registerThroughOnboardingUI({
    name: 'Prueba ' + idA, handle: idA, email: aEmail,
    businessType: 'restaurant', onRegister: registerBusiness,
  });
  const uidA = a.membership.userId;
  const managementBridge = {
    // React/jsdom vive en otro realm: Firestore rechaza arrays/objetos personalizados.
    // Convertir el payload de prueba a objetos nativos antes de llamar al SDK real.
    updateBranding: (id: string, patch: unknown) => updateDoc(doc(db, 'businesses', id), JSON.parse(JSON.stringify(patch))),
    syncPublic: (id: string, tenant: any) => syncPublicProfileIfNeeded(id, JSON.parse(JSON.stringify(tenant))),
    getBusiness: (uid: string, id: string) => getBusinessForUser(uid, id),
    subscribeCatalog: (id: string, callback: any, onError: any) => subscribeToBusinessCatalog(id, callback, onError),
    saveCatalog: (id: string, items: any, actor: string, revision: string | null) =>
      saveBusinessCatalog(id, JSON.parse(JSON.stringify(items)), actor, revision),
  };
  const publicationBridge = {
    getBusiness: (uid: string, id: string) => getBusinessForUser(uid, id),
    getMembership: (uid: string, id: string) => getBusinessMembership(uid, id),
    getStatus: (id: string) => getBusinessPublicationStatus(id),
    setPublication: (id: string, tenant: any, published: boolean) =>
      setBusinessPublication(id, JSON.parse(JSON.stringify(tenant)), published),
    syncPublic: (id: string, tenant: any) => syncPublicProfileIfNeeded(id, JSON.parse(JSON.stringify(tenant))),
  };
  assert.equal(a.tenant.restaurantId, idA);
  assert.equal((await getDoc(doc(db, 'businessMemberships', idA + '_' + uidA))).data()?.role, 'OWNER');
  const catalogA = await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'));
  assert(catalogA.exists() && catalogA.data().items.length > 0, 'Catálogo A sembrado');
  assert.deepEqual((await getBusinessesForUser(uidA)).map(x => x.restaurantId), [idA]);

  // Recuperación: una alta ya confirmada puede reintentarse sin reclamar un
  // identificador ajeno. Si faltó sembrar catálogo, el reintento lo restaura.
  await deleteDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'));
  assert.equal((await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).exists(), false);
  const restoredA = await signup(idA, aEmail, 'restaurant');
  assert.equal(restoredA.tenant.ownerUserId, uidA);
  assert.equal(restoredA.membership.role, 'OWNER');
  assert((await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).data()?.items.length > 0,
    'Reintento del dueño recupera catálogo ausente');
  // Dos siembras simultáneas sobre un catálogo ausente: solo una puede
  // crearlo. Una siembra tardía tampoco debe reemplazar el catálogo editado.
  await deleteDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'));
  const seedItem = (id: string) => [{
    id, name: id, description: '', category: 'Prueba', price: 31,
    available: true, sortOrder: 1,
  }];
  const seeds = await Promise.all([
    seedBusinessCatalogIfMissing(idA, seedItem('seed-first'), 'Siembra 1'),
    seedBusinessCatalogIfMissing(idA, seedItem('seed-second'), 'Siembra 2'),
  ]);
  assert.equal(seeds.filter(Boolean).length, 1, 'Solo una siembra gana la carrera');
  const winner = (await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).data();
  assert(winner, 'El catálogo debe existir después de la carrera');
  assert.equal(winner.items.length, 1, 'La segunda siembra no fusiona ni pisa productos');
  assert(['seed-first', 'seed-second'].includes(winner.items[0].id));
  assert.equal(await seedBusinessCatalogIfMissing(idA, seedItem('seed-late'), 'Siembra tardía'), false);
  assert.equal((await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).data()?.items[0].id, winner.items[0].id);
  // Edición efectiva de catálogo con el SDK real conectado al emulador.
  const updatedA = await saveBusinessCatalog(idA, [
    ...catalogA.data()!.items,
    { id: 'extra-a', name: 'Solo A', description: '', category: 'Prueba', price: 42, available: true, sortOrder: 99 },
  ], 'Propietario A');
  assert(updatedA.items.some(item => item.id === 'extra-a'));
  assert((await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).data()?.items.some(item => item.id === 'extra-a'));
  // Dos editores partieron de la misma versión: una escritura gana y la otra
  // debe fallar explícitamente sin perder el producto original ni el ganador.
  const baseRevision = updatedA.revision;
  if (!baseRevision) throw new Error('La escritura debe generar revisión de catálogo');
  const parallelEdits = await Promise.allSettled([
    saveBusinessCatalog(idA, [...updatedA.items, { ...seedItem('editor-one')[0], sortOrder: 120 }], 'Editor 1', baseRevision),
    saveBusinessCatalog(idA, [...updatedA.items, { ...seedItem('editor-two')[0], sortOrder: 130 }], 'Editor 2', baseRevision),
  ]);
  assert.equal(parallelEdits.filter(result => result.status === 'fulfilled').length, 1,
    'Solo un editor puede guardar desde la misma versión');
  assert.equal(parallelEdits.filter(result => result.status === 'rejected'
    && /CONFLICTO_CATALOGO/.test(String(result.reason))).length, 1,
    'El segundo editor recibe conflicto explícito');
  const afterParallel = (await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).data();
  assert(afterParallel?.items.some((item: { id: string }) => item.id === 'extra-a'),
    'Una carrera nunca elimina el producto ya confirmado');
  assert.equal(afterParallel?.items.filter((item: { id: string }) =>
    item.id === 'editor-one' || item.id === 'editor-two').length, 1);
  await assert.rejects(
    saveBusinessCatalog(idA, updatedA.items, 'Editor obsoleto', baseRevision),
    /CONFLICTO_CATALOGO/,
    'Una pestaña con versión anterior no puede reemplazar el catálogo actual'
  );
  const retriedA = await registerBusiness({
    businessName: 'Nombre distinto que no debe reemplazar al existente',
    handle: idA, email: aEmail, password, businessType: 'ghost-kitchen',
  });
  assert.equal(retriedA.tenant.branding.restaurantName, a.tenant.branding.restaurantName,
    'El reintento no sobrescribe la ficha original');
  assert((await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).data()?.items.some(item => item.id === 'extra-a'),
    'El reintento no reemplaza el catálogo editado');
  await addCatalogProductThroughUI({
    businessId: idA, businessName: a.tenant.branding.restaurantName,
    user: auth.currentUser!, bridge: managementBridge, productName: 'Producto UI A', price: 43,
  });
  assert((await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).data()?.items.some((item: {name:string}) => item.name === 'Producto UI A'));
  await publishBusinessThroughUI({businessId:idA,user:auth.currentUser!,bridge:publicationBridge});
  await saveBrandingThroughUI({
    tenant: (await getBusinessForUser(uidA, idA))!, user: auth.currentUser!,
    bridge: managementBridge, name: 'Negocio A configurado en UI',
  });
  assert.equal((await getDoc(doc(db, 'businesses', idA))).data()?.branding.restaurantName, 'Negocio A configurado en UI');
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idA))).data()?.branding.restaurantName, 'Negocio A configurado en UI');
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idA))).data()?.published, true);

  await signOut(auth);
  const b = await registerThroughOnboardingUI({
    name: 'Prueba ' + idB, handle: idB, email: bEmail,
    businessType: 'ghost-kitchen', onRegister: registerBusiness,
  });
  const uidB = b.membership.userId;
  assert.notEqual(uidA, uidB);
  assert.equal((await getDoc(doc(db, 'businessMemberships', idB + '_' + uidB))).data()?.role, 'OWNER');
  const catalogB = await getDoc(doc(db, 'businesses', idB, 'catalog', 'menu_catalog'));
  assert(catalogB.exists(), 'Catálogo B sembrado');
  await saveBusinessCatalog(idB, [
    ...catalogB.data()!.items,
    { id: 'extra-b', name: 'Solo B', description: '', category: 'Prueba', price: 25, available: true, sortOrder: 99 },
  ], 'Propietario B');
  await addCatalogProductThroughUI({
    businessId: idB, businessName: b.tenant.branding.restaurantName,
    user: auth.currentUser!, bridge: managementBridge, productName: 'Producto UI B', price: 26,
  });
  assert((await getDoc(doc(db, 'businesses', idB, 'catalog', 'menu_catalog'))).data()?.items.some((item: {name:string}) => item.name === 'Producto UI B'));
  assert(!(await getDoc(doc(db, 'businesses', idB, 'catalog', 'menu_catalog'))).data()?.items.some(item => item.id === 'extra-a'));
  assert(!(await getDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'))).data()?.items.some(item => item.id === 'extra-b'));
  assert.deepEqual((await getBusinessesForUser(uidB)).map(x => x.restaurantId), [idB]);
  await assert.rejects(saveBusinessCatalog(idA, updatedA.items, 'B no puede editar A'), /acceso|permission-denied/i);
  await deny(getDoc(doc(db, 'businesses', idA)), 'B no lee configuración privada de A');
  await deny(getDoc(doc(db, 'businessMemberships', idA + '_' + uidA)), 'B no lee OWNER de A');
  await deny(setDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'), {
    businessId: idA, sourceLabel: 'Cruce', items: [], updatedAt: '', updatedBy: uidB,
  }), 'B no sobrescribe catálogo A');
  await deny(setDoc(doc(db, 'publicBusinessProfiles', idA), {
    businessId: idA, restaurantId: idA, published: false, branding: { restaurantName: 'Cruce' }, updatedAt: '',
  }), 'B no despublica A');
  // La comprobación de OWNER puede rechazar antes de llegar a las reglas.
  await assert.rejects(setBusinessPublication(idA, a.tenant, false),
    /Solo el propietario|permission-denied/i, 'B no publica A');
  await deny(getBusinessForUser(uidB, idA), 'B no puede resolver el tenant privado A');
  await assertForeignWorkspaceDeniedThroughUI({businessId:idA,user:auth.currentUser!,bridge:publicationBridge});
  await publishAndHideBusinessThroughUI({businessId:idB,user:auth.currentUser!,bridge:publicationBridge});
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idB))).data()?.published, false);
  await saveBrandingThroughUI({
    tenant: (await getBusinessForUser(uidB, idB))!, user: auth.currentUser!,
    bridge: managementBridge, name: 'Negocio B configurado en UI',
  });
  assert.equal((await getDoc(doc(db, 'businesses', idB))).data()?.branding.restaurantName, 'Negocio B configurado en UI');
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
  // Las pantallas React de empleados/invitaciones delegan al SDK y API REALES
  // conectados a Auth/Firestore emulados. Ningún fetch sale a producción.
  const uiBridge = {
    listEmployees: (businessId: string) => listBusinessEmployees(businessId),
    updateEmployee: (businessId: string, userId: string, changes: { active?: boolean }) =>
      updateBusinessEmployee(businessId, userId, changes),
    listInvites: async (businessId: string) => {
      const bearer = await getIdToken(auth.currentUser!, true);
      const result = await call('/api/business-invites?businessId=' + encodeURIComponent(businessId),
        undefined, bearer, 'GET');
      if (result.status !== 200) throw new Error(result.data.error || 'No se cargaron invitaciones');
      return result.data.invites;
    },
    createInvite: async (businessId: string, name: string, email: string, role: string) => {
      const bearer = await getIdToken(auth.currentUser!, true);
      const result = await call('/api/business-invites', { businessId, name, email, role }, bearer);
      if (result.status !== 201) throw new Error(result.data.error || 'No se creó invitación');
      return result.data;
    },
    revokeInvite: async (businessId: string, inviteId: string) => {
      const bearer = await getIdToken(auth.currentUser!, true);
      const result = await call('/api/business-invites/revoke', { businessId, inviteId }, bearer);
      if (result.status !== 200) throw new Error(result.data.error || 'No se revocó invitación');
      return result.data;
    },
    previewInvite: async (token: string) => {
      const result = await call('/api/business-invites/preview', { token });
      if (result.status !== 200) throw new Error(result.data.error || 'No se pudo consultar invitación');
      return result.data;
    },
    acceptInvite: async (token: string) => {
      const bearer = await getIdToken(auth.currentUser!, true);
      const result = await call('/api/business-invites/accept', { token }, bearer);
      if (result.status !== 200) throw new Error(result.data.error || 'No se pudo aceptar invitación');
      return result.data;
    },
  };
  await inspectEmployeesUI({ businessId: idB, bridge: uiBridge,
    forbiddenText: 'Persona de prueba' });
  const bToken = await getIdToken(auth.currentUser, true);
  assert.equal((await call('/api/business-invites?businessId=' + idA, undefined, bToken, 'GET')).status, 403);
  assert.equal((await call('/api/business-invites', {
    businessId: idA, email: employeeEmail, name: 'Persona de prueba', role: 'KITCHEN',
  }, bToken)).status, 403);

  await signInWithEmailAndPassword(auth, aEmail, password);
  assert.equal((await getDoc(doc(db, 'businesses', idA))).data()?.branding.restaurantName, 'Negocio A configurado en UI');
  const aToken = await getIdToken(auth.currentUser, true);
  const inviteToken = await createInviteThroughEmployeesUI({
    businessId: idA, name: 'Persona de prueba', email: employeeEmail,
    role: 'KITCHEN', bridge: uiBridge,
  });
  assert.equal((await call('/api/business-invites/preview', { token: inviteToken })).status, 200);

  await signOut(auth);
  const staff = await createUserWithEmailAndPassword(auth, employeeEmail, password);
  await adminAuth.updateUser(staff.user.uid, { emailVerified: true });
  await reload(auth.currentUser);
  const staffToken = await getIdToken(auth.currentUser, true);
  const acceptedHash = await acceptInviteThroughUI({
    token: inviteToken, user: auth.currentUser!, bridge: uiBridge, businessId: idA,
  });
  assert.equal(acceptedHash, '#business/' + idA);
  assert.equal((await call('/api/business-invites/accept', { token: inviteToken }, staffToken)).status, 410);
  assert.equal((await getDoc(doc(db, 'businessMemberships', idA + '_' + staff.user.uid))).data()?.role, 'KITCHEN');
  await assertStaffCannotPublishThroughUI({businessId:idA,user:auth.currentUser!,bridge:publicationBridge});
  assert((await getDoc(doc(db, 'businesses', idA))).exists(), 'Empleado accede a A');
  assert.deepEqual((await getBusinessesForUser(staff.user.uid)).map(x => x.restaurantId), [idA]);
  await deny(updateDoc(doc(db, 'businesses', idA, 'catalog', 'menu_catalog'), {
    sourceLabel: 'Modificación sin permiso',
  }), 'Empleado KITCHEN no modifica catálogo A');
  await deny(getDoc(doc(db, 'businesses', idB)), 'Empleado A no accede a B');
  await assert.rejects(setBusinessPublication(idA, a.tenant, false), /propietario/, 'Empleado no publica A');

  await signInWithEmailAndPassword(auth, bEmail, password);
  await inspectEmployeesUI({ businessId: idB, bridge: uiBridge,
    forbiddenText: 'Persona de prueba' });
  await signInWithEmailAndPassword(auth, aEmail, password);
  await deactivateEmployeeThroughUI({
    businessId: idA, name: 'Persona de prueba', bridge: uiBridge,
  });
  assert.equal((await getDoc(doc(db, 'businessMemberships', idA + '_' + staff.user.uid))).data()?.active, false,
    'La UI revocó la membresía en Firestore emulado');
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
  console.log('PASS (' + (process.env.TEST_ATOMIC_OWNER_PROPOSAL === '1' ? 'propuesta OWNER aislada' : 'reglas staged') + '): onboarding, identidad, catálogo, publicación y empleados/invitaciones en React conectados a Auth/Firestore/API emulados; aislamiento, revocación y recuperación de sesión.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await signOut(auth).catch(() => {});
  await terminate(db);
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}
