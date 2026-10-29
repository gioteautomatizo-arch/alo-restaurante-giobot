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

// Compatibilidad del candidato de reglas: un registro histórico con rol
// desconocido o active no booleano NO puede declararse limpio para el corte.
for (const role of ['SUPER_ADMIN', 'ROOT', null, undefined]) {
  const checked = single([root('alpha', 'alice'), member('alpha', 'alice'),
    member('alpha', 'staff', role)]);
  hasReason(checked, 'MEMBERSHIP_ROLE_OR_ACTIVE_INVALID');
  assert.equal(checked.status, 'HOLD_MANUAL_REVIEW');
}
for (const active of [null, 1, 'true', undefined]) {
  const checked = single([root('alpha', 'alice'), member('alpha', 'alice'),
    member('alpha', 'staff', 'CASHIER', active)]);
  hasReason(checked, 'MEMBERSHIP_ROLE_OR_ACTIVE_INVALID');
  assert.equal(checked.status, 'HOLD_MANUAL_REVIEW');
}
const validInactiveStaff = single([root('alpha', 'alice'), member('alpha', 'alice'),
  member('alpha', 'staff', 'CASHIER', false)]);
assert.equal(validInactiveStaff.status, 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW');


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
  // El caso de raíz discordante añade una segunda copia de businesses/alpha
  // y ahora bloquea globalmente la extracción, además de retener el destino.
  assert.equal(target.status, foreignRecord.path === 'businesses/alpha'
    ? 'BLOCKED_INCOMPLETE_INVENTORY' : 'HOLD_MANUAL_REVIEW');
  if (foreignRecord.path === 'businesses/alpha')
    assert(checked.globalBlockers.includes('DUPLICATE_INVENTORY_PATH'));
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

// Contrato nuevo: una raíz marcada 3-doc NO puede convertirse en candidato
// de backfill legacy si falta la reserva atómica o su vinculación es inválida.
// Un solo caso anómalo debe bloquear el inventario ENTERO, incluido el otro
// negocio ficticio, hasta revisión privilegiada independiente.
const contractRoot = (id, owner, version) => ({
  ...root(id, owner),
  data: { ...root(id, owner).data, registrationContractVersion: version },
});
const validThreeDoc = auditHistoricalHandles(inventory([
  contractRoot('alpha', 'alice', 3), member('alpha', 'alice'), reservation('alpha', 'alice'),
  root('beta', 'bob'), member('beta', 'bob'),
]));
assert.deepEqual(validThreeDoc.globalBlockers, []);
assert.deepEqual(validThreeDoc.businesses.map(b => b.status), [
  'EXISTING_RESERVATION_REVIEW', 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW',
]);
assert.equal(validThreeDoc.safeToApplyAutomatically, false);

const missingThreeDocReservation = auditHistoricalHandles(inventory([
  contractRoot('alpha', 'alice', 3), member('alpha', 'alice'),
  root('beta', 'bob'), member('beta', 'bob'),
]));
assert(missingThreeDocReservation.globalBlockers.includes('THREE_DOC_ROOT_WITHOUT_UNIQUE_RESERVATION'));
assert.deepEqual(missingThreeDocReservation.businesses.map(b => b.status), [
  'BLOCKED_INCOMPLETE_INVENTORY', 'BLOCKED_INCOMPLETE_INVENTORY',
]);
assert.equal(missingThreeDocReservation.counts.manualCandidates, 0);

for (const version of ['3', 4, null]) {
  const invalidVersion = auditHistoricalHandles(inventory([
    contractRoot('alpha', 'alice', version), member('alpha', 'alice'),
    root('beta', 'bob'), member('beta', 'bob'),
  ]));
  assert(invalidVersion.globalBlockers.includes('UNKNOWN_REGISTRATION_CONTRACT_VERSION'));
  assert.equal(invalidVersion.counts.manualCandidates, 0);
}
const wrongThreeDocOwner = auditHistoricalHandles(inventory([
  contractRoot('alpha', 'alice', 3), member('alpha', 'alice'), reservation('alpha', 'bob'),
  root('beta', 'bob'), member('beta', 'bob'),
]));
assert(wrongThreeDocOwner.globalBlockers.includes('THREE_DOC_RESERVATION_BINDING_INVALID'));
assert.equal(wrongThreeDocOwner.counts.manualCandidates, 0);
const extraReservationFields = auditHistoricalHandles(inventory([
  contractRoot('alpha', 'alice', 3), member('alpha', 'alice'),
  { ...reservation('alpha', 'alice'), data: { businessId: 'alpha', ownerUserId: 'alice', mutable: true } },
]));
assert(extraReservationFields.globalBlockers.includes('THREE_DOC_RESERVATION_BINDING_INVALID'));
const duplicateThreeDocReservation = auditHistoricalHandles(inventory([
  contractRoot('alpha', 'alice', 3), member('alpha', 'alice'),
  reservation('alpha', 'alice'), reservation('alpha', 'alice'),
]));
assert(duplicateThreeDocReservation.globalBlockers.includes('THREE_DOC_ROOT_WITHOUT_UNIQUE_RESERVATION'));
assert(duplicateThreeDocReservation.globalBlockers.includes('DUPLICATE_INVENTORY_PATH'));
// La raíz histórica sin marcador sigue siendo candidata SOLO a revisión manual.
assert.equal(single([root('alpha', 'alice'), member('alpha', 'alice')]).status,
  'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW');

// Regresión del contrato atómico: raíz 3-doc + reserva NO bastan.
// La membresía OWNER también debió crearse activa, con UID, tenant y ruta
// coherentes en el mismo batch. Un error en A bloquea el backfill de B.
const invalidThreeDocOwnerCases = [
  { name: 'OWNER ausente', memberships: [] },
  { name: 'OWNER inactivo', memberships: [member('alpha', 'alice', 'OWNER', false)] },
  { name: 'OWNER con rol distinto', memberships: [member('alpha', 'alice', 'ADMIN')] },
  { name: 'OWNER de otro UID', memberships: [member('alpha', 'mallory')] },
  { name: 'dos OWNER', memberships: [member('alpha', 'alice'), member('alpha', 'mallory')] },
  { name: 'OWNER con ruta discordante', memberships: [{
    ...member('alpha', 'alice'), path: 'businessMemberships/alpha_wrong',
  }] },
  { name: 'OWNER con tenant discordante', memberships: [{
    ...member('alpha', 'alice'),
    data: { ...member('alpha', 'alice').data, restaurantId: 'beta' },
  }] },
];
for (const scenario of invalidThreeDocOwnerCases) {
  const checked = auditHistoricalHandles(inventory([
    contractRoot('alpha', 'alice', 3),
    ...scenario.memberships,
    reservation('alpha', 'alice'),
    root('beta', 'bob'), member('beta', 'bob'),
  ]));
  assert(checked.globalBlockers.includes('THREE_DOC_OWNER_MEMBERSHIP_INVALID'), scenario.name);
  assert.deepEqual(checked.businesses.map(b => b.status), [
    'BLOCKED_INCOMPLETE_INVENTORY', 'BLOCKED_INCOMPLETE_INVENTORY',
  ], scenario.name);
  assert.equal(checked.counts.manualCandidates, 0, scenario.name);
  assert.equal(checked.safeToApplyAutomatically, false, scenario.name);
}
for (const invalidRoot of [
  { ...contractRoot('alpha', 'alice', 3),
    data: { ...contractRoot('alpha', 'alice', 3).data, restaurantId: 'beta' } },
  { ...contractRoot('alpha', 'alice', 3),
    data: { ...contractRoot('alpha', 'alice', 3).data, ownerUserId: '' } },
]) {
  const checked = auditHistoricalHandles(inventory([
    invalidRoot, member('alpha', 'alice'), reservation('alpha', 'alice'),
    root('beta', 'bob'), member('beta', 'bob'),
  ]));
  assert(checked.globalBlockers.includes('THREE_DOC_ROOT_IDENTITY_INVALID'));
  assert.equal(checked.counts.manualCandidates, 0);
}
// La raíz legacy SIN marcador con OWNER ausente sigue en revisión local,
// no se interpreta como un contrato atómico nuevo ni se autoriza backfill.
const legacyMissingOwner = auditHistoricalHandles(inventory([
  root('alpha', 'alice'), reservation('alpha', 'alice'),
  root('beta', 'bob'), member('beta', 'bob'),
]));
assert.deepEqual(legacyMissingOwner.globalBlockers, []);
assert.equal(legacyMissingOwner.businesses[0].status, 'HOLD_MANUAL_REVIEW');
assert.equal(legacyMissingOwner.businesses[1].status, 'CANDIDATE_FOR_MANUAL_BACKFILL_REVIEW');

console.log('PASS: 17 escenarios originales, variantes y OWNER atómico del contrato 3-doc de perfil/residuales entre tenants; solo inventario local, ninguna escritura ni Firebase.');
console.warn('PENDIENTE: inventario real completo, respaldo, validación de propietarios y backfill autorizado; ningún candidato es aprobación automática.');
