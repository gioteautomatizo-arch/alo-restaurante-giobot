/**
 * Auditoría reproducible de autoridad de importes en pedidos públicos.
 *
 * Diagnóstico deliberado: las reglas STAGED pueden aceptar precios manipulados.
 * Una prueba que termina con éxito NO significa que el bloqueo esté corregido.
 * No modifica reglas, datos reales ni infraestructura. Solo Firestore Emulator.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: ejecutar exclusivamente con Firestore Emulator en 127.0.0.1:8080.');

const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-public-price-authority-audit',
  firestore: {
    rules: readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});
const guest = env.unauthenticatedContext().firestore();
const ownerB = env.authenticatedContext('owner-b').firestore();
const orderRef = (db, id) => doc(db, 'restaurant_orders', id);
const timestamp = '2026-10-28T12:00:00.000Z';
const line = (productId, unitPrice, name = 'Producto ficticio') => ({
  productId, name, quantity: 1, unitPrice, totalPrice: unitPrice,
});
const order = (id, items, subtotal, total, extra = {}) => ({
  restaurantId: id,
  code: 'AUDIT-001',
  status: 'NUEVO',
  billingStatus: 'PENDIENTE',
  orderType: 'pickup',
  orderSource: 'CLIENTE_QR',
  customerName: 'Visitante ficticio',
  paymentMethod: 'efectivo',
  items,
  subtotal,
  discountAmount: 0,
  deliveryFee: 0,
  total,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...extra,
});

try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, owner, published] of [
      ['business-a', 'owner-a', true],
      ['business-b', 'owner-b', false],
    ]) {
      await setDoc(doc(db, 'businesses', id), {
        restaurantId: id, ownerUserId: owner,
      });
      await setDoc(doc(db, 'businessMemberships', id + '_' + owner), {
        restaurantId: id, userId: owner, role: 'OWNER', active: true,
      });
      await setDoc(doc(db, 'publicBusinessProfiles', id), {
        businessId: id, restaurantId: id, published,
      });
    }
    await setDoc(doc(db, 'businesses/business-a/catalog/menu_catalog'), {
      businessId: 'business-a', sourceLabel: 'Auditoría ficticia',
      updatedAt: timestamp, updatedBy: 'owner-a',
      items: [
        {id: 'a-regular', name: 'Producto A', price: 75, available: true, category: 'Prueba', description: '', sortOrder: 1},
        {id: 'a-sold-out', name: 'Agotado A', price: 90, available: false, category: 'Prueba', description: '', sortOrder: 2},
      ],
    });
    await setDoc(doc(db, 'businesses/business-b/catalog/menu_catalog'), {
      businessId: 'business-b', sourceLabel: 'Auditoría ficticia',
      updatedAt: timestamp, updatedBy: 'owner-b',
      items: [
        {id: 'b-exclusive', name: 'Producto B', price: 110, available: true, category: 'Prueba', description: '', sortOrder: 1},
      ],
    });
  });

  // Control positivo: un pedido normal para A publicado es aceptado.
  await assertSucceeds(setDoc(orderRef(guest, 'audit-valid-a'),
    order('business-a', [line('a-regular', 75, 'Producto A')], 75, 75)));

  // Controles de seguridad existentes: publicación y cobro anticipado.
  await assertFails(setDoc(orderRef(guest, 'audit-unpublished-b'),
    order('business-b', [line('b-exclusive', 110, 'Producto B')], 110, 110)));
  await assertFails(setDoc(orderRef(guest, 'audit-paid-a'),
    order('business-a', [line('a-regular', 75)], 75, 75, { billingStatus: 'PAGADO' })));
  await assertFails(setDoc(orderRef(guest, 'audit-empty-a'),
    order('business-a', [], 0, 0)));

  // Hallazgos: se espera que STAGED ACEPTE estas escrituras inseguras.
  // Si se endurecen las reglas, estas aserciones fallarán para obligar a
  // revisar la nueva política y convertir el diagnóstico en pruebas de rechazo.
  const forged = [
    ['audit-zero-price-a', order('business-a', [line('a-regular', 0, 'Producto A')], 0, 0)],
    ['audit-sold-out-a', order('business-a', [line('a-sold-out', 90, 'Agotado A')], 90, 90)],
    ['audit-foreign-product-a', order('business-a', [line('b-exclusive', 110, 'Producto B')], 110, 110)],
    ['audit-inconsistent-total-a', order('business-a', [line('a-regular', 75, 'Producto A')], 75, 1)],
  ];
  for (const [id, payload] of forged) {
    await assertSucceeds(setDoc(orderRef(guest, id), payload));
  }

  // B no obtiene permiso para leer los pedidos privados de A.
  await assertFails(getDoc(orderRef(ownerB, 'audit-valid-a')));

  // Inspección de los documentos con privilegios exclusivos del emulador.
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, payload] of forged) {
      const snapshot = await getDoc(orderRef(db, id));
      assert.equal(snapshot.exists(), true, id + ': el diagnóstico esperaba una escritura admitida');
      assert.equal(snapshot.data().total, payload.total);
      assert.equal(snapshot.data().billingStatus, 'PENDIENTE');
    }
    for (const id of ['audit-unpublished-b', 'audit-paid-a', 'audit-empty-a']) {
      assert.equal((await getDoc(orderRef(db, id))).exists(), false, id + ': debe rechazarse');
    }
    const catalogA = (await getDoc(doc(db, 'businesses/business-a/catalog/menu_catalog'))).data();
    assert.equal(catalogA.items[0].price, 75);
    assert.equal(catalogA.items[1].available, false);
    const catalogB = (await getDoc(doc(db, 'businesses/business-b/catalog/menu_catalog'))).data();
    assert.equal(catalogB.items[0].id, 'b-exclusive');
  });

  console.log('PASS (auditoría): aislamiento de lectura A/B, publicación, cobro pendiente y catálogo sintético comprobados.');
  console.log('PENDIENTE CRÍTICO: STAGED acepta precio $0 para producto de $75, agotado, producto de B en A y total incoherente.');
  console.log('PENDIENTE: validación autoritativa de catálogo/precio/disponibilidad en backend, revisión de permisos y prueba de carrera; ninguna regla fue modificada o desplegada.');
} finally {
  await env.cleanup();
}
