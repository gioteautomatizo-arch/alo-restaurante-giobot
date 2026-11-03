import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, collection, getDocs, type Firestore } from 'firebase/firestore';
import { chargeBusinessTable } from '../src/lib/businessTableCheckout.ts';
import type { RestaurantOrder } from '../src/types';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
const env = await initializeTestEnvironment({ projectId: 'demo-business-table-checkout', firestore: {
  host: '127.0.0.1', port: 8080, rules: readFileSync(process.env.CHECKOUT_RULES_FILE || 'firestore.rules', 'utf8'),
} });
const db = env.authenticatedContext('owner-a').firestore() as unknown as Firestore;
const order = (id: string, restaurantId = 'tenant-a'): RestaurantOrder => ({
  id, restaurantId, code: id, orderType: 'dine_in', tableNumber: 2,
  orderSource: 'CLIENTE_QR', customerName: 'Prueba', items: [{ productId: 'x', name: 'Taco', quantity: 1, unitPrice: 25, totalPrice: 25 }],
  paymentMethod: 'efectivo', bringOwnContainer: false, subtotal: 25, discountAmount: 0, deliveryFee: 0, total: 25,
  status: 'NUEVO', billingStatus: 'PENDIENTE', createdAt: '2026-11-03T12:00:00Z', updatedAt: '2026-11-03T12:00:00Z',
});
async function seed(o: RestaurantOrder) { await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), 'restaurant_orders', o.id!), o); }); }
const charge = (orders: RestaurantOrder[], extra = {}, firestore = db, uid = () => 'owner-a') => chargeBusinessTable(firestore, {
  businessId: 'tenant-a', tableNumber: 2, orders, method: 'EFECTIVO', cashReceived: 100,
  user: { id: 'owner-a', name: 'Prueba' }, ...extra,
}, uid);
try {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'businesses', 'tenant-a'), { restaurantId: 'tenant-a', ownerUserId: 'owner-a' });
    await setDoc(doc(ctx.firestore(), 'businessMemberships', 'tenant-a_owner-a'), { restaurantId: 'tenant-a', userId: 'owner-a', role: 'OWNER', active: true });
  });
  const a = order('a'), b = order('b'); await seed(a); await seed(b);
  const results = await Promise.allSettled([charge([a, b]), charge([a, b])]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, 'una sola confirmación concurrente');
  const paidA = (await getDoc(doc(db, 'restaurant_orders', 'a'))).data()!;
  const paidB = (await getDoc(doc(db, 'restaurant_orders', 'b'))).data()!;
  assert.equal(paidA.billingStatus, 'PAGADO'); assert.equal(paidA.paymentId, paidB.paymentId);
  const payment = (await getDoc(doc(db, 'table_payments', paidA.paymentId))).data()!;
  assert.equal(payment.total, 50); assert.equal(payment.changeDue, 50); assert.equal(payment.restaurantId, 'tenant-a');
  assert.equal(paidA.paidAt, payment.createdAt);
  const fresh = order('fresh'); await seed(fresh);
  await assert.rejects(charge([fresh], { cashReceived: 10 }), /efectivo/);
  await assert.rejects(charge([fresh], {}, db, () => 'other'), /sesión/);
  const foreign = order('foreign', 'tenant-b'); await seed(foreign);
  await assert.rejects(charge([fresh, foreign]));
  await seed({ ...fresh, total: 30 }); await assert.rejects(charge([fresh]), /cambió/);
  await seed({ ...fresh, status: 'CANCELADO' }); await assert.rejects(charge([fresh]), /cambió/);
  await seed({ ...fresh, tableNumber: 4 }); await assert.rejects(charge([fresh]), /cambió/);
  await seed(fresh);
  await assert.rejects(charge([fresh], {}, env.authenticatedContext('intruder').firestore() as unknown as Firestore));
  assert.equal((await getDoc(doc(db, 'restaurant_orders', 'fresh'))).data()!.billingStatus, 'PENDIENTE');
  const card = await charge([fresh], { method: 'TARJETA', cashReceived: 0 }); assert.equal(card.total, 25); assert.equal(card.changeDue, 0);
  await env.withSecurityRulesDisabled(async ctx => { assert.equal((await getDocs(collection(ctx.firestore(), 'table_payments'))).size, 2); });
  console.log('PASS: cobro atómico, concurrencia, tenant ajeno, sesión, importe, cancelación, mesa, permisos y tarjeta.');
} finally { await env.cleanup(); }
