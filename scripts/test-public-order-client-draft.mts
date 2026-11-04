/** Contrato cliente puro: no tocar red, Firebase ni consola de producción. */
import assert from 'node:assert/strict';
import { buildTrustedPublicOrderDraft } from '../src/lib/publicOrderClientApi';
import type { PublicCartLine } from '../src/lib/businessPublicPage';

const attemptId = 'web_' + 'e'.repeat(32);
const line: PublicCartLine = {
  key: 'a::Salsa: Verde',
  item: {
    id: 'a', name: 'Taco demo', category: 'Tacos', description: '',
    price: 30, available: true, sortOrder: 1,
    optionGroups: [{
      id: 'salsa', name: 'Salsa', required: false, multiple: false,
      choices: [{name: 'Verde', price: 5}],
    }],
  },
  quantity: 2, selection: {salsa: ['Verde']},
};
const base = { businessId: 'tenant-a', attemptId, customerName: 'Ana',
  cart: [line] };
const order = buildTrustedPublicOrderDraft(base);
assert.equal(order.businessId, 'tenant-a');
assert.equal(order.orderType, 'pickup');
assert.equal(order.customerName, 'Ana');
assert.equal(order.paymentMethod, 'efectivo');
assert.deepEqual(order.lines, [{productId: 'a', quantity: 2, selections: {salsa:['Verde']}}]);
assert.equal('total' in order, false, 'El navegador no debe enviar totales');
assert.equal('subtotal' in order, false);
assert.equal('unitPrice' in order.lines[0], false, 'No enviar precio de opción');
const table = buildTrustedPublicOrderDraft({...base, tableNumber: 60, guestCount: 4,
  notes: 'Sin cebolla'});
assert.equal(table.orderType, 'dine_in');
assert.equal(table.tableNumber, 60);
assert.equal(table.guestCount, 4);
assert.equal(table.notes, 'Sin cebolla');
assert.throws(() => buildTrustedPublicOrderDraft({...base, tableNumber: 61, guestCount: 4}), /mesa o de personas/);
assert.throws(() => buildTrustedPublicOrderDraft({...base, tableNumber: 1, guestCount: 0}), /mesa o de personas/);
assert.throws(() => buildTrustedPublicOrderDraft({...base, guestCount: 2}), /para llevar/);
assert.throws(() => buildTrustedPublicOrderDraft({...base, notes: 'a'.repeat(301)}), /300/);
assert.throws(() => buildTrustedPublicOrderDraft({...base, cart: [{...line, quantity: -1}]}), /cantidades/);
assert.throws(() => buildTrustedPublicOrderDraft({...base, cart: [{...line, selection: {salsa: ['Verde', 123]}} as unknown as PublicCartLine]}), /opciones/);
assert.throws(() => buildTrustedPublicOrderDraft({...base, attemptId:'other'}), /Conservamos tu carrito/);
console.log('PASS: draft seguro por identificadores/cantidades/opciones, notas y mesa 60; sin importes del cliente.');
