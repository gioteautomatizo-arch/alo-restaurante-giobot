// Solo datos sintéticos en memoria; sin Firebase, red ni escrituras.
import assert from 'node:assert/strict';
import { auditBusinessMembershipInventory } from './business-membership-inventory-preflight.mjs';

const root = (id, uid) => ({ docId: id, restaurantId: id, ownerUserId: uid });
const member = (id, uid, role = 'OWNER', active = true) =>
  ({ docId: id + '_' + uid, restaurantId: id, userId: uid, role, active });
const baseline = () => ({
  coverage: {
    businesses: { complete: true, documentCount: 2, pagesRead: 1 },
    businessMemberships: { complete: true, documentCount: 3, pagesRead: 2 },
  },
  businesses: [root('tenant-a', 'uid-a'), root('tenant-b', 'uid-b')],
  memberships: [
    member('tenant-a', 'uid-a'),
    member('tenant-b', 'uid-b'),
    member('tenant-b', 'uid-a', 'WAITER'),
  ],
});
const audit = change => {
  const fixture = baseline();
  change?.(fixture);
  return auditBusinessMembershipInventory(fixture);
};
const blocked = (label, mutate, expected) => {
  const result = audit(mutate);
  assert.equal(result.status, 'BLOCKED', label);
  assert.equal(result.safeToDeploy, false, label);
  assert(result.issues.some(item => item.code === expected),
    label + ': missing ' + expected + ', got ' + JSON.stringify(result.issues));
  // La salida de auditoría nunca revela datos del inventario.
  for (const value of ['uid-a', 'uid-b', 'tenant-a', 'tenant-b']) {
    assert.equal(JSON.stringify(result).includes(value), false, label + ': exposed ' + value);
  }
};
const clean = audit();
assert.equal(clean.status, 'READY_FOR_INDEPENDENT_REVIEW');
assert.equal(clean.safeToDeploy, false, 'Un inventario limpio NUNCA autoriza despliegue');
assert.deepEqual(clean.issues, []);
assert.equal(clean.counts.businesses, 2);
assert.equal(clean.counts.memberships, 3);
assert.equal(clean.counts.activeOwners, 2);

blocked('Sin cobertura', f => { delete f.coverage.businessMemberships; },
  'MISSING_COLLECTION_COVERAGE');
blocked('Sin páginas completas', f => { f.coverage.businesses.complete = false; },
  'INCOMPLETE_COLLECTION_SCAN');
blocked('Conteo falso', f => { f.coverage.businessMemberships.documentCount = 2; },
  'DECLARED_COUNT_MISMATCH');
blocked('Paginación sin evidencia', f => { f.coverage.businessMemberships.pagesRead = 0; },
  'INVALID_PAGINATION_EVIDENCE');
blocked('Membresías omitidas', f => { f.memberships.pop(); },
  'DECLARED_COUNT_MISMATCH');
blocked('Raíz con ID ajeno', f => { f.businesses[1].restaurantId = 'tenant-a'; },
  'ROOT_DOCUMENT_IDENTITY_MISMATCH');
blocked('Raíz duplicada', f => {
  f.businesses.push(root('tenant-a', 'uid-a'));
  f.coverage.businesses.documentCount++;
}, 'DUPLICATE_ROOT_DOCUMENT');
blocked('Membresía mal asociada entre A/B', f => { f.memberships[2].restaurantId = 'tenant-a'; },
  'MEMBERSHIP_DOCUMENT_IDENTITY_MISMATCH');
blocked('UID interno discordante', f => { f.memberships[2].userId = 'uid-b'; },
  'MEMBERSHIP_DOCUMENT_IDENTITY_MISMATCH');
blocked('Membresía duplicada', f => {
  f.memberships.push(member('tenant-b', 'uid-a', 'WAITER'));
  f.coverage.businessMemberships.documentCount++;
}, 'DUPLICATE_MEMBERSHIP_DOCUMENT');
blocked('Rol desconocido', f => { f.memberships[2].role = 'ROOT'; },
  'UNKNOWN_MEMBERSHIP_ROLE');
blocked('SUPER_ADMIN no es rol de membresía tenant', f => {
  f.memberships[2].role = 'SUPER_ADMIN';
}, 'UNKNOWN_MEMBERSHIP_ROLE');
blocked('Estado histórico inválido', f => { f.memberships[2].active = 'true'; },
  'INVALID_MEMBERSHIP_ACTIVE_STATE');
blocked('Membresía huérfana', f => {
  f.memberships[2] = member('tenant-c', 'uid-a', 'WAITER');
}, 'MEMBERSHIP_WITHOUT_VALID_ROOT');
blocked('Sin OWNER activo', f => { f.memberships[0].active = false; },
  'ROOT_WITHOUT_ACTIVE_OWNER');
blocked('OWNER incorrecto', f => { f.businesses[0].ownerUserId = 'uid-other'; },
  'ROOT_OWNER_MEMBERSHIP_MISMATCH');
blocked('OWNER histórico sin campo', f => { delete f.businesses[0].ownerUserId; },
  'LEGACY_ROOT_OWNER_UNVERIFIED');
blocked('OWNER doble requiere revisión', f => {
  f.memberships.push(member('tenant-a', 'uid-b', 'OWNER'));
  f.coverage.businessMemberships.documentCount++;
}, 'MULTIPLE_ACTIVE_OWNERS_REVIEW');
blocked('No aceptar inventario vacío como validación', f => {
  f.businesses = [];
  f.memberships = [];
  f.coverage.businesses.documentCount = 0;
  f.coverage.businessMemberships.documentCount = 0;
}, 'EMPTY_BUSINESS_INVENTORY_REVIEW');
const missing = auditBusinessMembershipInventory();
assert.equal(missing.status, 'BLOCKED');
assert(missing.issues.some(item => item.code === 'MISSING_DOCUMENT_INVENTORY'));
assert.equal(missing.safeToDeploy, false);

console.log('PASS: preflight offline de raíces/membresías A/B, cobertura, identidad, OWNER, roles y huérfanos; nunca autoriza despliegue.');
console.warn('PENDIENTE: inventario histórico REAL autorizado, revisión independiente, backup/restauración, reglas/clientes antiguos y recorrido visual A/B.');
