import assert from 'node:assert/strict';
import type { SaleReceipt } from '../src/types';
import {
  computeShiftSalesAll,
  computeShiftSalesCombined,
  computeShiftSalesFromOrders,
  computeShiftSalesFromPayments,
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

console.log('PASS: Caja concilia pagos mixtos, tickets y pedidos externos sin duplicar mesas.');
