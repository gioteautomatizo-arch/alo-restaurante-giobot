import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const validOpening = '2026-10-23T15:00:00.000Z';
assert.equal(getShiftReadiness(tenantA, ready, 1, validOpening).ready, true);
assert.equal(getShiftReadiness(tenantA, ready, 1).ready, false);
assert.equal(getShiftReadiness(tenantA, ready, 1).invalidActiveShiftStart, true);
for (const opening of ['', 'fecha inválida', '1970-01-01T00:00:00.000Z']) {
  const result = getShiftReadiness(tenantA, ready, 1, opening);
  assert.equal(result.ready, false, 'Bloquear apertura inválida: ' + opening);
  assert.equal(result.invalidActiveShiftStart, true);
}
assert.equal(getShiftReadiness(tenantA, ready, 0).invalidActiveShiftStart, false);

const noOrders = { ...ready, orders: { businessId: tenantA, status: 'error' as const } };
assert.equal(getShiftReadiness(tenantA, noOrders, 1, validOpening).ready, false);
assert.deepEqual(getShiftReadiness(tenantA, noOrders, 1, validOpening).errors, ['orders']);
assert.equal(getShiftReadiness(tenantA, ready, 2).duplicateOpenShifts, true);
assert.equal(getShiftReadiness(tenantA, ready, 2).ready, false);

const missingVault = { ...ready, vault: { businessId: tenantA, status: 'loading' as const } };
assert.equal(getShiftReadiness(tenantA, missingVault, 1, validOpening).ready, false);
assert.deepEqual(getShiftReadiness(tenantA, missingVault, 1, validOpening).loading, ['vault']);
assert.equal(getShiftReadiness(tenantB, ready, 1, validOpening).ready, false);
assert.deepEqual(getShiftReadiness(tenantB, ready, 1, validOpening).loading, [...SHIFT_FEED_NAMES]);
assert.equal(getShiftReadiness('', ready, 0).ready, false);

// Regresión al cambiar de negocio: un feed de otro tenant nunca habilita Caja.
// Un error antiguo tampoco debe mostrarse como error del negocio actual.
const mixedTenantFeeds: ShiftFeedStates = {
  ...ready,
  orders: { businessId: tenantB, status: 'ready' },
};
const mixedReadiness = getShiftReadiness(tenantA, mixedTenantFeeds, 0);
assert.equal(mixedReadiness.ready, false);
assert.deepEqual(mixedReadiness.loading, ['orders']);
assert.deepEqual(mixedReadiness.errors, []);
const staleErrorFeeds: ShiftFeedStates = {
  ...ready,
  expenses: { businessId: tenantB, status: 'error' },
};
const staleErrorReadiness = getShiftReadiness(tenantA, staleErrorFeeds, 0);
assert.equal(staleErrorReadiness.ready, false);
assert.deepEqual(staleErrorReadiness.loading, ['expenses']);
assert.deepEqual(staleErrorReadiness.errors, []);
const ownErrorFeeds: ShiftFeedStates = {
  ...ready,
  expenses: { businessId: tenantA, status: 'error' },
};
assert.deepEqual(getShiftReadiness(tenantA, ownErrorFeeds, 0).errors, ['expenses']);
assert.equal(getShiftReadiness(tenantA, ownErrorFeeds, 0).ready, false);
assert.equal(getShiftReadiness(tenantA, {
  ...mixedTenantFeeds,
  orders: { businessId: tenantA, status: 'ready' },
}, 0).ready, true);
// Cada feed debe permanecer aislado por negocio, incluso si el dato viejo marca error.
for (const feed of SHIFT_FEED_NAMES) {
  for (const status of ['ready', 'error'] as const) {
    const crossTenant = { ...ready, [feed]: { businessId: tenantB, status } } as ShiftFeedStates;
    const result = getShiftReadiness(tenantA, crossTenant, 0);
    assert.equal(result.ready, false, `No habilitar Caja con ${feed} de otro negocio (${status})`);
    assert.deepEqual(result.loading, [feed]);
    assert.deepEqual(result.errors, []);
  }
}
assert.deepEqual(initialShiftFeedStates(tenantB), Object.fromEntries(
  SHIFT_FEED_NAMES.map((feed) => [feed, { businessId: tenantB, status: 'loading' }]),
));
// Cambio de tenant con todas las consultas viejas: no mostrar errores ajenos.
for (const status of ['ready', 'error'] as const) {
  const oldFeeds = Object.fromEntries(
    SHIFT_FEED_NAMES.map((feed) => [feed, { businessId: tenantB, status }]),
  ) as ShiftFeedStates;
  const result = getShiftReadiness(tenantA, oldFeeds, 0);
  assert.equal(result.ready, false);
  assert.deepEqual(result.loading, [...SHIFT_FEED_NAMES]);
  assert.deepEqual(result.errors, []);
}
// Durante una actualización parcial, distinguir un error propio de un feed ajeno.
const partialRefresh: ShiftFeedStates = {
  ...ready,
  orders: { businessId: tenantB, status: 'error' },
  vault: { businessId: tenantA, status: 'error' },
};
const partialResult = getShiftReadiness(tenantA, partialRefresh, 0);
assert.equal(partialResult.ready, false);
assert.deepEqual(partialResult.loading, ['orders']);
assert.deepEqual(partialResult.errors, ['vault']);
console.log('PASS: la transición completa y parcial de tenant conserva errores propios sin mostrar errores ajenos.');

