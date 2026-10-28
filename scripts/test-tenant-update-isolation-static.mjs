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
  const anchor = name.includes('{')
    ? '    match /' + name + ' {'
    : '    match /' + name + '/{';
  const start = rules.indexOf(anchor);
  assert(start >= 0, 'Falta ruta ' + name);
  const end = rules.indexOf('\n    match /', start + anchor.length);
  return rules.slice(start, end < 0 ? undefined : end);
}
for (const name of [...operational, ...other]) {
  const before = blockFor(staged, name);
  const after = blockFor(proposed, name);
  const guard = 'request.resource.data.restaurantId == resource.data.restaurantId';
  assert(!before.includes('allow update: if ' + guard), 'STAGED cambió: revisar manualmente ' + name);
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
const nestedPath = 'businesses/{businessId}/{moduleCol}/{moduleDoc}';
const nestedBefore = blockFor(staged, nestedPath);
const nestedAfter = blockFor(proposed, nestedPath);
assert(nestedBefore.includes('allow read: if isTenantModule(moduleCol)'),
  'El contrato de lectura STAGED cambió');
assert(nestedAfter.includes('allow read: if resource.data.businessId == businessId'),
  'La propuesta debe impedir leer documentos anidados de otro negocio');
const tenantModulesSource = readFileSync('src/lib/tenantModules.ts', 'utf8');
assert(tenantModulesSource.includes("where('businessId', '==', businessId)"),
  'Los listeners deben filtrar businessId para permitir reglas de lectura');
assert(!tenantModulesSource.includes('orderBy(sortField'),
  'No introducir índices compuestos implícitos sin inventario/despliegue');
assert(tenantModulesSource.includes('sortModuleRows('),
  'Conservar ordenación local después de filtrar por tenant');
assert(nestedBefore.includes('allow update: if isTenantModule(moduleCol)'),
  'El contrato de actualización anidada cambió');
assert(nestedAfter.includes('allow update: if resource.data.businessId == businessId'),
  'Falta exigir identidad original de módulo anidado en update');
assert(nestedAfter.includes('request.resource.data.businessId == resource.data.businessId'),
  'Falta inmutabilidad de businessId anidado');
assert(nestedAfter.includes('allow delete: if resource.data.businessId == businessId'),
  'Falta exigir identidad original de módulo anidado en delete');
assert(nestedAfter.includes('allow create: if isTenantModule(moduleCol)'),
  'No alterar create de módulos anidados');
assert(nestedAfter.includes("moduleCol != 'auditLog'")
  && nestedAfter.includes("moduleCol != 'shifts'"),
  'No relajar bitácora inmutable ni borrado de turnos');
assert.throws(() => buildTenantUpdateIsolationProposalRules(staged.replace(
  'match /businesses/{businessId}/{moduleCol}/{moduleDoc} {',
  'match /businesses/{businessId}/{moduleCol}/{moduleDocRenamed} {'
)), /ALTO/);
console.log('PASS: 12 rutas raíz y 6 módulos anidados protegidos; lectura filtrada e identidad original en update/delete; fail-closed ante drift.');
console.warn('PENDIENTE: STAGED/despliegue siguen sin estos guards; falta emulador, revisión independiente y autorización.');
