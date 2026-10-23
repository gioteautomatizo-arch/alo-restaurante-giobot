import assert from 'node:assert/strict';
import type { BusinessCatalogItem } from '../src/lib/businessCatalogService.ts';
import {
  canSubmitPublicCart,
  cartToOrderItems,
  cartTotal,
  groupVisibleCatalog,
  type PublicCartLine,
} from '../src/lib/businessPublicPage.ts';

const taco: BusinessCatalogItem = {
  id: 'taco-1',
  name: 'Taco',
  description: 'Taco de prueba',
  category: 'Antojitos',
  available: true,
  price: 18,
  sortOrder: 1,
  optionGroups: [{
    id: 'extras', name: 'Extras', required: false, multiple: true,
    choices: [{ name: 'Queso', price: 5 }],
  }],
};

const all: BusinessCatalogItem[] = [
  { ...taco, id: 'sin-nombre', name: '' },
  { ...taco, id: 'sin-precio', price: null },
  { ...taco, id: 'precio-negativo', price: -15 },
  { ...taco, id: 'precio-infinito', price: Infinity },
  { ...taco, id: 'precio-nan', price: Number.NaN },
  { ...taco, id: 'agotado', available: false },
  { ...taco, id: 'agua', category: 'Bebidas', name: 'Agua', price: 0, sortOrder: 2 },
  taco,
];

const visible = groupVisibleCatalog(all);
assert.equal(visible.length, 2);
assert.deepEqual(visible.map((group) => group.category), ['Antojitos', 'Bebidas']);
assert.deepEqual(visible.flatMap((group) => group.items.map((item) => item.id)), ['taco-1', 'agua']);

const lines: PublicCartLine[] = [{
  key: 'taco-1::Extras: Queso',
  item: taco,
  quantity: 2,
  selection: { extras: ['Queso'] },
}];
assert.equal(cartTotal(lines), 46);
const converted = cartToOrderItems(lines);
assert.equal(converted.length, 1);
assert.equal(converted[0].unitPrice, 23);
assert.equal(converted[0].totalPrice, 46);
assert.equal(converted[0].customizationSummary, 'Extras: Queso');
assert.equal(canSubmitPublicCart('ready', 1, false), true);
assert.equal(canSubmitPublicCart('loading', 1, false), false);
assert.equal(canSubmitPublicCart('error', 1, false), false);
assert.equal(canSubmitPublicCart('ready', 0, false), false);
assert.equal(canSubmitPublicCart('ready', 1, true), false);
assert.equal(canSubmitPublicCart('ready', Number.NaN, false), false);
console.log('PASS: carrito público bloquea envíos sin menú confiable y excluye precios inválidos.');
