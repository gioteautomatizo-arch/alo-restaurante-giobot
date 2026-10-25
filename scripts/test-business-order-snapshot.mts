import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
assert.equal(result.unpaidTotalCount, 1);
assert.equal(result.unpaidTotalAmount, 40);
assert.equal(result.deliveredUnpaidCount, 0);
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

const reconciliation = summarizeBusinessOrders([
  make({ code: 'GIO-001', status: 'ENTREGADO', total: 140 }),
  make({ code: 'GIO-002', status: 'ENTREGADO', total: 110, createdAt: '2026-10-16T15:00:00Z' }),
  make({ code: 'GIO-003', status: 'ENTREGADO', billingStatus: 'PAGADO', total: 50, paidAt: '2026-10-22T15:30:00Z' }),
], now);
assert.equal(reconciliation.unpaidTotalCount, 2);
assert.equal(reconciliation.unpaidTotalAmount, 250);
assert.equal(reconciliation.deliveredUnpaidCount, 2);
assert.equal(reconciliation.deliveredUnpaidAmount, 250);
assert.equal(reconciliation.paidTodayTotal, 50);
console.log('PASS: entregados pendientes de conciliación no incrementan ingresos.');


// Regresión contable: no convertir la fecha de creación en fecha de cobro.
// El mismo motor alimenta Resumen y Pedidos/Caja.
const datedPayments = summarizeBusinessOrders([
  make({ code: 'FALTA-FECHA-HOY', billingStatus: 'PAGADO', total: 150 }),
  make({ code: 'FECHA-INVALIDA', billingStatus: 'PAGADO', paidAt: 'incorrecta', total: 200 }),
  make({ code: 'FALTA-FECHA-HISTORICO', billingStatus: 'PAGADO', createdAt: '2026-09-10T14:00:00Z', total: 55 }),
  make({ code: 'PAGADO-AYER', billingStatus: 'PAGADO', paidAt: '2026-10-21T15:00:00Z', total: 80 }),
  make({ code: 'COBRADO-HOY', billingStatus: 'PAGADO', paidAt: '2026-10-22T15:00:00Z', total: 35 }),
  make({ code: 'COBRADO-HOY-PEDIDO-ANTERIOR', billingStatus: 'PAGADO',
    createdAt: '2026-10-21T14:00:00Z', paidAt: '2026-10-22T14:00:00Z', total: 30 }),
  make({ code: 'CANCELADO-CON-PAGO', status: 'CANCELADO', billingStatus: 'PAGADO', paidAt: '2026-10-22T14:00:00Z', total: 900 }),
  make({ code: 'PENDIENTE-CON-FECHA', paidAt: '2026-10-22T15:00:00Z', total: 400 }),
], now);
assert.equal(datedPayments.paidTodayCount, 2, 'Solo dos cobros del día cuentan');
assert.equal(datedPayments.paidTodayTotal, 65, 'No sumar pagos sin fecha, de ayer, pendientes ni cancelados');
assert.equal(datedPayments.paidMissingDateCount, 3, 'Fechas ausentes o inválidas requieren conciliación');
assert.equal(datedPayments.paidCancelledCount, 1);
console.log('PASS: Resumen y Caja no atribuyen pagos sin fecha a la creación del pedido.');

const atMexicoMidnight = summarizeBusinessOrders([
  make({ code: 'ANTES-MEDIANOCHE', billingStatus: 'PAGADO', paidAt: '2026-11-01T05:59:59Z', total: 99 }),
  make({ code: 'DESPUES-MEDIANOCHE', billingStatus: 'PAGADO', paidAt: '2026-11-01T06:00:00Z', total: 1.25 }),
], new Date('2026-11-01T12:00:00Z'));
assert.equal(atMexicoMidnight.paidTodayCount, 1);
assert.equal(atMexicoMidnight.paidTodayTotal, 1.25, 'Las ventas usan el día de Ciudad de México');
assert.equal(atMexicoMidnight.paidMissingDateCount, 0);

const summaryView = readFileSync('src/components/platform/BusinessSummaryTab.tsx', 'utf8');
assert.match(summaryView, /summarizeBusinessOrders\(orders\)/, 'Resumen debe usar el cálculo compartido con Caja');
assert.match(summaryView, /money\(snapshot\.paidTodayTotal\)/);
assert.match(summaryView, /snapshot\.paidMissingDateCount > 0/, 'Aviso para conciliar pagos sin fecha');
assert.doesNotMatch(summaryView, /paidAt \|\| o\.createdAt/, 'Resumen no puede usar creación como fecha de cobro');
console.log('PASS: Resumen comparte las cifras verificadas y alerta anomalías de cobro.');
