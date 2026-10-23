/**
 * Dos terminales autenticadas, mismo pedido: solo una registra PENDIENTE -> PAGADO.
 * Ejecutar exclusivamente en emulador; ningún dato de producción.
 */
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDoc, runTransaction } from 'firebase/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: se requiere Firestore Emulator.');
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-charge-race-test',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
});
const uidDb = uid => env.authenticatedContext(uid).firestore();
const orderId = 'quick-charge-race-test';
const sample = {
  restaurantId: 'alo-restaurante', code: 'TEST-RACE', orderType: 'pickup',
  orderSource: 'CAJA', status: 'NUEVO', billingStatus: 'PENDIENTE',
  customerName: 'Ejemplo', paymentMethod: 'efectivo',
  items: [{productId:'pan',name:'Pan ficticio',quantity:1,unitPrice:20,totalPrice:20}],
  subtotal:20,discountAmount:0,deliveryFee:0,total:20,createdAt:'2026-10-22T12:00:00Z',
  updatedAt:'2026-10-22T12:00:00Z',
};
try {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'restaurant_orders', orderId), sample);
  });

  async function attempt(uid, method) {
    const firestore = uidDb(uid);
    const ref = doc(firestore, 'restaurant_orders', orderId);
    return runTransaction(firestore, async tx => {
      const snap = await tx.get(ref);
      assert(snap.exists());
      const fresh = snap.data();
      if (fresh.billingStatus === 'PAGADO') return 'alreadyPaid';
      assert.equal(fresh.billingStatus, 'PENDIENTE');
      tx.update(ref, {
        billingStatus: 'PAGADO', paymentMethod: method, paidAt: '2026-10-22T12:01:00Z',
        chargedById: uid, chargedByName: uid, updatedAt: '2026-10-22T12:01:00Z',
      });
      return 'charged';
    });
  }
  const outcomes = await Promise.all([
    attempt('cashier-one', 'efectivo'), attempt('cashier-two', 'tarjeta'),
  ]);
  assert.deepEqual(outcomes.sort(), ['alreadyPaid', 'charged']);
  const paid = (await getDoc(doc(uidDb('cashier-one'), 'restaurant_orders', orderId))).data();
  assert.equal(paid.billingStatus, 'PAGADO');
  assert.equal(paid.total, 20);
  assert(['cashier-one','cashier-two'].includes(paid.chargedById));
  const initialPayer = paid.chargedById;
  const third = await attempt('cashier-two', 'transferencia');
  assert.equal(third, 'alreadyPaid');
  const finalPaid = (await getDoc(doc(uidDb('cashier-one'), 'restaurant_orders', orderId))).data();
  assert.equal(finalPaid.chargedById, initialPayer);
  assert.equal(finalPaid.paymentMethod, paid.paymentMethod);
  console.log('PASS: dos terminales, un cobro persistido y método original conservado.');
} finally {
  await env.cleanup();
}
