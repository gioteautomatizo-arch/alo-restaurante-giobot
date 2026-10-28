/**
 * Prueba del servicio REAL de transiciones con el SDK de Firestore y reglas STAGED
 * en Firebase Emulator. Solo usa identidades y documentos ficticios.
 * No modifica reglas, cobros ni Firebase desplegado.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: este test requiere Firebase Emulator en 127.0.0.1:8080.');

const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-order-status-emulator-test',
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'),
  },
});

// Esbuild usa el servicio TypeScript de producción. Solo sustituimos la
// configuración Firebase y los imports no relacionados; las operaciones
// doc/getDoc/updateDoc/runTransaction delegan al SDK REAL del emulador.
globalThis.orderStatusSdk = sdk;
globalThis.orderStatusDb = null;
const firestoreProxy = [
  'doc', 'getDoc', 'updateDoc', 'runTransaction',
  'addDoc', 'collection', 'onSnapshot', 'query', 'setDoc', 'where',
].map(name => {
  if (name === 'doc' || name === 'collection' || name === 'runTransaction') {
    return `export const ${name} = (_db, ...args) => globalThis.orderStatusSdk.${name}(globalThis.orderStatusDb, ...args);`;
  }
  return `export const ${name} = (...args) => globalThis.orderStatusSdk.${name}(...args);`;
}).join('\n');

const mocks = {
  'firebase/firestore': firestoreProxy,
  './firebase': 'export const db = {};',
  './firestoreService': 'export const sanitizeFirestorePayload = value => value;',
  './restaurantContext': "export const getActiveRestaurantId = () => 'alo-restaurante'; export const isCalientitoTenant = () => true;",
  './adminStorage': "export const getRestaurantInfo = () => ({orderFolioPrefix: 'CAL'});",
};
const bundle = await build({
  absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
  entryPoints: ['src/lib/ordersService.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{
    name: 'emulator-firestore-bridge',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.importer.endsWith('/ordersService.ts') && Object.hasOwn(mocks, args.path)) {
          return { path: args.path, namespace: 'mock' };
        }
      });
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({
        contents: mocks[args.path], loader: 'js',
      }));
    },
  }],
});
const { updateBusinessRestaurantOrderStatus: transition } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

const signed = uid => env.authenticatedContext(uid).firestore();
const ownerA = signed('owner-a');
const managerA = signed('manager-a');
const ownerB = signed('owner-b');
const outsider = signed('outsider');
const revoked = signed('revoked-a');
const user = { id: 'manager-a', name: 'Encargado ficticio' };
const order = (restaurantId, extras = {}) => ({
  restaurantId, code: 'DEMO-001', status: 'NUEVO', billingStatus: 'PENDIENTE',
  orderType: 'pickup', orderSource: 'CAJA',
  items: [{ productId: 'demo', name: 'Producto ficticio', quantity: 1, unitPrice: 55, totalPrice: 55 }],
  subtotal: 55, discountAmount: 0, deliveryFee: 0, total: 55,
  createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:00:00.000Z',
  ...extras,
});
const ref = (db, id) => sdk.doc(db, 'restaurant_orders', id);
const read = async (db, id) => (await sdk.getDoc(ref(db, id))).data();
const as = db => { globalThis.orderStatusDb = db; };
const expectDenied = async action => {
  await assert.rejects(action, error => error?.code === 'permission-denied',
    'Las reglas deben denegar acceso sin membresía del tenant.');
};

try {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [id, uid] of [['business-a', 'owner-a'], ['business-b', 'owner-b']]) {
      await sdk.setDoc(sdk.doc(db, 'businesses', id), { restaurantId: id, ownerUserId: uid });
      await sdk.setDoc(sdk.doc(db, 'businessMemberships', id + '_' + uid), {
        restaurantId: id, userId: uid, role: 'OWNER', active: true,
      });
    }
    await sdk.setDoc(sdk.doc(db, 'businessMemberships/business-a_manager-a'), {
      restaurantId: 'business-a', userId: 'manager-a', role: 'MANAGER', active: true,
    });
    await sdk.setDoc(sdk.doc(db, 'businessMemberships/business-a_revoked-a'), {
      restaurantId: 'business-a', userId: 'revoked-a', role: 'MANAGER', active: false,
    });
    await sdk.setDoc(ref(db, 'a-normal'), order('business-a'));
    await sdk.setDoc(ref(db, 'b-normal'), order('business-b'));
    await sdk.setDoc(ref(db, 'a-paid'), order('business-a', { status: 'LISTO', billingStatus: 'PAGADO' }));
    await sdk.setDoc(ref(db, 'a-cancel'), order('business-a', { status: 'LISTO' }));
    await sdk.setDoc(ref(db, 'a-race'), order('business-a'));
    await sdk.setDoc(ref(db, 'a-table'), order('business-a', { orderType: 'dine_in', tableNumber: 1 }));
    await sdk.setDoc(sdk.doc(db, 'public_table_orders/a-table'), {
      restaurantId: 'business-a', orderId: 'a-table', tableNumber: 1,
      code: 'DEMO-001', status: 'NUEVO', total: 55,
      items: [{ name: 'Producto ficticio', quantity: 1, unitPrice: 55, totalPrice: 55 }],
      createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:00:00.000Z',
    });
  });

  as(managerA);
  await transition('business-a', 'a-normal', 'PREPARANDO', user);
  const preparing = await read(managerA, 'a-normal');
  assert.equal(preparing.status, 'PREPARANDO');
  assert.equal(preparing.claimedById, user.id);
  assert.equal(preparing.billingStatus, 'PENDIENTE');
  assert.equal(preparing.total, 55);
  await transition('business-a', 'a-normal', 'PREPARANDO', user);
  assert.equal((await read(managerA, 'a-normal')).updatedAt, preparing.updatedAt,
    'Reintento confirmado no modifica la fecha.');
  await transition('business-a', 'a-normal', 'LISTO', user);
  await transition('business-a', 'a-normal', 'ENTREGADO', user);
  await assert.rejects(transition('business-a', 'a-normal', 'PREPARANDO', user), /cambió/);
  await assert.rejects(transition('business-a', 'a-normal', 'CANCELADO', user), /entregado/);

  await assert.rejects(transition('business-a', 'a-paid', 'CANCELADO', user), /Revisa Caja/);
  assert.equal((await read(managerA, 'a-paid')).billingStatus, 'PAGADO');
  await transition('business-a', 'a-cancel', 'CANCELADO', user);
  assert.equal((await read(managerA, 'a-cancel')).status, 'CANCELADO');
  await assert.rejects(transition('business-a', 'a-cancel', 'LISTO', user), /cambió/);

  // Dos operadores sobre el mismo estado: el SDK transaccional no duplica el cambio.
  await Promise.all([
    transition('business-a', 'a-race', 'PREPARANDO', user),
    transition('business-a', 'a-race', 'PREPARANDO', user),
  ]);
  assert.equal((await read(managerA, 'a-race')).status, 'PREPARANDO');

  // Las reglas rechazan a otra cuenta y a un empleado revocado.
  as(outsider);
  await expectDenied(() => transition('business-a', 'a-race', 'LISTO', user));
  as(revoked);
  await expectDenied(() => transition('business-a', 'a-race', 'LISTO', user));
  as(managerA);
  await expectDenied(() => transition('business-b', 'b-normal', 'PREPARANDO', user));
  assert.equal((await read(managerA, 'a-race')).status, 'PREPARANDO');

  // Un propietario de B opera B; no toca los documentos de A.
  as(ownerB);
  await transition('business-b', 'b-normal', 'PREPARANDO', { id: 'owner-b', name: 'Propietario B' });
  assert.equal((await read(ownerB, 'b-normal')).status, 'PREPARANDO');
  await expectDenied(() => transition('business-a', 'a-race', 'LISTO', user));

  // El espejo de mesa es best-effort: comprobar caso permitido, sin prometer atomicidad.
  as(ownerA);
  await transition('business-a', 'a-table', 'PREPARANDO', { id: 'owner-a', name: 'Propietario A' });
  assert.equal((await read(ownerA, 'a-table')).status, 'PREPARANDO');
  assert.equal((await sdk.getDoc(sdk.doc(ownerA, 'public_table_orders/a-table'))).data().status, 'PREPARANDO');

  console.log('PASS: servicio real + Firestore Emulator, dos tenants, roles, transacciones, reintentos, carrera, cobro y mesa.');
} finally {
  globalThis.orderStatusDb = null;
  await env.cleanup();
}
