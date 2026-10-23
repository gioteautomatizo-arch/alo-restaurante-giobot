import assert from 'node:assert/strict';
import type { RestaurantOrder } from '../src/types';
import { businessOrderAlert } from '../src/lib/businessOrderAlerts.ts';

const make = (partial: Partial<RestaurantOrder> = {}): RestaurantOrder => ({
  id: 'order-test-1',
  code: 'GIO-TEST-001',
  restaurantId: 'tenant-demo',
  orderType: 'pickup',
  customerName: 'Nombre privado de prueba',
  phone: '5550001111',
  paymentMethod: 'efectivo',
  bringOwnContainer: false,
  items: [],
  subtotal: 140,
  discountAmount: 0,
  deliveryFee: 0,
  total: 140,
  status: 'NUEVO',
  billingStatus: 'PENDIENTE',
  createdAt: '2026-10-23T14:00:00Z',
  updatedAt: '2026-10-23T14:00:00Z',
  ...partial,
});

const pending = businessOrderAlert(make());
assert.ok(pending);
assert.equal(pending.id, 'order:order-test-1');
assert.equal(pending.at, '2026-10-23T14:00:00Z');
assert.match(pending.summary, /Sin cobro registrado/);
assert.match(pending.summary, /140/);
assert.doesNotMatch(JSON.stringify(pending), /Nombre privado|5550001111/);

const paid = businessOrderAlert(make({ billingStatus: 'PAGADO' }));
assert.match(paid?.summary || '', /^Pagado/);
const cancelled = businessOrderAlert(make({ status: 'CANCELADO' }));
assert.match(cancelled?.summary || '', /^Cancelado/);
const unknown = businessOrderAlert(make({ billingStatus: undefined }));
assert.match(unknown?.summary || '', /^Cobro por verificar/);
const invalidAmount = businessOrderAlert(make({ total: -1 }));
assert.match(invalidAmount?.summary || '', /Importe por revisar/);
assert.equal(businessOrderAlert(make({ id: '' })), null);
assert.equal(businessOrderAlert(make({ createdAt: 'fecha inválida' })), null);
console.log('PASS: notificaciones de pedidos con estados prudentes y sin datos personales.');
