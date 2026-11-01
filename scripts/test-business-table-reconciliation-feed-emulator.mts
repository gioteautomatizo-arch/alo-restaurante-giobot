/** Prueba del coordinador REAL con dos consultas y reglas STAGED.
 * Solo Firestore Emulator con identidades, pedidos y pagos inventados.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import type { RestaurantOrder, TablePayment } from '../src/types';
import {
  subscribeToBusinessTableReconciliation,
  type TableReconciliationFeedUpdate,
} from '../src/lib/businessTableReconciliationFeed.ts';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: solo ejecutar con Firestore Emulator local.');
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-table-reconciliation-feed-test',
  firestore: {
    host: '127.0.0.1', port: 8080,
    rules: readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'),
  },
});
const signed = (uid: string) => env.authenticatedContext(uid).firestore();
const start = '2026-10-31T12:00:00.000Z';
const end = '2026-10-31T16:00:00.000Z';
const paidAt = '2026-10-31T13:00:00.000Z';
const order = (id: string, restaurantId: string, total: number, paymentId: string,
  extras: Partial<RestaurantOrder> = {}): RestaurantOrder => ({
  id, code: id, restaurantId, orderType: 'dine_in',
  customerName: 'Ficticio', paymentMethod: 'efectivo', bringOwnContainer: false,
  items: [], subtotal: total, discountAmount: 0, deliveryFee: 0, total,
  status: 'ENTREGADO', billingStatus: 'PAGADO', paidAt, paymentId,
  createdAt: start, updatedAt: paidAt, ...extras,
});
const payment = (id: string, restaurantId: string, orderIds: string[], total: number,
  extras: Partial<TablePayment> = {}): TablePayment => ({
  id, code: id, restaurantId, tableNumber: 1, orderIds,
  subtotal: total, discountAmount: 0, tipAmount: 0, total,
  paymentMethod: 'EFECTIVO', changeDue: 0, status: 'PAGADO', createdAt: paidAt,
  chargedById: 'demo', chargedByName: 'Cajero ficticio', ...extras,
});
const aPay = payment('a-pay', 'tenant-a', ['a-1', 'a-2'], 90, {
  paymentMethod: 'MIXTO',
  paymentBreakdown: [{ method: 'EFECTIVO', amount: 30 }, { method: 'TARJETA', amount: 60 }],
});
const aOne = order('a-1', 'tenant-a', 30, 'a-pay');
const aTwo = order('a-2', 'tenant-a', 60, 'a-pay');
const aPickup = order('a-pickup', 'tenant-a', 50, '', { orderType: 'pickup', paymentId: undefined });
const bPay = payment('b-pay', 'tenant-b', ['b-1'], 200);
const bOne = order('b-1', 'tenant-b', 200, 'b-pay');

function observe(firestore: ReturnType<typeof signed>, businessId: string): Promise<TableReconciliationFeedUpdate> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    const timer = setTimeout(() => { stop(); reject(new Error('Diagnóstico no resolvió en 15s')); }, 15000);
    const finish = (update: TableReconciliationFeedUpdate) => {
      clearTimeout(timer);
      stop();
      resolve(update);
    };
    stop = subscribeToBusinessTableReconciliation(
      businessId, start, end, (update) => {
        if (update.status !== 'loading') finish(update);
      }, firestore as unknown as Firestore,
    );
  });
}
function expectDiagnostic(update: TableReconciliationFeedUpdate) {
  assert.equal(update.status, 'diagnostic', JSON.stringify(update));
  if (update.status !== 'diagnostic') throw new Error('No llegó diagnóstico.');
  assert.equal(update.atomic, false, 'Dos consultas no son snapshot atómico');
  assert.equal(update.authorizesClose, false, 'El feed no autoriza cerrar Caja');
  assert.equal(update.reconciliation.authorizesClose, false);
  assert.equal(update.source, 'separate-server-snapshots');
  return update.reconciliation;
}
try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    for (const [tenant, uid] of [['tenant-a', 'owner-a'], ['tenant-b', 'owner-b']]) {
      await setDoc(doc(admin, 'businesses', tenant), { restaurantId: tenant, ownerUserId: uid });
      await setDoc(doc(admin, 'businessMemberships', tenant + '_' + uid), {
        restaurantId: tenant, userId: uid, role: 'OWNER', active: true,
      });
    }
    await setDoc(doc(admin, 'businessMemberships/tenant-a_revoked-a'), {
      restaurantId: 'tenant-a', userId: 'revoked-a', role: 'OWNER', active: false,
    });
    for (const item of [aOne, aTwo, aPickup, bOne]) {
      await setDoc(doc(admin, 'restaurant_orders', item.id!), item);
    }
    for (const item of [aPay, bPay]) {
      await setDoc(doc(admin, 'table_payments', item.id!), item);
    }
  });
  const a = expectDiagnostic(await observe(signed('owner-a'), 'tenant-a'));
  assert.deepEqual(a.issues, []);
  assert.deepEqual(a.tableTotals, { cash: 30, card: 60, platforms: 0, total: 90, count: 1 },
    'Solo pago de mesa, sin duplicar pedidos de mesa ni sumar el pickup');
  const b = expectDiagnostic(await observe(signed('owner-b'), 'tenant-b'));
  assert.deepEqual(b.issues, []);
  assert.equal(b.tableTotals?.total, 200);

  for (const [uid, tenant] of [
    ['owner-a', 'tenant-b'],
    ['owner-b', 'tenant-a'],
    ['revoked-a', 'tenant-a'],
    ['outsider', 'tenant-a'],
  ]) {
    const denied = await observe(signed(uid), tenant);
    assert.equal(denied.status, 'error', uid + ' no debe leer ' + tenant);
    if (denied.status === 'error') {
      assert.equal((denied.error as Error & { code?: string }).code, 'permission-denied');
    }
  }
  const anonymous = await observe(env.unauthenticatedContext().firestore(), 'tenant-a');
  assert.equal(anonymous.status, 'error', 'Anónimo no puede auditar Caja');

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'table_payments/a-pay'), {
      ...aPay, paymentBreakdown: [{ method: 'EFECTIVO', amount: 30 }],
    });
  });
  const invalidMixed = expectDiagnostic(await observe(signed('owner-a'), 'tenant-a'));
  assert.equal(invalidMixed.tableTotals, null, 'MIXTO incompleto nunca muestra un total parcial');
  assert.ok(invalidMixed.issues.some((issue) => issue.code === 'METODO_O_DESGLOSE_INVALIDO'));

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'table_payments/a-pay'), aPay);
    await setDoc(doc(ctx.firestore(), 'restaurant_orders/a-2'), { ...aTwo, paymentId: 'wrong-pay' });
  });
  const badReference = expectDiagnostic(await observe(signed('owner-a'), 'tenant-a'));
  assert.equal(badReference.tableTotals, null);
  assert.ok(badReference.issues.some((issue) => issue.code === 'REFERENCIA_NO_RECIPROCA'));

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'restaurant_orders/a-2'), aTwo);
  });
  const retried = expectDiagnostic(await observe(signed('owner-a'), 'tenant-a'));
  assert.deepEqual(retried.issues, [], 'Una suscripción nueva recupera el diagnóstico sin escribir cobros');
  assert.equal(retried.tableTotals?.total, 90);

  assert.throws(
    () => subscribeToBusinessTableReconciliation(' tenant-a', start, end, () => {}, signed('owner-a') as unknown as Firestore),
    /identificador/,
  );
  console.log('PASS: feed conjunto real A/B con servidor, permisos, error explícito, MIXTO, referencias y reintento.');
  console.warn('PENDIENTE: queries no atómicas, reglas desplegadas, comprobantes históricos y validación Android/iPad. Nunca autoriza cierre.');
} finally {
  await env.cleanup();
}
