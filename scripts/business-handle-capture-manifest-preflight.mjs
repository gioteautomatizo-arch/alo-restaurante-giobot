/**
 * Paso 2: evidencia ESTRUCTURAL de páginas para un inventario autorizado.
 * OFFLINE: no consulta Firebase ni certifica origen, consistencia o integridad.
 * Las huellas son etiquetas pseudónimas declaradas, NO hashes del contenido.
 */
const SCOPES = Object.freeze([
  'businesses', 'businessMemberships', 'businessHandleReservations',
  'publicBusinessProfiles', 'businessSubcollections',
]);
const FINGERPRINT = /^[0-9a-f]{64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeTime = value => Number.isSafeInteger(value) && value > 0;

function scopeFor(path) {
  if (typeof path !== 'string') return null;
  const parts = path.split('/');
  if (parts[0] === 'businesses' && parts.length === 2) return 'businesses';
  if (parts[0] === 'businesses' && parts.length >= 4 && parts.length % 2 === 0)
    return 'businessSubcollections';
  return parts.length === 2 && SCOPES.includes(parts[0]) ? parts[0] : null;
}

/**
 * @returns {string[]} Códigos globales, sin datos, UID ni fingerprints.
 */
export function auditHandleCaptureManifest({ capture, coverage, records } = {}) {
  const problems = [];
  if (!object(capture)) return ['MISSING_CAPTURE_MANIFEST'];
  const source = capture.sourceFingerprint;
  const snapshot = capture.snapshotFingerprint;
  if (typeof source !== 'string' || !FINGERPRINT.test(source))
    problems.push('INVALID_CAPTURE_SOURCE_FINGERPRINT');
  if (typeof snapshot !== 'string' || !FINGERPRINT.test(snapshot))
    problems.push('INVALID_CAPTURE_SNAPSHOT_FINGERPRINT');
  if (!safeTime(capture.startedAt) || !safeTime(capture.finishedAt)
      || capture.finishedAt < capture.startedAt)
    problems.push('INVALID_CAPTURE_TIME_RANGE');
  if (!object(capture.collections)) {
    problems.push('MISSING_CAPTURE_COLLECTIONS');
    return [...new Set(problems)].sort();
  }
  if (Object.keys(capture.collections).some(key => !SCOPES.includes(key)))
    problems.push('UNKNOWN_CAPTURE_COLLECTION');
  const counts = Object.fromEntries(SCOPES.map(scope => [scope, 0]));
  if (Array.isArray(records)) for (const record of records) {
    const scope = scopeFor(record?.path);
    if (scope) counts[scope]++;
  }
  for (const scope of SCOPES) {
    const scan = capture.collections[scope];
    if (!object(scan)) {
      problems.push('MISSING_CAPTURE_COLLECTION');
      continue;
    }
    if (scan.sourceFingerprint !== source || scan.snapshotFingerprint !== snapshot)
      problems.push('CROSS_COLLECTION_CAPTURE_MISMATCH');
    const size = scan.pageSize;
    if (!Number.isSafeInteger(size) || size < 1 || size > 500) {
      problems.push('INVALID_CAPTURE_PAGE_SIZE');
      continue;
    }
    const pages = scan.pageCounts;
    if (!Array.isArray(pages) || pages.length < 1 || pages.length > 10000) {
      problems.push('INVALID_CAPTURE_PAGE_SEQUENCE');
      continue;
    }
    if (!pages.every(n => Number.isSafeInteger(n) && n >= 0 && n <= size)) {
      problems.push('INVALID_CAPTURE_PAGE_COUNTS');
      continue;
    }
    // No declarar fin de consulta a partir de una página llena.
    if (pages.slice(0, -1).some(n => n !== size))
      problems.push('NONTERMINAL_PAGE_INCOMPLETE');
    if (pages.at(-1) === size) problems.push('MISSING_TERMINAL_PAGE');
    const total = pages.reduce((sum, n) => sum + n, 0);
    if (!Number.isSafeInteger(total) || total !== counts[scope]
        || coverage?.[scope]?.documentCount !== total)
      problems.push('CAPTURE_COUNT_MISMATCH');
    if (coverage?.[scope]?.complete !== true
        || coverage?.[scope]?.pagesRead !== pages.length)
      problems.push('CAPTURE_COVERAGE_MISMATCH');
  }
  return [...new Set(problems)].sort();
}
