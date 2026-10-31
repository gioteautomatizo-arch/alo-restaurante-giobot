/**
 * Paso 2: guard de consumidores de businessMemberships del código versionado.
 * No consulta Firebase, no activa flags ni sustituye inventario de clientes instalados.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const expected = new Map([
  ['businessDirectoryApi.ts', 2], // Admin SDK: listado privado opt-in
  ['businessInviteApi.ts', 7], // Admin SDK: membresías e invitaciones
  ['menuImportApi.ts', 1], // REST: membresía individual para importar menú
  ['src/lib/businessAuthService.ts', 1], // Web SDK: listado directo legado y get individual
  ['src/lib/businessCatalogService.ts', 1], // Web SDK: permiso de catálogo
  ['src/lib/businessEmployeeService.ts', 2], // Web SDK: roster por ID
  ['src/lib/businessPublicProfileService.ts', 1], // Web SDK: permiso de publicación
  ['src/lib/businessRegistrationThreeDocumentCandidate.ts', 1], // candidato inactivo
]);

function sourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', '.next', 'coverage', 'scripts', 'docs'].includes(entry.name))
        sourceFiles(join(dir, entry.name), files);
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(join(dir, entry.name));
  }
  return files;
}
function countConsumers(paths) {
  const result = new Map();
  for (const absolute of paths) {
    const path = relative(root, absolute).replaceAll('\\', '/');
    const source = readFileSync(absolute, 'utf8');
    const count = (source.match(/\bbusinessMemberships\b/g) || []).length;
    if (count) result.set(path, count);
  }
  return result;
}
function assertInventory(actual) {
  assert.deepEqual([...actual.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [...expected.entries()].sort(([a], [b]) => a.localeCompare(b)),
    'Cambió un consumidor de membresías: revisar permisos, lectura y compatibilidad antes de actualizar el inventario');
}
const actual = countConsumers(sourceFiles(root));
assertInventory(actual);
// Pruebas negativas: consumidor desconocido y ampliación no revisada del existente.
assert.throws(() => assertInventory(new Map([...actual, ['src/lib/unreviewed-list.ts', 1]])),
  /Cambió un consumidor/);
assert.throws(() => assertInventory(new Map([...actual].map(([path, count]) =>
  [path, path === 'src/lib/businessAuthService.ts' ? count + 1 : count]))),
  /Cambió un consumidor/);

const read = path => readFileSync(join(root, path), 'utf8');
const auth = read('src/lib/businessAuthService.ts');
const portal = read('src/components/platform/BusinessPortal.tsx');
const api = read('businessDirectoryApi.ts');
const employee = read('src/lib/businessEmployeeService.ts');
const candidate = read('src/lib/businessRegistrationThreeDocumentCandidate.ts');
const listStart = auth.indexOf('export async function getBusinessesForUser(');
const secureBranch = auth.indexOf('if (SECURE_BUSINESS_LIST_ENABLED) return getBusinessesFromVerifiedApi(userId);', listStart);
const directBranch = auth.indexOf('const membershipsQuery = query(', listStart);
assert(listStart >= 0 && secureBranch > listStart && directBranch > secureBranch,
  'El selector debe elegir el endpoint privado ANTES de la consulta directa heredada');
assert.equal((auth.match(/getDocsFromServer\(membershipsQuery\)/g) || []).length, 2,
  'El selector legado debe consultar y revalidar membresías desde servidor');
assert.match(auth, /const SECURE_BUSINESS_LIST_ENABLED = import\.meta\.env\?\.VITE_SECURE_BUSINESS_LIST === 'true'/,
  'El cliente privado debe permanecer opt-in');
assert.match(api, /process\.env\.ENABLE_SECURE_BUSINESS_LIST !== 'true'/,
  'El endpoint Admin SDK debe permanecer desactivado por defecto');
assert.match(api, /verifyIdToken\(bearer\[1\], true\)/,
  'El endpoint debe verificar token y revocación');
assert.match(portal, /getBusinessesForUser\(userId\)/,
  'El Portal debe usar la puerta de lectura');
assert.doesNotMatch(portal, /businessMemberships|\bgetDocsFromServer\b/,
  'El Portal no debe consultar membresías por su cuenta');
assert.match(employee, /getDocFromServer\(membershipRef\(/,
  'El roster debe comprobar membresía individual');
assert.doesNotMatch(employee, /getDocs(?:FromServer)?\(\s*membership/i,
  'El roster no debe reintroducir listado global de membresías');
assert.match(candidate, /businessHandleReservations/,
  'El candidato de alta 3 documentos requiere reserva permanente');

console.log('PASS (auditoría de código, NO corte): ' + actual.size +
  ' consumidores de businessMemberships inventariados; cambios no revisados bloqueados.');
console.log('PASS: Portal usa getBusinessesForUser; lectura privada/servidor opt-in, legado revalida servidor.');
console.warn('PENDIENTE: clientes instalados 2→3, reglas efectivas, colisiones históricas y recorrido A/B Android/iPad.');
