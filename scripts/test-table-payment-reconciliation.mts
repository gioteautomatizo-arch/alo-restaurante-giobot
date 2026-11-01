import assert from 'node:assert/strict';
import type { RestaurantOrder, TablePayment } from '../src/types';
import { computeShiftSalesAll } from '../src/lib/shiftSales.ts';
import { reconcileTenantTablePayments, type TableReconciliationIssueCode } from '../src/lib/tablePaymentReconciliation.ts';

// Dos negocios y registros completamente ficticios. No Firebase, cobros ni datos reales.
const start = '2026-10-23T15:00:00.000Z';
const end = '2026-10-23T18:00:00.000Z';
const paidAt = '2026-10-23T16:00:00.000Z';
const makeOrder = (overrides: Partial<RestaurantOrder> = {}): RestaurantOrder => ({
  id: 'a-order-1', code: 'A-1', restaurantId: 'demo-a', orderType: 'dine_in',
  customerName: 'Ficticio', paymentMethod: 'efectivo', bringOwnContainer: false,
  items: [], subtotal: 30, discountAmount: 0, deliveryFee: 0, total: 30,
  status: 'ENTREGADO', billingStatus: 'PAGADO', paidAt, paymentId: 'a-pay',
  createdAt: start, updatedAt: paidAt, ...overrides,
});
const makePayment = (overrides: Partial<TablePayment> = {}): TablePayment => ({
  id: 'a-pay', code: 'PA-1', restaurantId: 'demo-a', tableNumber: 1,
  orderIds: ['a-order-1', 'a-order-2'], subtotal: 90, discountAmount: 0,
  tipAmount: 0, total: 90, paymentMethod: 'MIXTO',
  paymentBreakdown: [{ method: 'EFECTIVO', amount: 30 }, { method: 'TARJETA', amount: 60 }],
  changeDue: 0, status: 'PAGADO', createdAt: paidAt, chargedById: 'fake',
  chargedByName: 'Ficticio', ...overrides,
});
const aOrders = [makeOrder(), makeOrder({ id: 'a-order-2', code: 'A-2', total: 60, subtotal: 60 })];
const aPayment = makePayment();
const bOrder = makeOrder({ id: 'b-order', code: 'B-1', restaurantId: 'demo-b',
  total: 200, subtotal: 200, paymentId: 'b-pay' });
const bPayment = makePayment({ id: 'b-pay', code: 'PB-1', restaurantId: 'demo-b',
  orderIds: ['b-order'], subtotal: 200, total: 200, paymentMethod: 'EFECTIVO',
  paymentBreakdown: undefined });

const a = reconcileTenantTablePayments('demo-a', [aPayment], aOrders, start, end);
assert.deepEqual(a.issues, []);
assert.deepEqual(a.tableTotals, { cash: 30, card: 60, platforms: 0, total: 90, count: 1 });
assert.equal(a.authorizesClose, false, 'Un snapshot limpio NO autoriza cerrar Caja');
const b = reconcileTenantTablePayments('demo-b', [bPayment], [bOrder], start, end);
assert.deepEqual(b.issues, []);
assert.equal(b.tableTotals?.total, 200);
assert.equal(reconcileTenantTablePayments('demo-a', [aPayment, bPayment], [...aOrders, bOrder], start, end).tableTotals, null);
assert.ok(reconcileTenantTablePayments('demo-a', [aPayment, bPayment], [...aOrders, bOrder], start, end)
  .issues.some(issue => issue.code === 'TENANT_AJENO'), 'Un feed mezclado falla cerrado');

// Los pedidos de mesa ya representados por table_payments no deben contarse dos veces.
const pickup = makeOrder({ id: 'a-pickup', code: 'A-P', orderType: 'pickup',
  paymentId: undefined, total: 50, subtotal: 50, paymentMethod: 'efectivo' });
assert.equal(reconcileTenantTablePayments('demo-a', [aPayment], [...aOrders, pickup], start, end).tableTotals?.total, 90);
assert.deepEqual(computeShiftSalesAll([aPayment], [...aOrders, pickup], start, end),
  { cash: 80, card: 60, platforms: 0, total: 140, count: 2 },
  'Pago de mesa $90 + pedido externo $50; no sumar otra vez los $90 de los pedidos de mesa');

