/**
 * Preflight PURO de protocolo candidato de época contable (sin Firebase).
 * No es un mecanismo de cierre: ni las épocas iguales ni una lista declarada
 * de escritores prueban que TODOS los clientes antiguos coordinen sus cambios.
 * Nunca devuelve autorización, saldos ni datos personales.
 */
export const CASH_VERSION_SOURCES = Object.freeze([
  'shifts', 'authority', 'orders', 'payments', 'expenses', 'vault',
]);
const validTenant = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(v);
const validEpoch = (v) => Number.isSafeInteger(v) && v >= 0;
const validId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 120 &&
  !v.includes('/');
const allowedSources = new Set(CASH_VERSION_SOURCES);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function auditCashVersionCoordinationPreflight({
  businessId, before, after, sourceReads, expectedWriterIds, writerManifest,
} = {}) {
  if (!validTenant(businessId) || !Array.isArray(sourceReads) ||
      !Array.isArray(expectedWriterIds) || !Array.isArray(writerManifest)) {
    throw new TypeError('INVALID_VERSION_PREFLIGHT_INPUT');
  }
  const issues = new Set([
    'CUTOVER_APPROVAL_REQUIRED',
    'HISTORICAL_EVIDENCE_PENDING',
    'CROSS_SOURCE_ATOMIC_SNAPSHOT_UNPROVEN',
    'WRITER_COVERAGE_NOT_INDEPENDENTLY_VERIFIED',
  ]);
  const marker = (m) => {
    if (!isObject(m) || !validEpoch(m.epoch)) {
      issues.add('VERSION_MARKER_INVALID');
      return null;
    }
    if (m.businessId !== businessId) {
      issues.add('VERSION_TENANT_MISMATCH');
      return null;
    }
    return m.epoch;
  };
  const start = marker(before);
  const end = marker(after);
  if (start !== null && end !== null) {
    if (end < start) issues.add('VERSION_EPOCH_ROLLBACK');
    else if (end > start) issues.add('VERSION_CHANGED_DURING_READ');
  }

  const readNames = new Set();
  for (const row of sourceReads) {
    if (!isObject(row) || !allowedSources.has(row.source)) {
      issues.add('SOURCE_READ_INVALID');
      continue;
    }
    if (readNames.has(row.source)) issues.add('SOURCE_READ_DUPLICATE');
    readNames.add(row.source);
    if (row.businessId !== businessId) issues.add('SOURCE_TENANT_MISMATCH');
    if (!validEpoch(row.observedEpoch)) issues.add('SOURCE_EPOCH_INVALID');
    else if (start !== null && row.observedEpoch > start) {
      issues.add('SOURCE_NEWER_THAN_START');
    }
  }
  for (const source of CASH_VERSION_SOURCES) {
    if (!readNames.has(source)) issues.add('SOURCE_READ_MISSING');
  }

  const expected = new Set();
  for (const id of expectedWriterIds) {
    if (!validId(id) || expected.has(id)) issues.add('WRITER_INVENTORY_INVALID');
    else expected.add(id);
  }
  if (expected.size === 0) issues.add('WRITER_INVENTORY_EMPTY');
  const writers = new Set();
  const covered = new Set();
  for (const row of writerManifest) {
    if (!isObject(row) || !validId(row.id) || !Array.isArray(row.sources)) {
      issues.add('WRITER_ENTRY_INVALID');
      continue;
    }
    if (writers.has(row.id)) issues.add('WRITER_DUPLICATE');
    writers.add(row.id);
    if (!expected.has(row.id)) issues.add('WRITER_NOT_IN_INVENTORY');
    if (row.businessId !== businessId) issues.add('WRITER_TENANT_MISMATCH');
    if (row.coordinatedInSameTransaction !== true) issues.add('WRITER_NOT_COORDINATED');
    if (row.sources.length === 0) issues.add('WRITER_SOURCES_INVALID');
    const seenSources = new Set();
    for (const source of row.sources) {
      if (!allowedSources.has(source) || seenSources.has(source)) {
        issues.add('WRITER_SOURCES_INVALID');
        continue;
      }
      seenSources.add(source);
      if (row.businessId === businessId && row.coordinatedInSameTransaction === true) {
        covered.add(source);
      }
    }
  }
  for (const id of expected) if (!writers.has(id)) issues.add('WRITER_MISSING');
  for (const source of CASH_VERSION_SOURCES) {
    if (!covered.has(source)) issues.add('SOURCE_WRITER_UNCOVERED');
  }

  // Observación útil, NO certificación. Una escritura sin versión puede
  // suceder con épocas iguales y la lectura puede quedar obsoleta al terminar.
  return {
    status: 'BLOCKED', canCloseCash: false, canActivate: false,
    reconciled: false, inventoryComplete: false, snapshotCertified: false,
    versionUnchanged: start !== null && end !== null && start === end,
    declaredWriterCoverage: expected.size > 0 &&
      ![...issues].some((code) => code.startsWith('WRITER_') &&
        code !== 'WRITER_COVERAGE_NOT_INDEPENDENTLY_VERIFIED') &&
      !issues.has('SOURCE_WRITER_UNCOVERED'),
    issues: [...issues].sort(),
  };
}
