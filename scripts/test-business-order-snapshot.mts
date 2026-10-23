import assert from 'node:assert/strict';
import type { RestaurantOrder } from '../src/types';
import { summarizeBusinessOrders } from '../src/lib/businessOrderSnapshot.ts';

const now = new Date('2026-10-22T16:00:00Z');
const make = (partial: Partial<RestaurantOrder> = {}): RestaurantOrder => ({
  code: 'TEST-SALE', restaurantId: 'business-test', orderType: 'pickup',
  customerName: 'Cliente ficticio', paymentMethod: 'efectivo',
  bringOwnContainer: false, items: [], subtotal: 40,
  discountAmount: 0, deliveryFee: 0, updatedAt: '2026-10-22T14:00:00Z',
  status: 'NUEVO', billingStatus: 'PENDIENTE',
  createdAt: '2026-10-22T14:00:00Z', total: 40, ...partial,
});
const result = summarizeBusinessOrders([
  make(),
  make({ billingStatus: 'PAGADO', paidAt: '2026-10-22T15:00:00Z', total: 35 }),
  make({ createdAt: '2026-10-21T14:00:00Z', billingStatus: 'PAGADO', paidAt: '2026-10-22T13:00:00Z', total: 50 }),
  make({ status: 'CANCELADO', billingStatus: 'PAGADO', total: 900 }),
], now);
assert.equal(result.ordersToday, 2);
assert.equal(result.paidTodayCount, 2);
assert.equal(result.paidTodayTotal, 85);
assert.equal(result.pendingTodayCount, 1);
assert.equal(result.pendingTodayTotal, 40);
assert.equal(result.activeOrders, 3);
assert.equal(result.paidCancelledCount, 1);
assert.equal(result.paidMissingDateCount, 0);
const anomalies = summarizeBusinessOrders([
  make({ billingStatus: 'PAGADO', status: 'CANCELADO' }),
  make({ billingStatus: 'PAGADO', createdAt: '2026-10-21T14:00:00Z' }),
], now);
assert.equal(anomalies.paidCancelledCount, 1);
assert.equal(anomalies.paidMissingDateCount, 2 - 1);
assert.equal(anomalies.paidTodayCount, 0);
console.log('PASS: los pedidos pendientes no cuentan como ventas pagadas y los cobrados hoy sí.');
