// Ejecuta el servicio real con frontera Firestore simulada; no hay red ni datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': `export const collection = (_db, path) => ({path});
    export const doc = (_db, path, id) => ({path, id});
    export async function addDoc(ref, payload) { globalThis.orderWrites.push({type: 'add', ref, payload}); return {id: 'auto-id'}; }
    export async function setDoc(ref, payload) {
      globalThis.orderWrites.push({type: 'set', ref, payload});
      if (globalThis.rejectOrderSet) throw new Error('simulated lost ACK');
    }
    export const getDoc = async () => { throw new Error('not expected'); };
    export const onSnapshot = () => () => {};
    export const query = (...args) => args;
    export const updateDoc = async () => {};
    export const runTransaction = async () => {};
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
console.log('PASS: servicio real usa setDoc con ID web estable, no crea un segundo ID tras fallo y conserva addDoc para Caja.');
