/**
 * Ensayo aislado del ticket de Venta rápida usando las reglas Firestore
 * versionadas (no implica que estén desplegadas en Firebase).
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import assert from 'node:assert/strict';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'PROHIBIDO ejecutar fuera del emulador local.');
const rulesFile = process.env.SALE_RECEIPTS_RULES_FILE;
assert(['firestore.rules', 'docs/firestore.launch-security.STAGED.rules'].includes(rulesFile),
  'Selecciona explícitamente las reglas activas versionadas o el borrador STAGED.');
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-receipt-security-test',
  firestore: { rules: readFileSync(rulesFile, 'utf8'), host: '127.0.0.1', port: 8080 },
});
const actor = id => env.authenticatedContext(id).firestore();
const guest = env.unauthenticatedContext().firestore();

const order = {
  code: 'CAL-TEST-001', restaurantId: 'alo-restaurante',
  orderType: 'pickup', orderSource: 'CAJA', orderOrigin: 'DIRECTO',
  status: 'NUEVO', billingStatus: 'PAGADO', paymentMethod: 'efectivo',
  items: [{ productId: 'manual-test', name: 'Producto ficticio', quantity: 1, unitPrice: 35, totalPrice: 35 }],
  subtotal: 35, discountAmount: 0, deliveryFee: 0, total: 35,
  createdAt: '2026-10-21T09:00:00.000Z', updatedAt: '2026-10-21T09:01:00.000Z',
  paidAt: '2026-10-21T09:01:00.000Z', customerName: 'Ejemplo',
};
const receipt = {
  receiptType: 'OFF_TABLE', code: order.code,
  restaurantId: order.restaurantId, tableNumber: 0, guestCount: 0,
  openedAt: order.createdAt, closedAt: order.paidAt,
  closedById: 'staff-test', closedByName: 'Caja prueba',
  orderIds: ['receipt-order-test'], paymentIds: [],
  orders: [{ orderId: 'receipt-order-test', code: order.code, orderSource: order.orderSource,
    createdAt: order.createdAt, items: order.items, total: 35 }],
  payments: [], subtotal: 35, discountAmount: 0, tipAmount: 0, totalPaid: 35,
  status: 'PAGADO',
};
try {
  // Sin pago registrado no se crea el ticket en este test; los datos se
  // preparan usando privilegios de la herramienta de pruebas exclusivamente.
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'restaurant_orders/receipt-order-test'), order);
  });
  // El SDK autenticado del restaurante debe poder leer el pedido pagado.
  await assertSucceeds(getDoc(doc(actor('calientito-staff'), 'restaurant_orders/receipt-order-test')));
  const receiptRef = doc(actor('calientito-staff'), 'sale_receipts/offtable-receipt-order-test');
  await assertSucceeds(setDoc(receiptRef, receipt));
  const verified = await assertSucceeds(getDoc(receiptRef));
  assert.equal(verified.data().orderIds[0], 'receipt-order-test');
  assert.equal(verified.data().totalPaid, 35);

  // El ticket tiene ID determinístico y no puede sobreescribirse.
  await assertFails(setDoc(receiptRef, { ...receipt, totalPaid: 70 }));
  await assertFails(updateDoc(receiptRef, { status: 'PENDIENTE' }));
  await assertFails(setDoc(doc(guest, 'sale_receipts/forged-public-ticket'), receipt));
  await assertFails(getDoc(doc(guest, 'sale_receipts/offtable-receipt-order-test')));

  // En negocio nuevo, solo un miembro autorizado o superadmin puede registrar.
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'businesses/other-business'), { restaurantId: 'other-business', ownerUserId: 'other-owner' });
    await setDoc(doc(ctx.firestore(), 'businessMemberships/other-business_other-owner'), {
      restaurantId: 'other-business', userId: 'other-owner', role: 'OWNER', active: true,
    });
  });
  const foreignReceipt = { ...receipt, restaurantId: 'other-business', code: 'OTH-TEST-001' };
  await assertFails(setDoc(doc(actor('calientito-staff'), 'sale_receipts/offtable-other-business-order'), foreignReceipt));
  await assertSucceeds(setDoc(doc(actor('other-owner'), 'sale_receipts/offtable-other-business-order'), foreignReceipt));
  // Limitación preexistente: canReadRestaurantDoc del repositorio permite que
  // cualquier cuenta Google autenticada lea comprobantes de Calientito.
  // NO es un permiso a ampliar ni una razón para desplegar las reglas actuales.
  // Lo registramos como bloqueo pendiente de la migración de administradores.
  const legacyRead = await assertSucceeds(getDoc(doc(actor('other-owner'), 'sale_receipts/offtable-receipt-order-test')));
  assert.equal(legacyRead.exists(), true);
  console.warn('BLOQUEO DE LANZAMIENTO: las reglas versionadas todavía permiten lectura de tickets Calientito a otra cuenta autenticada.');

  console.log('PASS: ticket de Venta rápida, ID idempotente, reglas', rulesFile, 'y aislamiento de negocios.');
} finally {
  await env.cleanup();
}
