import assert from 'node:assert/strict';
import type { RestaurantOrder, SaleReceipt } from '../src/types';
import { buildSalesReport } from '../src/lib/businessReports.ts';
import {
  computeShiftSalesAll,
  computeShiftSalesCombined,
  computeShiftSalesFromOrders,
  computeShiftSalesFromPayments,
  effectiveShiftStart,
  offTableSalesForDay,
  paymentsSalesForDay,
} from '../src/lib/shiftSales.ts';

// Datos sintéticos: ninguna prueba consulta Firebase ni modifica cobros reales.
const shiftStart = '2026-10-23T15:00:00.000Z';
const shiftEnd = '2026-10-23T18:00:00.000Z';
const mixedBreakdown = [
  { method: 'EFECTIVO' as const, amount: 30.25 },
  { method: 'TARJETA' as const, amount: 59.75 },
];

const tablePayments = [
  { status: 'PAGADO', createdAt: '2026-10-23T15:30:00.000Z',
    paymentMethod: 'MIXTO', total: 90, paymentBreakdown: mixedBreakdown },
  { status: 'PAGADO', createdAt: '2026-10-23T16:00:00.000Z',
    paymentMethod: 'TRANSFERENCIA', total: 40.5 },
  { status: 'ANULADO', createdAt: '2026-10-23T17:00:00.000Z',
    paymentMethod: 'EFECTIVO', total: 200 },
  { status: 'PAGADO', createdAt: '2026-10-23T19:00:00.000Z',
    paymentMethod: 'TARJETA', total: 500 },
];

const orders = [
  { orderType: 'pickup', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'efectivo', total: 50.25,
    createdAt: '2026-10-23T14:00:00.000Z', paidAt: '2026-10-23T17:00:00.000Z' },
  { orderType: 'delivery', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'transferencia', total: 24.75, paidAt: '2026-10-23T17:30:00.000Z' },
  { orderType: 'table', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'efectivo', total: 1000, paidAt: '2026-10-23T16:00:00.000Z' },
  { orderType: 'pickup', status: 'CANCELADO', billingStatus: 'PAGADO',
    paymentMethod: 'efectivo', total: 300, paidAt: '2026-10-23T16:00:00.000Z' },
  { orderType: 'pickup', status: 'NUEVO', billingStatus: 'PENDIENTE',
    paymentMethod: 'efectivo', total: 700, paidAt: '2026-10-23T16:00:00.000Z' },
  { orderType: 'pickup', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'tarjeta', total: 900, paidAt: '2026-10-23T19:00:00.000Z' },
];

const fromPayments = computeShiftSalesFromPayments(tablePayments, shiftStart, shiftEnd);
assert.deepEqual(fromPayments, { cash: 30.25, card: 59.75, platforms: 40.5, total: 130.5, count: 2 },
  'Los pagos mixtos se desglosan y los anulados o fuera del turno no suman');

const fromOrders = computeShiftSalesFromOrders(
  orders.filter((order) => order.orderType !== 'table'), shiftStart, shiftEnd,
);
assert.deepEqual(fromOrders, { cash: 50.25, card: 0, platforms: 24.75, total: 75, count: 2 },
  'El cobro usa paidAt; pendientes, cancelados y pagos posteriores quedan fuera');

const combined = computeShiftSalesAll(tablePayments, orders, shiftStart, shiftEnd);
assert.deepEqual(combined, { cash: 80.5, card: 59.75, platforms: 65.25, total: 205.5, count: 4 },
  'Caja no duplica pedidos de mesa ya representados por sus pagos');

const receipt: SaleReceipt = {
  code: 'RECIBO-DEMO', restaurantId: 'tenant-demo', tableNumber: 1, guestCount: 2,
  openedAt: shiftStart, closedAt: '2026-10-23T17:00:00.000Z',
  closedById: 'test', closedByName: 'Cajero demo',
  orderIds: [], paymentIds: [], orders: [],
  payments: [
    { code: 'PAGO-MIXTO', total: 90, discountAmount: 0, tipAmount: 0,
      paymentMethod: 'MIXTO', paymentBreakdown: mixedBreakdown,
      createdAt: '2026-10-23T15:30:00.000Z', chargedByName: 'Cajero demo' },
    { code: 'PAGO-TRANSFERENCIA', total: 40.5, discountAmount: 0, tipAmount: 0,
      paymentMethod: 'TRANSFERENCIA', createdAt: '2026-10-23T16:00:00.000Z',
      chargedByName: 'Cajero demo' },
  ],
  subtotal: 130.5, discountAmount: 0, tipAmount: 0,
  totalPaid: 130.5, status: 'PAGADO',
};
const fromReceipts = computeShiftSalesCombined([receipt], orders, shiftStart, shiftEnd);
assert.deepEqual(fromReceipts, { cash: 80.5, card: 59.75, platforms: 65.25, total: 205.5, count: 3 },
  'Tickets y pagos concilian importes, aunque su conteo sea diferente');


