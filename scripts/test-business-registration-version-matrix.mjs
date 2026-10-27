/**
 * Paso 2: matriz de compatibilidad de clientes y reglas de alta.
 * Solo Firebase Emulator y reglas derivadas en memoria. No modifica
 * registerBusiness, staged rules, datos reales ni despliega reglas.
 *
 * Cliente actual = negocio + OWNER (2 documentos).
 * Candidato = negocio + OWNER + reserva permanente (3 documentos).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { buildAtomicOwnerAndPermanentHandleProposalRules, buildRegistrationFreezeProposalRules } from './owner-atomic-proposal-rules.mjs';

const projectId = 'gioteautomatizo-registration-version-matrix-test';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'Esta prueba requiere Firestore Emulator aislado; nunca usar Firestore real.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposed = buildAtomicOwnerAndPermanentHandleProposalRules(staged);
const frozen = buildRegistrationFreezeProposalRules(staged);
const phase = process.argv[2];
assert(['staged', 'freeze-before', 'candidate', 'freeze-after', 'rollback'].includes(phase),
  'Indicar fase staged, candidate o rollback dentro del mismo emulador.');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules: phase === 'candidate' ? proposed : phase.startsWith('freeze-') ? frozen : staged, host: '127.0.0.1', port: 8080 },
});
const signed = uid => env.authenticatedContext(uid).firestore();
const business = (id, uid) => ({
  restaurantId: id, ownerUserId: uid, branding: { restaurantName: id },
});
const membership = (id, uid) => ({
  restaurantId: id, userId: uid, role: 'OWNER', active: true,
});
const reservation = (id, uid) => ({ businessId: id, ownerUserId: uid });
const root = id => 'businesses/' + id;
const owner = (id, uid) => 'businessMemberships/' + id + '_' + uid;
const handle = id => 'businessHandleReservations/' + id;
const catalog = id => 'businesses/' + id + '/catalog/menu_catalog';
const profile = id => 'publicBusinessProfiles/' + id;
const orderPath = code => 'restaurant_orders/' + code;
const publicOrder = (id, code) => ({
  restaurantId: id, code, status: 'NUEVO', billingStatus: 'PENDIENTE',
  orderType: 'pickup', orderSource: 'CLIENTE_QR',
  customerName: 'Comprador ficticio', paymentMethod: 'efectivo',
  items: [{ name: 'Producto sintético', quantity: 1, unitPrice: 10, totalPrice: 10 }],
  subtotal: 10, discountAmount: 0, deliveryFee: 0, total: 10,
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
});
const publishedProfile = id => ({
  businessId: id, restaurantId: id, businessType: 'restaurant',
  branding: { restaurantName: id }, published: true,
  updatedAt: '2026-10-27T00:00:00.000Z',
});
const staffMembership = (id, role) => ({
  restaurantId: id, userId: 'matrix-staff', role, active: true,
});

function registration(db, id, uid, version) {
  const batch = writeBatch(db);
  batch.set(doc(db, root(id)), business(id, uid));
  batch.set(doc(db, owner(id, uid)), membership(id, uid));
  if (version === 3) batch.set(doc(db, handle(id)), reservation(id, uid));
  return batch.commit();
}

async function assertNoPartialDocuments(paths, label) {
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    for (const path of paths) {
      const snap = await getDoc(doc(admin, path));
      assert.equal(snap.exists(), false, label + ': ' + path);
    }
  });
}

try {
  const alice = signed('matrix-alice');
  const bob = signed('matrix-bob');
  const staff = signed('matrix-staff');
  const visitor = env.unauthenticatedContext().firestore();
  const legacyId = 'matrix-legacy-two-docs';
  const stagedThreeId = 'matrix-staged-three-docs';
  const proposedThreeId = 'matrix-proposed-three-docs';

  if (phase === 'staged') {
  // Fase 1: staged acepta el cliente vigente, pero rechaza el futuro batch
  // de tres documentos porque no tiene permiso de crear reservas.
  await assertSucceeds(registration(alice, legacyId, 'matrix-alice', 2));
  await assertSucceeds(getDoc(doc(alice, root(legacyId))));
  await assertNoPartialDocuments([handle(legacyId)], 'staged no crea reserva');
  // Datos y empleado reales del tenant legado antes de congelar altas.
  await assertSucceeds(setDoc(doc(alice, catalog(legacyId)), {
    businessId: legacyId, items: [{ id: 'legacy', price: 12 }],
  }));
  await assertSucceeds(setDoc(doc(alice, owner(legacyId, 'matrix-staff')),
    staffMembership(legacyId, 'KITCHEN')));
  await assertSucceeds(getDoc(doc(staff, catalog(legacyId))));
  await assertFails(getDoc(doc(bob, catalog(legacyId))));
  await assertFails(getDoc(doc(visitor, catalog(legacyId))));
  await assertFails(registration(bob, stagedThreeId, 'matrix-bob', 3));
  await assertNoPartialDocuments([
    root(stagedThreeId), owner(stagedThreeId, 'matrix-bob'), handle(stagedThreeId),
  ], 'staged rechaza los tres documentos sin escritura parcial');

  console.log('PASS fase staged: cliente de dos documentos aceptado; tres rechazado sin escrituras parciales.');
  } else if (phase === 'freeze-before') {
  // Puerta fail-closed antes de cambiar el contrato: nadie puede registrar
  // con dos ni tres documentos, pero el OWNER existente sigue operando.
  await assertSucceeds(getDoc(doc(alice, root(legacyId))));
  await assertSucceeds(updateDoc(doc(alice, root(legacyId)), {
    'branding.restaurantName': 'Legado activo durante congelación',
  }));
  await assertFails(deleteDoc(doc(alice, root(legacyId))));
  await assertSucceeds(getDoc(doc(alice, root(legacyId))));
  // Congelar el registro NO debe bloquear el catálogo privado de un negocio
  // ya existente, ni conceder permisos de edición a empleados u otros dueños.
  await assertSucceeds(updateDoc(doc(alice, catalog(legacyId)), {
    items: [{ id: 'legacy', price: 15 }],
  }));
  assert.equal((await getDoc(doc(staff, catalog(legacyId)))).data()?.items?.[0]?.price, 15);
  await assertFails(updateDoc(doc(staff, catalog(legacyId)), { items: [] }));
  await assertFails(getDoc(doc(bob, catalog(legacyId))));
  await assertFails(updateDoc(doc(bob, catalog(legacyId)), { items: [] }));
  await assertFails(getDoc(doc(visitor, catalog(legacyId))));

  // La congelación de altas no debe interrumpir pedidos de negocios existentes.
  // Un visitante no puede pedir antes de la publicación ni consultar Pedidos.
  const beforePublish = 'matrix-a-unpublished';
  await assertFails(setDoc(doc(visitor, orderPath(beforePublish)),
    publicOrder(legacyId, beforePublish)));
  await assertNoPartialDocuments([orderPath(beforePublish)],
    'un negocio oculto no recibe pedido público');
  await assertSucceeds(setDoc(doc(alice, profile(legacyId)), publishedProfile(legacyId)));
  await assertSucceeds(getDoc(doc(visitor, catalog(legacyId))));
  const firstOrder = 'matrix-a-freeze-before-order';
  await assertSucceeds(setDoc(doc(visitor, orderPath(firstOrder)),
    publicOrder(legacyId, firstOrder)));
  await assertSucceeds(getDoc(doc(alice, orderPath(firstOrder))));
  await assertSucceeds(getDoc(doc(staff, orderPath(firstOrder))));
  await assertFails(getDoc(doc(bob, orderPath(firstOrder))));
  await assertFails(getDoc(doc(visitor, orderPath(firstOrder))));
  await assertSucceeds(updateDoc(doc(staff, orderPath(firstOrder)), {
    status: 'PREPARANDO', updatedAt: '2026-10-27T00:01:00.000Z',
  }));
  await assertFails(updateDoc(doc(staff, orderPath(firstOrder)), { total: 0 }));
  await assertFails(updateDoc(doc(staff, orderPath(firstOrder)), { billingStatus: 'PAGADO' }));
  await assertFails(updateDoc(doc(bob, orderPath(firstOrder)), { status: 'LISTO' }));
  await assertFails(updateDoc(doc(visitor, orderPath(firstOrder)), { status: 'LISTO' }));
  assert.equal((await getDoc(doc(alice, orderPath(firstOrder)))).data()?.status, 'PREPARANDO');
  console.log('PASS pedidos freeze-before: alta cerrada, publicación A, pedido público, gestión KITCHEN y dinero protegido.');

  for (const version of [2, 3]) {
    const id = 'matrix-freeze-before-' + version;
    await assertFails(registration(bob, id, 'matrix-bob', version));
    await assertNoPartialDocuments([
      root(id), owner(id, 'matrix-bob'), handle(id),
    ], 'congelación previa rechaza cliente ' + version);
  }
  console.log('PASS fase freeze-before: alta 2/3 bloqueada, sin parciales; legado editable, borrado cliente denegado.');
  } else if (phase === 'candidate') {
  // Fase 2: el mismo emulador conserva los documentos de la fase anterior.
  // Se cargan reglas candidatas SOLO para este proceso de prueba.
  // Un negocio histórico sin reserva no se protege automáticamente.
  await assertSucceeds(getDoc(doc(alice, root(legacyId))));
  await assertFails(getDoc(doc(bob, root(legacyId))));
  await assertFails(setDoc(doc(alice, handle(legacyId)),
    reservation(legacyId, 'matrix-alice')));
  await assertNoPartialDocuments([handle(legacyId)],
    'histórico no queda protegido automáticamente');

  const proposedTwoId = 'matrix-proposed-two-docs';
  await assertFails(registration(alice, proposedTwoId, 'matrix-alice', 2));
  await assertNoPartialDocuments([
    root(proposedTwoId), owner(proposedTwoId, 'matrix-alice'), handle(proposedTwoId),
  ], 'propuesta rechaza cliente vigente sin escritura parcial');

  await assertSucceeds(registration(bob, proposedThreeId, 'matrix-bob', 3));
  await assertSucceeds(getDoc(doc(bob, root(proposedThreeId))));
  await assertFails(getDoc(doc(alice, root(proposedThreeId))));
  await assertFails(getDoc(doc(bob, handle(proposedThreeId))));
  await assertSucceeds(setDoc(doc(bob, catalog(proposedThreeId)), {
    businessId: proposedThreeId, items: [{ id: 'candidate', price: 22 }],
  }));
  await assertSucceeds(setDoc(doc(bob, owner(proposedThreeId, 'matrix-staff')),
    staffMembership(proposedThreeId, 'WAITER')));
  await assertSucceeds(getDoc(doc(staff, catalog(legacyId))));
  await assertSucceeds(getDoc(doc(staff, catalog(proposedThreeId))));
  await assertFails(getDoc(doc(alice, catalog(proposedThreeId))));
  await assertFails(getDoc(doc(bob, catalog(legacyId))));
  await assertFails(getDoc(doc(visitor, catalog(proposedThreeId))));
  // El cambio a reglas candidatas no debe cortar pedidos del legado publicado.
  const candidateOrder = 'matrix-a-candidate-order';
  await assertSucceeds(setDoc(doc(visitor, orderPath(candidateOrder)),
    publicOrder(legacyId, candidateOrder)));
  await assertSucceeds(getDoc(doc(alice, orderPath(candidateOrder))));
  await assertFails(getDoc(doc(bob, orderPath(candidateOrder))));
  const unpublishedB = 'matrix-b-candidate-unpublished';
  await assertFails(setDoc(doc(visitor, orderPath(unpublishedB)),
    publicOrder(proposedThreeId, unpublishedB)));
  await assertNoPartialDocuments([orderPath(unpublishedB)],
    'negocio candidato no publicado rechaza pedido público');
  await env.withSecurityRulesDisabled(async context => {
    const snap = await getDoc(doc(context.firestore(), handle(proposedThreeId)));
    assert.equal(snap.data()?.ownerUserId, 'matrix-bob');
  });

  console.log('PASS fase candidate: cliente de tres documentos aceptado; dos rechazado; histórico sin backfill no protegido.');
  } else if (phase === 'freeze-after') {
  // Reversión hacia una puerta cerrada, NO a staged abierto. Los negocios
  // candidatos y sus reservas siguen presentes y sus OWNER pueden operar.
  await assertSucceeds(getDoc(doc(alice, root(legacyId))));
  await assertSucceeds(getDoc(doc(bob, root(proposedThreeId))));
  await assertFails(getDoc(doc(alice, root(proposedThreeId))));
  await assertSucceeds(updateDoc(doc(bob, root(proposedThreeId)), {
    'branding.restaurantName': 'Candidato activo durante reversión',
  }));
  await assertFails(deleteDoc(doc(bob, root(proposedThreeId))));
  await assertSucceeds(getDoc(doc(bob, root(proposedThreeId))));
  await assertFails(getDoc(doc(bob, handle(proposedThreeId))));
  // Segunda congelación: preservar operación de ambos tenants y los dos
  // roles de una misma cuenta, sin habilitar edición cruzada ni nuevas altas.
  await assertSucceeds(updateDoc(doc(bob, catalog(proposedThreeId)), {
    items: [{ id: 'candidate', price: 24 }],
  }));
  assert.equal((await getDoc(doc(staff, catalog(proposedThreeId)))).data()?.items?.[0]?.price, 24);
  assert.equal((await getDoc(doc(staff, catalog(legacyId)))).data()?.items?.[0]?.price, 15);
  await assertFails(updateDoc(doc(staff, catalog(proposedThreeId)), { items: [] }));
  await assertFails(updateDoc(doc(alice, catalog(proposedThreeId)), { items: [] }));
  await assertFails(updateDoc(doc(bob, catalog(legacyId)), { items: [] }));
  await assertFails(getDoc(doc(visitor, catalog(proposedThreeId))));
  // Un OWNER de negocio existente puede publicar incluso durante la puerta
  // de altas cerrada; solo entonces el catálogo pasa a lectura pública.
  await assertSucceeds(setDoc(doc(bob, profile(proposedThreeId)), {
    businessId: proposedThreeId, restaurantId: proposedThreeId,
    businessType: 'restaurant', branding: { restaurantName: 'Candidato B' },
    published: true, updatedAt: '2026-10-27T00:00:00.000Z',
  }));
  await assertSucceeds(getDoc(doc(visitor, profile(proposedThreeId))));
  await assertSucceeds(getDoc(doc(visitor, catalog(proposedThreeId))));
  await assertSucceeds(getDoc(doc(visitor, catalog(legacyId))));
  // Segunda congelación: A y B siguen recibiendo pedidos públicos y los
  // empleados compartidos ven/gestionan solo los tenants autorizados.
  const orderA = 'matrix-a-freeze-after-order';
  const orderB = 'matrix-b-freeze-after-order';
  await assertSucceeds(setDoc(doc(visitor, orderPath(orderA)),
    publicOrder(legacyId, orderA)));
  await assertSucceeds(setDoc(doc(visitor, orderPath(orderB)),
    publicOrder(proposedThreeId, orderB)));
  await assertSucceeds(getDoc(doc(alice, orderPath(orderA))));
  await assertSucceeds(getDoc(doc(bob, orderPath(orderB))));
  await assertSucceeds(getDoc(doc(staff, orderPath(orderA))));
  await assertSucceeds(getDoc(doc(staff, orderPath(orderB))));
  await assertFails(getDoc(doc(alice, orderPath(orderB))));
  await assertFails(getDoc(doc(bob, orderPath(orderA))));
  await assertFails(getDoc(doc(visitor, orderPath(orderA))));
  await assertFails(getDoc(doc(visitor, orderPath(orderB))));
  await assertSucceeds(updateDoc(doc(staff, orderPath(orderA)), {
    status: 'PREPARANDO', updatedAt: '2026-10-27T00:02:00.000Z',
  }));
  await assertSucceeds(updateDoc(doc(bob, orderPath(orderB)), {
    status: 'LISTO', updatedAt: '2026-10-27T00:03:00.000Z',
  }));
  await assertFails(updateDoc(doc(alice, orderPath(orderB)), { status: 'CANCELADO' }));
  await assertFails(updateDoc(doc(bob, orderPath(orderA)), { status: 'CANCELADO' }));
  await assertFails(updateDoc(doc(staff, orderPath(orderB)), { total: 0 }));
  await assertFails(updateDoc(doc(staff, orderPath(orderB)), { billingStatus: 'PAGADO' }));
  await assertFails(updateDoc(doc(visitor, orderPath(orderB)), { status: 'ENTREGADO' }));
  assert.equal((await getDoc(doc(bob, orderPath(orderB)))).data()?.status, 'LISTO');
  console.log('PASS pedidos freeze-after: A/B reciben, gestión por tenant, sin lectura cruzada ni cobros manipulados.');
  await env.withSecurityRulesDisabled(async context => {
    const snap = await getDoc(doc(context.firestore(), handle(proposedThreeId)));
    assert.equal(snap.data()?.ownerUserId, 'matrix-bob',
      'reversión congelada preserva la reserva inmutable');
  });

  for (const version of [2, 3]) {
    const id = 'matrix-freeze-after-' + version;
    await assertFails(registration(alice, id, 'matrix-alice', version));
    await assertNoPartialDocuments([
      root(id), owner(id, 'matrix-alice'), handle(id),
    ], 'reversión congelada rechaza cliente ' + version);
  }
  console.log('PASS fase freeze-after: sin altas 2/3, sin parciales, datos y reservas conservados.');
  } else {
  // Fase 5: reversión INSEGURA intencional como diagnóstico, no como plan.
  // Los datos candidatos sobreviven, pero los clientes de tres documentos
  // vuelven a fallar y los antiguos pueden crear altas sin reserva.
  await assertSucceeds(getDoc(doc(bob, root(proposedThreeId))));
  const rollbackThreeId = 'matrix-rollback-three-docs';
  await assertFails(registration(bob, rollbackThreeId, 'matrix-bob', 3));
  await assertNoPartialDocuments([
    root(rollbackThreeId), owner(rollbackThreeId, 'matrix-bob'), handle(rollbackThreeId),
  ], 'rollback rechaza cliente candidato sin escritura parcial');
  const rollbackTwoId = 'matrix-rollback-two-docs';
  await assertSucceeds(registration(alice, rollbackTwoId, 'matrix-alice', 2));
  await assertNoPartialDocuments([handle(rollbackTwoId)],
    'rollback permite otra alta sin reserva');

  console.log('PASS fase rollback (solo emulador): staged acepta de nuevo 2/rechaza 3; datos candidatos sobreviven.');
  }
  console.warn('PENDIENTE: la congelación ensayada impide altas (no habilita convivencia de clientes); exige plan operativo, revisión independiente y autorización antes de desplegar.');
  console.warn('PENDIENTE: la reversión simple a staged sigue permitiendo altas sin reserva; NO utilizarla como rollback de seguridad.');
  console.warn('PENDIENTE: negocios históricos sin reserva siguen desprotegidos ante borrados privilegiados; backfill requiere inventario, respaldo, revisión y autorización.');
} finally {
  await env.cleanup();
}
