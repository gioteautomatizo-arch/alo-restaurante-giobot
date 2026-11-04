/**
 * Ensayo integrado del corte CLIENTE_QR, solo contra Firestore Emulator.
 *
 * Combina REGLAS CANDIDATAS (in-memory) con el servidor HTTP Admin real.
 * Nunca utiliza reglas desplegadas, proyectos ni credenciales de producción.
 * App Check se SIMULA: no autoriza habilitar el endpoint en línea.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { buildPublicOrderWriteGateProposalRules } from './public-order-write-gate-proposal-rules.mjs';
import { registerPublicOrderApi } from '../publicOrderApi';
import { deriveTrustedOrderId } from '../publicOrderAuthorityTransaction';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: esta integración SOLO usa Firestore Emulator local.');
const projectId = 'gioteautomatizo-public-order-cutover-test';
const rules = buildPublicOrderWriteGateProposalRules(
  readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'),
);
const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules, host: '127.0.0.1', port: 8080 },
});
const adminApp = initializeApp({ projectId }, 'public-order-cutover-admin');
const db = getFirestore(adminApp);
const guest = testEnv.unauthenticatedContext().firestore();
const buyer = testEnv.authenticatedContext('external-buyer').firestore();
const ownerA = testEnv.authenticatedContext('owner-a').firestore();
const ownerB = testEnv.authenticatedContext('owner-b').firestore();
const app = express();
app.use(express.json({ limit: '12kb' }));
registerPublicOrderApi(app, {
  firestore: () => db,
  verifyAppCheck: async token => {
    if (token !== 'cutover.jwt.token') throw new Error('App Check simulado inválido');
    return { appId: 'cutover-web-a' };
  },
});
const server = createServer(app);
const oldFlag = process.env.ENABLE_SECURE_PUBLIC_ORDER_API;
const oldIds = process.env.PUBLIC_ORDER_ALLOWED_APP_IDS;
const attempt = (n: number) => 'web_' + n.toString(16).padStart(32, '0');
const draft = (businessId: string, n: number, extra: Record<string, unknown> = {}) => ({
  businessId, attemptId: attempt(n),
  orderType: 'dine_in', tableNumber: 3, guestCount: 2,
  paymentMethod: 'efectivo', customerName: 'Cliente de prueba',
  lines: [{productId: businessId === 'tenant-a' ? 'taco-a' : 'taco-b',
    quantity: 2, selections: {}}],
  ...extra,
});
const clientDirectOrder = (businessId: string, price: number) => ({
  restaurantId: businessId, code: 'FAKE-CODE', status: 'NUEVO',
  billingStatus: 'PENDIENTE', orderType: 'pickup',
  orderSource: 'CLIENTE_QR', customerName: 'Falso cliente',
  paymentMethod: 'efectivo',
  items: [{productId: 'taco-a', name: 'Taco A', quantity: 1, unitPrice: price, totalPrice: price}],
  subtotal: price, discountAmount: 0, deliveryFee: 0,
  total: price, createdAt: '2026-11-03T10:00:00Z', updatedAt: '2026-11-03T10:00:00Z',
});
let base = '';
try {
  for (const [tenant, owner, item, price] of [
    ['tenant-a', 'owner-a', 'taco-a', 57],
    ['tenant-b', 'owner-b', 'taco-b', 80],
  ] as const) {
    await db.doc('businesses/' + tenant).set({
      restaurantId: tenant, ownerUserId: owner, active: true,
    });
    await db.doc('businessMemberships/' + tenant + '_' + owner).set({
      restaurantId: tenant, userId: owner, role: 'OWNER', active: true,
    });
    await db.doc('publicBusinessProfiles/' + tenant).set({
      businessId: tenant, restaurantId: tenant, published: true,
    });
    await db.doc('businesses/' + tenant + '/catalog/menu_catalog').set({
      businessId: tenant, revision: 'rev1', updatedAt: '2026-11-03T00:00:00Z',
      items: [{id: item, name: item, category: 'Tacos', description: '',
        sortOrder: 1, price, available: true, optionGroups: []}],
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  async function send(input: unknown, token = 'cutover.jwt.token') {
    const response = await fetch(base + '/api/public-orders', {
      method: 'POST',
      headers: {'content-type': 'application/json', 'X-Firebase-AppCheck': token},
      body: JSON.stringify(input),
    });
    return {status: response.status, json: await response.json()};
  }

  // El endpoint seguro permanece CERRADO si no se hizo el corte explícito.
  delete process.env.ENABLE_SECURE_PUBLIC_ORDER_API;
  assert.equal((await send(draft('tenant-a', 1))).status, 404);
  assert.equal((await db.collection('restaurant_orders').get()).empty, true);
  process.env.ENABLE_SECURE_PUBLIC_ORDER_API = 'true';
  process.env.PUBLIC_ORDER_ALLOWED_APP_IDS = 'cutover-web-a';

  // Cliente anónimo/autenticado y empleado con rol no pueden saltarse la API
  // presentando CLIENTE_QR, aunque el importe coincida con catálogo.
  for (const [name, client] of [
    ['anonymous', guest], ['signed-in-buyer', buyer],
    ['owner-a', ownerA], ['owner-b', ownerB],
  ] as const) {
    await assertFails(setDoc(doc(client, 'restaurant_orders', 'direct-' + name),
      clientDirectOrder('tenant-a', 0)));
    await assertFails(setDoc(doc(client, 'restaurant_orders', 'direct-valid-' + name),
      clientDirectOrder('tenant-a', 57)));
  }

  // El dueño conserva el uso de Caja POS, pero nunca puede presentarlo como QR.
  await assertSucceeds(setDoc(doc(ownerA, 'restaurant_orders', 'cashier-pos'), {
    ...clientDirectOrder('tenant-a', 57), orderSource: 'CAJA',
  }));

  // El backend sí escribe de forma transaccional, sin aceptar total del navegador.
  const a = await send(draft('tenant-a', 1));
  assert.equal(a.status, 201, JSON.stringify(a.json));
  assert.equal(a.json.total, 114, '2 x 57 del catálogo A');
  assert.equal(a.json.created, true);
  const orderIdA = deriveTrustedOrderId('tenant-a', attempt(1));
  assert.equal(a.json.orderId, orderIdA);
  assert.equal((await db.doc('restaurant_orders/' + orderIdA).get()).data()?.total, 114);
  const mirrorA = await db.doc('public_table_orders/' + orderIdA).get();
  assert.equal(mirrorA.data()?.tableNumber, 3);
  assert.equal(mirrorA.data()?.restaurantId, 'tenant-a');
  assert.equal(mirrorA.data()?.total, 114);

  await assertFails(setDoc(doc(guest, 'public_table_orders', 'forged-mirror'), {
    restaurantId: 'tenant-a', orderId: 'forged-mirror',
    code: 'FAKE', tableNumber: 3,
    items: [clientDirectOrder('tenant-a', 0).items[0]], total: 0,
    status: 'NUEVO', createdAt: '2026-11-03T10:00:00Z',
    updatedAt: '2026-11-03T10:00:00Z',
  }));
  // El mismo pedido confirmado vuelve con ID e importe intactos.
  const duplicate = await send(draft('tenant-a', 1));
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.json.created, false);
  assert.equal(duplicate.json.orderId, orderIdA);
  assert.equal(duplicate.json.total, 114);
  // Cambiar el carrito del mismo intento no crea un segundo documento.
  assert.equal((await send(draft('tenant-a', 1, {
    lines: [{productId: 'taco-a', quantity: 1, selections: {}}],
  }))).status, 409);

  // Revisión de precio solo afecta intentos NUEVOS.
  await db.doc('businesses/tenant-a/catalog/menu_catalog').update({
    revision: 'rev2',
    items: [{id:'taco-a',name:'taco-a',category:'Tacos',description:'',
      sortOrder:1,price:70,available:true,optionGroups:[]}],
  });
  const retry = await send(draft('tenant-a', 1));
  assert.equal(retry.status, 200);
  assert.equal(retry.json.total, 114);
  const updatedPrice = await send(draft('tenant-a', 2));
  assert.equal(updatedPrice.status, 201);
  assert.equal(updatedPrice.json.total, 140);
  assert.equal((await send(draft('tenant-a', 3, {total: 0}))).status, 400);

  // Negocio B no puede tomar productos de A ni reutilizar datos del tenant A.
  const b = await send(draft('tenant-b', 1));
  assert.equal(b.status, 201);
  assert.equal(b.json.total, 160);
  assert.notEqual(b.json.orderId, a.json.orderId);
  assert.equal((await send(draft('tenant-b', 2, {
    lines: [{productId: 'taco-a', quantity: 1, selections: {}}],
  }))).status, 400);
  await assertFails(getDoc(doc(ownerA, 'restaurant_orders', b.json.orderId)));
  await assertFails(getDoc(doc(ownerB, 'restaurant_orders', a.json.orderId)));
  await assertFails(getDoc(doc(guest, 'public_order_rate_limits',
    'tenant_' + 'a'.repeat(64))));
  assert.equal((await db.collection('restaurant_orders').where('orderSource', '==', 'CLIENTE_QR').get()).size,
    3, 'Solo API debe haber creado tres pedidos QR con autoridad de servidor');

  process.env.ENABLE_SECURE_PUBLIC_ORDER_API = 'false';
  assert.equal((await send(draft('tenant-a', 4))).status, 404);
  console.log('PASS: reglas candidatas + API Admin en UN MISMO Emulator: QR directo negado A/B, POS permitido,');
  console.log('  pedidos confiables, resúmenes de mesa, precios, reintentos, permisos y shutdown 404.');
  console.log('NO PUBLICAR: App Check simulado, reglas solo en memoria y compatibilidad legacy pendiente.');
} finally {
  if (oldFlag === undefined) delete process.env.ENABLE_SECURE_PUBLIC_ORDER_API;
  else process.env.ENABLE_SECURE_PUBLIC_ORDER_API = oldFlag;
  if (oldIds === undefined) delete process.env.PUBLIC_ORDER_ALLOWED_APP_IDS;
  else process.env.PUBLIC_ORDER_ALLOWED_APP_IDS = oldIds;
  if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  await testEnv.cleanup();
  await deleteApp(adminApp);
}
