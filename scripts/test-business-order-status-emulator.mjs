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
  'doc', 'getDoc', 'updateDoc', 'runTransaction', 'writeBatch',
  'addDoc', 'collection', 'onSnapshot', 'query', 'setDoc', 'where',
].map(name => {
  if (name === 'doc') {
    // doc(db, collection, id) y doc(collection(db, collection)) comparten SDK.
    return `export const doc = (first, ...args) => first?.type === 'collection'
      ? globalThis.orderStatusSdk.doc(first, ...args)
      : globalThis.orderStatusSdk.doc(globalThis.orderStatusDb, ...args);`;
  }
  if (name === 'collection' || name === 'runTransaction' || name === 'writeBatch') {
    return `export const ${name} = (_db, ...args) => globalThis.orderStatusSdk.${name}(globalThis.orderStatusDb, ...args);`;
  }
  return `export const ${name} = (...args) => globalThis.orderStatusSdk.${name}(...args);`;
}).join('\n');

const mocks = {
  'firebase/firestore': firestoreProxy,
  './firebase': 'export const db = {};',
  './firestoreService': 'export const sanitizeFirestorePayload = value => JSON.parse(JSON.stringify(value));',
  './restaurantContext': "export const getActiveRestaurantId = () => globalThis.orderStatusTenant || 'alo-restaurante'; export const isCalientitoTenant = () => getActiveRestaurantId() === 'alo-restaurante';",
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
const { createBusinessRestaurantOrder: createOrder, updateBusinessRestaurantOrderStatus: transition, updateOffTableOrderDetails: editOffTable, chargeOffTableOrder: chargeOffTable } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

const signed = uid => env.authenticatedContext(uid).firestore();
const ownerA = signed('owner-a');
const managerA = signed('manager-a');
const ownerB = signed('owner-b');
const outsider = signed('outsider');
const revoked = signed('revoked-a');
const anonymous = env.unauthenticatedContext().firestore();
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
    await sdk.setDoc(sdk.doc(db, 'publicBusinessProfiles/business-a'), {
      restaurantId: 'business-a', published: true, name: 'Negocio A ficticio',
    });
    await sdk.setDoc(ref(db, 'a-normal'), order('business-a'));
    await sdk.setDoc(ref(db, 'a-edit-staged'), order('business-a'));
    await sdk.setDoc(ref(db, 'legacy-edit'), order('alo-restaurante'));
    await sdk.setDoc(ref(db, 'legacy-pay'), order('alo-restaurante'));

    await sdk.setDoc(ref(db, 'b-normal'), order('business-b'));
    await sdk.setDoc(ref(db, 'a-paid'), order('business-a', { status: 'LISTO', billingStatus: 'PAGADO' }));
    await sdk.setDoc(ref(db, 'a-cancel'), order('business-a', { status: 'LISTO' }));
    await sdk.setDoc(ref(db, 'a-race'), order('business-a'));
    await sdk.setDoc(ref(db, 'a-table'), order('business-a', { orderType: 'dine_in', tableNumber: 1 }));
    await sdk.setDoc(ref(db, 'a-table-mismatch'), order('business-a', { orderType: 'dine_in', tableNumber: 1 }));
    await sdk.setDoc(ref(db, 'a-table-no-mirror'), order('business-a', { orderType: 'dine_in', tableNumber: 1 }));
    await sdk.setDoc(sdk.doc(db, 'public_table_orders/a-table'), {
      restaurantId: 'business-a', orderId: 'a-table', tableNumber: 1,
      code: 'DEMO-001', status: 'NUEVO', total: 55,
      items: [{ name: 'Producto ficticio', quantity: 1, unitPrice: 55, totalPrice: 55 }],
      createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:00:00.000Z',
    });
    // Espejo corrupto simulado: el ID coincide pero pertenece a B.
    await sdk.setDoc(sdk.doc(db, 'public_table_orders/a-table-mismatch'), {
      restaurantId: 'business-b', orderId: 'a-table-mismatch', tableNumber: 1,
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
  const mirrorRef = sdk.doc(ownerA, 'public_table_orders/a-table');
  assert.equal((await sdk.getDoc(mirrorRef)).data().status, 'PREPARANDO');
  const mainUpdatedAt = (await read(ownerA, 'a-table')).updatedAt;
  assert.equal((await sdk.getDoc(mirrorRef)).data().updatedAt, mainUpdatedAt,
    'La transacción confirma las mismas fechas para pedido y resumen');
  // Una respuesta anterior pudo perderse: repetir el estado debe reparar
  // un espejo rezagado sin reescribir la fecha del pedido principal.
  await env.withSecurityRulesDisabled(async ctx => {
    await sdk.updateDoc(sdk.doc(ctx.firestore(), 'public_table_orders/a-table'), {
      status: 'NUEVO', updatedAt: '2026-10-28T10:00:00.000Z',
    });
  });
  await transition('business-a', 'a-table', 'PREPARANDO', { id: 'owner-a', name: 'Propietario A' });
  assert.equal((await sdk.getDoc(mirrorRef)).data().status, 'PREPARANDO');
  assert.equal((await sdk.getDoc(mirrorRef)).data().updatedAt, mainUpdatedAt);
  assert.equal((await read(ownerA, 'a-table')).updatedAt, mainUpdatedAt);
  await assert.rejects(
    transition('business-a', 'a-table-mismatch', 'PREPARANDO', { id: 'owner-a', name: 'Propietario A' }),
    /resumen de mesa no coincide/,
  );
  assert.equal((await read(ownerA, 'a-table-mismatch')).status, 'NUEVO',
    'Un espejo de otro negocio no permite avanzar el pedido');
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await transition('business-a', 'a-table-no-mirror', 'PREPARANDO', { id: 'owner-a', name: 'Propietario A' });
  } finally {
    console.warn = warn;
  }
  assert.equal((await read(ownerA, 'a-table-no-mirror')).status, 'PREPARANDO');
  assert(warnings.some(line => line.includes('PENDIENTE') && line.includes('a-table-no-mirror')),
    'El espejo ausente debe seguir marcado como pendiente');

  // La regla STAGED de tenants nuevos solo admite cambios de estado.
  // No presentar edición de importes/productos como habilitada hasta revisar reglas.
  as(ownerA);
  globalThis.orderStatusTenant = 'business-a';
  const newTenantSnapshot = { ...(await read(ownerA, 'a-edit-staged')), id: 'a-edit-staged' };
  await expectDenied(() => editOffTable(newTenantSnapshot, { total: 70 }, { id: 'owner-a', name: 'Propietario A' }));
  assert.equal((await read(ownerA, 'a-edit-staged')).total, 55);

  // En Calientito heredado, comprobar edición real, cobro y rechazo posterior.
  as(managerA);
  globalThis.orderStatusTenant = 'alo-restaurante';
  const legacySnapshot = { ...(await read(managerA, 'legacy-edit')), id: 'legacy-edit' };
  await editOffTable(legacySnapshot, { notes: 'Sin cebolla' }, user);
  assert.equal((await read(managerA, 'legacy-edit')).notes, 'Sin cebolla');
  await assert.rejects(editOffTable(legacySnapshot, { total: 1 }, user), /cambió/);
  const beforeCharge = { ...(await read(managerA, 'legacy-pay')), id: 'legacy-pay' };
  await chargeOffTable(beforeCharge, 'tarjeta', user);
  await assert.rejects(editOffTable(beforeCharge, { total: 1 }, user), /Revisa Caja/);
  const charged = await read(managerA, 'legacy-pay');
  assert.equal(charged.total, 55);
  assert.equal(charged.billingStatus, 'PAGADO');

  // Creación atómica: la comanda y el espejo comparten ID y folio.
  const tableInput = (source = 'CAJA', extras = {}) => ({
    orderType: 'dine_in', tableNumber: 1, tableSessionId: 'session-ficticia',
    accountId: 'general', accountLabel: 'General', orderSource: source,
    customerName: 'Cliente ficticio', paymentMethod: 'efectivo',
    bringOwnContainer: false,
    items: [{productId: 'demo', name: 'Producto ficticio', quantity: 1, unitPrice: 55, totalPrice: 55}],
    subtotal: 55, discountAmount: 0, deliveryFee: 0, total: 55, ...extras,
  });
  const aId = 'web_' + 'a'.repeat(32);
  const bId = 'web_' + 'b'.repeat(32);
  as(ownerA);
  const createdA = await createOrder('business-a', tableInput(), aId);
  assert.equal(createdA.id, aId);
  assert.equal((await read(ownerA, aId)).code, createdA.code);
  assert.equal((await sdk.getDoc(sdk.doc(ownerA, 'public_table_orders', aId))).data().code, createdA.code);
  assert.equal((await sdk.getDoc(sdk.doc(ownerA, 'public_table_orders', aId))).data().orderId, aId);
  as(ownerB);
  const createdB = await createOrder('business-b', tableInput(), bId);
  assert.equal(createdB.id, bId);
  assert.equal((await sdk.getDoc(sdk.doc(ownerB, 'public_table_orders', bId))).data().restaurantId, 'business-b');

  // El OWNER de A no puede crear una comanda interna de B.
  as(ownerA);
  await expectDenied(() => createOrder('business-b', tableInput(), 'web_' + 'c'.repeat(32)));
  // La página pública A puede crear; B aún no publicada, no.
  as(anonymous);
  const publicId = 'web_' + 'd'.repeat(32);
  // Misma forma que el checkout público real: QR con mesa, sin sesión ni cuenta
  // de las mesas heredadas de Calientito. La prueba anterior pasaba datos de POS
  // y no demostraba que la pantalla web pudiera crear su resumen.
  const {tableSessionId: _session, accountId: _account, accountLabel: _label, ...publicTableInput} =
    tableInput('CLIENTE_QR', {orderOrigin: 'MESA_QR', notes: 'Mesa 1 · 2 personas'});
  const publicCreated = await createOrder('business-a', publicTableInput, publicId);
  assert.equal(publicCreated.orderType, 'dine_in');
  assert.equal((await read(ownerA, publicId)).orderOrigin, 'MESA_QR');
  const publicMirror = await sdk.getDoc(sdk.doc(anonymous, 'public_table_orders', publicId));
  assert.equal(publicMirror.exists(), true, 'El QR real debe producir resumen de mesa');
  assert.equal(publicMirror.data().orderId, publicId);
  assert.equal(publicMirror.data().code, publicCreated.code);
  assert.equal(publicMirror.data().restaurantId, 'business-a');
  assert.equal(publicMirror.data().tableNumber, 1);
  await expectDenied(() => createOrder('business-b', publicTableInput, 'web_' + 'e'.repeat(32)));
  // Un QR sin mesa sigue siendo pedido para recoger y no crea espejo ficticio.
  const externalId = 'web_' + '1'.repeat(32);
  const externalCreated = await createOrder('business-a', {
    ...publicTableInput, orderType: 'pickup', orderOrigin: 'QR_EXTERNO',
    tableNumber: undefined, notes: 'Pedido externo ficticio',
  }, externalId);
  assert.equal(externalCreated.orderType, 'pickup');
  assert.equal((await read(ownerA, externalId)).orderOrigin, 'QR_EXTERNO');
  assert.equal((await sdk.getDoc(sdk.doc(anonymous, 'public_table_orders', externalId))).exists(), false);
  // Las reglas STAGED limitan los números de mesa: nunca confirmar un pedido
  // sin espejo si el QR señala una mesa no permitida por dichas reglas.
  const invalidPublicId = 'web_' + '2'.repeat(32);
  await expectDenied(() => createOrder('business-a', {...publicTableInput, tableNumber: 3}, invalidPublicId));
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    assert.equal((await sdk.getDoc(ref(db, invalidPublicId))).exists(), false);
    assert.equal((await sdk.getDoc(sdk.doc(db, 'public_table_orders', invalidPublicId))).exists(), false);
  });
  // Mesa inválida: la regla del espejo falla y revierte también el pedido.
  as(ownerA);
  const invalidId = 'web_' + 'f'.repeat(32);
  await expectDenied(() => createOrder('business-a', tableInput('CAJA', {tableNumber: 3}), invalidId));
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    assert.equal((await sdk.getDoc(ref(db, invalidId))).exists(), false,
      'No debe existir pedido principal si falla el espejo');
    assert.equal((await sdk.getDoc(sdk.doc(db, 'public_table_orders', invalidId))).exists(), false);
  });
  // Un ID ya usado no debe reemplazar ni pedido ni espejo.
  await expectDenied(() => createOrder('business-a', tableInput('CAJA', {total: 999}), aId));
  assert.equal((await read(ownerA, aId)).total, 55);
  assert.equal((await sdk.getDoc(sdk.doc(ownerA, 'public_table_orders', aId))).data().total, 55);

  console.log('PASS: servicio real + Firestore Emulator: estados y cobro; creación atómica de mesa A/B, cliente público, rechazo y rollback.');
} finally {
  globalThis.orderStatusDb = null;
  await env.cleanup();
}
