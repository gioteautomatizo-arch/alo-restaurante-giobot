/**
 * Prueba con Firestore Admin SDK y emulador. Nunca usa datos remotos.
 * No registra endpoint, no cobra y no modifica reglas.
 */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { commitTrustedPublicOrder, deriveTrustedOrderId } from '../publicOrderAuthorityTransaction';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: esta prueba requiere exclusivamente Firestore Emulator local.');
const projectId = 'gioteautomatizo-public-order-transaction-test';
const app = initializeApp({ projectId });
const db = getFirestore(app);
const id = (n: number) => 'web_' + n.toString(16).padStart(32, '0');
const aLine = { productId: 'a-regular', quantity: 2, selections: { guiso: ['Res'] } };
const draft = (attempt: number, overrides: Record<string, unknown> = {}) => ({
  businessId: 'business-a', attemptId: id(attempt),
  orderType: 'pickup', paymentMethod: 'efectivo',
  customerName: 'Cliente ficticio', lines: [aLine], ...overrides,
});
const catalog = (businessId: string, price: number) => ({
  businessId, sourceLabel: 'Prueba aislada', revision: 'rev-' + price,
  updatedAt: '2026-10-28T00:00:00Z', updatedBy: 'owner-test',
  items: businessId === 'business-a' ? [
    { id: 'a-regular', name: 'Platillo A', price, available: true, description: '', category: 'Prueba', sortOrder: 1,
      optionGroups: [{ id: 'guiso', name: 'Guiso', required: true, multiple: false,
        choices: [{ name: 'Res', price: 5 }, { name: 'Pollo', price: 0 }] }] },
    { id: 'a-sold-out', name: 'Agotado A', price: 90, available: false, description: '', category: 'Prueba', sortOrder: 2 },
  ] : [
    { id: 'b-exclusive', name: 'Platillo B', price: 110, available: true, description: '', category: 'Prueba', sortOrder: 1 },
  ],
});
const orderRef = (businessId: string, attemptId: string) =>
  db.doc('restaurant_orders/' + deriveTrustedOrderId(businessId, attemptId));
const mirrorRef = (businessId: string, attemptId: string) =>
  db.doc('public_table_orders/' + deriveTrustedOrderId(businessId, attemptId));
const attemptRef = (businessId: string, attemptId: string) =>
  db.doc(`businesses/${businessId}/publicOrderAttempts/${attemptId}`);

