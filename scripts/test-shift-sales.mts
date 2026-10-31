import assert from 'node:assert/strict';
import type { RestaurantOrder, SaleReceipt } from '../src/types';
import { buildSalesReport } from '../src/lib/businessReports.ts';
import {
  auditUnclassifiedPaidOrders,
  computeShiftSalesAll,
  computeShiftSalesCombined,
  computeShiftSalesFromOrders,
  computeShiftSalesFromPayments,
  effectiveShiftStart,
  isOffTableOrder,
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
    paymentMethod: 'efectivo', total: 10, paidAt: '2026-10-23T06:00:00.000Z' },
  { orderType: 'delivery', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'efectivo', total: 25.5, paidAt: '2026-10-24T05:59:59.000Z' },
  { orderType: 'pickup', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'efectivo', total: 99, paidAt: '2026-10-24T06:00:00.000Z' },
  { orderType: 'pickup', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'efectivo', total: 90, paidAt: '2026-10-23T05:59:59.000Z' },
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
  { status: 'PAGADO', paymentMethod: 'EFECTIVO', total: 12, createdAt: '2026-10-23T06:00:00.000Z' },
  { status: 'PAGADO', paymentMethod: 'TARJETA', total: 4.25, createdAt: '2026-10-24T05:59:59.000Z' },
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


// Bordes inclusivos del turno: un cobro exactamente al abrir/cerrar pertenece al
// turno, pero uno posterior por 1 ms no. Usamos pagos ficticios sin Firebase.
const boundaryPayments = [
  { status: 'PAGADO', createdAt: shiftStart, paymentMethod: 'EFECTIVO', total: 10 },
  { status: 'PAGADO', createdAt: shiftEnd, paymentMethod: 'TARJETA', total: 20 },
  { status: 'PAGADO', createdAt: '2026-10-23T17:00:00.000Z',
    paymentMethod: 'TRANSFERENCIA', total: 5 },
  { status: 'PAGADO', createdAt: '2026-10-23T18:00:00.001Z',
    paymentMethod: 'EFECTIVO', total: 900 },
  { status: 'ANULADO', createdAt: shiftStart, paymentMethod: 'EFECTIVO', total: 500 },
];
const boundarySnapshot = JSON.stringify(boundaryPayments);
assert.deepEqual(
  computeShiftSalesFromPayments(boundaryPayments, shiftStart, shiftEnd),
  { cash: 10, card: 20, platforms: 5, total: 35, count: 3 },
  'Caja incluye exactamente los límites del turno, no el milisegundo posterior ni pagos anulados',
);
assert.deepEqual(
  computeShiftSalesAll(boundaryPayments, [], shiftStart, shiftEnd),
  { cash: 10, card: 20, platforms: 5, total: 35, count: 3 },
  'La conciliación combinada no duplica pagos cuando no hay pedidos externos',
);
assert.equal(JSON.stringify(boundaryPayments), boundarySnapshot,
  'Calcular el corte no debe modificar los pagos de entrada');
console.log('PASS: Caja respeta límites exactos del turno y no modifica pagos sintéticos.');


// Bordes de turno para pedidos externos: se usa paidAt y se evitan duplicados de mesa.
// Estos casos complementan los bordes de pagos de mesa probados arriba.
const boundaryOrders = [
  { orderType: 'pickup', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'efectivo', total: 12.5,
    createdAt: '2026-10-22T12:00:00.000Z', paidAt: shiftStart },
  { orderType: 'delivery', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'transferencia', total: 17.75,
    createdAt: '2026-10-22T12:00:00.000Z', paidAt: shiftEnd },
  { orderType: 'pickup', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'tarjeta', total: 999, paidAt: '2026-10-23T18:00:00.001Z' },
  { orderType: 'table', status: 'ENTREGADO', billingStatus: 'PAGADO',
    paymentMethod: 'efectivo', total: 200, paidAt: shiftStart },
  { orderType: 'delivery', status: 'NUEVO', billingStatus: 'PENDIENTE',
    paymentMethod: 'efectivo', total: 100, paidAt: shiftStart },
  { orderType: 'pickup', status: 'CANCELADO', billingStatus: 'PAGADO',
    paymentMethod: 'tarjeta', total: 50, paidAt: shiftEnd },
];
const boundaryOrdersSnapshot = JSON.stringify(boundaryOrders);
const boundaryOrderTotals = { cash: 12.5, card: 0, platforms: 17.75, total: 30.25, count: 2 };
assert.deepEqual(
  computeShiftSalesFromOrders(boundaryOrders.filter(isOffTableOrder), shiftStart, shiftEnd),
  boundaryOrderTotals,
  'Pedidos externos cobrados exactamente al abrir/cerrar cuentan; posteriores, pendientes y cancelados no',
);
assert.deepEqual(
  computeShiftSalesAll([], boundaryOrders, shiftStart, shiftEnd),
  boundaryOrderTotals,
  'Caja no duplica pedidos de mesa al sumar pedidos externos en los bordes del turno',
);
assert.equal(JSON.stringify(boundaryOrders), boundaryOrdersSnapshot,
  'Conciliar pedidos externos no debe modificar sus registros de entrada');
