import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { makeQrMatrix } from '../src/lib/qrCode.ts';
import { businessTableUrl, calientitoTableUrl, setSiteBaseUrl } from '../src/lib/siteUrl.ts';
import { readPublicTableParam, parsePublicTableNumber, isValidPublicGuestCount } from '../src/lib/businessPublicPage.ts';

const saved = new Map<string, string>();
Object.assign(globalThis, {
  window: { location: { origin: 'https://gioteautomatizo.ai.studio' } },
  localStorage: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) },
});
function decodeQr(text: string): string | undefined {
  const matrix = makeQrMatrix(text);
  const scale = 6, size = (matrix.length + 8) * scale;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const index = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
      rgba[index] = rgba[index + 1] = rgba[index + 2] = 0;
    }
  }));
  return jsQR(rgba, size, size)?.data;
}
for (const business of ['giomero', 'otro-negocio', 'café-demo']) {
  for (const table of [1, 3, 10, 60, 999]) {
    const url = businessTableUrl(business, table);
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/', 'QR uses root so the hosting does not need nested routes');
    assert.equal(decodeURIComponent(parsed.hash.split('?')[0]), `#negocio/${business}`);
    assert.equal(parsePublicTableNumber(readPublicTableParam(parsed.search, parsed.hash)), table);
    assert.equal(decodeQr(url), url, 'Independent scanner must decode the exact tenant and table');
  }
}
assert.equal(readPublicTableParam('?table=3', ''), '3');
assert.equal(readPublicTableParam('', '#negocio/giomero?table=7'), '7');
assert.equal(readPublicTableParam('?table=2', '#negocio/giomero?table=7'), '2');
assert.equal(readPublicTableParam('', '#negocio/giomero'), null);
assert.equal(readPublicTableParam('?table=', ''), '');
for (const invalid of [0, -1, 1.5, 1000, Infinity, NaN]) assert.throws(() => businessTableUrl('giomero', invalid));
for (const invalid of [null, 0, -1, 1.5, 11, NaN, Infinity]) assert.equal(isValidPublicGuestCount(invalid), false);
for (const count of [1, 4, 10]) assert.equal(isValidPublicGuestCount(count), true);
assert.equal(calientitoTableUrl(2), 'https://gioteautomatizo.ai.studio/restaurante-calientito?table=2');
setSiteBaseUrl('https://app.example.com');
assert.equal(businessTableUrl('giomero', 3), 'https://app.example.com/#negocio/giomero?table=3');
// Pegar una URL profunda no debe generar QR con la ruta de Calientito como prefijo.
setSiteBaseUrl('https://app.example.com/restaurante-calientito?table=2');
assert.equal(businessTableUrl('giomero', 3), 'https://app.example.com/#negocio/giomero?table=3');
// La vista previa de AI Studio no es accesible como enlace definitivo desde otro celular.
setSiteBaseUrl('https://ais-dev-old.usercontent.goog/preview');
globalThis.window.location.origin = 'https://ais-dev-current.usercontent.goog';
assert.equal(businessTableUrl('giomero', 3), 'https://gioteautomatizo.ai.studio/#negocio/giomero?table=3');
setSiteBaseUrl('');
assert.equal(calientitoTableUrl(2), 'https://gioteautomatizo.ai.studio/restaurante-calientito?table=2');
console.log('PASS: QR roundtrip through independent decoder, tenant/table URLs, portable origins, legacy parameters and guest validation.');
