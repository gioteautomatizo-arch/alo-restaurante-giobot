/**
 * Paso 2: propuesta de reglas SOLO para Firestore Emulator.
 *
 * No modifica firestore.rules ni STAGED. Evita que una escritura sobre un
 * documento de B se autorice como miembro de A cambiando restaurantId a A.
 * No corrige por sí sola todos los permisos de tablas ni el legado Calientito.
 */
import assert from 'node:assert/strict';

const OPERATIONAL = [
  'staff_users/{userId}',
  'shifts/{shiftId}',
  'expenses/{expenseId}',
  'cxc_records/{cxcId}',
  'inventory_items/{itemId}',
  'sobre_movements/{movementId}',
  'daily_menu/{menuDoc}',
];

const OTHER_MUTABLE = [
  'tables/{tableId}',
  'table_sessions/{sessionId}',
  'public_table_orders/{orderId}',
  'restaurant_orders/{orderId}',
];

function updateMatch(rules, path, transform) {
  const anchor = '    match /' + path + ' {';
  assert.equal(rules.split(anchor).length, 2,
    'ALTO: ruta ausente o ambigua: ' + path);
  const start = rules.indexOf(anchor);
  const next = rules.indexOf('\n    match /', start + anchor.length);
  const end = next < 0 ? rules.length : next;
  const original = rules.slice(start, end);
  const modified = transform(original);
  assert.notEqual(modified, original, 'ALTO: no se protegió ' + path);
  return rules.slice(0, start) + modified + rules.slice(end);
}

function replacePermission(block, anchor, replacement) {
  assert.equal(block.split(anchor).length, 2,
    'ALTO: permiso cambió o es ambiguo: ' + anchor);
  const start = block.indexOf(anchor);
  const conditionStart = start + anchor.length;
  const end = block.indexOf(';', conditionStart);
  assert(end > conditionStart, 'ALTO: condición sin cierre: ' + anchor);
  const condition = block.slice(conditionStart, end).trim();
  return block.slice(0, start) + replacement(condition) + block.slice(end + 1);
}

export function buildTenantUpdateIsolationProposalRules(staged) {
  assert.equal(typeof staged, 'string');
  let rules = staged;
  for (const path of OPERATIONAL) {
    rules = updateMatch(rules, path, block =>
      replacePermission(block, '      allow create, update: if ', condition =>
        '      allow create: if ' + condition + ';\n'
        + '      allow update: if request.resource.data.restaurantId == resource.data.restaurantId\n'
        + '        && isAuthorizedRestaurant(resource.data)\n'
        + '        && (' + condition + ');'));
  }
  for (const path of OTHER_MUTABLE) {
    rules = updateMatch(rules, path, block =>
      replacePermission(block, '      allow update: if ', condition =>
        '      allow update: if request.resource.data.restaurantId == resource.data.restaurantId\n'
        + '        && (' + condition + ');'));
  }
  rules = updateMatch(rules, 'table_service_requests/{requestId}', block => {
    const anchor = '      allow update, delete: if ';
    return replacePermission(block, anchor, condition =>
      '      allow update: if request.resource.data.restaurantId == resource.data.restaurantId\n'
      + '        && (' + condition + ');\n'
      + '      allow delete: if ' + condition + ';');
  });
  // La identidad interna también protege lecturas. Firestore evalúa reglas
  // contra el resultado potencial de una consulta: los listeners deben filtrar
  // businessId == businessId de la ruta para no quedar denegados.
  rules = updateMatch(rules, 'businesses/{businessId}/{moduleCol}/{moduleDoc}', block =>
    replacePermission(block, '      allow read: if ', condition =>
      '      allow read: if resource.data.businessId == businessId\n'
      + '        && (' + condition + ');'));
  // Los módulos anidados se autorizan por la ruta businesses/{businessId}.
  // Si un documento fue mal asociado, no permitir que un miembro de esa ruta
  // reclame o borre datos que declaran pertenecer a otro negocio.
  rules = updateMatch(rules, 'businesses/{businessId}/{moduleCol}/{moduleDoc}', block => {
    const withUpdate = replacePermission(block, '      allow update: if ', condition =>
      '      allow update: if resource.data.businessId == businessId\n'
      + '        && request.resource.data.businessId == resource.data.businessId\n'
      + '        && (' + condition + ');');
    return replacePermission(withUpdate, '      allow delete: if ', condition =>
      '      allow delete: if resource.data.businessId == businessId\n'
      + '        && (' + condition + ');');
  });
  return rules;
}
