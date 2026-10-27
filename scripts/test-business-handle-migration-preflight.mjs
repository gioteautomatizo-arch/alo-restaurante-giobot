import assert from 'node:assert/strict';
import { auditHistoricalHandles } from './business-handle-migration-preflight.mjs';

const root = (id, owner) => ({ path: 'businesses/' + id,
  data: { restaurantId: id, ownerUserId: owner } });
const member = (id, uid, role = 'OWNER', active = true) => ({
  path: 'businessMemberships/' + id + '_' + uid,
  data: { restaurantId: id, userId: uid, role, active },
});
const reservation = (id, uid) => ({ path: 'businessHandleReservations/' + id,
  data: { businessId: id, ownerUserId: uid } });
const catalog = id => ({ path: 'businesses/' + id + '/catalog/menu_catalog',
  data: { items: [{ id: 'old-secret' }] } });
const inventory = (records, complete = true) => ({
  scope: 'business-identifier-inventory', complete, records,
});
const single = records => auditHistoricalHandles(inventory(records)).businesses[0];
const hasReason = (result, reason) => assert(result.reasons.includes(reason), reason);

// No se crea reserva ni se asigna propietario: solo se proponen revisiones.
const clean = single([root('alpha', 'alice'), member('alpha', 'alice')]);
assert.equal(clean.status, 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW');
assert.equal(clean.hasReservation, false);
const already = single([root('alpha', 'alice'), member('alpha', 'alice'),
  reservation('alpha', 'alice')]);
assert.equal(already.status, 'EXISTING_RESERVATION_REVIEW');
assert.equal(already.hasReservation, true);

const wrongReserve = single([root('alpha', 'alice'), member('alpha', 'alice'),
  reservation('alpha', 'bob')]);
assert.equal(wrongReserve.status, 'HOLD_MANUAL_REVIEW');
hasReason(wrongReserve, 'RESERVATION_OWNER_CONFLICT');

const orphan = single([member('alpha', 'alice'), catalog('alpha')]);
assert.equal(orphan.status, 'HOLD_MANUAL_REVIEW');
assert.equal(orphan.hasResidualData, true);
hasReason(orphan, 'MISSING_BUSINESS_ROOT');

const missingOwner = single([root('alpha', undefined), member('alpha', 'alice')]);
hasReason(missingOwner, 'INVALID_ROOT_OWNER_OR_ID');
assert.equal(missingOwner.status, 'HOLD_MANUAL_REVIEW');

const competing = single([root('alpha', 'alice'), member('alpha', 'alice'),
  member('alpha', 'bob')]);
hasReason(competing, 'FOREIGN_OWNER_MEMBERSHIP');
hasReason(competing, 'OWNER_MEMBERSHIP_NOT_UNIQUE_AND_ACTIVE');

const inactive = single([root('alpha', 'alice'), member('alpha', 'alice', 'OWNER', false)]);
hasReason(inactive, 'OWNER_MEMBERSHIP_NOT_UNIQUE_AND_ACTIVE');

const malformed = single([root('alpha', 'alice'), { ...member('alpha', 'alice'),
  path: 'businessMemberships/alpha_wrong-key' }]);
hasReason(malformed, 'MALFORMED_MEMBERSHIP');

const duplicate = single([root('alpha', 'alice'), root('alpha', 'alice'),
  member('alpha', 'alice')]);
hasReason(duplicate, 'DUPLICATE_DOCUMENT_PATH');

const crossTenantKey = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), member('alpha', 'alice'),
  { ...member('alpha', 'alice'), path: 'businessMemberships/beta_alice' },
]));
assert(crossTenantKey.globalBlockers.includes('MEMBERSHIP_PATH_TENANT_MISMATCH'));
assert.equal(crossTenantKey.businesses[0].status, 'BLOCKED_INCOMPLETE_INVENTORY');

const duplicateMember = single([root('alpha', 'alice'),
  member('alpha', 'alice'), member('alpha', 'alice')]);
hasReason(duplicateMember, 'DUPLICATE_DOCUMENT_PATH');

const malformedReservation = single([root('alpha', 'alice'), member('alpha', 'alice'),
  { ...reservation('alpha', 'alice'), data: { businessId: 'alpha', ownerUserId: 'alice', writable: true } }]);
hasReason(malformedReservation, 'INVALID_RESERVATION');

