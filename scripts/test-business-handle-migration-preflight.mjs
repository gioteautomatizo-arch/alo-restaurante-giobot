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
console.log('PASS: 15 escenarios sintéticos de preflight fail-closed; ninguna escritura ni Firebase.');
console.warn('PENDIENTE: inventario real completo, respaldo, validación de propietarios y backfill autorizado; ningún candidato es aprobación automática.');
