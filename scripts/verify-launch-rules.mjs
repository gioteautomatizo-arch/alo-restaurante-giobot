/**
 * Compara el proyecto Firestore activo (versionado, NO remoto) contra la
 * propuesta de lanzamiento. Evita cambios colaterales inadvertidos.
 *
 * Este script NO despliega ni hace copias de seguridad.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const current = readFileSync('firestore.rules', 'utf8');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const firebaseConfig = JSON.parse(readFileSync('firebase.json', 'utf8'));

assert.equal(firebaseConfig.firestore.rules, 'firestore.rules',
  'ALTO: firebase.json apunta a otro archivo de reglas.');
assert.notEqual(current, staged,
  'ALTO: las reglas preparadas se copiaron sobre las activas o perdimos la propuesta independiente.');
assert.match(current, /match \/vip_profiles\/\{profileId\}\s*\{\s*allow get:\s*if true;/,
  'ALTO: cambió el bloque VIP versionado; revisar el despliegue real y actualizar manualmente este control.');

function getBlocks(source) {
  const found = [];
  for (const match of source.matchAll(/^[ \t]*match (\/[^\s]+) \{/gm)) {
    const start = match.index;
    let depth = 1;
    let end = start + match[0].length;
    for (; end < source.length && depth > 0; end++) {
      if (source[end] === '{') depth++;
      if (source[end] === '}') depth--;
    }
    assert.equal(depth, 0, 'Regla incompleta: ' + match[1]);
    found.push({ path: match[1], start, end, text: source.slice(start, end) });
  }
  return found;
}

const currentBlocks = getBlocks(current);
const stagedBlocks = getBlocks(staged);
assert.deepEqual(stagedBlocks.map(x => x.path), currentBlocks.map(x => x.path),
  'ALTO: la propuesta agrega, elimina o reordena reglas match. Requiere revisión explícita.');

const allowed = new Set([
  '/businesses/{businessId}/employees/{employeeUserId}',
  '/businesses/{businessId}/catalog/{catalogDoc}',
  '/businessMemberships/{membershipId}',
  '/vip_profiles/{profileId}',
  '/restaurant_orders/{orderId}',
]);
const changed = [];
for (let i = 1; i < currentBlocks.length; i++) {
  if (currentBlocks[i].text === stagedBlocks[i].text) continue;
  const path = currentBlocks[i].path;
  assert(allowed.has(path), 'ALTO: propuesta cambia regla ajena a la migración: ' + path);
  changed.push(path);
}
assert.deepEqual(changed.sort(), [...allowed].sort(),
  'ALTO: la lista de bloques modificados no corresponde a los cinco revisados.');

function skeleton(source, blocks) {
  for (const block of [...blocks].slice(1).reverse()) {
    source = source.slice(0, block.start) + '__BLOCK__' + block.path + source.slice(block.end);
  }
  return source;
}
// Única diferencia autorizada fuera de los cinco bloques: las dos funciones
// adicionales de validación VIP, excluidas explícitamente por su marcador.
const marker = '    // ACTIVAR SOLO DESPUES DE VALIDAR LOGIN, MIGRACION Y PRUEBAS CON EMULATOR.';
const vipStub = '__BLOCK__/vip_profiles/{profileId}';
const oldSkeleton = skeleton(current, currentBlocks);
const stagedSkeleton = skeleton(staged, stagedBlocks);
const start = stagedSkeleton.indexOf(marker);
const end = stagedSkeleton.indexOf(vipStub);
assert(start >= 0 && end > start, 'ALTO: faltan las funciones de validación VIP esperadas.');
const vipHelpers = stagedSkeleton.slice(start, end);
assert.match(vipHelpers, /function canManageVipProfiles\(businessId\)/);
assert.match(vipHelpers, /function vipCountersValid\(data\)/);
assert.equal(stagedSkeleton.slice(0, start) + stagedSkeleton.slice(end), oldSkeleton,
  'ALTO: hay cambios no autorizados en funciones globales u otras secciones de Firestore.');

const catalog = stagedBlocks.find(x => x.path === '/businesses/{businessId}/catalog/{catalogDoc}').text;
assert.match(catalog, /isPublishedBusiness\(businessId\)/);
assert.match(catalog, /getCallerMembershipRole\(businessId\) in \['OWNER', 'ADMIN', 'MANAGER'\]/);
assert.doesNotMatch(catalog, /allow read:\s*if true/);
const vip = stagedBlocks.find(x => x.path === '/vip_profiles/{profileId}').text;
assert.doesNotMatch(vip, /allow get:\s*if true/);
assert.match(vip, /canManageVipProfiles/);
const orders = stagedBlocks.find(x => x.path === '/restaurant_orders/{orderId}').text;
assert.match(orders, /isPublishedBusiness\(request\.resource\.data\.restaurantId\)/);
assert.match(orders, /billingStatus == 'PENDIENTE'/);

console.log('OK: firebase.json conserva el archivo de producción; reglas staged siguen separadas.');
console.log('OK: solo cinco bloques de reglas cambiaron y las funciones auxiliares VIP están aisladas.');
console.log('PENDIENTE: respaldo de datos, migración VIP, pruebas de Calientito y aprobación humana antes del despliegue.');