console.log('PASS: Pedidos externos respetan bordes del turno, paidAt y exclusión de mesas.');


// Diagnóstico de deuda histórica (NO es una validación de conciliación resuelta):
// Caja atribuye el cobro a createdAt si falta paidAt; Reportes lo excluye.
// Mantener visible esta diferencia hasta definir migración y conciliación verificable.
// Solo se utilizan pedidos sintéticos; nunca se consulta Firebase.
const legacyOrderWithoutPaidAt: RestaurantOrder = {
  ...paidOffTableOrder('HISTORICO-SIN-FECHA', 'pickup', 'efectivo', 50,
    '2026-10-23T16:00:00.000Z'),
  paidAt: undefined,
  createdAt: '2026-10-23T16:00:00.000Z',
};
const datedOrder = paidOffTableOrder('COBRO-VERIFICADO', 'delivery', 'tarjeta',
  20, '2026-10-23T17:00:00.000Z');
const legacySample = [legacyOrderWithoutPaidAt, datedOrder];
const legacyShift = computeShiftSalesFromOrders(legacySample, shiftStart, shiftEnd);
const legacyReport = buildSalesReport(legacySample, 1, new Date(shiftEnd));
assert.equal(legacyShift.total, 20, 'Caja no atribuye el cobro histórico a createdAt');
assert.equal(legacyReport.totalSales, 20, 'Reportes no inventa fecha de cobro');
assert.equal(legacyReport.unreconciledPaidCount, 1, 'Reportes señala el pago histórico por conciliar');
assert.equal(legacyShift.total, legacyReport.totalSales,
  'Caja y Reportes excluyen el cobro sin fecha verificable');
console.warn('PENDIENTE HISTÓRICO: fecha de cobro ausente excluida de Caja y Reportes; falta comprobante (datos sintéticos).');

// El corte diario de pedidos externos comparte el fallback histórico de Caja.
// Esta prueba NO aprueba esa atribución: documenta que debe revisarse antes de
// ofrecer cifras definitivas. Reportes no inventa paidAt.
const legacyDaily = offTableSalesForDay(legacySample, '2026-10-23');
assert.deepEqual(legacyDaily, { total: 20, count: 1 },
  'El corte diario tampoco inventa fecha de cobro');
assert.equal(legacyDaily.total, legacyReport.totalSales,
  'El corte diario coincide con Reportes para cobros con fecha comprobable');
console.warn('PENDIENTE HISTÓRICO: el cobro sin paidAt requiere evidencia; no se migró ni imputó fecha.');

// Si paidAt existe pero es inválido, ninguno de los módulos debe sustituirlo
// silenciosamente por createdAt. La alerta de Reportes sí debe permanecer.
const malformedPaidAt: RestaurantOrder = {
  ...legacyOrderWithoutPaidAt,
  id: 'HISTORICO-FECHA-INVALIDA',
  code: 'HISTORICO-FECHA-INVALIDA',
  paidAt: 'fecha inválida',
};
assert.equal(computeShiftSalesFromOrders([malformedPaidAt], shiftStart, shiftEnd).total, 0);
assert.deepEqual(offTableSalesForDay([malformedPaidAt], '2026-10-23'), { total: 0, count: 0 });
const malformedReport = buildSalesReport([malformedPaidAt], 1, new Date(shiftEnd));
assert.equal(malformedReport.totalSales, 0);
assert.equal(malformedReport.unreconciledPaidCount, 1,
  'Fecha de cobro inválida requiere conciliación, no reasignación automática');
