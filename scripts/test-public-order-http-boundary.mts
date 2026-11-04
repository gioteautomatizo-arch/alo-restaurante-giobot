/**
 * Prueba de frontera HTTP solo en Firestore Emulator, con App Check simulado.
 * App Check simulado; prueba cuota centralizada en Emulator, no infraestructura real ni producción.
 */
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { registerPublicOrderApi } from '../publicOrderApi';
import { deriveTrustedOrderId } from '../publicOrderAuthorityTransaction';
import { publicOrderQuotaKeys, PUBLIC_ORDER_QUOTA_CLIENT_LIMIT } from '../publicOrderQuota';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: HTTP solo contra Firebase Emulator.');
const projectId = 'gioteautomatizo-public-order-http-test';
const admin = initializeApp({ projectId });
const db = getFirestore(admin);
const app = express();
app.use(express.json({ limit: '12kb' }));
let verifications = 0;
registerPublicOrderApi(app, {
  firestore: () => db,
  verifyAppCheck: async (token) => {
    verifications++;
    if (token === 'good.jwt.token') return { appId: 'demo-web-app' };
    if (token === 'foreign.jwt.token') return { appId: 'other-app' };
    throw new Error('App Check inválido');
  },
});
const server = createServer(app);
const initialFlag = process.env.ENABLE_SECURE_PUBLIC_ORDER_API;
const initialIds = process.env.PUBLIC_ORDER_ALLOWED_APP_IDS;
const attempt = (n: number) => 'web_' + n.toString(16).padStart(32, '0');
const draft = (n: number, extra: Record<string, unknown> = {}) => ({
  businessId: 'tenant-a', attemptId: attempt(n), orderType: 'pickup',
  paymentMethod: 'efectivo', customerName: 'Cliente ficticio',
  lines: [{ productId: 'taco', quantity: 2 }], ...extra,
});

