import assert from 'node:assert/strict';
import type { RestaurantOrder } from '../src/types.ts';
import { businessOrderChannelLabel } from '../src/lib/businessOrderChannel.ts';
import { parsePublicTableNumber, publicOrderOrigin } from '../src/lib/businessPublicPage.ts';

const base = {
  orderSource: 'CLIENTE_QR' as const,
  orderType: 'pickup' as const,
  orderOrigin: 'QR_EXTERNO' as const,
  notes: '',
  tableNumber: undefined,
};
assert.equal(parsePublicTableNumber('1'), 1);
assert.equal(parsePublicTableNumber('60'), 60);
assert.equal(parsePublicTableNumber('999'), 999);
assert.equal(parsePublicTableNumber('001'), 1, 'QR con ceros iniciales dentro del límite');
assert.equal(parsePublicTableNumber('099'), 99);
for (const bad of [null, '', '0', '000', '0000', '-1', '+1', '1000', 'Mesa 1', '1x', '1.2', '1e2', ' 1', '1 ', '1\\n', '１', 'NaN']) {
  assert.equal(parsePublicTableNumber(bad), undefined);
}
assert.deepEqual(publicOrderOrigin(4), { orderOrigin: 'MESA_QR', tableNumber: 4 });
assert.deepEqual(publicOrderOrigin(), { orderOrigin: 'QR_EXTERNO' });
assert.deepEqual(publicOrderOrigin(0), { orderOrigin: 'QR_EXTERNO' });
assert.deepEqual(publicOrderOrigin(1000), { orderOrigin: 'QR_EXTERNO' });
for (const invalid of [-1, 1.5, Number.NaN, Infinity, -Infinity]) {
  assert.deepEqual(publicOrderOrigin(invalid), { orderOrigin: 'QR_EXTERNO' }, 'Mesa no entera o fuera de rango');
}

const label = (parts: Partial<RestaurantOrder>) => businessOrderChannelLabel({ ...base, ...parts });
assert.equal(label({ ...publicOrderOrigin(4), notes: 'Mesa 4 · sin cebolla' }), 'QR · Mesa 4');
assert.equal(label({ orderSource: 'CLIENTE_QR', orderOrigin: 'QR_EXTERNO', notes: 'Mesa 5 · guacamole' }), 'QR · Mesa 5', 'Históricos con mesa solo en notas');
assert.equal(label({ orderSource: 'CLIENTE_QR', orderOrigin: 'QR_EXTERNO', notes: 'Sin sal' }), 'QR / enlace');
assert.equal(label({ orderSource: 'CAJA', orderOrigin: undefined, notes: undefined }), 'Capturado en caja');
assert.equal(label({ orderSource: 'MESERO', orderOrigin: undefined, orderType: 'dine_in', tableNumber: 2 }), 'Mesa 2');
assert.equal(label({ orderSource: 'MESERO', orderOrigin: undefined, orderType: 'delivery' }), 'Domicilio');
assert.equal(label({ orderSource: undefined, orderOrigin: undefined, orderType: 'pickup' }), 'Para llevar');
assert.equal(label({ orderSource: undefined, orderOrigin: 'MESA_QR', tableNumber: undefined }), 'QR de mesa');
assert.equal(label({ orderSource: 'CLIENTE_QR', orderOrigin: 'QR_EXTERNO', notes: 'Mesa 1234' }), 'QR / enlace');
assert.equal(label({ orderSource: 'CLIENTE_QR', orderOrigin: 'QR_EXTERNO', notes: 'Mesa 007 · nota' }), 'QR / enlace', 'No inferir mesa de notas con ceros iniciales');
assert.equal(label({ orderSource: 'MESERO', orderOrigin: undefined, notes: 'Mesa 8 · nota' }), 'Para llevar', 'Las notas de caja/mesero no son origen QR');
assert.equal(label({ orderSource: 'CLIENTE_QR', orderOrigin: 'MESA_QR', tableNumber: 1000, notes: '' }), 'QR de mesa', 'Mesa inválida no se muestra como número real');
console.log('PASS: origen QR mesa, enlace, caja, legacy y validación de números; sin alterar pagos.');
