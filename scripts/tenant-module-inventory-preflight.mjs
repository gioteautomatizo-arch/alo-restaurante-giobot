/**
 * Paso 2 — inventario histórico de módulos anidados. Solo datos de entrada:
 * NO lee Firestore, NO migra, NO escribe, NO imprime documentos.
 * El llamador debe proporcionar todas las particiones escaneadas con
 * credenciales autorizadas; cada partición debe certificar lectura completa
 * y el número de documentos entregados. No verifica la honestidad del llamador.
 */
export const TENANT_MODULES = Object.freeze([
  'shifts', 'expenses', 'vault', 'receivables', 'payables', 'auditLog',
]);
const isId = value => typeof value === 'string' && value.trim() !== ''
  && value === value.trim() && !value.includes('/');
const partitionKey = (businessId, module) => JSON.stringify([businessId, module]);
const docKey = (businessId, module, docId) =>
  JSON.stringify([businessId, module, docId]);

export function auditTenantModuleInventory({ expectedBusinessIds, scannedPartitions, documents } = {}) {
  const counts = {
    documents: 0, healthy: 0, missingIdentity: 0, foreignIdentity: 0,
    duplicate: 0, invalid: 0, incompletePartitions: 0, countMismatchPartitions: 0,
  };
  const issues = [];
  const expected = Array.isArray(expectedBusinessIds) ? expectedBusinessIds : [];
  const validExpected = expected.length > 0
    && expected.every(isId) && new Set(expected).size === expected.length;
  if (!validExpected) issues.push({ code: 'INVALID_EXPECTED_BUSINESSES' });

  const wanted = new Set(validExpected
    ? expected.flatMap(id => TENANT_MODULES.map(module => partitionKey(id, module)))
    : []);
  const seenPartitions = new Set();
  const declaredCounts = new Map();
  if (!Array.isArray(scannedPartitions)) {
    issues.push({ code: 'MISSING_PARTITION_COVERAGE' });
  } else {
    for (const [index, partition] of scannedPartitions.entries()) {
      const key = partition && partitionKey(partition.businessId, partition.module);
      if (!partition || !wanted.has(key) || seenPartitions.has(key)) {
        issues.push({ code: 'INVALID_OR_DUPLICATE_PARTITION', index });
      } else if (partition.complete !== true
          || !Number.isSafeInteger(partition.documentCount) || partition.documentCount < 0) {
        // Declarar una partición no prueba que todas sus páginas se leyeron.
        // Un escaneo fallido o sin recuento verificable nunca habilita el corte.
        issues.push({ code: 'INCOMPLETE_OR_INVALID_PARTITION_SCAN', index });
      } else {
        seenPartitions.add(key);
        declaredCounts.set(key, partition.documentCount);
      }
    }
  }
  const pendingPartitions = validExpected
    ? expected.flatMap(businessId => TENANT_MODULES
      .filter(module => !seenPartitions.has(partitionKey(businessId, module)))
      .map(module => ({ businessId, module })))
    : [];
  counts.incompletePartitions = pendingPartitions.length;

  const seenDocuments = new Set();
  const observedCounts = new Map();
  if (!Array.isArray(documents)) {
    issues.push({ code: 'MISSING_DOCUMENT_INVENTORY' });
  } else {
    counts.documents = documents.length;
    for (const [index, document] of documents.entries()) {
      const valid = document && isId(document.pathBusinessId)
        && isId(document.module) && TENANT_MODULES.includes(document.module)
        && isId(document.docId) && validExpected
        && expected.includes(document.pathBusinessId)
        && seenPartitions.has(partitionKey(document.pathBusinessId, document.module));
      if (!valid) {
        counts.invalid++;
        issues.push({ code: 'INVALID_DOCUMENT', index });
        continue;
      }
      const partition = partitionKey(document.pathBusinessId, document.module);
      observedCounts.set(partition, (observedCounts.get(partition) ?? 0) + 1);
      const key = docKey(document.pathBusinessId, document.module, document.docId);
      if (seenDocuments.has(key)) {
        counts.duplicate++;
        issues.push({ code: 'DUPLICATE_DOCUMENT', index });
        continue;
      }
      seenDocuments.add(key);
      if (document.businessId === undefined || document.businessId === null
          || document.businessId === '') {
        counts.missingIdentity++;
        issues.push({ code: 'MISSING_BUSINESS_ID', index });
      } else if (document.businessId !== document.pathBusinessId) {
        counts.foreignIdentity++;
        issues.push({ code: 'CROSS_TENANT_OR_INVALID_BUSINESS_ID', index });
      } else {
        counts.healthy++;
      }
    }
  }
  for (const [partition, declaredCount] of declaredCounts) {
    if ((observedCounts.get(partition) ?? 0) !== declaredCount) {
      counts.countMismatchPartitions++;
      // No incluir IDs de documentos ni detalles privados en el resultado.
      issues.push({ code: 'PARTITION_DOCUMENT_COUNT_MISMATCH' });
    }
  }
  return {
    safeToProceed: issues.length === 0 && pendingPartitions.length === 0,
    counts, issues, pendingPartitions,
  };
}
