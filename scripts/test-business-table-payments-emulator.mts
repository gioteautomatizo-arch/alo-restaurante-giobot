/** Integración del servicio real de lectura de pagos de mesa con reglas STAGED.
 * Solo Firestore Emulator, identidades y pagos ficticios; ninguna escritura real.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where, type Firestore } from 'firebase/firestore';
import { subscribeToBusinessTablePayments } from '../src/lib/businessTablePayments.ts';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: este test requiere Firestore Emulator local.');
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-table-payments-tenant-test',
  firestore: {
    host: '127.0.0.1', port: 8080,
    rules: readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'),
  },
});
const signed = (uid: string) => env.authenticatedContext(uid).firestore();
const ownerA = signed('owner-a');
const ownerB = signed('owner-b');
const managerA = signed('manager-a');
const revokedA = signed('revoked-a');
const outsider = signed('outsider');
const anonymous = env.unauthenticatedContext().firestore();

type Observation =
  | { kind: 'data'; ids: string[]; tenants: string[] }
  | { kind: 'error'; code: string };
function observe(firestore: ReturnType<typeof signed>, businessId: string): Promise<Observation> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    const timeout = setTimeout(() => { stop(); reject(new Error('Listener no resolvió en 12s')); }, 12000);
    const finish = (result: Observation) => { clearTimeout(timeout); stop(); resolve(result); };
    stop = subscribeToBusinessTablePayments(
      businessId,
      (rows) => finish({ kind: 'data', ids: rows.map(row => row.id || ''), tenants: rows.map(row => row.restaurantId) }),
      (error) => finish({ kind: 'error', code: (error as Error & { code?: string }).code || 'unknown' }),
      firestore as unknown as Firestore,
    );
  });
}
const payment = (restaurantId: string, createdAt: string) => ({
  restaurantId, code: 'DEMO-ONLY', tableNumber: 1, orderIds: ['demo-order'],
  subtotal: 20, discountAmount: 0, tipAmount: 0, total: 20,
  paymentMethod: 'EFECTIVO', changeDue: 0, status: 'PAGADO',
  createdAt, chargedById: 'demo', chargedByName: 'Cajero ficticio',
});
try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    for (const [businessId, uid] of [['tenant-a', 'owner-a'], ['tenant-b', 'owner-b']]) {
      await setDoc(doc(admin, 'businesses', businessId), { restaurantId: businessId, ownerUserId: uid });
      await setDoc(doc(admin, 'businessMemberships', businessId + '_' + uid), {
        restaurantId: businessId, userId: uid, role: 'OWNER', active: true,
      });
    }
    await setDoc(doc(admin, 'businessMemberships/tenant-a_manager-a'), {
      restaurantId: 'tenant-a', userId: 'manager-a', role: 'MANAGER', active: true,
    });
    await setDoc(doc(admin, 'businessMemberships/tenant-a_revoked-a'), {
      restaurantId: 'tenant-a', userId: 'revoked-a', role: 'OWNER', active: false,
    });
    await setDoc(doc(admin, 'table_payments/a-early'), payment('tenant-a', '2026-10-31T12:00:00.000Z'));
    await setDoc(doc(admin, 'table_payments/a-late'), payment('tenant-a', '2026-10-31T13:00:00.000Z'));
    await setDoc(doc(admin, 'table_payments/b-only'), payment('tenant-b', '2026-10-31T14:00:00.000Z'));
  });

  assert.deepEqual(await observe(ownerA, 'tenant-a'), {
    kind: 'data', ids: ['a-late', 'a-early'], tenants: ['tenant-a', 'tenant-a'],
  }, 'El listener real devuelve solo A, ordenado por fecha');
  assert.deepEqual(await observe(ownerB, 'tenant-b'), {
    kind: 'data', ids: ['b-only'], tenants: ['tenant-b'],
  }, 'El listener real devuelve solo B');
  assert.deepEqual(await observe(managerA, 'tenant-a'), {
    kind: 'data', ids: ['a-late', 'a-early'], tenants: ['tenant-a', 'tenant-a'],
  }, 'Un responsable activo puede leer pagos de su negocio');
  for (const [firestore, businessId, label] of [
    [ownerA, 'tenant-b', 'A no puede consultar B'],
    [ownerB, 'tenant-a', 'B no puede consultar A'],
    [revokedA, 'tenant-a', 'Membresía revocada no lee A'],
    [outsider, 'tenant-a', 'Cuenta ajena no lee A'],
    [anonymous, 'tenant-a', 'Anónimo no lee A'],
  ] as const) {
    const result = await observe(firestore, businessId);
    assert.deepEqual(result, { kind: 'error', code: 'permission-denied' }, label);
  }
  await assertSucceeds(getDocs(query(collection(ownerA, 'table_payments'), where('restaurantId', '==', 'tenant-a'))));
  await assertFails(getDocs(query(collection(ownerA, 'table_payments'), where('restaurantId', '==', 'tenant-b'))));
  await assertFails(getDocs(collection(ownerA, 'table_payments')));
  await assertFails(getDoc(doc(ownerA, 'table_payments', 'b-only')));
  await assertFails(setDoc(doc(outsider, 'table_payments', 'forged'), payment('tenant-a', '2026-10-31T12:00:00.000Z')));
  assert.throws(() => subscribeToBusinessTablePayments(' tenant-a', () => {}, () => {}, ownerA as unknown as Firestore), /identificador/);
  assert.throws(() => subscribeToBusinessTablePayments('', () => {}, () => {}, ownerA), /identificador/);
  console.log('PASS: listener real de pagos de mesa aislado A/B; errores explícitos, permisos y consulta sin filtro denegados.');
} finally {
  await env.cleanup();
}
