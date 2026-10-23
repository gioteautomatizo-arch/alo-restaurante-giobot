/**
 * Read-only production posture proof. All writes happen ONLY in local Firestore
 * Emulator with invented data. The test documents why ID-stable quick-sale
 * creation must NOT be enabled with the current rules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';

const ruleFile = process.env.IDEMPOTENCY_RULE_FILE;
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'Esta prueba solo se permite en el emulador.');
assert(['firestore.rules', 'docs/firestore.launch-security.STAGED.rules'].includes(ruleFile),
  'Usa exclusivamente el archivo versionado de reglas o su propuesta STAGED.');
const testEnv = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-idempotency-safety-test',
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: readFileSync(ruleFile, 'utf8'),
  },
});
const db = uid => testEnv.authenticatedContext(uid).firestore();
const key = 'quick-00000000-0000-4000-8000-000000000001';
const sample = businessId => ({
  code: 'TEST-001', restaurantId: businessId, orderType: 'pickup',
  orderSource: 'CAJA', orderOrigin: 'DIRECTO',
  customerName: 'Cliente de prueba', paymentMethod: 'efectivo',
  bringOwnContainer: false,
  items: [{ productId: 'test', name: 'Pan ficticio', quantity: 1, unitPrice: 20, totalPrice: 20 }],
  subtotal: 20, discountAmount: 0, deliveryFee: 0, total: 20,
  status: 'NUEVO', billingStatus: 'PENDIENTE',
  createdAt: '2026-10-22T12:00:00Z', updatedAt: '2026-10-22T12:00:00Z',
});
try {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'businesses/business-a'), {
      restaurantId: 'business-a', ownerUserId: 'cashier-a',
    });
    await setDoc(doc(ctx.firestore(), 'businessMemberships/business-a_cashier-a'), {
      restaurantId: 'business-a', userId: 'cashier-a', role: 'CASHIER', active: true,
    });
    await setDoc(doc(ctx.firestore(), 'restaurant_orders/existing-paid'), {
      ...sample('alo-restaurante'), billingStatus: 'PAGADO',
      paidAt: '2026-10-22T12:01:00Z',
    });
  });
  // Un getDoc sobre un documento inexistente no puede utilizar resource.data
  // para resolver el tenant. La transacción de creación actual depende de él.
  for (const [uid, businessId] of [['cashier-cal', 'alo-restaurante'], ['cashier-a', 'business-a']]) {
    const missingRef = doc(db(uid), 'restaurant_orders', key + '-' + businessId);
    await assertFails(getDoc(missingRef));
    await assertFails(runTransaction(db(uid), async transaction => {
      const missing = await transaction.get(missingRef);
      if (!missing.exists()) transaction.set(missingRef, sample(businessId));
    }));
  }

  // Un ID fijo vía setDoc sin transacción no resuelve el problema:
  // el segundo setDoc es una UPDATE cuando el pedido ya existe.
  const original = doc(db('cashier-cal'), 'restaurant_orders/' + key);
  await assertSucceeds(setDoc(original, sample('alo-restaurante')));
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'restaurant_orders/' + key), {
      ...sample('alo-restaurante'), billingStatus: 'PAGADO',
      paidAt: '2026-10-22T12:01:00Z',
    });
  });

  if (ruleFile === 'firestore.rules') {
    // Bloqueante del archivo histórico: permite revertir PAGADO -> PENDIENTE.
    await assertSucceeds(setDoc(original, sample('alo-restaurante')));
    assert.equal((await getDoc(original)).data().billingStatus, 'PENDIENTE');
  } else {
    // La propuesta STAGED conserva temporalmente compatibilidad de Calientito.
    // Aún no tiene autorización para implantar el nuevo flujo.
    await assertSucceeds(setDoc(original, sample('alo-restaurante')));
    assert.equal((await getDoc(original)).data().billingStatus, 'PENDIENTE');
  }

  // Una cuenta de otro negocio no puede leer ni editar el pedido ya guardado,
  // pero la política de Calientito sigue sin aislar lectura entre cuentas Google.
  await assertFails(setDoc(doc(db('cashier-a'), 'restaurant_orders/' + key), sample('business-a')));

  console.log('PASS: bloqueo demostrado en emulador: get de pedido inexistente denegado,');
  console.log('      creación transaccional no viable y setDoc repetido reabre cobros en Calientito.');
  console.log('      NO ACTIVAR el mecanismo de ID fijo ni desplegar estas reglas.');
} finally {
  await testEnv.cleanup();
}