console.log('PASS: fechas de cobro inválidas no se reemplazan automáticamente por fecha de creación.');



// Diagnóstico pendiente: un pago MIXTO sin desglose tiene resultados distintos
// según el origen (ticket cerrado o pago de mesa). NO es una prueba de corrección:
// congela un ejemplo sintético para que el riesgo no se pierda durante la revisión.
// Nunca atribuir automáticamente todo el importe a transferencia/plataformas.
const incompleteMixedReceipt: SaleReceipt = {
  ...receipt,
  code: 'RECIBO-MIXTO-SIN-DESGLOSE',
  payments: [{ ...receipt.payments[0], paymentBreakdown: [] }],
  totalPaid: 90,
};
const incompleteReceiptShift = computeShiftSalesCombined(
  [incompleteMixedReceipt], [], shiftStart, shiftEnd,
);
const incompletePaymentShift = computeShiftSalesFromPayments([
  { status: 'PAGADO', createdAt: '2026-10-23T15:30:00.000Z',
    paymentMethod: 'MIXTO', total: 90, paymentBreakdown: [] },
], shiftStart, shiftEnd);
assert.deepEqual(incompleteReceiptShift,
  { cash: 0, card: 0, platforms: 0, total: 0, count: 1 },
  'Diagnóstico actual: ticket MIXTO sin desglose cuenta ticket, pero no asigna importe');
assert.deepEqual(incompletePaymentShift,
  { cash: 0, card: 0, platforms: 0, total: 0, count: 1 },
  'Un MIXTO sin desglose no puede atribuirse a plataformas');
assert.equal(incompletePaymentShift.total, incompleteReceiptShift.total,
  'Pagos y tickets no inventan importes clasificados en MIXTO sin desglose');
console.warn('PENDIENTE HISTÓRICO: MIXTO sin desglose excluido de importes clasificados; faltan comprobantes.');


// Diagnóstico pendiente: MIXTO con desglose parcial. Aunque ambos orígenes
// coincidan entre sí, la suma de los métodos puede ser inferior al total cobrado.
// No asignar automáticamente la diferencia a efectivo/tarjeta/transferencia.
const partialMixedParts = [{ ...mixedBreakdown[0], amount: 30 }];
const partialMixedReceipt: SaleReceipt = {
  ...incompleteMixedReceipt,
  code: 'RECIBO-MIXTO-PARCIAL',
  payments: [{ ...receipt.payments[0], paymentBreakdown: partialMixedParts }],
};
const partialReceiptTotals = computeShiftSalesCombined(
  [partialMixedReceipt], [], shiftStart, shiftEnd,
);
const partialPaymentTotals = computeShiftSalesFromPayments([
  { status: 'PAGADO', createdAt: '2026-10-23T15:30:00.000Z',
    paymentMethod: 'MIXTO', total: 90, paymentBreakdown: partialMixedParts },
], shiftStart, shiftEnd);
assert.deepEqual(partialReceiptTotals,
  { cash: 0, card: 0, platforms: 0, total: 0, count: 1 },
  'Un MIXTO parcial no se clasifica hasta reconciliar el total');
assert.deepEqual(partialPaymentTotals, partialReceiptTotals,
  'Pagos y tickets coinciden en desglose parcial, pero no con el importe declarado');
assert.equal(partialMixedReceipt.totalPaid - partialReceiptTotals.total, 90,
  'El cobro de $90 sigue pendiente; no se reconocen parcialmente $30 como conciliados');
console.warn('PENDIENTE DE CONCILIACIÓN: MIXTO parcial registra $90, pero solo desglosa $30 (datos sintéticos).');

