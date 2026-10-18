/**
 * Guardia de cambios VIP: verifica que la propuesta más restrictiva esté
 * aislada y NO haya reemplazado accidentalmente las reglas operativas.
 * No sustituye pruebas con Firebase Emulator, usuarios reales ni rollback.
 *
 * Ejecutar: node scripts/verify-vip-staged.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const current = read('firestore.rules');
const staged = read('docs/firestore.vip-secure.STAGED.rules');
const api = read('vipRecoveryApi.ts');
const server = read('server.ts');
const client = read('src/lib/vipStorage.ts');
const checklist = read('docs/VIP_MIGRATION_CHECKLIST.md');

const vipStart = '    match /vip_profiles/{profileId} {';
const vipEnd = '\n    match /tables/{tableId} {';
const marker = '    // ACTIVAR SOLO DESPUES DE VALIDAR';
const first = (text, needle, label) => {
  const index = text.indexOf(needle);
  assert(index >= 0, `No se encontró ${label}`);
  return index;
};

const currentStart = first(current, vipStart, 'bloque VIP actual');
const currentEnd = first(current, vipEnd, 'siguiente bloque actual');
const stagedStart = first(staged, marker, 'inicio de propuesta VIP');
const stagedEnd = first(staged, vipEnd, 'siguiente bloque propuesto');
const currentVip = current.slice(currentStart, currentEnd);
const stagedVip = staged.slice(stagedStart, stagedEnd);

// La propuesta NO puede alterar las reglas de pedidos, caja, mesas, empleados, etc.
assert.equal(staged.slice(0, stagedStart), current.slice(0, currentStart),
  'La propuesta cambió reglas anteriores al módulo VIP');
assert.equal(staged.slice(stagedEnd), current.slice(currentEnd),
  'La propuesta cambió reglas posteriores al módulo VIP');

// Verifica que el cambio sea explícito y restrictivo respecto al flujo legado.
assert.match(currentVip, /allow get:\s*if true\s*;/,
  'El legado cambió: revisar migración antes de actualizar esta guardia');
assert.match(stagedVip, /function canManageVipProfiles\(businessId\)/);
assert.match(stagedVip, /getCallerMembershipRole\(businessId\) in \['OWNER', 'ADMIN', 'MANAGER'\]/);
assert.match(stagedVip, /allow get, list:\s*if resource\.data\.restaurantId is string/);
assert.match(stagedVip, /allow create:\s*if request\.resource\.data\.restaurantId is string/);
assert.match(stagedVip, /request\.resource\.data\.restaurantId == resource\.data\.restaurantId/);
assert.match(stagedVip, /request\.resource\.data\.pinHash == resource\.data\.pinHash/);
assert.match(stagedVip, /request\.resource\.data\.memberId == resource\.data\.memberId/);
assert.match(stagedVip, /vipCountersValid\(request\.resource\.data\)/);
assert.match(stagedVip, /\.hasOnly\(\['stamps', 'totalOrders', 'rewardAvailable', 'pendingStampsToValidate', 'updatedAt'\]\)/);
assert.match(stagedVip, /request\.resource\.data\.stamps == 0/);
assert.doesNotMatch(stagedVip, /allow (?:get|list|read|write|create|update|delete):\s*if true\s*;/);
assert.doesNotMatch(stagedVip, /isKnownRestaurant\(request\.resource\.data\)/);

// No publicar la nueva regla sin las rutas verificables y la bandera de transición.
for (const route of ['/api/vip/register', '/api/vip/recover', '/api/vip/profile']) {
  assert(api.includes(route), `Falta API segura: ${route}`);
}
assert.match(api, /session\.businessId !== businessId/);
assert.match(api, /Number\(session\.expiresAt\) <= Date\.now\(\)/);
assert.match(api, /const \{ pinHash: _secret, \.\.\.safe \}/);
assert.match(server, /registerVipRecoveryApi\(app\)/);
assert.match(client, /VITE_SECURE_VIP_API === 'true'/);
assert.match(client, /SECURE_VIP_API\s*&&\s*!tokenFor\(businessId\)/);
assert.match(checklist, /NO publicar|No publicar/i);
assert.match(checklist, /Calientito/);
assert.match(checklist, /Emulator/i);

console.log('OK: reglas VIP más restrictivas, aisladas y sin modificar otras colecciones.');
console.log('OK: rutas API y controles básicos de sesión presentes.');
console.log('PENDIENTE: Emulator, API real, respaldo, permisos de Calientito y aprobación de despliegue.');
