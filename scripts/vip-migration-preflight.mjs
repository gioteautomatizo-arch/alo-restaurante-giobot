/**
 * Gioteautomatizo - VIP migration preflight (offline, READ ONLY).
 *
 * Input: local manually prepared JSON manifest with:
 *  businessId: string
 *  profiles: [{id, restaurantId?, stamps, totalOrders, rewardAvailable,
 *              pendingStampsToValidate?}]
 *  memberships: [{id, restaurantId, userId, role, active}]
 *  expectedAdmins: [{uid, role, identityVerifiedByOwner}]
 *
 * Never connects to Firebase. Never writes data. Never prints personal data,
 * IDs, credentials or individual records. This is NOT a migration tool.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const MAX_COUNT = 1000000;
const isNonnegativeCounter = v => Number.isInteger(v) && v >= 0 && v <= MAX_COUNT;
const hasOwn = (x, prop) => Object.prototype.hasOwnProperty.call(x, prop);
const safeRow = x => x !== null && typeof x === 'object' && !Array.isArray(x);

export function auditVipMigration(manifest) {
  if (!safeRow(manifest) || typeof manifest.businessId !== 'string'
    || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.businessId)
    || !Array.isArray(manifest.profiles)
    || !Array.isArray(manifest.memberships)
    || !Array.isArray(manifest.expectedAdmins)) {
    throw new Error('Manifest inválido: requiere businessId, profiles[], memberships[] y expectedAdmins[].');
  }
  const businessId = manifest.businessId;
  const counts = {
    profilesReviewed: manifest.profiles.length,
    profilesAssigned: 0,
    profilesWithoutTenant: 0,
    profilesWithInvalidTenant: 0,
    profilesFromAnotherBusiness: 0,
    profilesWithInvalidCounters: 0,
    profilesWithInvalidId: 0,
    duplicateProfileIds: 0,
    expectedAdmins: manifest.expectedAdmins.length,
    adminsUnverified: 0,
    adminsUnlinked: 0,
    adminsMismatched: 0,
    membershipsWithInvalidId: 0,
    membershipDuplicates: 0,
  };
  const profileIds = new Set();
  for (const row of manifest.profiles) {
    if (!safeRow(row)) {
      counts.profilesWithInvalidId++;
      counts.profilesWithInvalidCounters++;
      continue;
    }
    if (typeof row.id !== 'string' || row.id.length === 0) counts.profilesWithInvalidId++;
    else if (profileIds.has(row.id)) counts.duplicateProfileIds++;
    else profileIds.add(row.id);

    if (!hasOwn(row, 'restaurantId')) {
      // Missing tenant is never proof of ownership. Human review required.
      counts.profilesWithoutTenant++;
    } else if (typeof row.restaurantId !== 'string' || !row.restaurantId.trim()) {
      counts.profilesWithInvalidTenant++;
    } else if (row.restaurantId === businessId) {
      counts.profilesAssigned++;
    } else {
      counts.profilesFromAnotherBusiness++;
    }
    if (!isNonnegativeCounter(row.stamps)
      || !isNonnegativeCounter(row.totalOrders)
      || typeof row.rewardAvailable !== 'boolean'
      || (hasOwn(row, 'pendingStampsToValidate')
        && !isNonnegativeCounter(row.pendingStampsToValidate))) {
      counts.profilesWithInvalidCounters++;
    }
  }

  const memberships = new Map();
  for (const row of manifest.memberships) {
    if (!safeRow(row) || typeof row.id !== 'string' || typeof row.userId !== 'string'
      || !row.userId.trim() || typeof row.restaurantId !== 'string'
      || row.id !== row.restaurantId + '_' + row.userId
      || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(row.restaurantId)) {
      counts.membershipsWithInvalidId++;
      continue;
    }
    if (memberships.has(row.id)) counts.membershipDuplicates++;
    else memberships.set(row.id, row);
  }

  const expectedUids = new Set();
  let ownerConfirmed = false;
  for (const admin of manifest.expectedAdmins) {
    // Do not accept legacy staff PINs or names as verified Firebase identity.
    if (!safeRow(admin) || typeof admin.uid !== 'string' || !admin.uid.trim()
      || !ROLES.has(admin.role) || admin.identityVerifiedByOwner !== true
      || expectedUids.has(admin.uid)) {
      counts.adminsUnverified++;
      continue;
    }
    expectedUids.add(admin.uid);
    const membership = memberships.get(businessId + '_' + admin.uid);
    if (!membership) {
      counts.adminsUnlinked++;
    } else if (membership.restaurantId !== businessId
      || membership.userId !== admin.uid || membership.role !== admin.role
      || membership.active !== true) {
      counts.adminsMismatched++;
    } else if (admin.role === 'OWNER') {
      ownerConfirmed = true;
    }
  }

  const blockers = [];
  if (manifest.expectedAdmins.length === 0 || !ownerConfirmed) blockers.push('owner_not_verified_and_linked');
  if (counts.profilesWithoutTenant > 0) blockers.push('legacy_profiles_need_individual_owner_review');
  if (counts.profilesWithInvalidTenant > 0) blockers.push('invalid_tenant_identifiers');
  if (counts.profilesFromAnotherBusiness > 0) blockers.push('cross_business_rows_in_manifest');
  if (counts.profilesWithInvalidCounters > 0) blockers.push('invalid_loyalty_balances');
  if (counts.profilesWithInvalidId > 0 || counts.duplicateProfileIds > 0) blockers.push('invalid_or_duplicate_profile_ids');
  if (counts.membershipsWithInvalidId > 0 || counts.membershipDuplicates > 0) blockers.push('invalid_or_duplicate_membership_ids');
  if (counts.adminsUnverified > 0) blockers.push('admin_identity_not_verified');
  if (counts.adminsUnlinked > 0) blockers.push('admin_membership_missing');
  if (counts.adminsMismatched > 0) blockers.push('admin_membership_mismatch_or_inactive');

  return {
    readiness: blockers.length ? 'BLOCKED' : 'PREFLIGHT_PASSED',
    // Even PREFLIGHT_PASSED never means deployment approved.
    approvalToDeploy: false,
    counts,
    blockers,
    nextStep: blockers.length
      ? 'Revisar manualmente los casos bloqueados y respaldar antes de migrar.'
      : 'Verificar respaldo, restauración, panel y recuperación real con responsables; no desplegar automáticamente.',
  };
}

const invokedAsCli = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsCli) {
  if (process.argv.length !== 4 || process.argv[2] !== '--input') {
    console.error('Uso: node scripts/vip-migration-preflight.mjs --input /ruta/privada/manifiesto.json');
    console.error('Sin conexión a Firebase ni escrituras. No subir manifiestos con datos privados a GitHub.');
    process.exitCode = 2;
  } else {
    try {
      const input = JSON.parse(readFileSync(process.argv[3], 'utf8'));
      // Only aggregate counters and fixed reason codes leave this process.
      const result = auditVipMigration(input);
      console.log(JSON.stringify(result, null, 2));
      if (result.readiness === 'BLOCKED') process.exitCode = 1;
    } catch {
      // Never include the source JSON, filename, or potentially sensitive parser details.
      console.error('No se pudo evaluar el manifiesto privado. Verifica su formato.');
      process.exitCode = 2;
    }
  }
}
