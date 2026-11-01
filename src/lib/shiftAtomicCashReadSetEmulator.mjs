/**
 * Lectura consistente y ACOTADA de seis fuentes de Caja, solo Admin SDK
 * conectado a Firestore Emulator. No es endpoint, migrador ni autoridad.
 * Una transacción cubre el conjunto leído; no acredita historial externo,
 * reglas desplegadas, comprobantes ni seguridad de clientes antiguos.
 */
import { auditShiftCutoverCompatibility } from './shiftCutoverCompatibilityPreflight.mjs';
import { auditAccountingCrossSource } from './shiftAccountingCrossSourceAudit.mjs';

const validBusiness = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(v);
const validIso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) &&
  Date.parse(v) > 0 && new Date(v).toISOString() === v;
const cents = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 &&
  Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001
  ? Math.round(v * 100) : null;
const methods = new Set(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']);
const names = ['shifts', 'authority', 'orders', 'payments', 'expenses', 'vault'];
const blank = () => ({
  atomicReadSet: false, scope: 'EMULATOR_BOUNDED_SIX_SOURCES_ONLY',
  counts: Object.fromEntries(names.map((name) => [name, 0])),
  otherTenant: { orders: 0, payments: 0 },
});
const blocked = (issues, capture = blank()) => ({
  status: 'BLOCKED', inventoryComplete: false, reconciled: false,
  canCloseCash: false, canActivate: false,
  issues: [...new Set(['CUTOVER_APPROVAL_REQUIRED', 'HISTORICAL_EVIDENCE_PENDING', ...issues])].sort(),
  capture,
});

function paymentIssue(row, issues) {
  const p = row.data;
  if (!validIso(p.createdAt) || cents(p.total) === null) issues.add('TABLE_PAYMENT_DATE_OR_AMOUNT_UNVERIFIED');
  if (p.paymentMethod === 'MIXTO') {
    const parts = p.paymentBreakdown;
    let sum = 0;
    const seen = new Set();
    const valid = Array.isArray(parts) && parts.length >= 2 && parts.every((part) => {
      const amount = cents(part?.amount);
      if (!methods.has(part?.method) || seen.has(part.method) || amount === null ||
          !Number.isSafeInteger(sum + amount)) return false;
      seen.add(part.method);
      sum += amount;
      return true;
    });
    if (!valid || sum !== cents(p.total)) issues.add('TABLE_PAYMENT_MIXED_BREAKDOWN_UNVERIFIED');
  } else if (!methods.has(p.paymentMethod)) {
    issues.add('TABLE_PAYMENT_METHOD_UNVERIFIED');
  }
}

/**
 * No acepta URLs ni credenciales: db debe ser Admin Firestore ya conectado
 * a 127.0.0.1:8080. No se devuelve ninguna fila ni importe.
 */
export async function captureAtomicCashReadSetEmulator({ db, businessId, maxRows = 200 } = {}) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('EMULATOR_ONLY');
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function' ||
      !validBusiness(businessId) || !Number.isInteger(maxRows) || maxRows < 1 || maxRows > 200) {
    throw new TypeError('INVALID_CAPTURE_INPUT');
  }
  try {
    return await db.runTransaction(async (tx) => {
      const root = db.collection('businesses').doc(businessId);
      const rootSnap = await tx.get(root);
      if (!rootSnap.exists || rootSnap.data()?.restaurantId !== businessId) {
        return blocked(['BUSINESS_NOT_FOUND_OR_MISMATCH']);
      }
      const refs = {
        shifts: root.collection('shifts'), authority: root.collection('shiftAuthority'),
        orders: db.collection('restaurant_orders'), payments: db.collection('table_payments'),
        expenses: root.collection('expenses'), vault: root.collection('vault'),
      };
      const rows = {};
      for (const name of names) {
        // La consulta global NO filtra tenant: detecta documentos huérfanos
        // en el universo acotado. Si rebasa el límite, se bloquea.
        const snapshot = await tx.get(refs[name].orderBy('__name__').limit(maxRows + 1));
        if (snapshot.size > maxRows) return blocked([name.toUpperCase() + '_HISTORY_LIMIT_EXCEEDED']);
        rows[name] = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
      }
      const capture = blank();
      capture.atomicReadSet = true; // solo los documentos leídos dentro de ESTA transacción
      const issues = new Set(['ATOMIC_READ_SET_NOT_HISTORICAL_PROOF']);
      const own = {};
      for (const name of names) {
        const identity = ['orders', 'payments'].includes(name) ? 'restaurantId' : 'businessId';
        own[name] = [];
        for (const row of rows[name]) {
          const tenant = row.data?.[identity];
          if (!validBusiness(tenant)) {
            issues.add(name.toUpperCase() + '_TENANT_ID_MISSING_OR_INVALID');
            continue;
          }
          if (tenant !== businessId) {
            if (name === 'orders' || name === 'payments') capture.otherTenant[name]++;
            else issues.add(name.toUpperCase() + '_TENANT_MISMATCH');
            continue;
          }
          own[name].push(row);
          capture.counts[name]++;
        }
      }
      // Solo los registros propios participan en relaciones contables.
      // Los globales ajenos permanecen únicamente como conteos.
      for (const row of own.orders) {
        if (row.data.billingStatus === 'PAGADO' &&
            (!validIso(row.data.paidAt) || cents(row.data.total) === null)) {
          issues.add('PAID_ORDER_DATE_OR_AMOUNT_UNVERIFIED');
        }
      }
      for (const row of own.payments) paymentIssue(row, issues);
      let currentLock = null;
      const receipts = [];
      for (const row of rows.authority) {
        if (row.id === 'current') currentLock = row.data;
        else if (row.id.startsWith('closed-')) {
          if (row.id !== 'closed-' + row.data?.shiftId) issues.add('RECEIPT_DOCUMENT_ID_MISMATCH');
          receipts.push({ ...row.data, id: row.id });
        } else issues.add('UNKNOWN_AUTHORITY_DOCUMENT');
      }
      const shiftAudit = auditShiftCutoverCompatibility({
        businessId, shifts: rows.shifts.map((row) => ({ ...row.data, id: row.id })),
        currentLock, receipts, inventoryComplete: false,
      });
      const accountingAudit = auditAccountingCrossSource({
        businessId, orders: own.orders, payments: own.payments,
        expenses: rows.expenses, vault: rows.vault,
      });
      for (const code of [...shiftAudit.issues, ...accountingAudit.issues]) issues.add(code);
      return blocked([...issues], capture);
    }, { maxAttempts: 3 });
  } catch {
    // Un fallo, conflicto/reintentos agotados o lectura incompleta NO es Caja vacía.
    return blocked(['TRANSACTION_READ_FAILED']);
  }
}
