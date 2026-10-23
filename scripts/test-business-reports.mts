import assert from 'node:assert/strict';
import type { RestaurantOrder } from '../src/types';
import { buildSalesReport } from '../src/lib/businessReports.ts';

const now = new Date('2026-10-23T16:00:00Z');
const make = (partial: Partial<RestaurantOrder> = {}): RestaurantOrder => ({
  id: 'order-test', code: 'TEST-001', restaurantId: 'tenant-demo',
  orderType: 'pickup', customerName: 'Cliente prueba',
  paymentMethod: 'efectivo', bringOwnContainer: false,
  items: [], subtotal: 40, discountAmount: 0, deliveryFee: 0, total: 40,
  status: 'NUEVO', billingStatus: 'PENDIENTE',
  createdAt: '2026-10-23T13:00:00Z', updatedAt: '2026-10-23T13:00:00Z',
  ...partial,
});

const orders = [
  make({ code: 'PAGADO-HOY', billingStatus: 'PAGADO',
    createdAt: '2026-10-22T18:00:00Z', paidAt: '2026-10-23T14:00:00Z',
    paymentMethod: 'tarjeta', total: 80,
    items: [{ productId: 'cafe', name: 'Café', quantity: 2, unitPrice: 40, totalPrice: 80 }] }),
  make({ code: 'PENDIENTE-HOY', total: 120 }),
  make({ code: 'CANCELADO-HOY', status: 'CANCELADO', billingStatus: 'PAGADO',
    paidAt: '2026-10-23T15:00:00Z', total: 999 }),
  make({ code: 'PAGADO-AYER', billingStatus: 'PAGADO',
    createdAt: '2026-10-22T12:00:00Z', paidAt: '2026-10-22T13:00:00Z',
    total: 40 }),
];

const today = buildSalesReport(orders, 1, now);
assert.equal(today.totalSales, 80, 'Sólo cobros del día cuentan como venta de hoy');
assert.equal(today.orderCount, 1);
assert.equal(today.cancelledCount, 1);
assert.equal(today.byPayment.tarjeta, 80);
assert.equal(today.byPayment.efectivo, 0);
assert.equal(today.topProducts[0]?.quantity, 2);
assert.equal(today.days[0]?.total, 80);

const week = buildSalesReport(orders, 7, now);
assert.equal(week.totalSales, 120);
assert.equal(week.orderCount, 2);
assert.equal(week.byPayment.efectivo, 40);
assert.equal(week.byPayment.tarjeta, 80);
assert.equal(week.averageTicket, 60);
console.log('PASS: reportes cuentan pagos por fecha de cobro y excluyen pendientes y cancelados.');
