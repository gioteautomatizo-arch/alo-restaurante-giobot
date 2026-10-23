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
  make({ code: 'PAGADO-SIN-FECHA', billingStatus: 'PAGADO',
    createdAt: '2026-10-23T13:10:00Z', total: 250 }),
  make({ code: 'PAGADO-FECHA-INVALIDA', billingStatus: 'PAGADO',
    createdAt: '2026-10-23T13:15:00Z', paidAt: 'fecha inválida', total: 300 }),
  make({ code: 'PAGADO-HISTORICO-SIN-FECHA', billingStatus: 'PAGADO',
    createdAt: '2026-08-10T12:00:00Z', total: 150 }),
  make({ code: 'CANCELADO-SIN-FECHA', status: 'CANCELADO', billingStatus: 'PAGADO',
    createdAt: '2026-10-23T13:20:00Z', total: 999 }),

];

const today = buildSalesReport(orders, 1, now);
assert.equal(today.totalSales, 80, 'Sólo cobros del día cuentan como venta de hoy');
assert.equal(today.orderCount, 1);
assert.equal(today.cancelledCount, 2);
assert.equal(today.unreconciledPaidCount, 3, 'Incluir pendientes de conciliación históricos, no solo pedidos creados hoy');
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
assert.equal(week.unreconciledPaidCount, 3);
const cleanReport = buildSalesReport(orders.filter((order) => order.paidAt && order.paidAt !== 'fecha inválida'), 1, now);
assert.equal(cleanReport.unreconciledPaidCount, 0, 'No alertar cuando no hay pagos sin fecha');
console.log('PASS: reportes usan fecha de cobro y excluyen pendientes, cancelados y pagos sin fecha verificable; muestran los históricos por conciliar.');
