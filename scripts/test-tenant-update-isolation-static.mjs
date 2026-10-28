import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTenantUpdateIsolationProposalRules } from './tenant-update-isolation-proposal.mjs';

const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposed = buildTenantUpdateIsolationProposalRules(staged);
const operational = ['staff_users', 'shifts', 'expenses', 'cxc_records',
  'inventory_items', 'sobre_movements', 'daily_menu'];
const other = ['tables', 'table_sessions', 'table_service_requests',
  'public_table_orders', 'restaurant_orders'];
function blockFor(rules, name) {
  const anchor = '    match /' + name + '/{';
  const start = rules.indexOf(anchor);
  assert(start >= 0, 'Falta ruta ' + name);
  const end = rules.indexOf('\n    match /', start + anchor.length);
  return rules.slice(start, end < 0 ? undefined : end);
}
for (const name of [...operational, ...other]) {
  const before = blockFor(staged, name);
  const after = blockFor(proposed, name);
  const guard = 'request.resource.data.restaurantId == resource.data.restaurantId';
  assert(!before.includes(guard), 'STAGED cambió: revisar manualmente ' + name);
  assert(after.includes(guard), 'Falta protección ' + name);
  assert(after.includes('allow update: if ' + guard), 'Guard debe preceder al permiso ' + name);
  assert(after.includes('allow delete:'), 'No perder semántica de delete ' + name);
  if (operational.includes(name)) {
    assert(before.includes('allow create, update: if '), 'Contrato staged cambió ' + name);
    assert(after.includes('allow create: if '), 'No perder create ' + name);
    assert(!after.includes('allow create, update: if '), 'Update debe estar separado ' + name);
    assert(after.includes('isAuthorizedRestaurant(resource.data)'),
      'No basta autorizar el tenant destino ' + name);
  }
}
assert.throws(() => buildTenantUpdateIsolationProposalRules(staged.replace(
  'match /expenses/{expenseId} {', 'match /expenses_renamed/{expenseId} {'
)), /ALTO/);
assert.throws(() => buildTenantUpdateIsolationProposalRules(staged.replace(
  'allow create, update: if isAuthorizedRestaurant(request.resource.data)',
  'allow create: if isAuthorizedRestaurant(request.resource.data)'
)), /ALTO/);
console.log('PASS: 12 rutas con tenant inmutable en propuesta aislada; 7 módulos exigen autorización sobre origen; fail-closed ante drift.');
console.warn('PENDIENTE: STAGED/despliegue siguen sin estos guards; falta emulador, revisión independiente y autorización.');