const incomplete = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), member('alpha', 'alice'),
], false));
assert.equal(incomplete.businesses[0].status, 'BLOCKED_INCOMPLETE_INVENTORY');
assert(incomplete.globalBlockers.includes('INVENTORY_NOT_CERTIFIED_COMPLETE'));

const unknown = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), member('alpha', 'alice'),
  { path: 'someOtherPrivateCollection/alpha', data: {} },
]));
assert.equal(unknown.businesses[0].status, 'BLOCKED_INCOMPLETE_INVENTORY');
assert(unknown.globalBlockers.includes('UNKNOWN_PATH_SCOPE'));

const badMembership = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), member('alpha', 'alice'),
  { path: 'businessMemberships/unknown', data: { userId: 'bob', role: 'OWNER' } },
]));
assert.equal(badMembership.businesses[0].status, 'BLOCKED_INCOMPLETE_INVENTORY');
assert(badMembership.globalBlockers.includes('MEMBERSHIP_WITHOUT_TENANT'));

const empty = auditHistoricalHandles(inventory([]));
assert(empty.globalBlockers.includes('EMPTY_INVENTORY_NOT_PROOF_OF_UNUSED_IDS'));
assert.equal(empty.counts.total, 0);

const result = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), member('alpha', 'alice'),
  root('beta', 'bob'), member('beta', 'bob'), reservation('beta', 'bob'),
]));
assert.equal(result.mode, 'READ_ONLY_NO_FIREBASE_NO_WRITES');
assert.equal(result.safeToApplyAutomatically, false);
assert.equal(result.counts.total, 2);
assert.equal(result.counts.manualCandidates, 1);
assert.equal(result.counts.blockedOrHeld, 0);
assert.deepEqual(result.businesses.map(x => x.businessId), ['alpha', 'beta']);
assert.throws(() => auditHistoricalHandles(null), /inventario/);
// Regresión: basta UN identificador de perfil público cruzado para detener
// el preflight. No se debe considerar segura una coincidencia parcial.
const profile = (id, businessId, restaurantId) => ({
  path: 'publicBusinessProfiles/' + id,
  data: { businessId, restaurantId, published: true },
});
for (const badProfile of [
  profile('alpha', 'alpha', 'beta'),
  profile('alpha', 'beta', 'alpha'),
  profile('alpha', 'beta', 'beta'),
  { path: 'publicBusinessProfiles/alpha', data: { businessId: 'alpha' } },
  { path: 'publicBusinessProfiles/alpha', data: { restaurantId: 'alpha' } },
]) {
  const checked = single([root('alpha', 'alice'), member('alpha', 'alice'), badProfile]);
  assert.notEqual(checked.status, 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW');
  hasReason(checked, 'PROFILE_TENANT_MISMATCH');
}
assert.equal(single([root('alpha', 'alice'), member('alpha', 'alice'),
  profile('alpha', 'alpha', 'alpha')]).status, 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW');

// Documentos dependientes con tenant explícito cruzado también bloquean.
for (const data of [{ businessId: 'beta' }, { restaurantId: 'beta' },
  { businessId: 'alpha', restaurantId: 'beta' }, { businessId: null }]) {
  const checked = single([root('alpha', 'alice'), member('alpha', 'alice'),
    { path: 'businesses/alpha/catalog/menu_catalog', data }]);
  assert.notEqual(checked.status, 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW');
  hasReason(checked, 'RESIDUAL_TENANT_MISMATCH');
}
for (const data of [{ businessId: 'alpha' }, { restaurantId: 'alpha' },
  { businessId: 'alpha', restaurantId: 'alpha' }, { items: [] }]) {
  assert.equal(single([root('alpha', 'alice'), member('alpha', 'alice'),
    { path: 'businesses/alpha/catalog/menu_catalog', data }]).status,
  'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW');
}
const crossTenantInventory = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), member('alpha', 'alice'),
  profile('alpha', 'alpha', 'beta'),
  root('beta', 'bob'), member('beta', 'bob'),
  { path: 'businesses/beta/catalog/menu_catalog', data: { businessId: 'alpha' } },
]));
assert.deepEqual(crossTenantInventory.businesses.map(b => b.status),
  ['HOLD_MANUAL_REVIEW', 'HOLD_MANUAL_REVIEW']);
assert.equal(crossTenantInventory.safeToApplyAutomatically, false);