// Diagnóstico pendiente: un MIXTO también puede sobredeclarar sus métodos.
// Un cobro de $90 desglosado como $60 + $50 no debe considerarse conciliado:
// ambas rutas pueden coincidir entre sí y aun así superar el total declarado.
// No corregir importes ni métodos sin revisar comprobantes reales.
const overallocatedParts = [
  { method: 'EFECTIVO' as const, amount: 60 },
  { method: 'TARJETA' as const, amount: 50 },
];
const overallocatedReceipt: SaleReceipt = {
  ...incompleteMixedReceipt,
  code: 'RECIBO-MIXTO-EXCESO',
  payments: [{ ...receipt.payments[0], total: 90, paymentBreakdown: overallocatedParts }],
  totalPaid: 90,
};
const overallocatedSnapshot = JSON.stringify(overallocatedReceipt);
const overallocatedFromReceipt = computeShiftSalesCombined(
  [overallocatedReceipt], [], shiftStart, shiftEnd,
);
const overallocatedFromPayment = computeShiftSalesFromPayments([
  { status: 'PAGADO', createdAt: '2026-10-23T15:30:00.000Z',
    paymentMethod: 'MIXTO', total: 90, paymentBreakdown: overallocatedParts },
], shiftStart, shiftEnd);
assert.deepEqual(overallocatedFromReceipt,
  { cash: 0, card: 0, platforms: 0, total: 0, count: 1 },
  'Un MIXTO sobreasignado no se registra como ingresos comprobados');
assert.deepEqual(overallocatedFromPayment, overallocatedFromReceipt,
  'La coincidencia entre rutas no garantiza que el desglose coincida con el cobro');
assert.equal(overallocatedReceipt.totalPaid - overallocatedFromReceipt.total, 90,
  'Todo el cobro requiere conciliación; los $20 excedentes no son ingresos comprobados');
assert.equal(JSON.stringify(overallocatedReceipt), overallocatedSnapshot,
  'El diagnóstico no debe modificar el ticket original');
console.warn('PENDIENTE DE CONCILIACIÓN: MIXTO de $90 con desglose de $110 (datos sintéticos).');


// Diagnóstico adicional: el resumen diario de pagos utiliza el total declarado,
// mientras el corte por turno suma el desglose MIXTO. En registros incompletos
// o excesivos, ambos reportes discrepan aunque consulten el mismo pago.
// Solo documenta el riesgo con datos sintéticos; NO cambia cifras de producción.
const mixedDailySamples = [
  { status: 'PAGADO', createdAt: '2026-10-23T15:30:00.000Z',
    paymentMethod: 'MIXTO', total: 90, paymentBreakdown: partialMixedParts },
  { status: 'PAGADO', createdAt: '2026-10-23T15:30:00.000Z',
    paymentMethod: 'MIXTO', total: 90, paymentBreakdown: overallocatedParts },
];
const mixedDailySnapshot = JSON.stringify(mixedDailySamples);
const partialDaily = paymentsSalesForDay([mixedDailySamples[0]], '2026-10-23');
const partialByShift = computeShiftSalesFromPayments([mixedDailySamples[0]], shiftStart, shiftEnd);
assert.deepEqual(partialDaily, { total: 0, count: 0 });
assert.equal(partialByShift.total, 0);
assert.equal(partialDaily.total, partialByShift.total,
  'El diario y el turno excluyen MIXTO parcial hasta conciliación');
const excessDaily = paymentsSalesForDay([mixedDailySamples[1]], '2026-10-23');
const excessByShift = computeShiftSalesFromPayments([mixedDailySamples[1]], shiftStart, shiftEnd);
assert.deepEqual(excessDaily, { total: 0, count: 0 });
assert.equal(excessByShift.total, 0);
assert.equal(excessByShift.total, excessDaily.total,
  'El diario y el turno excluyen MIXTO excesivo hasta conciliación');
assert.equal(JSON.stringify(mixedDailySamples), mixedDailySnapshot,
  'El diagnóstico diario/turno no modifica pagos sintéticos');
console.warn('PENDIENTE HISTÓRICO: MIXTO parcial/excesivo se excluye de importes clasificados hasta comprobarlo.');


// Una descripción de método desconocido no se sanea por traer un desglose válido.
// El mismo rechazo debe aplicarse a tickets, pagos de mesa y corte diario.
const misleadingPayment = {
  status: 'PAGADO', createdAt: '2026-10-23T16:00:00.000Z',
  paymentMethod: 'VALE', total: 90, paymentBreakdown: mixedBreakdown,
};
const duplicatedMixedPayment = {
  ...misleadingPayment, paymentMethod: 'MIXTO',
  paymentBreakdown: [
    { method: 'EFECTIVO', amount: 30 },
    { method: 'EFECTIVO', amount: 60 },
  ],
};
const badPayments = [misleadingPayment, duplicatedMixedPayment];
assert.deepEqual(computeShiftSalesFromPayments(badPayments, shiftStart, shiftEnd),
  { cash: 0, card: 0, platforms: 0, total: 0, count: 2 },
  'Ni método desconocido ni desglose MIXTO duplicado son ingresos clasificados');
