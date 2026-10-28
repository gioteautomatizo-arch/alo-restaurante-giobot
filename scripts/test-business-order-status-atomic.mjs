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
  './restaurantContext': "export const getActiveRestaurantId = () => globalThis.testActiveRestaurantId || 'alo-restaurante'; export const isCalientitoTenant = () => getActiveRestaurantId() === 'alo-restaurante';",
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
const { updateBusinessRestaurantOrderStatus, updateOffTableOrderDetails, chargeOffTableOrder } = await import(
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


// Edición de pedidos fuera de mesa: mismo servicio real, transacciones simuladas.
// En particular, nunca debe cambiar el importe después de que Caja cobre.
globalThis.testActiveRestaurantId = 'demo-a';
const snapshot = id => ({ ...read(id), id });
put('edit-a', sample('demo-a'));
const beforeEdit = snapshot('edit-a');
await updateOffTableOrderDetails(beforeEdit, { notes: 'Sin cebolla', total: 60 }, user);
assert.equal(read('edit-a').total, 60);
assert.equal(read('edit-a').notes, 'Sin cebolla');
assert.equal(read('edit-a').billingStatus, 'PENDIENTE');
await assert.rejects(updateOffTableOrderDetails(beforeEdit, { total: 10 }, user), /cambió/,
  'La segunda edición con pantalla antigua no debe sobrescribir la primera');
assert.equal(read('edit-a').total, 60);

put('edit-paid', sample('demo-a'));
const beforePayment = snapshot('edit-paid');
const paid = await chargeOffTableOrder(beforePayment, 'tarjeta', user);
assert.equal(paid.alreadyPaid, false);
assert.equal(read('edit-paid').billingStatus, 'PAGADO');
await assert.rejects(updateOffTableOrderDetails(beforePayment, { total: 1 }, user), /Revisa Caja/);
assert.equal(read('edit-paid').total, 55, 'Editar tras cobrar no altera el importe');
assert.equal(read('edit-paid').paymentMethod, 'tarjeta');

// En orden inverso la edición se confirma primero y el cobro usa el importe nuevo.
put('edit-then-charge', sample('demo-a'));
const beforeConcurrent = snapshot('edit-then-charge');
const both = await Promise.allSettled([
  updateOffTableOrderDetails(beforeConcurrent, { total: 90 }, user),
  chargeOffTableOrder(beforeConcurrent, 'efectivo', user),
]);
assert.deepEqual(both.map(result => result.status), ['fulfilled', 'fulfilled']);
assert.equal(read('edit-then-charge').total, 90);
assert.equal(read('edit-then-charge').billingStatus, 'PAGADO');

put('edit-delivered', sample('demo-a', 'ENTREGADO'));
await assert.rejects(updateOffTableOrderDetails(snapshot('edit-delivered'), { status: 'CANCELADO' }, user), /entregado/);
put('edit-unknown', { ...sample('demo-a'), billingStatus: undefined });
await assert.rejects(updateOffTableOrderDetails(snapshot('edit-unknown'), { total: 1 }, user), /Revisa Caja/);
put('edit-cancel', sample('demo-a'));
await updateOffTableOrderDetails(snapshot('edit-cancel'), { status: 'CANCELADO', notes: 'Solicitud del cliente' }, user);
assert.equal(read('edit-cancel').status, 'CANCELADO');
assert.equal(read('edit-cancel').cancelledById, user.id);
await assert.rejects(updateOffTableOrderDetails(snapshot('edit-cancel'), { total: 1 }, user), /cancelado/);
await assert.rejects(updateOffTableOrderDetails(snapshot('edit-a'), { status: 'LISTO' }, user), /Solo se permite cancelar/);
await assert.rejects(updateOffTableOrderDetails({ ...sample('demo-a') }, { total: 1 }, user), /identificador/);
await assert.rejects(updateOffTableOrderDetails(snapshot('order-b'), { total: 1 }, user), /otro negocio/);
assert.equal(read('order-b').total, 55);

// Cambiar de tenant mientras se resuelve la lectura de la transacción bloquea el write.
put('edit-switch', sample('demo-a'));
const pendingSwitch = updateOffTableOrderDetails(snapshot('edit-switch'), { total: 1 }, user);
globalThis.testActiveRestaurantId = 'demo-b';
await assert.rejects(pendingSwitch, /Cambió la sesión/);
assert.equal(read('edit-switch').total, 55);

// El editor de Calientito mantiene el contrato de datos, ahora sin carrera con Caja.
globalThis.testActiveRestaurantId = 'alo-restaurante';
put('edit-legacy', sample('alo-restaurante'));
const legacyWritesBefore = globalThis.testLegacyWrites.length;
await updateOffTableOrderDetails(snapshot('edit-legacy'), { notes: 'Mostrador' }, user);
assert.equal(read('edit-legacy').notes, 'Mostrador');
assert.equal(globalThis.testLegacyWrites.length, legacyWritesBefore,
  'La edición usa transacción, no updateDoc separado');
console.log('PASS: edición transaccional, cobro concurrente, pantalla obsoleta, tenant, cancelación y compatibilidad Calientito.');
