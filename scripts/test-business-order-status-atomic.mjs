// Prueba de transición de pedidos con el servicio real y una frontera Firestore
// transaccional en memoria. No usa Firebase, usuarios ni cobros reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': `const key = (ref) => ref.path + '/' + ref.id;
    export const doc = (_db, path, id) => ({ path, id });
    export const collection = (_db, path) => ({ path });
    export const query = (...args) => args;
    export const where = () => null;
    export const onSnapshot = () => () => {};
    export const addDoc = async () => { throw new Error('No se permite crear pedidos en esta prueba'); };
    export const setDoc = async () => { throw new Error('No se permite crear pedidos en esta prueba'); };
    export async function getDoc(ref) {
      globalThis.testReads.push(key(ref));
      const value = globalThis.testDocs.get(key(ref));
      return { exists: () => !!value, data: () => ({ ...value }), id: ref.id };
    }
    export async function updateDoc(ref, patch) {
      globalThis.testLegacyWrites.push({ key: key(ref), patch });
      const previous = globalThis.testDocs.get(key(ref));
      if (!previous) throw new Error('Documento espejo no existe');
      globalThis.testDocs.set(key(ref), { ...previous, ...patch });
    }
    export async function runTransaction(_db, callback) {
      const previous = globalThis.testTransactionQueue;
      let release;
      globalThis.testTransactionQueue = new Promise(resolve => { release = resolve; });
      await previous;
      try {
        const updates = [];
        const tx = {
          get: async ref => {
            const value = globalThis.testDocs.get(key(ref));
            return { exists: () => !!value, data: () => ({ ...value }), id: ref.id };
          },
          update: (ref, patch) => updates.push({ key: key(ref), patch }),
        };
        const result = await callback(tx);
        for (const update of updates) {
          const previousDoc = globalThis.testDocs.get(update.key);
          if (!previousDoc) throw new Error('Documento desaparecido');
          globalThis.testDocs.set(update.key, { ...previousDoc, ...update.patch });
          globalThis.testTransactionWrites.push(update);
        }
        return result;
      } finally { release(); }
    }`,
  './firebase': 'export const db = {};',
  './firestoreService': 'export const sanitizeFirestorePayload = value => value;',
  './restaurantContext': "export const getActiveRestaurantId = () => 'alo-restaurante'; export const isCalientitoTenant = () => true;",
  './adminStorage': "export const getRestaurantInfo = () => ({orderFolioPrefix: 'CAL'});",
};
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ['src/lib/ordersService.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'mock-firestore', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (args.importer.endsWith('/ordersService.ts') && Object.hasOwn(mocks, args.path)) {
        return { path: args.path, namespace: 'mock' };
      }
    });
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const { updateBusinessRestaurantOrderStatus } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
globalThis.testDocs = new Map();
globalThis.testReads = [];
globalThis.testLegacyWrites = [];
globalThis.testTransactionWrites = [];
globalThis.testTransactionQueue = Promise.resolve();
const user = { id: 'staff-a', name: 'Encargado A' };
const docKey = (id) => 'restaurant_orders/' + id;
const sample = (restaurantId, status = 'NUEVO', billingStatus = 'PENDIENTE', orderType = 'pickup') => ({
  restaurantId, status, billingStatus, orderType, total: 55,
  items: [{ productId: 'taco', name: 'Taco', quantity: 1, unitPrice: 55, totalPrice: 55 }],
  code: 'DEMO-001', createdAt: '2026-10-28T10:00:00Z', updatedAt: '2026-10-28T10:00:00Z',
});
const put = (id, order) => globalThis.testDocs.set(docKey(id), order);
const read = (id) => globalThis.testDocs.get(docKey(id));

put('order-a', sample('demo-a'));
put('order-b', sample('demo-b'));
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-b', 'order-a', 'PREPARANDO', user), /otro negocio/);
assert.equal(read('order-a').status, 'NUEVO');
assert.equal(globalThis.testTransactionWrites.length, 0);
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-a', 'missing', 'PREPARANDO', user), /ya no existe/);
await assert.rejects(updateBusinessRestaurantOrderStatus('', 'order-a', 'PREPARANDO', user), /Falta identificar/);
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-a', '', 'PREPARANDO', user), /Falta identificar/);

await updateBusinessRestaurantOrderStatus('demo-a', 'order-a', 'PREPARANDO', user);
assert.equal(read('order-a').status, 'PREPARANDO');
assert.equal(read('order-a').claimedById, user.id);
assert.equal(read('order-a').billingStatus, 'PENDIENTE');
assert.equal(read('order-a').total, 55);
assert.equal(read('order-b').status, 'NUEVO', 'A no altera el negocio B');
const writeCount = globalThis.testTransactionWrites.length;
const firstUpdatedAt = read('order-a').updatedAt;
await updateBusinessRestaurantOrderStatus('demo-a', 'order-a', 'PREPARANDO', user);
assert.equal(globalThis.testTransactionWrites.length, writeCount, 'Reintento confirmado no escribe');
assert.equal(read('order-a').updatedAt, firstUpdatedAt, 'Reintento no cambia fecha');
await updateBusinessRestaurantOrderStatus('demo-a', 'order-a', 'LISTO', user);
assert.ok(read('order-a').readyAt);
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-a', 'order-a', 'PREPARANDO', user), /cambió/);
// El pedido en LISTO y pendiente puede cancelarse, pero el cobrado no.
put('paid', sample('demo-a', 'LISTO', 'PAGADO'));
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-a', 'paid', 'CANCELADO', user), /Revisa Caja/);
assert.equal(read('paid').status, 'LISTO');
put('cancel-from-ready', sample('demo-a', 'LISTO'));
await updateBusinessRestaurantOrderStatus('demo-a', 'cancel-from-ready', 'CANCELADO', user);
assert.equal(read('cancel-from-ready').status, 'CANCELADO');
put('unknown-billing', { ...sample('demo-a'), billingStatus: undefined });
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-a', 'unknown-billing', 'CANCELADO', user), /Revisa Caja/);
put('delivered', sample('demo-a', 'ENTREGADO'));
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-a', 'delivered', 'CANCELADO', user), /ya fue entregado/);
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-a', 'delivered', 'LISTO', user), /cambió/);
put('cancelled', sample('demo-a'));
await updateBusinessRestaurantOrderStatus('demo-a', 'cancelled', 'CANCELADO', user);
assert.equal(read('cancelled').status, 'CANCELADO');
assert.ok(read('cancelled').cancelledAt);
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-a', 'cancelled', 'PREPARANDO', user), /cambió/);

put('race', sample('demo-a'));
const simultaneous = await Promise.allSettled([
  updateBusinessRestaurantOrderStatus('demo-a', 'race', 'PREPARANDO', user),
  updateBusinessRestaurantOrderStatus('demo-a', 'race', 'LISTO', user),
]);
assert.equal(simultaneous[0].status, 'fulfilled');
assert.equal(simultaneous[1].status, 'fulfilled');
assert.equal(read('race').status, 'LISTO', 'Dos cambios válidos no se pierden');
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-a', 'race', 'NUEVO', user), /cambió/);
put('skip', sample('demo-b'));
await assert.rejects(updateBusinessRestaurantOrderStatus('demo-b', 'skip', 'ENTREGADO', user), /cambió/);
assert.equal(read('skip').status, 'NUEVO');

put('table', { ...sample('demo-a', 'NUEVO', 'PENDIENTE', 'dine_in'), tableNumber: 1 });
globalThis.testDocs.set('public_table_orders/table', { status: 'NUEVO', restaurantId: 'demo-a' });
await updateBusinessRestaurantOrderStatus('demo-a', 'table', 'PREPARANDO', user);
assert.equal(globalThis.testDocs.get('public_table_orders/table').status, 'PREPARANDO');
assert.equal(globalThis.testLegacyWrites.filter(x => x.key === 'restaurant_orders/table').length, 0,
  'Tenant nuevo escribe pedido únicamente por transacción');

put('legacy', sample('alo-restaurante'));
globalThis.testDocs.set('public_table_orders/legacy', { status: 'NUEVO' });
await updateBusinessRestaurantOrderStatus('alo-restaurante', 'legacy', 'PREPARANDO', user);
assert.equal(read('legacy').status, 'PREPARANDO', 'Calientito conserva su flujo legado');
assert.ok(globalThis.testReads.includes(docKey('legacy')));
assert.ok(globalThis.testLegacyWrites.some(x => x.key === docKey('legacy')));
const ui = readFileSync('src/components/platform/BusinessOperationsView.tsx', 'utf8');
assert.match(ui, /businessId !== 'alo-restaurante' && order\.billingStatus !== 'PENDIENTE'/,
  'La interfaz bloquea cancelación de pagos de nuevos tenants');
assert.match(ui, /businessId === 'alo-restaurante' \|\| order\.billingStatus === 'PENDIENTE'/,
  'La interfaz no ofrece cancelar un pedido cobrado sin conciliación');
console.log('PASS: transición atómica tenant A/B, avance, reintento, carrera, terminales, cancelación pagada, espejo y Calientito legado.');
