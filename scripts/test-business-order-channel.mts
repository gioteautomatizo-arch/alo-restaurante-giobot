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
for (const bad of [null, '', '0', '-1', '1000', 'Mesa 1', '1x', '1.2']) {
  assert.equal(parsePublicTableNumber(bad), undefined);
}
assert.deepEqual(publicOrderOrigin(4), { orderOrigin: 'MESA_QR', tableNumber: 4 });
assert.deepEqual(publicOrderOrigin(), { orderOrigin: 'QR_EXTERNO' });
assert.deepEqual(publicOrderOrigin(0), { orderOrigin: 'QR_EXTERNO' });
assert.deepEqual(publicOrderOrigin(1000), { orderOrigin: 'QR_EXTERNO' });

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
console.log('PASS: origen QR mesa, enlace, caja, legacy y validación de números; sin alterar pagos.');