console.log('PASS: los cuatro feeds bloquean datos y errores cruzados entre negocios.');

console.log('PASS: cambiar de negocio no reutiliza lecturas ni errores de otro tenant.');
console.log('PASS: turnos no se abren ni cierran con lecturas incompletas, fechas inválidas, entre negocios o con turnos duplicados.');

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

// Guardia estática de regresión: no ejecuta cobros ni accede a Firebase.
// Complementa las pruebas de lógica; NO certifica permisos ni aislamiento en Firestore.
const shiftViewSource = readFileSync(new URL('../src/components/platform/BusinessShiftView.tsx', import.meta.url), 'utf8');
assert.match(shiftViewSource, /subscribeToBusinessRestaurantOrders\(businessId,/);
const scopedFeeds = [...shiftViewSource.matchAll(/subscribeToModule(?:<[^()\n]+>)?\(businessId,\s*'(shifts|expenses|vault)'/g)].map((match) => match[1]).sort();
assert.deepEqual(scopedFeeds, ['expenses', 'shifts', 'vault']);
assert.match(shiftViewSource, /getShiftReadiness\(businessId, feedStates,/);
assert.match(shiftViewSource, /}, \[businessId\]\);/);
assert.doesNotMatch(shiftViewSource, /\b(?:settleTableAccount|subscribeToRestaurantOrders|getActiveRestaurantId|RESTAURANT_ID)\b/);
console.log('PASS: la vista de turno mantiene suscripciones multinegocio y no usa cobro legado (revisión estática).');

 
// Guardia visual de cierre: un pedido pagado sin paidAt no debe habilitar
// el cierre, y el fondo/contado no deben recibir un valor inventado por defecto.
// Solo verifica el código fuente; no ejecuta Firebase ni operaciones de Caja.
assert.match(shiftViewSource, /const missingPaymentDates = active && readiness\.ready \? countPaidOrdersMissingPaymentDate\(orders, active\.openedAt\) : 0;/);
assert.match(shiftViewSource, /if \(missingPaymentDates > 0\) \{\s*setError\(/);
assert.match(shiftViewSource, /disabled=\{missingPaymentDates > 0\}/);
assert.match(shiftViewSource, /disabled=\{busy \|\| missingPaymentDates > 0\}/);
assert.match(shiftViewSource, /const \[fund, setFund\] = useState\(''\)/);
assert.match(shiftViewSource, /const \[counted, setCounted\] = useState\(''\)/);
assert.match(shiftViewSource, /const fundAmount = parseShiftCashAmount\(fund\)/);
assert.match(shiftViewSource, /const countedCash = parseShiftCashAmount\(counted\)/);
console.log('PASS: guardia visual de cierre por fecha de pago y captura explícita de efectivo (revisión estática).');

