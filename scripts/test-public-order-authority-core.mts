import assert from 'node:assert/strict';
import { quotePublicOrderFromTrustedCatalog } from '../src/lib/publicOrderAuthority';
import type { BusinessCatalogDocument } from '../src/lib/businessCatalogService';

// Solo datos sintéticos. No hay credenciales, red, Firestore ni escrituras.
const catalog: BusinessCatalogDocument = {
  businessId: 'business-a', sourceLabel: 'Prueba A', updatedAt: '2026-10-28T00:00:00Z',
  updatedBy: 'owner-a', revision: 'rev-a-1',
  items: [
    {
      id: 'a-regular', name: 'Producto A', description: '', price: 75, available: true,
      category: 'Prueba', sortOrder: 1, optionGroups: [
        { id: 'guiso', name: 'Guiso', required: true, multiple: false,
          choices: [{name: 'Pollo', price: 0}, {name: 'Res', price: 5}] },
        { id: 'extras', name: 'Extras', required: false, multiple: true,
          choices: [{name: 'Queso', price: 10}, {name: 'Salsa', price: 0}] },
      ],
    },
    { id: 'a-sold-out', name: 'Agotado A', description: '', price: 90, available: false, category: 'Prueba', sortOrder: 2 },
    { id: 'a-decimal', name: 'Decimal A', description: '', price: 0.1, available: true, category: 'Prueba', sortOrder: 3,
      optionGroups: [{id: 'extra', name: 'Extra', required: false, multiple: false, choices: [{name: 'Dos', price: 0.2}]}] },
  ],
};
const profile = { businessId: 'business-a', restaurantId: 'business-a', published: true };
const regular = { productId: 'a-regular', quantity: 2, selections: { guiso: ['Res'], extras: ['Queso'] } };
const base = { businessId: 'business-a', profile, catalog, lines: [regular] };
const quote = quotePublicOrderFromTrustedCatalog(base);
assert.deepEqual(quote, {
  items: [{
    productId: 'a-regular', name: 'Producto A', quantity: 2, unitPrice: 90,
    totalPrice: 180, customizationSummary: 'Guiso: Res · Extras: Queso',
  }],
  subtotal: 180, total: 180, catalogRevision: 'rev-a-1',
});
assert.equal(catalog.items[0].price, 75, 'No muta el catálogo');
assert.equal(regular.quantity, 2, 'No muta la solicitud');

