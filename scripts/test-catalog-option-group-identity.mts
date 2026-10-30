// Paso 2: contrato de opciones del carrito, sin Firebase ni datos reales.
import assert from 'node:assert/strict';
import { assertUniqueOptionGroupIdentity, assertValidOptionChoicesBeforeCleaning, cleanOptionGroups } from '../src/lib/catalogOptions.ts';

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

// Los importes introducidos nunca deben convertirse silenciosamente a $0.
const invalidChoice = (price: unknown) => [group('extras', 'Extras')].map(g => ({
  ...g, choices: [{ name: 'Queso', price }],
})) as ReturnType<typeof group>[];
for (const [label, price] of [
  ['negativo', -5], ['NaN', Number.NaN], ['infinito', Infinity],
  ['texto', 'gratis'], ['vacío', ''], ['ausente', undefined],
  ['desbordamiento en centavos', Number.MAX_SAFE_INTEGER],
] as const) {
  assert.throws(() => assertValidOptionChoicesBeforeCleaning(invalidChoice(price)),
    /OPCIONES_CATALOGO_INVALIDAS/, label);
}
assert.throws(() => assertValidOptionChoicesBeforeCleaning([{
  ...group('extras', 'Extras'), choices: [{name:'Queso',price:5},{name:' queso ',price:10}],
}]), /OPCIONES_CATALOGO_INVALIDAS/, 'Nombres repetidos no se descartan silenciosamente');
assert.throws(() => assertValidOptionChoicesBeforeCleaning([{
  ...group('guiso', 'Guiso'), required:true, choices:[{name:'',price:0}],
}]), /OPCIONES_CATALOGO_INVALIDAS/, 'Un grupo obligatorio no desaparece al guardar');
assert.throws(() => assertValidOptionChoicesBeforeCleaning([{
  ...group('extras', 'Extras'), required:false, choices:[{name:'',price:0}],
}]), /OPCIONES_CATALOGO_INVALIDAS/, 'Un grupo con nombre no desaparece al guardar');
assert.throws(() => assertValidOptionChoicesBeforeCleaning([{
  ...group('',''), choices:[{name:'Queso',price:5}],
}]), /OPCIONES_CATALOGO_INVALIDAS/, 'Opciones con nombre requieren grupo');
assert.doesNotThrow(() => assertValidOptionChoicesBeforeCleaning([{
  ...group('',''), choices:[{name:'',price:0}],
}]), 'Placeholder totalmente vacío permitido');
assert.doesNotThrow(() => assertValidOptionChoicesBeforeCleaning([{
  ...group('extras','Extras'), choices:[{name:'Queso',price:'12.50'} as any],
}]), 'Consumidor antiguo con cadena numérica válida');
assert.doesNotThrow(() => assertValidOptionChoicesBeforeCleaning([group('extras','Extras')]));
assert.doesNotThrow(() => assertValidOptionChoicesBeforeCleaning([]));

console.log('PASS: grupos únicos preservados y colisiones de IDs/nombres rechazadas antes del guardado; precios inválidos y opciones duplicadas rechazados; sin Firebase.');
