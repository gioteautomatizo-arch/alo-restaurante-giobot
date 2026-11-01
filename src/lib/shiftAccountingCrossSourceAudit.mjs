/**
 * Diagnóstico PURO y sin importes de integridad entre cuatro fuentes de Caja.
 * Requiere filas materializadas por el inventario paginado del EMULADOR.
 * No acredita completitud, snapshot atómico ni autoridad de cierre.
 */
const validTenant = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(v);
const isoMs = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) &&
  Date.parse(v) > 0 && new Date(v).toISOString() === v ? Date.parse(v) : null;
const cents = (v, allowZero = false) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (!allowZero && v === 0)) return null;
  const n = Math.round(v * 100);
  return Number.isSafeInteger(n) && Math.abs(v * 100 - n) < 0.000001 ? n : null;
};
const isRow = (r) => r && typeof r.id === 'string' && r.id.length > 0 &&
  !r.id.includes('/') && r.data && typeof r.data === 'object' && !Array.isArray(r.data);

export function auditAccountingCrossSource({ businessId, orders, payments, expenses, vault,
  startIso, endIso } = {}) {
  if (!validTenant(businessId) || ![orders, payments, expenses, vault].every(Array.isArray) ||
      (startIso !== undefined && isoMs(startIso) === null) ||
      (endIso !== undefined && isoMs(endIso) === null) ||
      (startIso !== undefined && endIso !== undefined && isoMs(startIso) > isoMs(endIso))) {
    throw new TypeError('INVALID_AUDIT_INPUT');
  }
  const issues = new Set(['HISTORICAL_EVIDENCE_PENDING', 'NOT_ATOMIC_SNAPSHOT']);
  const countsInPeriod = { orders: 0, payments: 0, expenses: 0, vault: 0 };
  const start = startIso === undefined ? -Infinity : isoMs(startIso);
  const end = endIso === undefined ? Infinity : isoMs(endIso);
  const own = {};
  for (const [name, rows] of Object.entries({ orders, payments, expenses, vault })) {
    const tenantKey = name === 'orders' || name === 'payments' ? 'restaurantId' : 'businessId';
    const seen = new Set();
    own[name] = [];
    for (const row of rows) {
      if (!isRow(row)) { issues.add(name.toUpperCase() + '_ROW_INVALID'); continue; }
      if (row.data[tenantKey] !== businessId) {
        issues.add(name.toUpperCase() + '_TENANT_MISMATCH_OR_MISSING');
        continue;
      }
      // Un ID ajeno no puede crear un falso duplicado del tenant auditado.
      if (seen.has(row.id)) { issues.add(name.toUpperCase() + '_DUPLICATE_ID'); continue; }
      seen.add(row.id);
      own[name].push(row);
      const timeField = name === 'orders' ? (row.data.billingStatus === 'PAGADO' ? 'paidAt' : 'createdAt') : 'createdAt';
      const at = isoMs(row.data[timeField]);
      if (at === null) issues.add(name.toUpperCase() + '_DATE_UNVERIFIED');
      else if (at >= start && at <= end) countsInPeriod[name]++;
      if (name === 'expenses') {
        if (cents(row.data.amount) === null || !['efectivo_caja', 'otro'].includes(row.data.paidWith)) {
          issues.add('EXPENSES_AMOUNT_OR_METHOD_UNVERIFIED');
        }
      }
      if (name === 'vault') {
        if (cents(row.data.amount) === null || !['deposito', 'retiro'].includes(row.data.kind)) {
          issues.add('VAULT_AMOUNT_OR_KIND_UNVERIFIED');
        }
      }
    }
  }
  const orderById = new Map(own.orders.map((r) => [r.id, r.data]));
  const paymentById = new Map(own.payments.map((r) => [r.id, r.data]));
  const claimed = new Set();
  for (const paymentRow of own.payments) {
    const p = paymentRow.data;
    if (!['PAGADO', 'ANULADO'].includes(p.status)) issues.add('TABLE_PAYMENT_STATUS_UNVERIFIED');
    if (p.status !== 'PAGADO') continue;
    if (!Array.isArray(p.orderIds) || p.orderIds.length === 0) {
      issues.add('TABLE_PAYMENT_WITHOUT_ORDERS');
      continue;
    }
    const seen = new Set();
    let subtotal = 0;
    let subtotalValid = true;
    for (const orderId of p.orderIds) {
      if (typeof orderId !== 'string' || !orderId) { issues.add('TABLE_PAYMENT_ORDER_ID_INVALID'); continue; }
      if (seen.has(orderId)) { issues.add('TABLE_PAYMENT_ORDER_DUPLICATE'); continue; }
      seen.add(orderId);
      if (claimed.has(orderId)) issues.add('TABLE_ORDER_IN_MULTIPLE_PAYMENTS');
      claimed.add(orderId);
      const o = orderById.get(orderId);
      if (!o) { issues.add('TABLE_PAYMENT_ORDER_MISSING'); continue; }
      if (o.orderType !== 'dine_in' || o.status === 'CANCELADO' || o.billingStatus !== 'PAGADO') {
        issues.add('TABLE_PAYMENT_ORDER_STATE_INVALID');
      }
      if (o.paymentId !== paymentRow.id) issues.add('TABLE_PAYMENT_NOT_RECIPROCAL');
      if (isoMs(o.paidAt) === null || isoMs(p.createdAt) === null || isoMs(o.paidAt) !== isoMs(p.createdAt)) {
        issues.add('TABLE_PAYMENT_DATE_MISMATCH');
      }
      const n = cents(o.total);
      if (n === null || !Number.isSafeInteger(subtotal + n)) subtotalValid = false;
      else subtotal += n;
    }
    const expectedSubtotal = cents(p.subtotal, true);
    const discount = cents(p.discountAmount, true);
    const tip = cents(p.tipAmount, true);
    const total = cents(p.total);
    if (!subtotalValid || expectedSubtotal === null || discount === null || tip === null || total === null ||
        discount > expectedSubtotal || subtotal !== expectedSubtotal || expectedSubtotal - discount + tip !== total) {
      issues.add('TABLE_PAYMENT_AMOUNT_MISMATCH');
    }
  }
  for (const orderRow of own.orders) {
    const o = orderRow.data;
    if (o.orderType === 'dine_in' && o.billingStatus === 'PAGADO') {
      if (typeof o.paymentId !== 'string' || !paymentById.has(o.paymentId) ||
          paymentById.get(o.paymentId)?.status !== 'PAGADO' || !claimed.has(orderRow.id)) {
        issues.add('PAID_TABLE_ORDER_WITHOUT_VALID_PAYMENT');
      }
    }
    if (o.orderType !== 'dine_in' && o.paymentId && paymentById.has(o.paymentId)) {
      issues.add('OFF_TABLE_ORDER_LINKED_TO_TABLE_PAYMENT');
    }
  }
  return { status: 'BLOCKED', reconciled: false, inventoryComplete: false,
    canCloseCash: false, canActivate: false, countsInPeriod, issues: [...issues].sort() };
}
