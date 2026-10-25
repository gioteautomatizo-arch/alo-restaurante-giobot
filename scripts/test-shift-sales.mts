import assert from 'node:assert/strict';
import type { RestaurantOrder, SaleReceipt } from '../src/types';
import { buildSalesReport } from '../src/lib/businessReports.ts';
import {
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
assert.equal(legacyShift.total, 70, 'Comportamiento actual de Caja: usa createdAt sin paidAt');
assert.equal(legacyReport.totalSales, 20, 'Reportes no inventa fecha de cobro');
assert.equal(legacyReport.unreconciledPaidCount, 1, 'Reportes señala el pago histórico por conciliar');
assert.equal(legacyShift.total - legacyReport.totalSales, 50,
  'Diferencia conocida: no interpretarla como ventas adicionales verificadas');
console.warn('PENDIENTE DE CONCILIACIÓN: fecha de cobro ausente genera diferencia entre Caja y Reportes (datos sintéticos).');

// El corte diario de pedidos externos comparte el fallback histórico de Caja.
// Esta prueba NO aprueba esa atribución: documenta que debe revisarse antes de
// ofrecer cifras definitivas. Reportes no inventa paidAt.
const legacyDaily = offTableSalesForDay(legacySample, '2026-10-23');
assert.deepEqual(legacyDaily, { total: 70, count: 2 },
  'Comportamiento actual del corte diario: incluye el histórico sin paidAt');
assert.equal(legacyDaily.total - legacyReport.totalSales, 50,
  'La divergencia del corte diario debe permanecer visible hasta conciliar historial');
console.warn('PENDIENTE: el corte diario también usa createdAt para pedidos pagados sin paidAt.');

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
  { cash: 0, card: 0, platforms: 90, total: 90, count: 1 },
  'Diagnóstico actual: pago MIXTO sin desglose se atribuye a plataformas');
assert.equal(incompletePaymentShift.total - incompleteReceiptShift.total, 90,
  'La diferencia debe conciliarse con comprobantes antes de cambiar cálculos reales');
console.warn('PENDIENTE DE CONCILIACIÓN: MIXTO sin desglose produce cifras diferentes entre tickets y pagos (datos sintéticos).');


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
  { cash: 30, card: 0, platforms: 0, total: 30, count: 1 },
  'Diagnóstico actual: ticket MIXTO parcial solo suma los métodos declarados');
assert.deepEqual(partialPaymentTotals, partialReceiptTotals,
  'Pagos y tickets coinciden en desglose parcial, pero no con el importe declarado');
assert.equal(partialMixedReceipt.totalPaid - partialReceiptTotals.total, 60,
  'Los $60 sin desglose requieren comprobantes; no atribuirlos a un método supuesto');
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
  { cash: 60, card: 50, platforms: 0, total: 110, count: 1 },
  'Diagnóstico actual: un MIXTO sobreasignado suma más que el total cobrado');
assert.deepEqual(overallocatedFromPayment, overallocatedFromReceipt,
  'La coincidencia entre rutas no garantiza que el desglose coincida con el cobro');
assert.equal(overallocatedFromReceipt.total - overallocatedReceipt.totalPaid, 20,
  'Los $20 excedentes requieren conciliación; no son ingresos comprobados');
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
assert.deepEqual(partialDaily, { total: 90, count: 1 });
assert.equal(partialByShift.total, 30);
assert.equal(partialDaily.total - partialByShift.total, 60,
  'El resumen diario y el turno difieren $60 por desglose parcial');
const excessDaily = paymentsSalesForDay([mixedDailySamples[1]], '2026-10-23');
const excessByShift = computeShiftSalesFromPayments([mixedDailySamples[1]], shiftStart, shiftEnd);
assert.deepEqual(excessDaily, { total: 90, count: 1 });
assert.equal(excessByShift.total, 110);
assert.equal(excessByShift.total - excessDaily.total, 20,
  'El turno excede el resumen diario $20 por desglose sobreasignado');
assert.equal(JSON.stringify(mixedDailySamples), mixedDailySnapshot,
  'El diagnóstico diario/turno no modifica pagos sintéticos');
console.warn('PENDIENTE: resumen diario y corte por turno discrepan con MIXTO parcial/excesivo.');


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
  { cash: 0, card: 0, platforms: 45, total: 45, count: 1 },
  'Diagnóstico actual: Caja clasifica un método desconocido como plataformas');
assert.equal(unknownOffTableReport.totalSales, 45);
assert.equal(unknownOffTableReport.unclassifiedPaymentTotal, 45,
  'Reportes conserva el importe sin inventar un método de pago');
assert.deepEqual(unknownOffTableReport.byPayment,
  { efectivo: 0, transferencia: 0, tarjeta: 0 },
  'Reportes no atribuye el método desconocido a transferencia');
assert.equal(JSON.stringify(unknownOffTablePayment), unknownOffTableSnapshot,
  'El diagnóstico no modifica el pedido original');
console.warn('PENDIENTE: Caja atribuye método desconocido a plataformas; Reportes lo deja sin clasificar (datos sintéticos).');


// Diagnóstico pendiente: importes nulos o negativos en pedidos externos.
// El corte diario y Reportes los contabilizan, pero el corte por turno los omite.
// Esta prueba solo registra la divergencia actual con pedidos ficticios;
// NO interpreta los negativos como reembolsos ni altera datos de producción.
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
assert.deepEqual(nonPositiveDaily, { total: -10, count: 2 },
  'El corte diario actualmente cuenta ambos pedidos e incluye el importe negativo');
assert.equal(nonPositiveReport.totalSales, -10);
assert.equal(nonPositiveReport.orderCount, 2);
assert.equal(JSON.stringify(nonPositiveOrders), nonPositiveSnapshot,
  'El diagnóstico no debe modificar pedidos ficticios');
console.warn('PENDIENTE: pedidos pagados con importes cero/negativos difieren entre turno y corte diario (datos sintéticos).');

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
assert.deepEqual(nonPositiveTableDaily, { total: -10, count: 2 },
  'El corte diario incluye el importe negativo y ambos pagos');
assert.equal(nonPositiveTableDaily.total - nonPositiveTableShift.total, -10,
  'La diferencia requiere revisión contable, no reclasificación automática');
assert.equal(JSON.stringify(nonPositiveTablePayments), nonPositiveTableSnapshot,
  'El diagnóstico no modifica los pagos sintéticos');
console.warn('PENDIENTE: pagos de mesa cero/negativos difieren entre corte diario y turno (datos sintéticos).');


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