// Las ventanas diarias usan Ciudad de México (UTC-6 en estas fechas), no el día UTC.
const dayOrders = [
  { orderType: 'pickup', status: 'ENTREGADO', billingStatus: 'PAGADO',
    total: 10, paidAt: '2026-10-23T06:00:00.000Z' },
  { orderType: 'delivery', status: 'ENTREGADO', billingStatus: 'PAGADO',
    total: 25.5, paidAt: '2026-10-24T05:59:59.000Z' },
  { orderType: 'pickup', status: 'ENTREGADO', billingStatus: 'PAGADO',
    total: 99, paidAt: '2026-10-24T06:00:00.000Z' },
  { orderType: 'pickup', status: 'ENTREGADO', billingStatus: 'PAGADO',
    total: 90, paidAt: '2026-10-23T05:59:59.000Z' },
  { orderType: 'table', status: 'ENTREGADO', billingStatus: 'PAGADO',
    total: 300, paidAt: '2026-10-23T12:00:00.000Z' },
  { orderType: 'pickup', status: 'CANCELADO', billingStatus: 'PAGADO',
    total: 100, paidAt: '2026-10-23T12:00:00.000Z' },
  { orderType: 'delivery', status: 'NUEVO', billingStatus: 'PENDIENTE',
    total: 70, paidAt: '2026-10-23T12:00:00.000Z' },
];
assert.deepEqual(offTableSalesForDay(dayOrders, '2026-10-23'), { total: 35.5, count: 2 },
  'El corte diario de pedidos externos respeta medianoche de México y excluye mesas/no pagados');

const dayPayments = [
  { status: 'PAGADO', total: 12, createdAt: '2026-10-23T06:00:00.000Z' },
  { status: 'PAGADO', total: 4.25, createdAt: '2026-10-24T05:59:59.000Z' },
  { status: 'PAGADO', total: 99, createdAt: '2026-10-24T06:00:00.000Z' },
  { status: 'ANULADO', total: 300, createdAt: '2026-10-23T12:00:00.000Z' },
];
assert.deepEqual(paymentsSalesForDay(dayPayments, '2026-10-23'), { total: 16.25, count: 2 },
  'El corte diario de pagos de mesa respeta medianoche de México y excluye anulados');

assert.equal(
  effectiveShiftStart('2026-10-23T15:00:00.000Z', ['2026-10-23T05:59:59.000Z']),
  '2026-10-23T06:00:00.000Z',
  'El primer turno del día incluye cobros previos a su apertura sin absorber el día anterior',
);
assert.equal(
  effectiveShiftStart('2026-10-23T15:00:00.000Z', ['2026-10-23T14:00:00.000Z']),
  '2026-10-23T15:00:00.000Z',
  'Un turno posterior no absorbe ventas anteriores si ya existía otro turno del día',
);

console.log('PASS: Caja concilia pagos mixtos, tickets y pedidos externos sin duplicar mesas.');


// Consistencia entre Caja y Reportes para pedidos externos con paidAt válido.
// Los dos módulos deben coincidir en importes y conteo al cruzar medianoche CDMX,
// incluso cuando los centavos se suman en coma flotante.
const paidOffTableOrder = (
  code: string, orderType: 'pickup' | 'delivery',
  paymentMethod: 'efectivo' | 'tarjeta', total: number, paidAt: string,
): RestaurantOrder => ({
  id: code, code, restaurantId: 'tenant-demo', orderType,
  customerName: 'Cliente sintético', paymentMethod, bringOwnContainer: false,
  items: [], subtotal: total, discountAmount: 0, deliveryFee: 0, total,
  status: 'ENTREGADO', billingStatus: 'PAGADO',
  createdAt: '2026-10-22T18:00:00.000Z',
  updatedAt: '2026-10-22T18:00:00.000Z', paidAt,
});
const sharedOrders = [
  paidOffTableOrder('CENTAVO-1', 'pickup', 'efectivo', 0.1, '2026-10-23T06:00:00.000Z'),
  paidOffTableOrder('CENTAVO-2', 'delivery', 'tarjeta', 0.2, '2026-10-24T05:59:59.000Z'),
  paidOffTableOrder('DIA-SIGUIENTE', 'pickup', 'efectivo', 0.4, '2026-10-24T06:00:00.000Z'),
];
const endOfMexicoDay = new Date('2026-10-24T05:59:59.000Z');
const sharedShift = computeShiftSalesFromOrders(
  sharedOrders, '2026-10-23T06:00:00.000Z', endOfMexicoDay.toISOString(),
);
const sharedReport = buildSalesReport(sharedOrders, 1, endOfMexicoDay);
assert.equal(sharedShift.total, 0.3);
assert.equal(sharedShift.count, 2);
assert.equal(sharedReport.totalSales, sharedShift.total,
  'Caja y Reportes deben coincidir con fechas de cobro verificables');
assert.equal(sharedReport.orderCount, sharedShift.count);
assert.deepEqual(
  { cash: sharedShift.cash, card: sharedShift.card, platforms: sharedShift.platforms },
  { cash: sharedReport.byPayment.efectivo, card: sharedReport.byPayment.tarjeta,
    platforms: sharedReport.byPayment.transferencia },
  'El desglose de métodos debe coincidir sin mezclar el día siguiente',
);
console.log('PASS: Caja y Reportes coinciden en pedidos externos, centavos y medianoche CDMX.');