assert.deepEqual(paymentsSalesForDay(badPayments, '2026-10-23'),
  { total: 0, count: 0 }, 'El diario también excluye cobros con clasificación ambigua');
const misleadingReceipt: SaleReceipt = {
  ...receipt, payments: [{ ...receipt.payments[0],
    paymentMethod: 'VALE' as SaleReceipt['payments'][number]['paymentMethod'],
    paymentBreakdown: mixedBreakdown }],
};
assert.deepEqual(computeShiftSalesCombined([misleadingReceipt], [], shiftStart, shiftEnd),
  { cash: 0, card: 0, platforms: 0, total: 0, count: 1 },
  'Los tickets no convierten un método desconocido en un MIXTO válido');
console.log('PASS: métodos desconocidos, desgloses engañosos y métodos MIXTO duplicados se rechazan sin inventar categorías.');


// Diagnóstico pendiente: método de pago desconocido en pedido externo.
// Caja lo agrupa como plataformas, mientras Reportes lo deja sin clasificar.
// Ambos reconocen el total, pero NO hay evidencia de que sea transferencia.
// Solo datos sintéticos; no se cambia el método ni se consulta Firebase.
const unknownOffTablePayment: RestaurantOrder = {
  ...paidOffTableOrder('METODO-NO-RECONOCIDO', 'pickup', 'efectivo', 45,
    '2026-10-23T17:00:00.000Z'),
  paymentMethod: 'VALE' as RestaurantOrder['paymentMethod'],
};
const unknownOffTableSnapshot = JSON.stringify(unknownOffTablePayment);
const unknownOffTableShift = computeShiftSalesFromOrders(
  [unknownOffTablePayment], shiftStart, shiftEnd,
);
const unknownOffTableReport = buildSalesReport(
  [unknownOffTablePayment], 1, new Date(shiftEnd),
);
assert.deepEqual(unknownOffTableShift,
  { cash: 0, card: 0, platforms: 0, total: 0, count: 0 },
  'Caja no inventa transferencia/plataformas para método desconocido');
assert.equal(unknownOffTableReport.totalSales, 0);
assert.equal(unknownOffTableReport.orderCount, 0);
assert.equal(unknownOffTableReport.unclassifiedPaidCount, 1);
assert.equal(unknownOffTableReport.unclassifiedPaymentTotal, 45,
  'Reportes conserva el importe pendiente por separado, sin sumarlo a ventas verificadas');
assert.deepEqual(unknownOffTableReport.byPayment,
  { efectivo: 0, transferencia: 0, tarjeta: 0 },
  'Reportes no atribuye el método desconocido a transferencia');
assert.equal(JSON.stringify(unknownOffTablePayment), unknownOffTableSnapshot,
  'El diagnóstico no modifica el pedido original');
console.warn('PENDIENTE HISTÓRICO: método desconocido excluido de ventas verificadas y mostrado por separado; faltan comprobantes.');

// El turno debe detectar importes/métodos no conciliables sin mutar pedidos.
const unclassifiedFixtures = [
  unknownOffTablePayment,
  paidOffTableOrder('IMPORTE-NEGATIVO-AUDIT', 'pickup', 'efectivo', -10, '2026-10-23T17:10:00.000Z'),
  paidOffTableOrder('IMPORTE-CERO-AUDIT', 'pickup', 'efectivo', 0, '2026-10-23T17:20:00.000Z'),
  paidOffTableOrder('PAGO-VALIDO-AUDIT', 'pickup', 'efectivo', 30, '2026-10-23T17:30:00.000Z'),
  { ...unknownOffTablePayment, code: 'SIN-FECHA-AUDIT', paidAt: undefined },
  { ...unknownOffTablePayment, code: 'CANCELADO-AUDIT', status: 'CANCELADO' as const },
];
const unclassifiedBefore = JSON.stringify(unclassifiedFixtures);
assert.deepEqual(auditUnclassifiedPaidOrders(unclassifiedFixtures, shiftStart),
  { count: 3, positiveAmount: 45 },
  'Método desconocido y dos importes no positivos bloquean cierre, no el pago válido');