let rejected = 0;
const deny = (overrides: Record<string, unknown>, description: string) => {
  assert.throws(() => quotePublicOrderFromTrustedCatalog({ ...base, ...overrides } as typeof base),
    /PEDIDO_NO_VALIDO:/, description);
  rejected++;
};
const withLine = (line: unknown) => ({ lines: [line] });
deny({ profile: { ...profile, published: false } }, 'Negocio despublicado');
deny({ profile: { ...profile, businessId: 'business-b' } }, 'Perfil ajeno');
deny({ profile: { ...profile, restaurantId: 'business-b' } }, 'Perfil de otro tenant');
deny({ catalog: { ...catalog, businessId: 'business-b' } }, 'Catálogo ajeno');
deny({ businessId: 'business-b' }, 'No permitir tenant B con catálogo A');
deny({ businessId: 'business-a/../business-b' }, 'ID con slash');
deny(withLine({ productId: 'b-exclusive', quantity: 1 }), 'Producto exclusivo de B');
deny(withLine({ productId: 'a-sold-out', quantity: 1 }), 'Producto agotado');
deny(withLine({ ...regular, unitPrice: 0 }), 'Precio forjado');
deny(withLine({ ...regular, totalPrice: 0 }), 'Total de partida forjado');
deny(withLine({ ...regular, subtotal: 0 }), 'Subtotal forjado');
deny(withLine({ ...regular, billingStatus: 'PAGADO' }), 'Cobro forjado');
deny(withLine({ ...regular, discountAmount: 999 }), 'Descuento forjado');
deny(withLine({ ...regular, quantity: 0 }), 'Cantidad cero');
deny(withLine({ ...regular, quantity: -1 }), 'Cantidad negativa');
deny(withLine({ ...regular, quantity: 1.5 }), 'Cantidad fraccionaria');
deny(withLine({ ...regular, quantity: 100 }), 'Cantidad excesiva');
deny(withLine({ ...regular, quantity: Number.NaN }), 'NaN');
deny(withLine({ ...regular, quantity: Infinity }), 'Infinito');
deny({ lines: [] }, 'Pedido vacío');
deny({ lines: Array(51).fill(regular) }, 'Demasiadas partidas');
deny({ lines: [regular, regular] }, 'Partida duplicada');
deny({ lines: [
  { ...regular, selections: { guiso: ['Res'], extras: ['Salsa', 'Queso'] } },
  { ...regular, selections: { guiso: ['Res'], extras: ['Queso', 'Salsa'] } },
] }, 'La misma selección en distinto orden es duplicada');
deny(withLine({ ...regular, selections: {} }), 'Opción requerida ausente');
deny(withLine({ ...regular, selections: { guiso: ['Pollo', 'Res'] } }), 'Selección única múltiple');
deny(withLine({ ...regular, selections: { guiso: ['Pato'] } }), 'Opción inexistente');
deny(withLine({ ...regular, selections: { guiso: ['Res'], extras: ['Queso', 'Queso'] } }), 'Extra duplicado');
deny(withLine({ ...regular, selections: { guiso: ['Res'], otro: ['Queso'] } }), 'Grupo ajeno');
deny(withLine({ ...regular, selections: { guiso: ['res'] } }), 'Nombre de opción alterado');
deny(withLine({ ...regular, selections: ['Res'] }), 'Opciones mal formadas');
deny({ catalog: { ...catalog, items: [catalog.items[0], catalog.items[0]] } }, 'IDs de catálogo duplicados');
deny({ catalog: { ...catalog, items: [{ ...catalog.items[0], price: 75.005 }] } }, 'Precio con fracciones de centavo');
deny({ catalog: { ...catalog, items: [{ ...catalog.items[0], price: -1 }] } }, 'Precio negativo');
deny({ catalog: { ...catalog, items: [{ ...catalog.items[0], price: Infinity }] } }, 'Precio infinito');
deny({ catalog: { ...catalog, items: [{ ...catalog.items[0], optionGroups: [
  { id: 'guiso', name: 'Guiso', required: true, multiple: false, choices: [{name: 'Res', price: 5}, {name: 'res', price: 10}] },
] }] }, lines: [{ productId: 'a-regular', quantity: 1, selections: { guiso: ['Res'] } }] }, 'Opciones duplicadas por mayúsculas');
deny({ catalog: { ...catalog, items: [{ ...catalog.items[0], optionGroups: [
  { id: 'guiso', name: 'Guiso', required: true, multiple: false, choices: [{name: 'Res', price: 5}] },
  { id: 'guiso', name: 'Duplicado', required: false, multiple: true, choices: [{name: 'Queso', price: 10}] },
] }] }, lines: [{ productId: 'a-regular', quantity: 1, selections: { guiso: ['Res'] } }] }, 'Grupos duplicados');
deny({ catalog: { ...catalog, items: [{ ...catalog.items[0], price: 1_000_000 }] },
  lines: [{ ...regular, quantity: 2 }] }, 'Tope de importe');
const decimal = quotePublicOrderFromTrustedCatalog({
  ...base, lines: [{ productId: 'a-decimal', quantity: 3, selections: { extra: ['Dos'] } }],
});
assert.equal(decimal.items[0].unitPrice, 0.3);
assert.equal(decimal.items[0].totalPrice, 0.9);
assert.equal(decimal.total, 0.9);
const free = quotePublicOrderFromTrustedCatalog({
  ...base, catalog: { ...catalog, items: [{ ...catalog.items[1], available: true, price: 0 }] },
  lines: [{ productId: 'a-sold-out', quantity: 1 }],
});
assert.equal(free.total, 0, 'Un precio cero real del catálogo no es una manipulación');
console.log(`PASS: núcleo aislado de autoridad de precios: cotizaciones correctas, centavos exactos y ${rejected} rechazos de datos manipulados; NO hay backend ni reglas activadas.`);
