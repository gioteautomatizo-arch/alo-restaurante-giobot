// Integración de altas concurrentes con Auth + Firestore Emulator reales.
// No usa cuentas, credenciales, datos ni reglas desplegadas de producción.
import assert from 'node:assert/strict';
import { initializeApp, deleteApp, getApps } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDocFromServer, terminate } from 'firebase/firestore';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const projectId = 'gioteautomatizo-employee-concurrency-test';
process.env.FIREBASE_PROJECT_ID = projectId;
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'Firestore Emulator obligatorio');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099', 'Auth Emulator obligatorio');

const clientApp = initializeApp({
  apiKey: 'emulator-only-key', authDomain: 'localhost', projectId,
  appId: '1:123456789:web:employee-concurrency',
});
const { auth, db } = await import('../src/lib/firebase.ts');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
assert.equal(auth.app.options.projectId, projectId);
assert(auth.emulatorConfig, 'No ejecutar altas si Auth primario no apunta al emulador');

const { createBusinessEmployee } = await import('../src/lib/businessEmployeeService.ts');
const adminApp = initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
const suffix = Date.now().toString(36);
const businessA = 'employee-race-a-' + suffix;
const businessB = 'employee-race-b-' + suffix;
const password = 'EmulatorOnlyPass123!';
const ownerAEmail = 'owner-a-' + suffix + '@example.test';
const ownerBEmail = 'owner-b-' + suffix + '@example.test';
const employeeEmail = (label: string) => label + '-' + suffix + '@example.test';
const employeeInput = (label: string, businessId = businessA, role: 'WAITER' | 'KITCHEN' = 'WAITER') => ({
  businessId, name: 'Empleado ' + label, email: employeeEmail(label),
  password, role, accountMode: 'new' as const,
});
const membershipPath = (tenant: string, uid: string) => 'businessMemberships/' + tenant + '_' + uid;
const appNames = () => getApps().map(app => app.name).sort();
const assertNoSecondaryApps = (baseline: string[]) =>
  assert.deepEqual(appNames(), baseline, 'Cada operación libera su Auth secundaria sin cerrar la principal');
const assertAuthNotCreated = async (email: string) => {
  await assert.rejects(adminAuth.getUserByEmail(email),
    (error: any) => error?.code === 'auth/user-not-found',
    'No debe crearse cuenta Auth tras denegación previa');
};

try {
  const ownerA = (await createUserWithEmailAndPassword(auth, ownerAEmail, password)).user;
  const ownerB = await adminAuth.createUser({ email: ownerBEmail, password });
  await Promise.all([
    adminDb.doc('businesses/' + businessA).set({
      restaurantId: businessA, ownerUserId: ownerA.uid, employeeUserIds: [],
      branding: { restaurantName: 'Negocio A ficticio' },
    }),
    adminDb.doc('businesses/' + businessB).set({
      restaurantId: businessB, ownerUserId: ownerB.uid, employeeUserIds: [],
      branding: { restaurantName: 'Negocio B ficticio' },
    }),
    adminDb.doc(membershipPath(businessA, ownerA.uid)).set({
      restaurantId: businessA, userId: ownerA.uid, role: 'OWNER', active: true,
      name: 'Propietario A', email: ownerAEmail,
    }),
    adminDb.doc(membershipPath(businessB, ownerB.uid)).set({
      restaurantId: businessB, userId: ownerB.uid, role: 'OWNER', active: true,
      name: 'Propietario B', email: ownerBEmail,
    }),
  ]);

  const baseline = appNames();
  assert.equal(auth.currentUser?.uid, ownerA.uid);
  // Dos altas reales simultáneas, mismo negocio/índice pero cuentas Auth distintas.
  const [alpha, beta] = await Promise.all([
    createBusinessEmployee(employeeInput('alpha')),
    createBusinessEmployee(employeeInput('beta', businessA, 'KITCHEN')),
  ]);
  assert.notEqual(alpha.userId, beta.userId, 'No compartir sesión Auth secundaria');
  assert.equal((await adminAuth.getUserByEmail(alpha.email)).uid, alpha.userId);
  assert.equal((await adminAuth.getUserByEmail(beta.email)).uid, beta.userId);
  for (const employee of [alpha, beta]) {
    const saved = (await adminDb.doc(membershipPath(businessA, employee.userId)).get()).data();
    assert.equal(saved?.restaurantId, businessA);
    assert.equal(saved?.userId, employee.userId);
    assert.equal(saved?.active, true);
    assert.equal(saved?.role, employee.role);
  }
  const roster = (await adminDb.doc('businesses/' + businessA).get()).data()?.employeeUserIds;
  assert(Array.isArray(roster));
  assert.deepEqual([...roster].sort(), [alpha.userId, beta.userId].sort(),
    'La transacción concurrente conserva ambos UID sin sobrescribir el índice');
  assert.deepEqual((await adminDb.doc('businesses/' + businessB).get()).data()?.employeeUserIds, [],
    'El negocio B no recibe empleados de A');
  assert.equal(auth.currentUser?.uid, ownerA.uid, 'El propietario sigue autenticado');
  assertNoSecondaryApps(baseline);

  // Correo duplicado: Auth falla sin tocar membresía ni dejar una app secundaria.
  await assert.rejects(createBusinessEmployee(employeeInput('alpha')), /Ese correo ya tiene una cuenta/);
  assertNoSecondaryApps(baseline);
  assert.deepEqual((await adminDb.doc('businesses/' + businessA).get()).data()?.employeeUserIds.sort(),
    [alpha.userId, beta.userId].sort());

  // El propietario A no puede leer B ni crear allí empleados, incluso si B existe.
  await assert.rejects(getDocFromServer(doc(db, 'businesses', businessB)),
    (error: any) => error?.code === 'permission-denied');
  await assert.rejects(createBusinessEmployee(employeeInput('cross', businessB)), /No tienes permiso/);
  await assertAuthNotCreated(employeeEmail('cross'));
  assertNoSecondaryApps(baseline);

  // Revocación previa: el preflight falla cerrado antes de crear una cuenta Auth.
  await adminDb.doc(membershipPath(businessA, ownerA.uid)).update({ active: false });
  await assert.rejects(createBusinessEmployee(employeeInput('revoked')), /No tienes permiso/);
  await assertAuthNotCreated(employeeEmail('revoked'));
  assertNoSecondaryApps(baseline);

  // Recuperación tras reactivar al OWNER de prueba: alta legítima sin tocar B.
  await adminDb.doc(membershipPath(businessA, ownerA.uid)).update({ active: true });
  const recovered = await createBusinessEmployee(employeeInput('recovered'));
  assert.equal((await adminAuth.getUserByEmail(recovered.email)).uid, recovered.userId);
  const finalRoster = (await adminDb.doc('businesses/' + businessA).get()).data()?.employeeUserIds;
  assert.deepEqual([...finalRoster].sort(), [alpha.userId, beta.userId, recovered.userId].sort());
  assert.deepEqual((await adminDb.doc('businesses/' + businessB).get()).data()?.employeeUserIds, []);
  assert.equal(auth.currentUser?.uid, ownerA.uid);
  assertNoSecondaryApps(baseline);
  console.log('PASS: Auth+Firestore Emulator, dos altas simultáneas, índice A sin pérdida, B aislado, correo duplicado, revocación, recuperación y apps secundarias liberadas.');
} finally {
  await Promise.allSettled([signOut(auth), terminate(db)]);
  await deleteApp(clientApp);
  await deleteAdminApp(adminApp);
}