assert.deepEqual(auditUnclassifiedPaidOrders(unclassifiedFixtures, 'fecha inválida'),
  { count: 0, positiveAmount: 0 }, 'Una apertura inválida no asigna cobros a un turno');
assert.equal(JSON.stringify(unclassifiedFixtures), unclassifiedBefore, 'La auditoría no modifica datos');
console.log('PASS: auditoría de métodos/importes no conciliables bloquea el cierre sin inventar dinero.');



// Regresión: importes nulos o negativos en pedidos externos se excluyen de
// Caja por turno, corte diario y Reportes. Se alertan por separado, sin
// interpretarlos como reembolsos ni alterar datos de producción.
const nonPositiveOrders = [
  paidOffTableOrder('IMPORTE-CERO', 'pickup', 'efectivo', 0,
    '2026-10-23T17:00:00.000Z'),
  paidOffTableOrder('IMPORTE-NEGATIVO', 'delivery', 'tarjeta', -10,
    '2026-10-23T17:15:00.000Z'),
];
const nonPositiveSnapshot = JSON.stringify(nonPositiveOrders);
const nonPositiveShift = computeShiftSalesFromOrders(nonPositiveOrders, shiftStart, shiftEnd);
const nonPositiveDaily = offTableSalesForDay(nonPositiveOrders, '2026-10-23');
const nonPositiveReport = buildSalesReport(nonPositiveOrders, 1, new Date(shiftEnd));
assert.deepEqual(nonPositiveShift, { cash: 0, card: 0, platforms: 0, total: 0, count: 0 },
  'Caja por turno omite actualmente pedidos pagados con total cero o negativo');
assert.deepEqual(nonPositiveDaily, { total: 0, count: 0 },
  'El corte diario excluye pedidos con importe cero o negativo');
assert.equal(nonPositiveReport.totalSales, 0);
assert.equal(nonPositiveReport.orderCount, 0);
assert.equal(nonPositiveReport.anomalousPaidCount, 2);
assert.equal(nonPositiveReport.unclassifiedPaidCount, 0);
assert.equal(JSON.stringify(nonPositiveOrders), nonPositiveSnapshot,
  'El diagnóstico no debe modificar pedidos ficticios');
console.warn('PENDIENTE HISTÓRICO: importes cero/negativos excluidos de ventas verificadas; requieren comprobantes.');



// Coherencia de tres vistas: pedidos externos con importe no representable en centavos,
// método desconocido y un pago válido. Los dos primeros quedan fuera de ventas,
// pero aparecen como alertas de revisión; no se modifican los documentos.
const invalidCents = paidOffTableOrder('TRES-DECIMALES', 'pickup', 'efectivo',
  3.001, '2026-10-23T17:45:00.000Z');
const mixedReconciliationOrders = [
  paidOffTableOrder('COBRO-CORRECTO', 'delivery', 'tarjeta', 15.25, '2026-10-23T17:30:00.000Z'),
  invalidCents,
  unknownOffTablePayment,
  ...nonPositiveOrders,
];
const mixedReconciliationSnapshot = JSON.stringify(mixedReconciliationOrders);
const mixedReconciliationShift = computeShiftSalesFromOrders(mixedReconciliationOrders, shiftStart, shiftEnd);
const mixedReconciliationDaily = offTableSalesForDay(mixedReconciliationOrders, '2026-10-23');
const mixedReconciliationReport = buildSalesReport(mixedReconciliationOrders, 1, new Date(shiftEnd));
assert.deepEqual(mixedReconciliationShift,
  { cash: 0, card: 15.25, platforms: 0, total: 15.25, count: 1 });
assert.deepEqual(mixedReconciliationDaily, { total: 15.25, count: 1 });
assert.equal(mixedReconciliationReport.totalSales, 15.25);
assert.equal(mixedReconciliationReport.orderCount, 1);
assert.equal(mixedReconciliationReport.unclassifiedPaidCount, 1);
assert.equal(mixedReconciliationReport.unclassifiedPaymentTotal, 45);
assert.equal(mixedReconciliationReport.anomalousPaidCount, 3);
assert.equal(JSON.stringify(mixedReconciliationOrders), mixedReconciliationSnapshot,
  'El reporte no modifica cobros sintéticos pendientes');
console.log('PASS: Caja por turno, corte diario y Reportes coinciden sin contar cobros anómalos.');

