import assert from 'node:assert/strict';
import { countPaidOrdersMissingPaymentDate, getShiftReadiness, initialShiftFeedStates, SHIFT_FEED_NAMES, parseShiftCashAmount, type ShiftFeedStates } from '../src/lib/businessShiftReadiness.ts';

const tenantA = 'giomero';
const tenantB = 'another-restaurant';
const initial = initialShiftFeedStates(tenantA);
const loading = getShiftReadiness(tenantA, initial, 0);
assert.equal(loading.ready, false);
assert.deepEqual(loading.loading, [...SHIFT_FEED_NAMES]);

const ready: ShiftFeedStates = {
  shifts: { businessId: tenantA, status: 'ready' },
  orders: { businessId: tenantA, status: 'ready' },
  expenses: { businessId: tenantA, status: 'ready' },
  vault: { businessId: tenantA, status: 'ready' },
};
assert.equal(getShiftReadiness(tenantA, ready, 0).ready, true);
assert.equal(getShiftReadiness(tenantA, ready, 1).ready, true);

const noOrders = { ...ready, orders: { businessId: tenantA, status: 'error' as const } };
assert.equal(getShiftReadiness(tenantA, noOrders, 1).ready, false);
assert.deepEqual(getShiftReadiness(tenantA, noOrders, 1).errors, ['orders']);
assert.equal(getShiftReadiness(tenantA, ready, 2).duplicateOpenShifts, true);
assert.equal(getShiftReadiness(tenantA, ready, 2).ready, false);

const missingVault = { ...ready, vault: { businessId: tenantA, status: 'loading' as const } };
assert.equal(getShiftReadiness(tenantA, missingVault, 1).ready, false);
assert.deepEqual(getShiftReadiness(tenantA, missingVault, 1).loading, ['vault']);
assert.equal(getShiftReadiness(tenantB, ready, 1).ready, false);
assert.deepEqual(getShiftReadiness(tenantB, ready, 1).loading, [...SHIFT_FEED_NAMES]);
assert.equal(getShiftReadiness('', ready, 0).ready, false);
console.log('PASS: turnos no se abren ni cierran con lecturas incompletas, entre negocios o con turnos duplicados.');

assert.equal(parseShiftCashAmount('0'), 0);
assert.equal(parseShiftCashAmount('500'), 500);
assert.equal(parseShiftCashAmount('150.50'), 150.5);
for (const amount of ['', '  ', '-1', 'NaN', '1.001', '1e3', '1,000', 'Infinity']) {
  assert.equal(parseShiftCashAmount(amount), null, 'No aceptar ' + amount);
}
console.log('PASS: el fondo de apertura y efectivo contado se validan antes de registrar el turno.');

const shiftOpened = '2026-10-23T15:00:00.000Z';
const paidOrders = [
  { status: 'ENTREGADO', billingStatus: 'PAGADO', createdAt: '2026-10-23T15:01:00.000Z' },
  { status: 'ENTREGADO', billingStatus: 'PAGADO', createdAt: '2026-10-23T15:02:00.000Z', paidAt: 'fecha inválida' },
  { status: 'ENTREGADO', billingStatus: 'PAGADO', createdAt: '2026-10-23T15:03:00.000Z', paidAt: '2026-10-23T15:10:00.000Z' },
  { status: 'NUEVO', billingStatus: 'PENDIENTE', createdAt: '2026-10-23T15:04:00.000Z' },
  { status: 'CANCELADO', billingStatus: 'PAGADO', createdAt: '2026-10-23T15:05:00.000Z' },
  { status: 'ENTREGADO', billingStatus: 'PAGADO', createdAt: '2026-10-23T14:59:00.000Z' },
];
assert.equal(countPaidOrdersMissingPaymentDate(paidOrders, shiftOpened), 2);
assert.equal(countPaidOrdersMissingPaymentDate(paidOrders, 'invalid'), 0);
assert.equal(countPaidOrdersMissingPaymentDate([], shiftOpened), 0);
console.log('PASS: se identifican pagos recientes sin fecha verificable antes de cerrar turno.');
