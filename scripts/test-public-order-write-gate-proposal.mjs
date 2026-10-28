/**
 * Puerta aislada de escritura de pedidos públicos, exclusivamente en Emulator.
 * Prueba una PROPUESTA de reglas en memoria, no las reglas STAGED/desplegadas.
 * Las reglas originales siguen aceptando pedidos manipulados (auditoría aparte).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { buildPublicOrderWriteGateProposalRules } from './public-order-write-gate-proposal-rules.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: esta prueba requiere Firestore Emulator local en 127.0.0.1:8080.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposed = buildPublicOrderWriteGateProposalRules(staged);
assert.notEqual(proposed, staged);
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-public-order-gate-proposal',
  firestore: { rules: proposed, host: '127.0.0.1', port: 8080 },
});
const guest = env.unauthenticatedContext().firestore();
const buyer = env.authenticatedContext('buyer').firestore();
const ownerA = env.authenticatedContext('owner-a').firestore();
const ownerB = env.authenticatedContext('owner-b').firestore();
const cashierA = env.authenticatedContext('cashier-a').firestore();
const revokedA = env.authenticatedContext('revoked-a').firestore();
const ts = '2026-10-28T15:30:00.000Z';
const item = (price = 75) => ({
  productId: 'a-regular', name: 'Producto ficticio', quantity: 1,
  unitPrice: price, totalPrice: price,
});
const order = (tenant, source = 'CLIENTE_QR', price = 75, extra = {}) => ({
  restaurantId: tenant, code: 'TEST-001', status: 'NUEVO',
  billingStatus: 'PENDIENTE', orderType: 'pickup', orderSource: source,
  customerName: 'Cliente ficticio', paymentMethod: 'efectivo',
  items: [item(price)], subtotal: price, discountAmount: 0,
  deliveryFee: 0, total: price, createdAt: ts, updatedAt: ts, ...extra,
});
const mirror = (tenant, id, price = 75, extra = {}) => ({
  restaurantId: tenant, orderId: id, code: 'TEST-001',
  tableNumber: 2, items: [item(price)], total: price,
  status: 'NUEVO', createdAt: ts, updatedAt: ts, ...extra,
});
const orderRef = (db, id) => doc(db, 'restaurant_orders', id);
const mirrorRef = (db, id) => doc(db, 'public_table_orders', id);

try {
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    for (const [tenant, owner] of [['business-a', 'owner-a'], ['business-b', 'owner-b']]) {
      await setDoc(doc(admin, 'businesses', tenant), { restaurantId: tenant, ownerUserId: owner });
      await setDoc(doc(admin, 'publicBusinessProfiles', tenant), {
        businessId: tenant, restaurantId: tenant, published: true,
      });
      await setDoc(doc(admin, 'businessMemberships', tenant + '_' + owner), {
        restaurantId: tenant, userId: owner, role: 'OWNER', active: true,
      });
    }
    await setDoc(doc(admin, 'businessMemberships/business-a_cashier-a'), {
      restaurantId: 'business-a', userId: 'cashier-a', role: 'CASHIER', active: true,
    });
    await setDoc(doc(admin, 'businessMemberships/business-a_revoked-a'), {
      restaurantId: 'business-a', userId: 'revoked-a', role: 'WAITER', active: false,
    });
    await setDoc(doc(admin, 'restaurant_orders/trusted-table'), order('business-a', 'CLIENTE_QR', 75, {
      orderType: 'dine_in', tableNumber: 2,
    }));
  });

  // Ni un pedido válido ni uno manipulado deben poder entrar directamente
  // por SDK cliente: la autoridad futura es el backend transaccional.
  for (const [label, db] of [
    ['guest', guest], ['buyer', buyer], ['owner-b', ownerB], ['revoked-a', revokedA],
  ]) {
    await assertFails(setDoc(orderRef(db, 'blocked-' + label),
      order('business-a')));
    await assertFails(setDoc(orderRef(db, 'forged-' + label),
      order('business-a', 'CLIENTE_QR', 0)));
    await assertFails(setDoc(mirrorRef(db, 'trusted-table'),
      mirror('business-a', 'trusted-table')));
  }

  // Incluso un OWNER o cajero de A no puede disfrazar una escritura cliente
  // como pedido POS. El personal conserva su flujo explícito MESERO/CAJA.
  await assertFails(setDoc(orderRef(ownerA, 'owner-spoof'),
    order('business-a', 'CLIENTE_QR', 0)));
  await assertFails(setDoc(orderRef(cashierA, 'cashier-spoof'),
    order('business-a', 'CLIENTE_QR', 0)));
  await assertSucceeds(setDoc(orderRef(ownerA, 'owner-pos'),
    order('business-a', 'MESERO')));
  await assertSucceeds(setDoc(orderRef(cashierA, 'cashier-pos'),
    order('business-a', 'CAJA')));
  await assertSucceeds(setDoc(orderRef(ownerB, 'owner-b-pos'),
    order('business-b', 'CAJA', 110, { items: [{ productId: 'b-exclusive', name: 'Producto B', quantity: 1, unitPrice: 110, totalPrice: 110 }] })));
  await assertFails(getDoc(orderRef(ownerA, 'owner-b-pos')));
  await assertFails(setDoc(orderRef(ownerB, 'cross-tenant-pos'),
    order('business-a', 'CAJA')));
  await assertFails(setDoc(orderRef(revokedA, 'revoked-pos'),
    order('business-a', 'MESERO')));
  await assertFails(setDoc(orderRef(ownerA, 'paid-pos'),
    order('business-a', 'CAJA', 75, { billingStatus: 'PAGADO' })));

  // POS de mesa: pedido y resumen se crean en el mismo batch. No aceptar
  // resumen huérfano, cruzado ni con importe/folio diferente.
  const staffBatch = writeBatch(ownerA);
  staffBatch.set(orderRef(ownerA, 'staff-table'), order('business-a', 'MESERO', 75, {
    orderType: 'dine_in', tableNumber: 2,
  }));
  staffBatch.set(mirrorRef(ownerA, 'staff-table'), mirror('business-a', 'staff-table'));
  await assertSucceeds(staffBatch.commit());
  await assertFails(setDoc(mirrorRef(ownerA, 'orphan-mirror'),
    mirror('business-a', 'orphan-mirror')));
  // Una escritura de dos documentos falla entera si el resumen discrepa.
  const badBatch = writeBatch(ownerA);
  badBatch.set(orderRef(ownerA, 'staff-bad-batch'), order('business-a', 'MESERO', 75, {
    orderType: 'dine_in', tableNumber: 2,
  }));
  badBatch.set(mirrorRef(ownerA, 'staff-bad-batch'), mirror('business-a', 'staff-bad-batch', 1));
  await assertFails(badBatch.commit());
  await env.withSecurityRulesDisabled(async context => {
    assert.equal((await getDoc(orderRef(context.firestore(), 'staff-bad-batch'))).exists(), false,
      'El batch con resumen incorrecto no debe dejar pedido parcial');
  });
  await assertSucceeds(setDoc(orderRef(ownerA, 'staff-unmirrored'),
    order('business-a', 'MESERO', 75, { orderType: 'dine_in', tableNumber: 2 })));
  await assertFails(setDoc(mirrorRef(ownerA, 'staff-unmirrored'),
    mirror('business-a', 'staff-unmirrored', 1)));
  await assertFails(setDoc(mirrorRef(ownerB, 'trusted-table'),
    mirror('business-a', 'trusted-table')));
  await assertFails(getDoc(orderRef(ownerB, 'owner-pos')));
  await assertFails(getDoc(orderRef(ownerA, 'cross-tenant-pos')));

  // Calientito conserva su camino heredado de creación (solo compatibilidad
  // en esta prueba; NO certifica su seguridad o sus reglas desplegadas).
  await assertSucceeds(setDoc(orderRef(guest, 'legacy-order'),
    order('alo-restaurante')));
  await assertSucceeds(setDoc(mirrorRef(guest, 'legacy-mirror'),
    mirror('alo-restaurante', 'legacy-mirror')));

  // El backend Admin sigue pudiendo escribir un pedido + resumen canónico;
  // esta vía NO verifica controles del endpoint (aún inexistente).
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    const batch = writeBatch(admin);
    batch.set(orderRef(admin, 'trusted-admin'), order('business-a', 'CLIENTE_QR', 75, {
      orderType: 'dine_in', tableNumber: 2,
    }));
    batch.set(mirrorRef(admin, 'trusted-admin'), mirror('business-a', 'trusted-admin'));
    await batch.commit();
    assert.equal((await getDoc(orderRef(admin, 'trusted-admin'))).data()?.total, 75);
    assert.equal((await getDoc(mirrorRef(admin, 'trusted-admin'))).data()?.restaurantId, 'business-a');
    for (const id of ['blocked-guest', 'forged-guest', 'owner-spoof', 'cashier-spoof', 'cross-tenant-pos']) {
      assert.equal((await getDoc(orderRef(admin, id))).exists(), false, id + ' no debe existir');
    }
    assert.equal((await getDoc(orderRef(admin, 'staff-table'))).exists(), true);
    assert.equal((await getDoc(mirrorRef(admin, 'staff-table'))).exists(), true);
  });

  console.log('PASS (candidato NO desplegado): escrituras directas CLIENTE_QR bloqueadas, POS A/B y roles aislados, espejo ligado a pedido y Calientito legado comprobados en Emulator.');
  console.log('PENDIENTE CRÍTICO: STAGED/desplegadas NO incorporan esta propuesta; no hay endpoint público protegido ni migración cliente/backend/reglas.');
} finally {
  await env.cleanup();
}
