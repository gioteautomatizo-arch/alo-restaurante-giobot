import assert from 'node:assert/strict';
import { getShiftReadiness, initialShiftFeedStates, SHIFT_FEED_NAMES, type ShiftFeedStates } from '../src/lib/businessShiftReadiness.ts';

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
