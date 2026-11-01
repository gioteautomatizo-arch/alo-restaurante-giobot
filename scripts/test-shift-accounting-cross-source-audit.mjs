import assert from 'node:assert/strict';
import { auditAccountingCrossSource as audit } from '../src/lib/shiftAccountingCrossSourceAudit.mjs';
const at = '2026-10-31T13:00:00.000Z';
const later = '2026-11-01T13:00:00.000Z';
const row = (id, data) => ({ id, data });
const make = () => ({ businessId: 'tenant-a', startIso: at, endIso: at,
  orders: [row('a1', { restaurantId: 'tenant-a', orderType: 'dine_in', billingStatus: 'PAGADO',
    status: 'ENTREGADO', paidAt: at, paymentId: 'p1', total: 100 }),
    row('a2', { restaurantId: 'tenant-a', orderType: 'pickup', billingStatus: 'PAGADO',
      status: 'ENTREGADO', paidAt: later, total: 30 })],
  payments: [row('p1', { restaurantId: 'tenant-a', status: 'PAGADO', createdAt: at,
    orderIds: ['a1'], subtotal: 100, discountAmount: 10, tipAmount: 5, total: 95 })],
  expenses: [row('e1', { businessId: 'tenant-a', createdAt: at, amount: 10, paidWith: 'efectivo_caja' })],
  vault: [row('v1', { businessId: 'tenant-a', createdAt: at, amount: 5, kind: 'deposito' })],
});
const has = (r, code) => assert.ok(r.issues.includes(code), `Falta ${code}: ${r.issues}`);
const base = audit(make());
assert.equal(base.status, 'BLOCKED');
assert.equal(base.canCloseCash, false);
assert.equal(base.reconciled, false);
assert.deepEqual(base.countsInPeriod, { orders: 1, payments: 1, expenses: 1, vault: 1 });
assert.deepEqual(base.issues, ['HISTORICAL_EVIDENCE_PENDING', 'NOT_ATOMIC_SNAPSHOT']);
const test = (change, code) => { const v = make(); change(v); has(audit(v), code); };
test(v => { v.payments[0].data.orderIds = ['a1', 'a1']; }, 'TABLE_PAYMENT_ORDER_DUPLICATE');
test(v => { v.payments[0].data.orderIds = ['absent']; }, 'TABLE_PAYMENT_ORDER_MISSING');
test(v => { v.orders[0].data.paymentId = 'other'; }, 'TABLE_PAYMENT_NOT_RECIPROCAL');
test(v => { v.orders[0].data.paidAt = later; }, 'TABLE_PAYMENT_DATE_MISMATCH');
test(v => { v.orders[0].data.total = 110; }, 'TABLE_PAYMENT_AMOUNT_MISMATCH');
test(v => { v.payments.push(row('p2', { ...v.payments[0].data, orderIds: ['a1'] })); }, 'TABLE_ORDER_IN_MULTIPLE_PAYMENTS');
test(v => { v.payments = []; }, 'PAID_TABLE_ORDER_WITHOUT_VALID_PAYMENT');
test(v => { v.payments[0].data.status = 'ANULADO'; }, 'PAID_TABLE_ORDER_WITHOUT_VALID_PAYMENT');
test(v => { v.orders[0].data.orderType = 'delivery'; }, 'TABLE_PAYMENT_ORDER_STATE_INVALID');
test(v => { v.expenses[0].data.paidWith = 'inventado'; }, 'EXPENSES_AMOUNT_OR_METHOD_UNVERIFIED');
test(v => { v.vault[0].data.kind = 'inventado'; }, 'VAULT_AMOUNT_OR_KIND_UNVERIFIED');
test(v => { v.orders[0].data.restaurantId = 'tenant-b'; }, 'ORDERS_TENANT_MISMATCH_OR_MISSING');
test(v => { v.payments[0].data.restaurantId = 'tenant-b'; }, 'PAYMENTS_TENANT_MISMATCH_OR_MISSING');
test(v => { v.expenses[0].data.businessId = 'tenant-b'; }, 'EXPENSES_TENANT_MISMATCH_OR_MISSING');
test(v => { v.vault[0].data.businessId = undefined; }, 'VAULT_TENANT_MISMATCH_OR_MISSING');
test(v => { v.orders[0].data.paidAt = 'fecha-desconocida'; }, 'ORDERS_DATE_UNVERIFIED');
test(v => { v.orders.push({ ...v.orders[0] }); }, 'ORDERS_DUPLICATE_ID');
assert.throws(() => audit({ ...make(), startIso: 'mal' }), /INVALID_AUDIT_INPUT/);
assert.throws(() => audit({ ...make(), endIso: '2026-10-30T13:00:00.000Z' }), /INVALID_AUDIT_INPUT/);
assert.equal(audit({ ...make(), orders: [...make().orders, row('b1', {
  restaurantId: 'tenant-b', billingStatus: 'PAGADO', paidAt: at })] }).countsInPeriod.orders, 1);
console.log('PASS: integridad de referencias, importes, fechas, métodos, periodos y aislamiento A/B con datos sintéticos.');
console.log('PENDIENTE: conciliación histórica, snapshot atómico, autoridad de cierre y reglas desplegadas.');
