/**
 * Inventario de fuentes contables, SOLO Admin SDK + Firestore Emulator.
 * Lee globales SIN filtro de tenant para encontrar filas sin identidad.
 * Nunca devuelve importes ni filas, ni autoriza conciliación o cierre.
 * Dos pasadas NO son un snapshot atómico.
 */
const MAX_ROWS = 200;
const validBusiness = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(v);
const validDate = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) &&
  Date.parse(v) > 0 && new Date(v).toISOString() === v;
const validMoney = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 &&
  Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
const denied = (code, capture = {}) => ({
  status: 'BLOCKED', inventoryComplete: false, reconciled: false,
  canCloseCash: false, canActivate: false,
  issues: ['ACCOUNTING_AUTHORITY_REQUIRED', code].sort(),
  capture: { stable: false, scope: 'EMULATOR_GLOBAL_AND_NESTED_NOT_ATOMIC', ...capture },
});
const version = (d) => d.updateTime ? `${d.updateTime.seconds}:${d.updateTime.nanoseconds}` : 'NO_UPDATE_TIME';

async function pageAll(ref, size) {
  const rows = [];
  let cursor = null, pages = 0;
  const seen = new Set();
  for (;;) {
    const query = ref.orderBy('__name__').limit(size);
    const snap = await (cursor ? query.startAfter(cursor).get() : query.get());
    pages++;
    if (snap.empty) break;
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) return { error: 'PAGINATION_DUPLICATE', pages };
      if (rows.length >= MAX_ROWS) return { error: 'HISTORY_LIMIT_EXCEEDED', pages };
      seen.add(doc.id);
      rows.push({ id: doc.id, version: version(doc), data: doc.data() });
    }
    if (snap.size < size) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return { rows, pages };
}
const unchanged = (a, b) => a.length === b.length &&
  a.every((x, i) => x.id === b[i].id && x.version === b[i].version);

/**
 * afterFirstPass solo existe para inyectar carreras en tests.
 * No exponer esta función en HTTP ni usarla contra Firestore real.
 */
export async function captureAccountingSourcesEmulator({
  db, businessId, pageSize = 25, afterFirstPass,
} = {}) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('EMULATOR_ONLY');
  if (!db || typeof db.collection !== 'function' || !validBusiness(businessId) ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      (afterFirstPass !== undefined && typeof afterFirstPass !== 'function')) {
    throw new TypeError('INVALID_CAPTURE_INPUT');
  }
  const names = ['orders', 'payments', 'expenses', 'vault'];
  const capture = { stable: false, scope: 'EMULATOR_GLOBAL_AND_NESTED_NOT_ATOMIC',
    counts: { orders: 0, payments: 0, expenses: 0, vault: 0 },
    otherTenant: { orders: 0, payments: 0 }, pages: {} };
  try {
    const root = db.collection('businesses').doc(businessId);
    const firstRoot = await root.get();
    if (!firstRoot.exists || firstRoot.data()?.restaurantId !== businessId) {
      return denied('BUSINESS_NOT_FOUND_OR_MISMATCH', capture);
    }
    const refs = {
      orders: db.collection('restaurant_orders'),
      payments: db.collection('table_payments'),
      expenses: root.collection('expenses'),
      vault: root.collection('vault'),
    };
    const first = {}, second = {};
    for (const name of names) {
      first[name] = await pageAll(refs[name], pageSize);
      capture.pages[name] = first[name].pages;
      if (first[name].error) return denied(name.toUpperCase() + '_' + first[name].error, capture);
    }
    if (afterFirstPass) await afterFirstPass();
    for (const name of names) {
      second[name] = await pageAll(refs[name], pageSize);
      if (second[name].error) return denied(name.toUpperCase() + '_' + second[name].error, capture);
    }
    const lastRoot = await root.get();
    if (!lastRoot.exists || lastRoot.data()?.restaurantId !== businessId ||
        version(firstRoot) !== version(lastRoot) ||
        names.some((name) => !unchanged(first[name].rows, second[name].rows))) {
      return denied('SOURCES_CHANGED_DURING_READ', capture);
    }
    const issues = new Set(['ACCOUNTING_AUTHORITY_REQUIRED', 'NOT_ATOMIC_SNAPSHOT',
      'HISTORICAL_EVIDENCE_PENDING']);
    for (const name of names) {
      const nested = name === 'expenses' || name === 'vault';
      const identity = nested ? 'businessId' : 'restaurantId';
      for (const row of second[name].rows) {
        const tenant = row.data?.[identity];
        if (typeof tenant !== 'string' || !validBusiness(tenant)) {
          issues.add(name.toUpperCase() + '_TENANT_ID_MISSING_OR_INVALID');
          continue;
        }
        if (tenant !== businessId) {
          if (nested) issues.add(name.toUpperCase() + '_TENANT_MISMATCH');
          else capture.otherTenant[name]++;
          continue;
        }
        capture.counts[name]++;
        if (name === 'orders' && row.data.billingStatus === 'PAGADO' &&
            (!validDate(row.data.paidAt) || !validMoney(row.data.total))) {
          issues.add('PAID_ORDER_DATE_OR_AMOUNT_UNVERIFIED');
        }
        if (name === 'payments') {
          if (!validDate(row.data.createdAt) || !validMoney(row.data.total)) {
            issues.add('TABLE_PAYMENT_DATE_OR_AMOUNT_UNVERIFIED');
          }
          if (row.data.paymentMethod === 'MIXTO') {
            const parts = row.data.paymentBreakdown;
            const allowed = new Set(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']);
            let totalCents = 0;
            const seen = new Set();
            const valid = Array.isArray(parts) && parts.length >= 2 &&
              parts.every((part) => {
                if (!part || !allowed.has(part.method) || seen.has(part.method) ||
                    !validMoney(part.amount)) return false;
                seen.add(part.method);
                totalCents += Math.round(part.amount * 100);
                return Number.isSafeInteger(totalCents);
              });
            if (!valid || !validMoney(row.data.total) ||
                totalCents !== Math.round(row.data.total * 100)) {
              issues.add('TABLE_PAYMENT_MIXED_BREAKDOWN_UNVERIFIED');
            }
          } else if (!['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].includes(row.data.paymentMethod)) {
            issues.add('TABLE_PAYMENT_METHOD_UNVERIFIED');
          }
        }
        if (nested && (!validDate(row.data.createdAt) || !validMoney(row.data.amount))) {
          issues.add(name.toUpperCase() + '_DATE_OR_AMOUNT_UNVERIFIED');
        }
      }
    }
    capture.stable = true;
    return { status: 'BLOCKED', inventoryComplete: false, reconciled: false,
      canCloseCash: false, canActivate: false, issues: [...issues].sort(), capture };
  } catch {
    return denied('READ_FAILED', capture);
  }
}
