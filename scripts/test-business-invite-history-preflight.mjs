// Prueba OFFLINE A/B: no Firebase, red, datos reales, tokens ni escrituras.
import assert from 'node:assert/strict';
import { auditBusinessInviteHistory } from './business-invite-history-preflight.mjs';

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const root = (id, uid, employeeUserIds = []) => ({ docId: id, restaurantId: id, ownerUserId: uid, employeeUserIds });
const member = (id, uid, role = 'OWNER', active = true) =>
  ({ docId: id + '_' + uid, restaurantId: id, userId: uid, role, active });
let serial = 0;
const invite = (businessId = 'tenant-a', createdBy = 'uid-a', status = 'PENDING') => ({
  docId: (++serial).toString(16).padStart(64, '0'), businessId, createdBy, status,
  role: 'WAITER', createdAt: NOW - HOUR, expiresAt: NOW + HOUR,
  name: 'NO DEBE SALIR', email: 'no-publicar@example.test',
});
const fixture = () => ({
  now: NOW,
  coverage: {
    businesses: { complete: true, documentCount: 2, pagesRead: 1 },
    businessMemberships: { complete: true, documentCount: 3, pagesRead: 1 },
    business_invites: { complete: true, documentCount: 3, pagesRead: 1 },
  },
  businesses: [root('tenant-a', 'uid-a'), root('tenant-b', 'uid-b', ['uid-a'])],
  memberships: [member('tenant-a', 'uid-a'), member('tenant-b', 'uid-b'), member('tenant-b', 'uid-a', 'WAITER')],
  invites: [invite('tenant-a', 'uid-a'), invite('tenant-b', 'uid-b'), invite('tenant-b', 'uid-b', 'ACCEPTED')],
});
const evaluate = change => {
  const f = fixture();
  change?.(f);
  return auditBusinessInviteHistory(f);
};
const noLeak = result => {
  const serialized = JSON.stringify(result);
  for (const secret of ['tenant-a', 'tenant-b', 'uid-a', 'uid-b', 'NO DEBE SALIR', 'no-publicar@example.test']) {
    assert(!serialized.includes(secret), 'La salida no debe revelar: ' + secret);
  }
  assert.equal(result.safeToDeploy, false);
};
const blocked = (label, change, code) => {
  const result = evaluate(change);
  assert.equal(result.status, 'BLOCKED', label);
  assert(result.issues.some(issue => issue.code === code), label + ': falta ' + code);
  noLeak(result);
};
const good = evaluate();
assert.equal(good.status, 'READY_FOR_INDEPENDENT_REVIEW');
assert.equal(good.counts.invites, 3);
assert.equal(good.counts.actionablePending, 2);
assert.equal(good.counts.legacyTenantsOverLimit, 0);
assert.equal(good.protocol.maxGuaranteedPaginatedDocumentsPerTenant, 7499);
noLeak(good);

