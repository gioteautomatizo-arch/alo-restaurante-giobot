/**
 * Paso 2: verificación estructural OFFLINE de la evidencia de páginas de un
 * inventario autorizado. No lee Firebase, no certifica el origen ni el snapshot.
 * Los fingerprints son etiquetas declaradas, NO pruebas criptográficas.
 */
const COLLECTIONS = [
  ['businesses', 'businesses'],
  ['businessMemberships', 'memberships'],
  ['business_invites', 'invites'],
];
const FINGERPRINT = /^[0-9a-f]{64}$/;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validTime = value => Number.isSafeInteger(value) && value > 0;

export function auditBusinessInviteCaptureManifest({ capture, coverage, businesses, memberships, invites } = {}) {
  const issues = [];
  const add = (code, collection) => issues.push({ code, ...(collection ? { collection } : {}) });
  const counts = { businesses: Array.isArray(businesses) ? businesses.length : 0,
    businessMemberships: Array.isArray(memberships) ? memberships.length : 0,
    business_invites: Array.isArray(invites) ? invites.length : 0, pagesDeclared: 0 };
  const inventory = { businesses, memberships, invites };
  const source = capture?.sourceFingerprint;
  const snapshot = capture?.snapshotFingerprint;
  if (!isObject(capture)) add('MISSING_CAPTURE_MANIFEST');
  if (typeof source !== 'string' || !FINGERPRINT.test(source)) add('INVALID_SOURCE_FINGERPRINT');
  if (typeof snapshot !== 'string' || !FINGERPRINT.test(snapshot)) add('INVALID_SNAPSHOT_FINGERPRINT');
  if (!validTime(capture?.startedAt) || !validTime(capture?.finishedAt) ||
      capture.finishedAt < capture.startedAt) add('INVALID_CAPTURE_TIME_RANGE');
  if (!isObject(capture?.collections)) add('MISSING_CAPTURE_COLLECTIONS');

  for (const [name, inventoryKey] of COLLECTIONS) {
    const scan = capture?.collections?.[name];
    const declared = coverage?.[name];
    const documents = inventory[inventoryKey];
    if (!Array.isArray(documents)) add('MISSING_DOCUMENT_INVENTORY', name);
    if (!isObject(scan)) { add('MISSING_CAPTURE_COLLECTION', name); continue; }
    if (scan.sourceFingerprint !== source || scan.snapshotFingerprint !== snapshot) {
      add('CROSS_COLLECTION_CAPTURE_MISMATCH', name);
    }
    if (!Number.isSafeInteger(scan.pageSize) || scan.pageSize < 1 || scan.pageSize > 500) {
      add('INVALID_CAPTURE_PAGE_SIZE', name);
    }
    const pages = scan.pageCounts;
    if (!Array.isArray(pages) || pages.length === 0 || pages.length > 10000) {
      add('INVALID_CAPTURE_PAGE_SEQUENCE', name);
      continue;
    }
    counts.pagesDeclared += pages.length;
    const validPageSize = Number.isSafeInteger(scan.pageSize) && scan.pageSize >= 1 && scan.pageSize <= 500;
    const validCounts = validPageSize && pages.every(n => Number.isSafeInteger(n) && n >= 0 && n <= scan.pageSize);
    if (!validCounts) {
      add('INVALID_CAPTURE_PAGE_COUNTS', name);
      continue;
    }
    // La captura debe consultar una página terminal corta o vacía; una última
    // página llena no prueba que el inventario haya terminado.
    if (pages.slice(0, -1).some(n => n !== scan.pageSize)) {
      add('NONTERMINAL_PAGE_INCOMPLETE', name);
    }
    if (pages.at(-1) === scan.pageSize) add('MISSING_TERMINAL_PAGE', name);
    const total = pages.reduce((sum, n) => sum + n, 0);
    if (!Number.isSafeInteger(total) || !Array.isArray(documents) || total !== documents.length ||
        !isObject(declared) || declared.documentCount !== total) {
      add('CAPTURE_COUNT_MISMATCH', name);
    }
    if (!isObject(declared) || declared.complete !== true || declared.pagesRead !== pages.length) {
      add('CAPTURE_COVERAGE_MISMATCH', name);
    }
  }
  return {
    mode: 'OFFLINE_NO_FIREBASE_NO_WRITE',
    status: issues.length ? 'BLOCKED' : 'READY_FOR_INDEPENDENT_REVIEW',
    safeToDeploy: false,
    counts, issues,
    caveat: 'Las páginas, huellas y tiempos son declaraciones del capturista. No prueban origen, autorización, lectura exhaustiva real ni snapshot atómico. Exigir revisión humana y auditoría histórica separada.',
  };
}
