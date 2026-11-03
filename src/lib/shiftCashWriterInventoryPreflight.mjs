/**
 * Inventario ESTÁTICO de sitios de escritura conocidos de Caja.
 * No escanea otros repositorios, clientes instalados ni SDKs antiguos.
 * Un conteo igual no demuestra coordinación, seguridad ni atomicidad.
 * Este módulo NO lee Firestore ni autoriza cierres.
 */
export const CASH_WRITER_SITE_COUNTS = Object.freeze({
  'src/lib/businessTableCheckout.ts': Object.freeze({ runTransaction: 1, 'tx.set': 1, 'tx.update': 1 }),
  'src/lib/ordersService.ts': Object.freeze({
    addDoc: 2, setDoc: 3, updateDoc: 4, writeBatch: 1,
    runTransaction: 3, 'transaction.update': 4, 'batch.set': 2,
  }),
  'src/lib/paymentsService.ts': Object.freeze({
    runTransaction: 1, 'transaction.set': 1,
    'transaction.update': 1, updateDoc: 1,
  }),
  'src/lib/tenantModules.ts': Object.freeze({
    addDoc: 1, setDoc: 1, deleteDoc: 1,
  }),
  'src/components/platform/BusinessShiftView.tsx': Object.freeze({
    saveModuleDoc: 2,
  }),
  'src/components/platform/BusinessExpensesView.tsx': Object.freeze({
    saveModuleDoc: 1, deleteModuleDoc: 1,
  }),
  'src/components/platform/BusinessVaultView.tsx': Object.freeze({
    saveModuleDoc: 1, deleteModuleDoc: 1,
  }),
  'src/lib/shiftOpenAuthorityPreflight.mjs': Object.freeze({
    runTransaction: 1, 'tx.create': 2,
  }),
  'src/lib/shiftCloseAuthorityPreflight.mjs': Object.freeze({
    runTransaction: 1, 'tx.update': 1, 'tx.delete': 1, 'tx.create': 1,
  }),
  'publicOrderAuthorityTransaction.ts': Object.freeze({
    runTransaction: 1, 'tx.create': 3,
  }),
  'src/lib/saleReceiptsService.ts': Object.freeze({
    setDoc: 3,
  }),
});

const bindings = Object.freeze([
  ['src/lib/tenantModules.ts', "setDoc\\(doc\\(db,\\s*'businesses',\\s*businessId,\\s*module,\\s*id\\)", 1],
  ['src/lib/tenantModules.ts', "deleteDoc\\(doc\\(db,\\s*'businesses',\\s*businessId,\\s*module,\\s*id\\)", 1],
  ['src/components/platform/BusinessShiftView.tsx', "saveModuleDoc\\(\\s*businessId,\\s*'shifts'", 2],
  ['src/components/platform/BusinessExpensesView.tsx', "saveModuleDoc\\(\\s*businessId,\\s*'expenses'", 1],
  ['src/components/platform/BusinessExpensesView.tsx', "deleteModuleDoc\\(\\s*businessId,\\s*'expenses'", 1],
  ['src/components/platform/BusinessVaultView.tsx', "saveModuleDoc\\(\\s*businessId,\\s*'vault'", 1],
  ['src/components/platform/BusinessVaultView.tsx', "deleteModuleDoc\\(\\s*businessId,\\s*'vault'", 1],
  ['src/lib/paymentsService.ts', "transaction\\.set\\(paymentRef", 1],
  ['src/lib/paymentsService.ts', "transaction\\.update\\(doc\\(db,\\s*'restaurant_orders'", 1],
  ['src/lib/shiftOpenAuthorityPreflight.mjs', "tx\\.create\\(lock", 1],
  ['src/lib/shiftCloseAuthorityPreflight.mjs', "tx\\.create\\(receipt", 1],
  ['publicOrderAuthorityTransaction.ts', "tx\\.create\\(orderRef", 1],
]);

export function auditCashWriterSites(sourceByPath = {}) {
  if (sourceByPath === null || typeof sourceByPath !== 'object' ||
      Array.isArray(sourceByPath)) throw new TypeError('INVALID_CASH_WRITER_SOURCE_MAP');
  const issues = new Set([
    'SHARED_EPOCH_NOT_ENFORCED',
    'HISTORICAL_CLIENT_WRITERS_UNVERIFIED',
    'WRITER_DISCOVERY_NOT_EXHAUSTIVE',
    'CASH_CUTOVER_NOT_AUTHORIZED',
  ]);
  const observed = {};
  let stable = true;
  for (const [path, expected] of Object.entries(CASH_WRITER_SITE_COUNTS)) {
    const source = sourceByPath[path];
    if (typeof source !== 'string' || source.length === 0) {
      issues.add('WRITER_SOURCE_MISSING');
      stable = false;
      continue;
    }
    observed[path] = {};
    for (const [sink, expectedCount] of Object.entries(expected)) {
      const pattern = new RegExp('\\b' + sink.replaceAll('.', '\\.') + '\\s*\\(', 'g');
      const actual = (source.match(pattern) || []).length;
      observed[path][sink] = actual;
      if (actual !== expectedCount) {
        issues.add('WRITER_SITE_DRIFT');
        stable = false;
      }
    }
  }
  for (const [path, pattern, expectedCount] of bindings) {
    const source = sourceByPath[path];
    if (typeof source !== 'string') continue;
    const actual = (source.match(new RegExp(pattern, 'g')) || []).length;
    if (actual !== expectedCount) {
      issues.add('WRITER_TENANT_BINDING_DRIFT');
      stable = false;
    }
  }
  if (Object.keys(sourceByPath).some((path) =>
    !Object.hasOwn(CASH_WRITER_SITE_COUNTS, path))) {
    issues.add('UNREVIEWED_WRITER_SOURCE');
    stable = false;
  }
  return {
    status: 'BLOCKED',
    canCloseCash: false,
    canActivate: false,
    reconciled: false,
    snapshotCertified: false,
    writerInventoryComplete: false,
    knownWriterSitesStable: stable,
    observed,
    issues: [...issues].sort(),
  };
}