// Un cruce UNILATERAL también retiene al destino sin errores propios.
for (const foreignRecord of [
  profile('alpha', 'alpha', 'beta'),
  { path: 'businesses/alpha/catalog/menu_catalog', data: { businessId: 'beta' } },
  { ...root('alpha', 'alice'), data: { restaurantId: 'beta', ownerUserId: 'alice' } },
  { ...reservation('alpha', 'alice'), data: { businessId: 'beta', ownerUserId: 'alice' } },
]) {
  const checked = auditHistoricalHandles(inventory([
    root('alpha', 'alice'), member('alpha', 'alice'),
    root('beta', 'bob'), member('beta', 'bob'),
    foreignRecord,
  ]));
  const target = checked.businesses.find(b => b.businessId === 'beta');
  assert.equal(target.status, 'HOLD_MANUAL_REVIEW');
  hasReason(target, 'REFERENCED_BY_FOREIGN_TENANT');
  assert.equal(checked.counts.manualCandidates, 0);
}
const absentTarget = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), member('alpha', 'alice'),
  profile('alpha', 'alpha', 'missing-tenant'),
]));
assert(absentTarget.globalBlockers.includes('REFERENCE_TO_UNINVENTORIED_TENANT'));
assert.equal(absentTarget.businesses[0].status, 'BLOCKED_INCOMPLETE_INVENTORY');
assert.equal(absentTarget.counts.manualCandidates, 0);
const cleanPair = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), member('alpha', 'alice'),
  { path: 'businesses/alpha/catalog/menu_catalog', data: { items: [] } },
  profile('alpha', 'alpha', 'alpha'),
  root('beta', 'bob'), member('beta', 'bob'),
]));
assert.deepEqual(cleanPair.businesses.map(b => b.status), [
  'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW', 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW',
]);
assert.deepEqual(cleanPair.globalBlockers, []);

// Una ruta de Firestore solo identifica UN documento, incluso si dos pares
// tenant/UID distintos producen la misma clave por concatenación con '_'.
const membershipPathCollision = auditHistoricalHandles(inventory([
  root('alpha', 'bob_charlie'), member('alpha', 'bob_charlie'),
  root('alpha_bob', 'charlie'), member('alpha_bob', 'charlie'),
]));
assert(membershipPathCollision.globalBlockers.includes('DUPLICATE_INVENTORY_PATH'));
assert.deepEqual(membershipPathCollision.businesses.map(b => b.status), [
  'BLOCKED_INCOMPLETE_INVENTORY', 'BLOCKED_INCOMPLETE_INVENTORY',
]);
assert.equal(membershipPathCollision.counts.manualCandidates, 0);
assert.equal(membershipPathCollision.counts.blockedOrHeld, 2);

// También se bloquea una extracción repetida del mismo documento y rutas
// inválidas en cualquier nivel, no solo en el identificador de negocio.
const repeatedRoot = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), member('alpha', 'alice'), root('alpha', 'alice'),
]));
assert(repeatedRoot.globalBlockers.includes('DUPLICATE_INVENTORY_PATH'));
assert.equal(repeatedRoot.businesses[0].status, 'BLOCKED_INCOMPLETE_INVENTORY');
for (const invalidPath of [
  'businesses/alpha/catalog/.',
  'businesses/alpha/catalog/..',
  'businesses/alpha/./menu',
  'businesses/alpha/catalog//menu',
]) {
  const invalidNested = auditHistoricalHandles(inventory([
    root('alpha', 'alice'), member('alpha', 'alice'),
    { path: invalidPath, data: { items: [] } },
  ]));
  assert(invalidNested.globalBlockers.includes('INVALID_PATH'), invalidPath);
  assert.equal(invalidNested.businesses[0].status, 'BLOCKED_INCOMPLETE_INVENTORY');
}
const cleanUnderscorePair = auditHistoricalHandles(inventory([
  root('alpha_bob', 'charlie'), member('alpha_bob', 'charlie'),
  root('alpha', 'alice'), member('alpha', 'alice'),
]));
assert.deepEqual(cleanUnderscorePair.globalBlockers, []);
assert.equal(cleanUnderscorePair.counts.manualCandidates, 2);

console.log('PASS: 17 escenarios originales y variantes adicionales de perfil/residuales entre tenants; solo inventario local, ninguna escritura ni Firebase.');
console.warn('PENDIENTE: inventario real completo, respaldo, validación de propietarios y backfill autorizado; ningún candidato es aprobación automática.');