blocked('Cobertura incompleta', f => { f.coverage.business_invites.complete = false; }, 'INCOMPLETE_COLLECTION_SCAN');
blocked('Conteo declarado no coincide', f => { f.coverage.business_invites.documentCount = 2; }, 'DECLARED_COUNT_MISMATCH');
blocked('No hay evidencia de páginas', f => { f.coverage.business_invites.pagesRead = 0; }, 'INVALID_PAGINATION_EVIDENCE');
blocked('Inventario no entregado', f => { delete f.invites; }, 'MISSING_DOCUMENT_INVENTORY');
blocked('Dependencia OWNER histórica inconsistente', f => { delete f.businesses[0].ownerUserId; }, 'DEPENDENT_MEMBERSHIP_INVENTORY_BLOCKED');
blocked('Tiempo de referencia inválido', f => { f.now = NaN; }, 'INVALID_REFERENCE_TIME');
blocked('Invitación de tenant ajeno', f => { f.invites[0].businessId = 'tenant-c'; }, 'INVITE_WITHOUT_VALID_BUSINESS');
blocked('Hash inválido', f => { f.invites[0].docId = 'token-no-hash'; }, 'INVALID_INVITE_DOCUMENT_ID');
blocked('Documento duplicado', f => { f.invites[1].docId = f.invites[0].docId; }, 'DUPLICATE_INVITE_DOCUMENT');
blocked('Estado desconocido', f => { f.invites[0].status = 'SENT'; }, 'UNKNOWN_INVITE_STATUS');
blocked('Rol OWNER no invitado', f => { f.invites[0].role = 'OWNER'; }, 'INVALID_INVITE_ROLE_OR_INVITER');
blocked('Emisor inválido', f => { f.invites[0].createdBy = 'bad/uid'; }, 'INVALID_INVITE_ROLE_OR_INVITER');
blocked('Vencimiento ausente', f => { delete f.invites[0].expiresAt; }, 'INVALID_INVITE_TIME_WINDOW');
blocked('Vencimiento extendido', f => { f.invites[0].expiresAt = NOW + 100 * HOUR; }, 'INVALID_INVITE_TIME_WINDOW');
blocked('Creación futura', f => { f.invites[0].createdAt = NOW + 1; }, 'INVALID_INVITE_TIME_WINDOW');
blocked('Emisor revocado', f => { f.memberships[0].active = false; }, 'PENDING_INVITER_NOT_AUTHORIZED');
blocked('Emisor WAITER de B no puede invitar', f => { f.invites[1].createdBy = 'uid-a'; }, 'PENDING_INVITER_NOT_AUTHORIZED');
blocked('Emisor de otro tenant', f => { f.invites[1].createdBy = 'uid-c'; }, 'PENDING_INVITER_NOT_AUTHORIZED');
blocked('MANAGER no puede invitar ADMIN', f => {
  f.memberships[2].role = 'MANAGER'; f.invites[1].createdBy = 'uid-a'; f.invites[1].role = 'ADMIN';
}, 'PENDING_INVITER_NOT_AUTHORIZED');
const manager = evaluate(f => {
  f.memberships[2].role = 'MANAGER'; f.invites[1].createdBy = 'uid-a';
});
assert.equal(manager.status, 'READY_FOR_INDEPENDENT_REVIEW', 'MANAGER puede invitar WAITER en B');
const expired = evaluate(f => {
  f.invites[0].createdAt = NOW - 72 * HOUR;
  f.invites[0].expiresAt = NOW - HOUR;
});
assert.equal(expired.status, 'READY_FOR_INDEPENDENT_REVIEW');
assert.equal(expired.counts.expiredPending, 1);

const replaceWith = (f, n) => {
  f.invites = Array.from({ length: n }, (_, i) => ({
    ...invite('tenant-a', 'uid-a', 'REVOKED'), docId: (i + 1).toString(16).padStart(64, '0'),
  }));
  f.coverage.business_invites.documentCount = n;
  f.coverage.business_invites.pagesRead = Math.max(1, Math.ceil(n / 150));
};
const boundary150 = evaluate(f => replaceWith(f, 150));
assert.equal(boundary150.status, 'READY_FOR_INDEPENDENT_REVIEW', '150 históricos permiten modo legado');
blocked('151 históricos: cliente legado debe actualizar', f => replaceWith(f, 151), 'LEGACY_CLIENT_HISTORY_LIMIT_REVIEW');
const boundary7499 = evaluate(f => replaceWith(f, 7499));
assert.equal(boundary7499.counts.paginationTenantsAtLimit, 0);
assert.equal(boundary7499.counts.legacyTenantsOverLimit, 1);
blocked('7500 exactos no tienen página final vacía dentro del máximo',
  f => replaceWith(f, 7500), 'PAGINATED_CLIENT_CAPACITY_REVIEW');
noLeak(boundary7499);
console.log('PASS: preflight offline historial invitaciones A/B, permisos, vencimientos y límites 150/151/7499/7500 (sin Firebase).');
