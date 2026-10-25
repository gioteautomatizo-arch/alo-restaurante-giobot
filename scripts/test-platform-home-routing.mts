import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldShowPublicDirectory } from '../src/lib/platformHomeRouting';

assert.equal(shouldShowPublicDirectory('', false), true, 'La URL / abre el directorio de negocios.');
assert.equal(shouldShowPublicDirectory('#', false), true, 'El marcador # abre el directorio.');
assert.equal(shouldShowPublicDirectory('#explorar', false), true, 'La ruta pública #explorar sigue vigente.');
assert.equal(shouldShowPublicDirectory('', true), false, 'Un QR histórico en / no debe perder la mesa.');
for (const route of ['#admin', '#business', '#business-new', '#negocio/alo-restaurante', '#negocio/otra-tienda', '#business/otra-tienda']) {
  assert.equal(shouldShowPublicDirectory(route, false), false, route + ' no debe redirigir al directorio.');
}

const main = readFileSync('src/main.tsx', 'utf8');
assert.match(main, /shouldShowPublicDirectory\(hash, hasTableQr\)/,
  'El router principal debe usar la validación del inicio.');
assert.match(main, /'restaurante-calientito': 'alo-restaurante'/,
  'El enlace histórico /restaurante-calientito debe mantenerse.');
assert.match(main, /publicId === 'alo-restaurante'/,
  'La página Calientito debe conservarse con un destino explícito.');
const portal = readFileSync('src/components/platform/BusinessPortal.tsx', 'utf8');
assert.match(portal, /const openPublicCalientito = \(\) => \{[\s\S]*?window\.location\.hash = '#negocio\/alo-restaurante';/,
  'El acceso empresarial debe enlazar a Calientito sin depender de la raíz.');

console.log('PASS: la raíz pública abre el directorio; las rutas de negocios, administración y QR antiguos siguen separadas.');

// Regresión de la portada pública: separar exploración de acceso/registro empresarial.
// Guardia estática: no navega ni consulta Firebase.
const directory = readFileSync('src/components/platform/BusinessDirectory.tsx', 'utf8');
assert.match(directory, /const openBusinessAccess = \(\) => \{ window\.location\.hash = '#business'; \};/);
assert.match(directory, /const openRegistration = \(\) => \{ window\.location\.hash = '#business-new'; \};/);
assert.match(directory, /onClick=\{openBusinessAccess\}[^>]*><Store[^>]*\/> Tengo un negocio<\/button>/);
assert.match(directory, /getDocs\(query\(collection\(db, 'publicBusinessProfiles'\), where\('published', '==', true\)\)\)/);
console.log('PASS: la portada separa explorar, acceso y registro; solo consulta perfiles publicados (guardia estática).');
