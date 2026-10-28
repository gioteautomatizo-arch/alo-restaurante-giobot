/**
 * Paso 2: reproducción aislada de traslado entre tenants y propuesta de cierre.
 * SOLO Firestore Emulator, dos negocios ficticios, sin reglas desplegadas.
 * El diagnóstico STAGED que permite el traslado es un BLOQUEO, no un PASS de seguridad.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { buildTenantUpdateIsolationProposalRules } from './tenant-update-isolation-proposal.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: requiere Firestore Emulator local, nunca Firebase real.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposed = buildTenantUpdateIsolationProposalRules(staged);
assert.notEqual(proposed, staged);
for (const path of ['staff_users', 'shifts', 'expenses', 'cxc_records',
  'inventory_items', 'sobre_movements', 'daily_menu', 'tables',
  'table_sessions', 'table_service_requests', 'public_table_orders', 'restaurant_orders']) {
  assert(proposed.includes('match /' + path + '/{'), 'Falta ruta ' + path);
}
const a = 'beta-tenant-a';
const b = 'beta-tenant-b';
const fixtures = [
  ['staff_users', { name: 'Persona ficticia', role: 'MESERO' }, { name: 'Actualizado' }],
  ['shifts', { status: 'abierto', initialCashFund: 0 }, { status: 'cerrado' }],
  ['expenses', { concept: 'Insumo ficticio', amount: 10 }, { amount: 11 }],
  ['cxc_records', { person: 'Cliente ficticio', amount: 10, status: 'Pendiente' }, { amount: 11 }],
  ['inventory_items', { name: 'Ingrediente ficticio' }, { name: 'Ingrediente actualizado' }],
  ['sobre_movements', { amount: 10 }, { amount: 11 }],
  ['daily_menu', { name: 'Platillo ficticio' }, { name: 'Platillo actualizado' }],
];
const nestedModules = ['shifts', 'expenses', 'vault', 'receivables', 'payables', 'auditLog'];
const nestedDeletable = ['expenses', 'vault', 'receivables', 'payables'];
const nestedRef = (db, tenant, moduleCol, name) =>
  doc(db, 'businesses', tenant, moduleCol, name);
const nestedQuery = (db, tenant, moduleCol) =>
  query(collection(db, 'businesses', tenant, moduleCol), where('businessId', '==', tenant));
const table = id => ({
  restaurantId: id, tableId: 'table-' + id, tableNumber: 1, status: 'LIBRE',
});
const session = id => ({
  restaurantId: id, tableNumber: 1, guestCount: 1,
  accountMode: 'GENERAL', accounts: [{ id: 'general', label: 'General' }],
  status: 'CERRADA', openedBy: 'QR', openedAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
});
const sessionReopen = id => ({
  restaurantId: id, tableNumber: 1, guestCount: 2,
  accountMode: 'GENERAL', accounts: [{ id: 'general', label: 'General' }],
  status: 'ACTIVA', openedBy: 'QR', openedAt: '2026-10-27T00:01:00.000Z',
  updatedAt: '2026-10-27T00:01:00.000Z',
});

async function runScenario(rules, diagnostic) {
  const env = await initializeTestEnvironment({
    projectId: 'gioteautomatizo-tenant-update-isolation-test',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      for (const [id, uid] of [[a, 'alice'], [b, 'bob']]) {
        await setDoc(doc(db, 'businesses', id), { restaurantId: id, ownerUserId: uid });
        await setDoc(doc(db, 'businessMemberships', id + '_' + uid),
          { restaurantId: id, userId: uid, role: 'OWNER', active: true });
        // Bob también colabora en A: ni un usuario con acceso a ambos tenants
        // puede reasignar un documento de B a A.
        if (id === a) await setDoc(doc(db, 'businessMemberships', a + '_bob'),
          { restaurantId: a, userId: 'bob', role: 'WAITER', active: true });
        for (const [collection, fields] of fixtures) {
          await setDoc(doc(db, collection, id + '-record'), { restaurantId: id, ...fields });
        }
        for (const moduleCol of nestedModules) {
          await setDoc(nestedRef(db, id, moduleCol, 'valid'), {
            businessId: id, amount: 10, actorId: uid, action: 'CREATED',
          });
          if (id === a) {
            // Un histórico sin businessId queda fuera de consultas filtradas.
            await setDoc(nestedRef(db, a, moduleCol, 'missing-id'), {
              amount: 10, actorId: uid, action: 'CREATED',
            });
            // Datos mal asociados sembrados por el emulador administrador:
            // el dueño A no debe apropiarse de una ficha que declara B.
            for (const name of ['misrouted-update', 'misrouted-delete']) {
              await setDoc(nestedRef(db, a, moduleCol, name), {
                businessId: b, amount: 10, actorId: uid, action: 'CREATED',
              });
            }
          }
        }
        await setDoc(doc(db, 'tables', id + '-table'), table(id));
        await setDoc(doc(db, 'table_sessions', id + '-session'), session(id));
        await setDoc(doc(db, 'table_service_requests', id + '-request'), {
          restaurantId: id, status: 'PENDIENTE', tableNumber: 1,
          requestType: 'LLAMAR_MESERO', createdAt: '2026-10-27T00:00:00.000Z',
        });
        await setDoc(doc(db, 'public_table_orders', id + '-order'), {
          restaurantId: id, orderId: id + '-order', tableNumber: 1,
          code: id + '-code', items: [{ name: 'Prueba', quantity: 1 }],
          total: 10, status: 'NUEVO', createdAt: '2026-10-27T00:00:00.000Z',
          updatedAt: '2026-10-27T00:00:00.000Z',
        });
      }
      await setDoc(doc(db, 'restaurant_orders', 'legacy-order'), {
        restaurantId: 'alo-restaurante', code: 'legacy-order', status: 'NUEVO',
        items: [{ name: 'Prueba', quantity: 1 }], total: 10,
      });
    });
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const visitor = env.unauthenticatedContext().firestore();
    const expenseB = doc(alice, 'expenses', b + '-record');
    const tableB = doc(visitor, 'tables', b + '-table');
    const sessionB = doc(visitor, 'table_sessions', b + '-session');
    const serviceB = doc(bob, 'table_service_requests', b + '-request');
    const publicOrderB = doc(bob, 'public_table_orders', b + '-order');
    const legacyOrder = doc(bob, 'restaurant_orders', 'legacy-order');
    if (diagnostic) {
      await assertSucceeds(updateDoc(expenseB, { restaurantId: a, amount: 999 }));
      await assertSucceeds(updateDoc(tableB, { restaurantId: a, status: 'OCUPADA' }));
      await assertSucceeds(updateDoc(sessionB, sessionReopen(a)));
      await assertSucceeds(updateDoc(serviceB, { restaurantId: a }));
      await assertSucceeds(updateDoc(publicOrderB, { restaurantId: a }));
      await assertSucceeds(updateDoc(legacyOrder, { restaurantId: b }));
      for (const moduleCol of nestedModules) {
        const wrong = nestedRef(alice, a, moduleCol, 'misrouted-update');
        const missing = nestedRef(alice, a, moduleCol, 'missing-id');
        await assertSucceeds(getDoc(wrong));
        await assertSucceeds(getDoc(missing));
        const unfiltered = await assertSucceeds(getDocs(collection(alice, 'businesses', a, moduleCol)));
        assert.equal(unfiltered.size, 4, 'STAGED expone documentos mal asociados: ' + moduleCol);
        if (moduleCol !== 'auditLog') {
          await assertSucceeds(updateDoc(nestedRef(alice, a, moduleCol, 'misrouted-update'),
            { businessId: a, amount: 99 }));
        }
        if (nestedDeletable.includes(moduleCol)) {
          await assertSucceeds(deleteDoc(nestedRef(alice, a, moduleCol, 'misrouted-delete')));
        }
      }
      console.warn('PENDIENTE SEGURIDAD STAGED: traslados entre tenants permitidos en gasto, mesa, sesión, solicitud, orden de mesa y pedido legado (solo emulador).');
      console.warn('PENDIENTE SEGURIDAD STAGED: módulos anidados mal asociados permiten reclamo y borrado por el tenant de la ruta (solo emulador).');
      console.warn('PENDIENTE LECTURA STAGED: A puede leer documentos anidados que declaran B o carecen de businessId (solo emulador).');
      return;
    }
    for (const [collection, , patch] of fixtures) {
      const idB = collection + '/' + b + '-record';
      const idA = collection + '/' + a + '-record';
      await assertFails(updateDoc(doc(alice, idB), { restaurantId: a, ...patch }));
      await assertFails(updateDoc(doc(bob, idB), { restaurantId: a, ...patch }));
      await assertSucceeds(updateDoc(doc(bob, idB), patch));
      await assertSucceeds(updateDoc(doc(alice, idA), patch));
      if (collection !== 'daily_menu') await assertFails(getDoc(doc(alice, idB)));
      const snap = await assertSucceeds(getDoc(doc(bob, idB)));
      assert.equal(snap.data()?.restaurantId, b, collection + ' conserva tenant B');
    }
    await assertFails(updateDoc(tableB, { restaurantId: a, status: 'OCUPADA' }));
    await assertSucceeds(updateDoc(tableB, { restaurantId: b, status: 'OCUPADA' }));
    await assertFails(updateDoc(sessionB, sessionReopen(a)));
    await assertSucceeds(updateDoc(sessionB, sessionReopen(b)));
    await assertFails(updateDoc(serviceB, { restaurantId: a }));
    await assertSucceeds(updateDoc(serviceB, { status: 'ATENDIDA' }));
    await assertFails(updateDoc(publicOrderB, { restaurantId: a }));
    await assertSucceeds(updateDoc(publicOrderB, { status: 'PREPARANDO' }));
    await assertFails(updateDoc(legacyOrder, { restaurantId: b }));
    await assertSucceeds(updateDoc(legacyOrder, { status: 'PREPARANDO' }));
    assert.equal((await getDoc(doc(bob, 'tables', b + '-table'))).data()?.restaurantId, b);
    assert.equal((await getDoc(doc(bob, 'table_sessions', b + '-session'))).data()?.restaurantId, b);
    for (const moduleCol of nestedModules) {
      // La consulta debe probar que solo puede devolver businessId=A.
      await assertFails(getDoc(nestedRef(alice, a, moduleCol, 'misrouted-update')));
      await assertFails(getDoc(nestedRef(alice, a, moduleCol, 'missing-id')));
      await assertFails(getDoc(nestedRef(bob, a, moduleCol, 'valid')));
      await assertFails(getDocs(collection(alice, 'businesses', a, moduleCol)));
      const onlyA = await assertSucceeds(getDocs(nestedQuery(alice, a, moduleCol)));
      assert.deepEqual(onlyA.docs.map(d => d.id), ['valid'], 'Filtro A: ' + moduleCol);
      const onlyB = await assertSucceeds(getDocs(nestedQuery(bob, b, moduleCol)));
      assert.deepEqual(onlyB.docs.map(d => d.id), ['valid'], 'Filtro B: ' + moduleCol);
      await assertFails(getDocs(nestedQuery(alice, b, moduleCol)));
      const misroutedUpdate = nestedRef(alice, a, moduleCol, 'misrouted-update');
      const misroutedDelete = nestedRef(alice, a, moduleCol, 'misrouted-delete');
      const validA = nestedRef(alice, a, moduleCol, 'valid');
      const validB = nestedRef(bob, b, moduleCol, 'valid');
      if (moduleCol !== 'auditLog') {
        await assertFails(updateDoc(misroutedUpdate, { businessId: a, amount: 99 }));
        await assertFails(updateDoc(validA, { businessId: b }));
        await assertFails(updateDoc(nestedRef(alice, b, moduleCol, 'valid'), { amount: 99 }));
        await assertSucceeds(updateDoc(validA, { amount: 11 }));
        await assertSucceeds(updateDoc(validB, { amount: 12 }));
      } else {
        await assertFails(updateDoc(validA, { amount: 11 }));
      }
      if (nestedDeletable.includes(moduleCol)) {
        await assertFails(deleteDoc(misroutedDelete));
        await assertFails(deleteDoc(nestedRef(alice, b, moduleCol, 'valid')));
        await assertSucceeds(deleteDoc(validA));
        await assertSucceeds(deleteDoc(validB));
      } else {
        await assertFails(deleteDoc(validA)); // shifts y auditLog nunca se borran
      }
    }
    console.log('PASS propuesta aislada: 12 rutas raíz y 6 módulos anidados protegidos; reclamo/borrado cruzado negados y operaciones legítimas A/B conservadas.');
    console.log('PASS lectura propuesta aislada: get de documentos mal asociados negado, listas sin filtro negadas y consultas businessId A/B autorizadas.');
  } finally {
    await env.clearFirestore();
    await env.cleanup();
  }
}

await runScenario(staged, true);
await runScenario(proposed, false);
console.warn('PENDIENTE: reglas STAGED/desplegadas NO corregidas; falta revisión independiente y autorización de migración. No publicar.');
