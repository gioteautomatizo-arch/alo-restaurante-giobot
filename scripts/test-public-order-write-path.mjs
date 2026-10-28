// Ejecuta el servicio real con frontera Firestore simulada; no hay red ni datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': `export const collection = (_db, path) => ({path});
    export const doc = (dbOrCollection, path, id) => path === undefined\n      ? ({path: dbOrCollection.path, id: 'auto-table-id'}) : ({path, id});
    export async function addDoc(ref, payload) { globalThis.orderWrites.push({type: 'add', ref, payload}); return {id: 'auto-id'}; }
    export async function setDoc(ref, payload) {
      globalThis.orderWrites.push({type: 'set', ref, payload});
      if (globalThis.rejectOrderSet) throw new Error('simulated lost ACK');
    }
    export const getDoc = async () => { throw new Error('not expected'); };
    export const onSnapshot = () => () => {};
    export const query = (...args) => args;
    export const updateDoc = async () => {};
    export const runTransaction = async () => {};\n    export const writeBatch = () => {\n      const pending = [];\n      return {\n        set(ref, payload) { pending.push({type: 'batch-set', ref, payload}); },\n        async commit() {\n          if (globalThis.rejectBatch) throw new Error('simulated mirror permission-denied');\n          globalThis.orderWrites.push(...pending);\n        },\n      };\n    };
    export const where = () => {}; `,
  './firebase': 'export const db = {};',
  './firestoreService': 'export const sanitizeFirestorePayload = payload => payload;',
  './restaurantContext': "export const getActiveRestaurantId = () => 'business-a'; export const isCalientitoTenant = () => false;",
  './adminStorage': 'export const getRestaurantInfo = () => ({});',
};
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ['src/lib/ordersService.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{name: 'mock-firestore', setup(builder) {
    builder.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/ordersService.ts') && Object.hasOwn(mocks, args.path)) {
        return {path: args.path, namespace: 'mock'};
      }
    });
    builder.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: mocks[args.path], loader: 'js'}));
  }}],
});
const {createBusinessRestaurantOrder} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
globalThis.orderWrites = [];
const order = {
  orderType: 'pickup', orderSource: 'CLIENTE_QR', customerName: 'Cliente de prueba',
  paymentMethod: 'efectivo', bringOwnContainer: false,
  items: [{productId: 'taco', name: 'Taco', quantity: 1, unitPrice: 25, totalPrice: 25}],
  subtotal: 25, discountAmount: 0, deliveryFee: 0, total: 25,
};
const stableId = 'web_0123456789abcdef0123456789abcdef';
const saved = await createBusinessRestaurantOrder('business-a', order, stableId);
assert.equal(saved.id, stableId);
assert.equal(saved.restaurantId, 'business-a');
assert.equal(saved.billingStatus, 'PENDIENTE');
assert.deepEqual(globalThis.orderWrites.map(x => x.type), ['set']);
assert.equal(globalThis.orderWrites[0].ref.id, stableId);
assert.equal(globalThis.orderWrites[0].payload.total, 25);
globalThis.orderWrites = [];
await assert.rejects(createBusinessRestaurantOrder('business-a', order, 'not-a-safe-id'), /inválido/);
assert.equal(globalThis.orderWrites.length, 0, 'Invalid ID must not write');
globalThis.rejectOrderSet = true;
await assert.rejects(createBusinessRestaurantOrder('business-a', order, stableId), /lost ACK/);
assert.deepEqual(globalThis.orderWrites.map(x => x.type), ['set'], 'Failed stable write never falls back to addDoc');
globalThis.rejectOrderSet = false;
globalThis.orderWrites = [];
const legacy = await createBusinessRestaurantOrder('business-a', order);
assert.equal(legacy.id, 'auto-id');
assert.deepEqual(globalThis.orderWrites.map(x => x.type), ['add'], 'POS/other callers retain addDoc behavior');
globalThis.orderWrites = [];
const calientito = await createBusinessRestaurantOrder('alo-restaurante', order, stableId);
assert.equal(calientito.id, 'auto-id');
assert.deepEqual(globalThis.orderWrites.map(x => x.type), ['add'], 'Legacy Calientito must not overwrite an existing order with setDoc');
// En negocios nuevos, la comanda de mesa y su resumen deben ser inseparables.
const tableOrder = {...order, orderType: 'dine_in', tableNumber: 1};
globalThis.orderWrites = [];
const table = await createBusinessRestaurantOrder('business-a', tableOrder, stableId);
assert.equal(table.id, stableId);
assert.deepEqual(globalThis.orderWrites.map(x => x.type), ['batch-set', 'batch-set']);
assert.deepEqual(globalThis.orderWrites.map(x => x.ref.path), ['restaurant_orders', 'public_table_orders']);
assert(globalThis.orderWrites.every(x => x.ref.id === stableId));
assert.equal(globalThis.orderWrites[1].payload.orderId, stableId);
assert.equal(globalThis.orderWrites[1].payload.restaurantId, 'business-a');
assert.equal(globalThis.orderWrites[1].payload.code, globalThis.orderWrites[0].payload.code);
assert.equal(globalThis.orderWrites[1].payload.updatedAt, globalThis.orderWrites[0].payload.updatedAt);
globalThis.orderWrites = [];
const posTable = await createBusinessRestaurantOrder('business-b', tableOrder);
assert.equal(posTable.id, 'auto-table-id');
assert.deepEqual(globalThis.orderWrites.map(x => x.type), ['batch-set', 'batch-set'],
  'POS de mesa usa batch y conserva un ID automático');
assert.equal(globalThis.orderWrites[1].payload.restaurantId, 'business-b');
globalThis.orderWrites = [];
globalThis.rejectBatch = true;
await assert.rejects(createBusinessRestaurantOrder('business-a', tableOrder, stableId), /permission-denied/);
assert.equal(globalThis.orderWrites.length, 0, 'Un fallo del espejo no debe confirmar el pedido principal');
globalThis.rejectBatch = false;
globalThis.orderWrites = [];
await createBusinessRestaurantOrder('alo-restaurante', tableOrder);
assert.deepEqual(globalThis.orderWrites.map(x => x.type), ['add', 'set'],
  'Calientito conserva su ruta heredada fuera del batch');
console.log('PASS: IDs web, POS y Calientito; pedido y espejo de mesa atómicos en tenants nuevos con rollback simulado.');
