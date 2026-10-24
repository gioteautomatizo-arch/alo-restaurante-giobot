// Verificación estática del acceso multinegocio: no usa red ni Firebase.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const screens = [
  'src/components/platform/BusinessPortal.tsx',
  'src/components/platform/BusinessOnboarding.tsx',
];

for (const screen of screens) {
  const source = readFileSync(screen, 'utf8');
  const images = [...source.matchAll(/<img\b[^>]*\bsrc=["'](\/[^"']+)["']/g)]
    .map((match) => match[1]);
  const platformLogos = images.filter((path) => /gioteautomatizo/i.test(path));
  const fullLogoTags = [...source.matchAll(/<img\b[^>]*\bsrc=["']\/brand\/gioteautomatizo-oficial\.jpg["'][^>]*>/g)]
    .map((match) => match[0]);
  assert.equal(fullLogoTags.length, screen.includes('BusinessPortal') ? 2 : 1,
    `${screen}: el logo completo debe aparecer en las vistas previstas`);
  for (const tag of fullLogoTags) {
    assert.match(tag, /\bobject-contain\b/,
      `${screen}: el logo oficial no debe recortarse con object-cover`);
    assert.doesNotMatch(tag, /\bobject-cover\b/,
      `${screen}: el logo oficial no debe combinar object-contain con object-cover`);
    assert.match(tag, /\balt=["'][^"']*Gioteautomatizo[^"']*["']/i,
      `${screen}: el logo oficial debe conservar una descripción accesible`);
  }

  assert.ok(platformLogos.length > 0,
    `${screen}: debe mostrar la marca Gioteautomatizo`);
  assert.ok(!images.some((path) => /giobot-logo/i.test(path)),
    `${screen}: Giobot no debe sustituir el logo de la plataforma`);

  for (const logo of platformLogos) {
    const asset = join('public', logo.slice(1));
    assert.ok(statSync(asset).size > 0,
      `${screen}: falta el archivo de marca ${asset}`);
  }
}

console.log('PASS: acceso y registro muestran archivos de Gioteautomatizo existentes; Giobot conserva su identidad separada.');