try {
  await db.doc('businesses/tenant-a').set({ restaurantId: 'tenant-a', active: true });
  await db.doc('businesses/tenant-b').set({ restaurantId: 'tenant-b', active: true });
  await db.doc('publicBusinessProfiles/tenant-a').set({
    businessId: 'tenant-a', restaurantId: 'tenant-a', published: true,
  });
  await db.doc('publicBusinessProfiles/tenant-b').set({
    businessId: 'tenant-b', restaurantId: 'tenant-b', published: false,
  });
  await db.doc('businesses/tenant-a/catalog/menu_catalog').set({
    businessId: 'tenant-a', revision: 'rev1',
    items: [{ id: 'taco', name: 'Taco', price: 35, available: true, optionGroups: [] }],
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const url = 'http://127.0.0.1:' + address.port + '/api/public-orders';
  async function send(body: unknown, token?: string) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'X-Firebase-AppCheck': token } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  }

  delete process.env.ENABLE_SECURE_PUBLIC_ORDER_API;
  const closed = await send(draft(1), 'good.jwt.token');
  assert.equal(closed.status, 404);
  assert.equal(verifications, 0, 'API apagada no verifica tokens ni accede al servidor');

  process.env.ENABLE_SECURE_PUBLIC_ORDER_API = 'true';
  delete process.env.PUBLIC_ORDER_ALLOWED_APP_IDS;
  assert.equal((await send(draft(1), 'good.jwt.token')).status, 503, 'Allowlist es obligatoria');
  process.env.PUBLIC_ORDER_ALLOWED_APP_IDS = 'demo-web-app';
  assert.equal((await send(draft(1))).status, 401);
  assert.equal((await send(draft(1), 'wrong.jwt.token')).status, 401);
  assert.equal((await send(draft(1), 'foreign.jwt.token')).status, 403);
  assert.equal((await send(draft(1, { total: 0 }), 'good.jwt.token')).status, 400,
    'No admite precios, totales ni estados declarados por cliente');
  assert.equal((await send(draft(1, { lines: [{ productId: 'taco', quantity: 1, unitPrice: 0 }] }), 'good.jwt.token')).status, 400);
  assert.equal((await db.doc('restaurant_orders/' + deriveTrustedOrderId('tenant-a', attempt(1))).get()).exists, false);

  const created = await send(draft(1), 'good.jwt.token');
  assert.equal(created.status, 201);
  assert.equal(created.cache, 'no-store');
  assert.equal(created.body.total, 70);
  assert.deepEqual(created.body.items, [{ productId: 'taco', name: 'Taco',
    quantity: 2, totalPrice: 70 }]);
  assert.equal(created.body.created, true);
  assert.equal((await db.doc('restaurant_orders/' + created.body.orderId).get()).data()?.total, 70);
  const duplicate = await send(draft(1), 'good.jwt.token');
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.created, false);
  assert.equal(duplicate.body.orderId, created.body.orderId);
  assert.deepEqual(duplicate.body.items, created.body.items);
  assert.equal((await send(draft(1, { customerName: 'Diferente' }), 'good.jwt.token')).status, 409);

  assert.equal((await send(draft(2, { orderType: 'dine_in', tableNumber: 61 }), 'good.jwt.token')).status, 400);
  const atLimit = await send(draft(3, {
    orderType: 'dine_in', tableNumber: 60, guestCount: 4, notes: 'Sin picante',
  }), 'good.jwt.token');
  assert.equal(atLimit.status, 201);
  assert.equal((await db.doc('public_table_orders/' + atLimit.body.orderId).get()).data()?.tableNumber, 60);
  assert.equal((await db.doc('restaurant_orders/' + atLimit.body.orderId).get()).data()?.notes,
    'Mesa 60 · 4 personas · Sin picante');

  assert.equal((await send(draft(4, { businessId: 'tenant-b' }), 'good.jwt.token')).status, 400);
  assert.equal((await db.doc('restaurant_orders/' + deriveTrustedOrderId('tenant-b', attempt(4))).get()).exists, false);
  await db.doc('businesses/tenant-a').update({ active: false });
  assert.equal((await send(draft(5), 'good.jwt.token')).status, 400);
  assert.equal((await db.doc('restaurant_orders/' + deriveTrustedOrderId('tenant-a', attempt(5))).get()).exists, false);
  // Límite compartido: una segunda instancia usaría exactamente este documento.
  await db.doc('businesses/tenant-a').update({ active: true });
  const key = publicOrderQuotaKeys('tenant-a', 'demo-web-app', '127.0.0.1');
  // Express req.ip en loopback es 127.0.0.1.
  await db.collection('public_order_rate_limits').doc(key.client).set({
    count: PUBLIC_ORDER_QUOTA_CLIENT_LIMIT, resetAt: Date.now() + 55_000,
  });
  const limited = await send(draft(6), 'good.jwt.token');
  assert.equal(limited.status, 429, 'No se puede pasar el límite centralizado');
  assert.equal((await db.doc('restaurant_orders/' + deriveTrustedOrderId('tenant-a', attempt(6))).get()).exists, false);
  // Un registro corrupto de cuota tampoco puede abrir un pedido nuevo.
  await db.collection('public_order_rate_limits').doc(key.client).set({
    count: 'invalid', resetAt: Date.now() + 55_000,
  });
  assert.equal((await send(draft(7), 'good.jwt.token')).status, 503,
    'Un error de cuota centralizada debe fallar cerrado');
  assert.equal((await db.doc('restaurant_orders/' + deriveTrustedOrderId('tenant-a', attempt(7))).get()).exists, false);
  process.env.ENABLE_SECURE_PUBLIC_ORDER_API = 'false';
  assert.equal((await send(draft(8), 'good.jwt.token')).status, 404);
  console.log('PASS: API cerrada; App Check/allowlist simulados; cliente sin precios; pedido fiable, reintento, mesa 60 y tenant A/B en Emulator.');
  console.log('PENDIENTE CRÍTICO: App Check real, mitigación DDoS y cuotas de infraestructura, integración cliente y cierre del bypass directo; NO ACTIVAR.');
} finally {
  if (initialFlag === undefined) delete process.env.ENABLE_SECURE_PUBLIC_ORDER_API;
  else process.env.ENABLE_SECURE_PUBLIC_ORDER_API = initialFlag;
  if (initialIds === undefined) delete process.env.PUBLIC_ORDER_ALLOWED_APP_IDS;
  else process.env.PUBLIC_ORDER_ALLOWED_APP_IDS = initialIds;
  if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  await deleteApp(admin);
}