try {
  for (const [businessId, published] of [['business-a', true], ['business-b', false]] as const) {
    await db.doc('businesses/' + businessId).set({ restaurantId: businessId, active: true });
    await db.doc('publicBusinessProfiles/' + businessId).set({ businessId, restaurantId: businessId, published });
    await db.doc(`businesses/${businessId}/catalog/menu_catalog`).set(catalog(businessId, 75));
  }

  const first = await commitTrustedPublicOrder(db, draft(1));
  assert.equal(first.total, 160, '2 x ($75 + $5) desde catálogo autoritativo');
  assert.equal(first.created, true);
  const firstSnap = await orderRef('business-a', id(1)).get();
  assert.equal(firstSnap.data()?.total, 160);
  assert.equal(firstSnap.data()?.billingStatus, 'PENDIENTE');
  assert.equal((await mirrorRef('business-a', id(1)).get()).exists, false, 'pickup no crea espejo');

  // El orden de claves JSON no puede convertir el mismo intento en conflicto.
  const reordered = {
    lines: [{ selections: { guiso: ['Res'] }, quantity: 2, productId: 'a-regular' }],
    customerName: 'Cliente ficticio', paymentMethod: 'efectivo',
    orderType: 'pickup', attemptId: id(1), businessId: 'business-a',
  };
  const reorderedRetry = await commitTrustedPublicOrder(db, reordered);
  assert.equal(reorderedRetry.created, false);
  assert.equal(reorderedRetry.orderId, first.orderId);
  assert.equal(reorderedRetry.total, 160);

  // Un reintento no reescribe estados ni importes aunque el catálogo cambie.
  await orderRef('business-a', id(1)).update({ status: 'PREPARANDO' });
  await db.doc('businesses/business-a/catalog/menu_catalog').set(catalog('business-a', 95));
  const retry = await commitTrustedPublicOrder(db, draft(1));
  assert.equal(retry.created, false);
  assert.equal(retry.orderId, first.orderId);
  assert.equal(retry.total, 160);
  assert.equal((await orderRef('business-a', id(1)).get()).data()?.status, 'PREPARANDO');
  await assert.rejects(commitTrustedPublicOrder(db, draft(1, { customerName: 'Otro cliente' })), /CONFLICTO_INTENTO/);

  const repriced = await commitTrustedPublicOrder(db, draft(2));
  assert.equal(repriced.total, 200, 'Nuevo intento toma precio actualizado ($95 + $5) x 2');
  await assert.rejects(commitTrustedPublicOrder(db, draft(3, { total: 0 })), /campos no autorizizados|campos no autorizados/);
  await assert.rejects(commitTrustedPublicOrder(db, draft(4, {
    lines: [{ productId: 'a-regular', quantity: 1, unitPrice: 0 }],
  })), /PEDIDO_NO_VALIDO/);
  await assert.rejects(commitTrustedPublicOrder(db, draft(5, {
    lines: [{ productId: 'a-sold-out', quantity: 1 }],
  })), /PEDIDO_NO_VALIDO/);
  await assert.rejects(commitTrustedPublicOrder(db, draft(6, {
    lines: [{ productId: 'b-exclusive', quantity: 1 }],
  })), /PEDIDO_NO_VALIDO/);
  await assert.rejects(commitTrustedPublicOrder(db, draft(7, {
    businessId: 'business-b', lines: [{ productId: 'b-exclusive', quantity: 1 }],
  })), /PEDIDO_NO_VALIDO/);
  await assert.rejects(commitTrustedPublicOrder(db, draft(8, {
    orderType: 'dine_in', tableNumber: 0,
  })), /PEDIDO_NO_VALIDO/);
  await assert.rejects(commitTrustedPublicOrder(db, draft(9, {
    orderType: 'pickup', tableNumber: 2,
  })), /PEDIDO_NO_VALIDO/);
  await assert.rejects(commitTrustedPublicOrder(db, draft(10, {
    businessId: 'alo-restaurante',
  })), /PEDIDO_NO_VALIDO/);

  // Concurrencia: un solo pedido/espejo/intento por clave.
  const tableDraft = draft(11, { orderType: 'dine_in', tableNumber: 2 });
  const parallel = await Promise.all(Array.from({ length: 4 }, () => commitTrustedPublicOrder(db, tableDraft)));
  assert.equal(parallel.filter(result => result.created).length, 1, 'Un único ganador transaccional');
  assert.equal(new Set(parallel.map(result => result.orderId)).size, 1);
  const mirror = await mirrorRef('business-a', id(11)).get();
  assert.equal(mirror.data()?.orderId, parallel[0].orderId);
  assert.equal(mirror.data()?.restaurantId, 'business-a');
  assert.equal(mirror.data()?.total, 200);
  assert.equal((await attemptRef('business-a', id(11)).get()).data()?.total, 200);

  // Recuperar una respuesta perdida no puede encubrir un espejo o pedido alterado.
  await mirrorRef('business-a', id(11)).update({ total: 1 });
  await assert.rejects(commitTrustedPublicOrder(db, tableDraft), /INTEGRIDAD_PEDIDO/);
  await mirrorRef('business-a', id(11)).update({ total: 200, code: 'FOLIO-AJENO' });
  await assert.rejects(commitTrustedPublicOrder(db, tableDraft), /INTEGRIDAD_PEDIDO/);
  await mirrorRef('business-a', id(11)).update({ code: parallel[0].code });
  await orderRef('business-a', id(11)).update({ orderType: 'pickup' });
  await assert.rejects(commitTrustedPublicOrder(db, tableDraft), /INTEGRIDAD_PEDIDO/);
  await orderRef('business-a', id(11)).update({ orderType: 'dine_in' });
  assert.equal((await commitTrustedPublicOrder(db, tableDraft)).created, false);

  // Un resumen preexistente incompatible aborta pedido e intento sin escritura parcial.
  await mirrorRef('business-a', id(12)).set({ restaurantId: 'business-b', orderId: 'foreign', total: 1 });
  await assert.rejects(commitTrustedPublicOrder(db, draft(12, {
    orderType: 'dine_in', tableNumber: 2,
  })), /CONFLICTO_ID/);
  assert.equal((await orderRef('business-a', id(12)).get()).exists, false);
  assert.equal((await attemptRef('business-a', id(12)).get()).exists, false);

  // B publicado puede operar con su propio catálogo y la misma clave sin colisión.
  await db.doc('publicBusinessProfiles/business-b').update({ published: true });
  const bDraft = draft(1, {
    businessId: 'business-b', lines: [{ productId: 'b-exclusive', quantity: 1 }],
  });
  const b = await commitTrustedPublicOrder(db, bDraft);
  assert.equal(b.total, 110);
  assert.notEqual(b.orderId, first.orderId);
  assert.equal((await orderRef('business-a', id(1)).get()).data()?.restaurantId, 'business-a');
  await assert.rejects(commitTrustedPublicOrder(db, draft(13, {
    businessId: 'business-b', lines: [aLine],
  })), /PEDIDO_NO_VALIDO/);

  // Perfil/catálogo huérfanos o un businessId discordante nunca crean un pedido nuevo.
  await db.doc('businesses/business-a').update({ restaurantId: 'business-b' });
  await assert.rejects(commitTrustedPublicOrder(db, draft(14)), /negocio o catálogo no disponible o discordante/);
  assert.equal((await orderRef('business-a', id(14)).get()).exists, false);
  assert.equal((await attemptRef('business-a', id(14)).get()).exists, false);
  await db.doc('businesses/business-a').update({ restaurantId: 'business-a' });

  await db.doc('businesses/business-b').delete();
  await assert.rejects(commitTrustedPublicOrder(db, draft(15, {
    businessId: 'business-b', lines: [{ productId: 'b-exclusive', quantity: 1 }],
  })), /negocio o catálogo no disponible o discordante/);
  assert.equal((await orderRef('business-b', id(15)).get()).exists, false);
  assert.equal((await attemptRef('business-b', id(15)).get()).exists, false);
  // La recuperación de un intento ya confirmado sigue siendo posible sin crear nada nuevo.
  const bRetry = await commitTrustedPublicOrder(db, bDraft);
  assert.equal(bRetry.created, false);
  assert.equal(bRetry.orderId, b.orderId);

  // Si se pierde el resumen histórico, no fingir que el reintento reparó el pedido.
  await mirrorRef('business-a', id(11)).delete();
  await assert.rejects(commitTrustedPublicOrder(db, tableDraft), /INTEGRIDAD_PEDIDO/);

  console.log('PASS: Firestore Admin Emulator A/B: negocio vigente y tenant concordante, idempotencia canónica, reintentos, precio, 4 solicitudes concurrentes, espejo y rollback.');
  console.log('PENDIENTE CRÍTICO: sin endpoint, sin reglas que bloqueen escrituras directas, sin mitigación de abuso ni autorización para activación.');
} finally {
  await deleteApp(app);
}