// Diagnóstico pendiente: pagos de mesa con importes cero o negativos.
// El corte por turno conserva el conteo, pero omite los importes; el diario
// conserva también el importe negativo. No son devoluciones confirmadas.
// Prueba sintética, sin Firebase ni cambios en cálculos de producción.
const nonPositiveTablePayments = [
  { status: 'PAGADO', createdAt: '2026-10-23T17:00:00.000Z',
    paymentMethod: 'EFECTIVO', total: 0 },
  { status: 'PAGADO', createdAt: '2026-10-23T17:15:00.000Z',
    paymentMethod: 'TARJETA', total: -10 },
];
const nonPositiveTableSnapshot = JSON.stringify(nonPositiveTablePayments);
const nonPositiveTableShift = computeShiftSalesFromPayments(
  nonPositiveTablePayments, shiftStart, shiftEnd,
);
const nonPositiveTableDaily = paymentsSalesForDay(nonPositiveTablePayments, '2026-10-23');
assert.deepEqual(nonPositiveTableShift,
  { cash: 0, card: 0, platforms: 0, total: 0, count: 2 },
  'El turno cuenta ambos pagos, pero no suma importes no positivos');
assert.deepEqual(nonPositiveTableDaily, { total: 0, count: 0 },
  'El corte diario no cuenta pagos sin importe positivo verificable');
assert.equal(nonPositiveTableDaily.total, nonPositiveTableShift.total,
  'El diario y turno excluyen pagos de mesa no positivos sin reclasificarlos');
assert.equal(JSON.stringify(nonPositiveTablePayments), nonPositiveTableSnapshot,
  'El diagnóstico no modifica los pagos sintéticos');
console.warn('PENDIENTE HISTÓRICO: pagos de mesa cero/negativos requieren revisión documental; no se trataron como reembolsos.');


// Diagnóstico de aislamiento: los sumadores de Caja NO filtran por tenant.
// Los llamadores deben entregar listas previamente acotadas al negocio correcto.
// Esta prueba con datos sintéticos documenta el riesgo; NO certifica aislamiento
// en Firestore, ni habilita cobros entre negocios.
const tenantPayments = [
  { restaurantId: 'demo-a', status: 'PAGADO', createdAt: '2026-10-23T16:00:00.000Z',
    paymentMethod: 'EFECTIVO', total: 10 },
  { restaurantId: 'demo-b', status: 'PAGADO', createdAt: '2026-10-23T16:00:00.000Z',
    paymentMethod: 'TARJETA', total: 200 },
];
const tenantOrders = [
  { restaurantId: 'demo-a', orderType: 'pickup', status: 'ENTREGADO',
    billingStatus: 'PAGADO', paymentMethod: 'efectivo', total: 5,
    paidAt: '2026-10-23T16:30:00.000Z' },
  { restaurantId: 'demo-b', orderType: 'delivery', status: 'ENTREGADO',
    billingStatus: 'PAGADO', paymentMethod: 'transferencia', total: 300,
    paidAt: '2026-10-23T16:30:00.000Z' },
];
const tenantInputsSnapshot = JSON.stringify([tenantPayments, tenantOrders]);
const tenantATotals = computeShiftSalesAll(
  tenantPayments.filter((p) => p.restaurantId === 'demo-a'),
  tenantOrders.filter((o) => o.restaurantId === 'demo-a'),
  shiftStart, shiftEnd,
);
assert.deepEqual(tenantATotals,
  { cash: 15, card: 0, platforms: 0, total: 15, count: 2 },
  'Con listas acotadas, Caja calcula únicamente las ventas ficticias de A');
const unscopedTenantTotals = computeShiftSalesAll(tenantPayments, tenantOrders, shiftStart, shiftEnd);
assert.deepEqual(unscopedTenantTotals,
  { cash: 15, card: 200, platforms: 300, total: 515, count: 4 },
  'Riesgo conocido: si el llamador mezcla tenants, el sumador NO los separa');
assert.equal(unscopedTenantTotals.total - tenantATotals.total, 500,
  'La diferencia entre A y datos mezclados no debe mostrarse como ventas de A');
assert.equal(JSON.stringify([tenantPayments, tenantOrders]), tenantInputsSnapshot,
  'El diagnóstico no debe alterar registros sintéticos');
console.warn('PENDIENTE: Caja depende del aislamiento de los listeners; los sumadores no filtran tenant.');
