// Paso 2: contrato de opciones del carrito, sin Firebase ni datos reales.
import assert from 'node:assert/strict';
import { assertUniqueOptionGroupIdentity, cleanOptionGroups } from '../src/lib/catalogOptions.ts';

const group = (id: string, name: string) => ({
  id, name, required: false, multiple: true,
  choices: [{ name: 'Queso', price: 5 }],
});
const valid = cleanOptionGroups([group('extras', 'Extras'), group('salsas', 'Salsas')]);
assert.doesNotThrow(() => assertUniqueOptionGroupIdentity(valid));
assert.equal(valid.length, 2);
assert.doesNotThrow(() => assertUniqueOptionGroupIdentity([]),
  'Catálogos antiguos sin grupos siguen admitidos');
for (const [label, groups] of [
  ['ID repetido', [group('extras', 'Extras'), group('extras', 'Salsas')]],
  ['nombre repetido', [group('extras', 'Extras'), group('salsas', 'extras')]],
  ['ID con espacios', [group(' extras ', 'Extras')]],
  ['ID generado en colisión', [group('grupo-2', 'Extras'), group('', 'Salsas')]],
] as const) {
  assert.throws(() => assertUniqueOptionGroupIdentity(cleanOptionGroups([...groups])),
    /OPCIONES_CATALOGO_INVALIDAS/, label);
}
console.log('PASS: grupos únicos preservados y colisiones de IDs/nombres rechazadas antes del guardado; sin Firebase.');
