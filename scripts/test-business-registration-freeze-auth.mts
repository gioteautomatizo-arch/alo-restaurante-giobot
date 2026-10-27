// Ensayo de congelación con el cliente ACTUAL de dos documentos y Auth real
// conectado a emuladores. No crea usuarios ni escribe datos de producción.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { buildRegistrationFreezeProposalRules } from './owner-atomic-proposal-rules.mjs';

const projectId = 'gioteautomatizo-registration-freeze-auth-test';
process.env.FIREBASE_PROJECT_ID = projectId;
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'Se requiere Firestore Emulator');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099', 'Se requiere Auth Emulator');

const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules: buildRegistrationFreezeProposalRules(staged), host: '127.0.0.1', port: 8080 },
});
const app = initializeApp({
  apiKey: 'emulator-only-key', authDomain: 'localhost', projectId,
  appId: '1:123456789:web:registration-freeze-auth',
});
const { auth, db } = await import('../src/lib/firebase.ts');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const { registerBusiness, getBusinessesForUser } = await import('../src/lib/businessAuthService.ts');
const password = 'EmulatorOnlyPass123!';

try {
  for (const owner of ['a', 'b']) {
    const businessId = 'freeze-auth-beta-' + owner;
    const email = 'freeze-owner-' + owner + '@example.test';
    const input = {businessName: 'Negocio ficticio ' + owner, handle: businessId,
      businessType: 'restaurant', email, password};
    await assert.rejects(registerBusiness(input), (error: any) => error?.code === 'permission-denied',
      'La puerta debe rechazar el batch del cliente vigente');
    const uid = auth.currentUser?.uid;
    assert(uid, 'Auth puede crear una cuenta aunque Firestore rechace el alta');
    assert.equal(auth.currentUser?.email, email);
    assert.deepEqual(await getBusinessesForUser(uid), [], 'No presentar negocio ficticio no confirmado');

    // Un reintento con el mismo correo y contraseña recupera la cuenta Auth;
    // no debe crear un tenant ni reclamar un handle durante la congelación.
    await assert.rejects(registerBusiness(input), (error: any) => error?.code === 'permission-denied',
      'El reintento debe seguir bloqueado por las reglas en memoria');
    assert.equal(auth.currentUser?.uid, uid, 'Reintento sin segunda cuenta Auth');
    await testEnv.withSecurityRulesDisabled(async context => {
      const adminDb = context.firestore();
      for (const path of [
        'businesses/' + businessId,
        'businessMemberships/' + businessId + '_' + uid,
        'businessHandleReservations/' + businessId,
      ]) {
        assert.equal((await adminDb.doc(path).get()).exists, false,
          'Rechazo sin documentos parciales: ' + path);
      }
    });
    await signOut(auth);
  }
  console.log('PASS: congelación en emuladores rechaza el alta actual, conserva cuentas Auth recuperables, evita documentos parciales y no duplica UID en reintentos.');
} finally {
  await terminate(db);
  await deleteApp(app);
  await testEnv.cleanup();
}
