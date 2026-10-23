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
// Medianoche en CDMX: 05:59 UTC aún es 31 de octubre; 06:00 UTC ya es 1 de noviembre.
// El reporte no debe usar la fecha de creación ni agrupar cobros en el día equivocado.
const midnightOrders = [
  make({ code: 'ANTES-MEDIANOCHE', billingStatus: 'PAGADO',
    createdAt: '2026-10-30T16:00:00Z', paidAt: '2026-11-01T05:59:59Z', total: 35 }),
  make({ code: 'DESPUES-MEDIANOCHE', billingStatus: 'PAGADO',
    createdAt: '2026-10-31T16:00:00Z', paidAt: '2026-11-01T06:00:00Z', total: 65 }),
];
const novFirst = new Date('2026-11-01T12:00:00Z');
const firstDay = buildSalesReport(midnightOrders, 1, novFirst);
assert.equal(firstDay.totalSales, 65, 'El cobro anterior a medianoche CDMX pertenece al día anterior');
assert.equal(firstDay.orderCount, 1);
assert.equal(firstDay.days[0]?.key, '2026-11-01');
const crossingMonth = buildSalesReport(midnightOrders, 7, novFirst);
assert.equal(crossingMonth.totalSales, 100, 'El reporte semanal incluye ambos días al cruzar de mes');
assert.equal(crossingMonth.days.find((day) => day.key === '2026-10-31')?.total, 35);
assert.equal(crossingMonth.days.find((day) => day.key === '2026-11-01')?.total, 65);


 // Cambio de año: el filtro de 30 días incluye diciembre y enero, pero no cobros fuera de ventana.
const yearEndOrders = [
  make({ code: 'FUERA-30-DIAS', billingStatus: 'PAGADO',
    paidAt: '2026-12-01T18:00:00Z', total: 900 }),
  make({ code: 'ULTIMO-DIA-2026', billingStatus: 'PAGADO',
    paidAt: '2027-01-01T05:59:59Z', total: 40 }),
  make({ code: 'PRIMER-DIA-2027', billingStatus: 'PAGADO',
    paidAt: '2027-01-01T06:00:00Z', total: 60 }),
];
const janFirst = new Date('2027-01-01T18:00:00Z');
const yearStartToday = buildSalesReport(yearEndOrders, 1, janFirst);
assert.equal(yearStartToday.totalSales, 60, 'El cobro anterior a medianoche pertenece a diciembre');
const yearStartMonth = buildSalesReport(yearEndOrders, 30, janFirst);
assert.equal(yearStartMonth.totalSales, 100, 'La ventana de 30 días cruza de año y excluye cobros antiguos');
assert.equal(yearStartMonth.orderCount, 2);
assert.equal(yearStartMonth.days.find((day) => day.key === '2026-12-31')?.total, 40);
assert.equal(yearStartMonth.days.find((day) => day.key === '2027-01-01')?.total, 60);
assert.equal(yearStartMonth.days.length, 30, 'El filtro de 30 días conserva exactamente 30 fechas');

console.log('PASS: reportes concilian fechas de cobro, históricos y medianoche CDMX al cambiar de mes y año.');
