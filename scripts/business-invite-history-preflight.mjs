/**
 * Paso 2: auditoría OFFLINE de historial de invitaciones antes del corte 2→3.
 * Recibe inventarios previamente autorizados; no importa Firebase ni accede a red.
 * Nunca emite IDs, tokens, correos, nombres o documentos en el resultado.
 */
import { auditBusinessMembershipInventory } from './business-membership-inventory-preflight.mjs';
import { INVITE_LIST_PAGE_SIZE, INVITE_LIST_MAX_PAGES } from '../businessInvitePagination.ts';
import { hasValidInviterId, INVITE_EXPIRES_IN_MS } from '../businessInviteIntegrity.ts';

const BUSINESS_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const HASH_ID = /^[0-9a-f]{64}$/;
const INVITE_ROLES = new Set(['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE']);
const OPERATIONAL_ROLES = new Set(['CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE']);
const STATUSES = new Set(['PENDING', 'ACCEPTED', 'REVOKED']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validTime = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const canInvite = (role, invitedRole) => role === 'OWNER' || role === 'ADMIN'
  ? INVITE_ROLES.has(invitedRole)
  : role === 'MANAGER' && OPERATIONAL_ROLES.has(invitedRole);

export function auditBusinessInviteHistory({ coverage, businesses, memberships, invites, now } = {}) {
  const issues = [];
  const add = (code, collection, index) => issues.push({ code,
    ...(collection ? { collection } : {}), ...(index === undefined ? {} : { index }) });
  const counts = {
    invites: Array.isArray(invites) ? invites.length : 0,
    pending: 0, actionablePending: 0, expiredPending: 0, accepted: 0, revoked: 0,
    invalidDocuments: 0, unauthorizedPendingInviters: 0,
    legacyTenantsOverLimit: 0, paginationTenantsAtLimit: 0,
  };
  // El preflight de membresías valida raíces, roles OWNER, índices y cobertura.
  const membershipAudit = auditBusinessMembershipInventory({ coverage, businesses, memberships });
  if (membershipAudit.status !== 'READY_FOR_INDEPENDENT_REVIEW') {
    add('DEPENDENT_MEMBERSHIP_INVENTORY_BLOCKED');
  }
  if (!validTime(now)) add('INVALID_REFERENCE_TIME');
  const scan = object(coverage) ? coverage.business_invites : undefined;
  if (!Array.isArray(invites)) add('MISSING_DOCUMENT_INVENTORY', 'business_invites');
  if (!object(scan)) add('MISSING_COLLECTION_COVERAGE', 'business_invites');
  else {
    if (scan.complete !== true) add('INCOMPLETE_COLLECTION_SCAN', 'business_invites');
    if (!Number.isSafeInteger(scan.documentCount) || scan.documentCount < 0 ||
        !Array.isArray(invites) || scan.documentCount !== invites.length) {
      add('DECLARED_COUNT_MISMATCH', 'business_invites');
    }
    if (!Number.isSafeInteger(scan.pagesRead) || scan.pagesRead < 1) {
      add('INVALID_PAGINATION_EVIDENCE', 'business_invites');
    }
  }
  const roots = new Map(Array.isArray(businesses) ? businesses
    .filter(b => object(b) && typeof b.docId === 'string' && b.docId === b.restaurantId)
    .map(b => [b.docId, b]) : []);
  const members = new Map(Array.isArray(memberships) ? memberships
    .filter(m => object(m) && typeof m.docId === 'string')
    .map(m => [m.docId, m]) : []);
  const tenantCounts = new Map();
  const seen = new Set();
  if (Array.isArray(invites)) for (const [index, invite] of invites.entries()) {
    if (!object(invite)) {
      counts.invalidDocuments++;
      add('INVALID_INVITE_DOCUMENT', 'business_invites', index);
      continue;
    }
    if (typeof invite.docId !== 'string' || !HASH_ID.test(invite.docId)) {
      counts.invalidDocuments++;
      add('INVALID_INVITE_DOCUMENT_ID', 'business_invites', index);
    } else if (seen.has(invite.docId)) {
      counts.invalidDocuments++;
      add('DUPLICATE_INVITE_DOCUMENT', 'business_invites', index);
    }
    if (typeof invite.docId === 'string') seen.add(invite.docId);
    if (typeof invite.businessId !== 'string' || !BUSINESS_ID.test(invite.businessId) ||
        !roots.has(invite.businessId)) {
      counts.invalidDocuments++;
      add('INVITE_WITHOUT_VALID_BUSINESS', 'business_invites', index);
    } else {
      tenantCounts.set(invite.businessId, (tenantCounts.get(invite.businessId) || 0) + 1);
    }
    if (!STATUSES.has(invite.status)) {
      counts.invalidDocuments++;
      add('UNKNOWN_INVITE_STATUS', 'business_invites', index);
    } else if (invite.status === 'PENDING') counts.pending++;
    else if (invite.status === 'ACCEPTED') counts.accepted++;
    else counts.revoked++;
    if (!INVITE_ROLES.has(invite.role) || !hasValidInviterId(invite.createdBy)) {
      counts.invalidDocuments++;
      add('INVALID_INVITE_ROLE_OR_INVITER', 'business_invites', index);
    }
    if (!validTime(invite.createdAt) || !validTime(invite.expiresAt) ||
        invite.expiresAt <= invite.createdAt ||
        invite.expiresAt - invite.createdAt > INVITE_EXPIRES_IN_MS ||
        (validTime(now) && invite.createdAt > now)) {
      counts.invalidDocuments++;
      add('INVALID_INVITE_TIME_WINDOW', 'business_invites', index);
      continue;
    }
    if (invite.status !== 'PENDING' || !validTime(now)) continue;
    if (invite.expiresAt <= now) {
      counts.expiredPending++;
      continue; // Un token vencido no es accionable; no exigir permisos actuales del emisor.
    }
    counts.actionablePending++;
    const root = roots.get(invite.businessId);
    const issuer = members.get(invite.businessId + '_' + invite.createdBy);
    if (!root || !issuer || issuer.restaurantId !== invite.businessId ||
        issuer.userId !== invite.createdBy || issuer.active !== true ||
        (issuer.role === 'OWNER' && root.ownerUserId !== invite.createdBy) ||
        !canInvite(issuer.role, invite.role)) {
      counts.unauthorizedPendingInviters++;
      add('PENDING_INVITER_NOT_AUTHORIZED', 'business_invites', index);
    }
  }
  // Un cliente legado no lee cursores. El cliente nuevo no puede terminar
  // exactamente 50 páginas llenas: la última entrega nextCursor no nulo.
  for (const size of tenantCounts.values()) {
    if (size > INVITE_LIST_PAGE_SIZE) {
      counts.legacyTenantsOverLimit++;
      add('LEGACY_CLIENT_HISTORY_LIMIT_REVIEW', 'business_invites');
    }
    if (size >= INVITE_LIST_PAGE_SIZE * INVITE_LIST_MAX_PAGES) {
      counts.paginationTenantsAtLimit++;
      add('PAGINATED_CLIENT_CAPACITY_REVIEW', 'business_invites');
    }
  }
  return {
    mode: 'OFFLINE_NO_FIREBASE_NO_WRITE',
    status: issues.length ? 'BLOCKED' : 'READY_FOR_INDEPENDENT_REVIEW',
    safeToDeploy: false,
    counts,
    dependencies: { membershipInventory: membershipAudit.status },
    protocol: {
      pageSize: INVITE_LIST_PAGE_SIZE, maxPages: INVITE_LIST_MAX_PAGES,
      legacyHistoryLimit: INVITE_LIST_PAGE_SIZE,
      maxGuaranteedPaginatedDocumentsPerTenant: INVITE_LIST_PAGE_SIZE * INVITE_LIST_MAX_PAGES - 1,
    },
    issues,
    caveat: 'Cobertura y fecha declaradas por el llamador; no prueban snapshot real, autorización, costos, reglas desplegadas ni compatibilidad de versiones instaladas.',
  };
}