const hasIssue = (
  expected: TableReconciliationIssueCode,
  payments: TablePayment[],
  orders: RestaurantOrder[],
  shiftStart = start,
  shiftEnd = end,
) => {
  const result = reconcileTenantTablePayments('demo-a', payments, orders, shiftStart, shiftEnd);
  assert.ok(result.issues.some(issue => issue.code === expected),
    `Falta anomalía ${expected}; obtenidas: ${JSON.stringify(result.issues)}`);
  assert.equal(result.tableTotals, null, `No publicar total de mesa ante ${expected}`);
  assert.equal(result.authorizesClose, false);
};
hasIssue('ID_AUSENTE', [makePayment({ id: undefined })], aOrders);
hasIssue('ID_DUPLICADO', [aPayment, aPayment], aOrders);
hasIssue('ID_DUPLICADO', [aPayment], [...aOrders, aOrders[0]]);
hasIssue('PAGO_SIN_PEDIDOS', [makePayment({ orderIds: [] })], aOrders);
hasIssue('REFERENCIA_DUPLICADA', [makePayment({ orderIds: ['a-order-1', 'a-order-1'] })], aOrders);
hasIssue('PEDIDO_INEXISTENTE', [makePayment({ orderIds: ['a-order-1', 'missing'] })], aOrders);
hasIssue('PEDIDO_NO_ES_MESA', [aPayment], [makeOrder({ orderType: 'pickup' }), aOrders[1]]);
hasIssue('PEDIDO_NO_COBRADO', [aPayment], [makeOrder({ billingStatus: 'PENDIENTE' }), aOrders[1]]);
hasIssue('PEDIDO_CANCELADO', [aPayment], [makeOrder({ status: 'CANCELADO' }), aOrders[1]]);
hasIssue('REFERENCIA_NO_RECIPROCA', [aPayment], [makeOrder({ paymentId: 'otro' }), aOrders[1]]);
hasIssue('FECHA_COBRO_DISCREPANTE', [aPayment], [makeOrder({ paidAt: '2026-10-23T16:05:00.000Z' }), aOrders[1]]);
hasIssue('FECHA_COBRO_DISCREPANTE', [aPayment], [makeOrder({ paidAt: undefined }), aOrders[1]]);
hasIssue('IMPORTE_DISCREPANTE', [makePayment({ subtotal: 89 })], aOrders);
hasIssue('IMPORTE_DISCREPANTE', [makePayment({ discountAmount: 1 })], aOrders);
hasIssue('IMPORTE_DISCREPANTE', [makePayment({ tipAmount: 0.001 })], aOrders);
hasIssue('METODO_O_DESGLOSE_INVALIDO', [makePayment({ paymentBreakdown: [{ method: 'EFECTIVO', amount: 30 }] })], aOrders);
hasIssue('METODO_O_DESGLOSE_INVALIDO', [makePayment({ paymentMethod: 'MERCADO_PAGO', paymentBreakdown: undefined })], aOrders);
hasIssue('FECHA_INVALIDA', [makePayment({ createdAt: 'fecha-inválida' })], aOrders);
hasIssue('FECHA_INVALIDA', [aPayment], aOrders, 'fecha-inválida');
hasIssue('FECHA_INVALIDA', [aPayment], aOrders, start, 'fecha-inválida');
hasIssue('PEDIDO_COBRADO_SIN_PAGO', [], aOrders);
hasIssue('PEDIDO_EN_DOS_PAGOS', [aPayment, makePayment({ id: 'a-pay-2', orderIds: ['a-order-1'],
  subtotal: 30, total: 30, paymentMethod: 'EFECTIVO', paymentBreakdown: undefined })], aOrders);
const ignoredCancelled = reconcileTenantTablePayments('demo-a', [makePayment({ status: 'ANULADO' })], [], start, end);
assert.deepEqual(ignoredCancelled.issues, []);
assert.equal(ignoredCancelled.tableTotals?.total, 0, 'Pago anulado sin pedidos cobrados no genera ventas');
const outside = reconcileTenantTablePayments('demo-a',
  [makePayment({ createdAt: '2026-10-23T19:00:00.000Z' })], [], start, end);
assert.deepEqual(outside.issues, []);
assert.equal(outside.tableTotals?.total, 0, 'No atribuir pagos posteriores al turno');
const before = JSON.stringify([aPayment, aOrders, bPayment, bOrder]);
reconcileTenantTablePayments('demo-a', [aPayment], aOrders, start, end);
assert.equal(JSON.stringify([aPayment, aOrders, bPayment, bOrder]), before, 'Auditoría inmutable');
console.log('PASS: preflight mesa/pedido A/B, referencias recíprocas, MIXTO, ventanas, anomalías y no doble conteo.');
console.warn('PENDIENTE: snapshots completos/sincronizados, reglas Firebase desplegadas y comprobantes históricos; nunca autorizar cierre por este preflight.');
