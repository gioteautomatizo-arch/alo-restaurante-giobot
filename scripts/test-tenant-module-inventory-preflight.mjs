import assert from 'node:assert/strict';
import { auditTenantModuleInventory, TENANT_MODULES } from './tenant-module-inventory-preflight.mjs';

const businesses = ['tenant-A', 'tenant-B'];
const partitions = businesses.flatMap(businessId =>
  TENANT_MODULES.map(module => ({ businessId, module, complete: true, documentCount: 1 })));
const valid = partitions.map(({ businessId, module }) => ({
  pathBusinessId: businessId, module, docId: 'valid', businessId,
}));
const run = (documents = valid, scannedPartitions = partitions, expectedBusinessIds = businesses) =>
  auditTenantModuleInventory({ documents, scannedPartitions, expectedBusinessIds });

let result = run();
assert.equal(result.safeToProceed, true);
assert.equal(result.counts.healthy, 12);
assert.equal(result.issues.length, 0);
assert.equal(result.pendingPartitions.length, 0);
assert.equal(run([], partitions.map(p => ({ ...p, documentCount: 0 }))).safeToProceed,
  true, 'inventario vacío solo es válido con 12 escaneos completos y recuento cero');

result = run(valid.map((d, i) => i === 0 ? { ...d, businessId: undefined } : d));
assert.equal(result.safeToProceed, false);
assert.equal(result.counts.missingIdentity, 1);
assert.equal(result.issues[0].code, 'MISSING_BUSINESS_ID');

result = run(valid.map((d, i) => i === 0 ? { ...d, businessId: 'tenant-B' } : d));
assert.equal(result.safeToProceed, false);
assert.equal(result.counts.foreignIdentity, 1);
assert.equal(result.issues[0].code, 'CROSS_TENANT_OR_INVALID_BUSINESS_ID');

result = run([...valid, { ...valid[0] }]);
assert.equal(result.counts.duplicate, 1);
assert.equal(result.safeToProceed, false);

result = run([...valid, { ...valid[0], docId: 'other', module: 'unknown' }]);
assert.equal(result.counts.invalid, 1);
assert.equal(result.safeToProceed, false);

result = run(valid, partitions.slice(1));
assert.equal(result.safeToProceed, false);
assert.equal(result.counts.incompletePartitions, 1);
assert.equal(result.pendingPartitions[0].module, 'shifts');

result = run(valid, [...partitions, partitions[0]]);
assert.equal(result.safeToProceed, false);
assert(result.issues.some(i => i.code === 'INVALID_OR_DUPLICATE_PARTITION'));

assert.equal(run(valid, partitions, []).safeToProceed, false);
assert.equal(run(valid, partitions, ['tenant-A', 'tenant-A']).safeToProceed, false);
assert.equal(run(valid, partitions, ['tenant-A', 'bad/id']).safeToProceed, false);
assert.equal(auditTenantModuleInventory().safeToProceed, false);
assert.equal(run(null).safeToProceed, false);
assert.equal(run(valid, null).safeToProceed, false);
assert.equal(run(valid, partitions, null).safeToProceed, false);

result = run([{ ...valid[0], businessId: null }, { ...valid[1], businessId: 7 }]);
assert.equal(result.counts.missingIdentity, 1);
assert.equal(result.counts.foreignIdentity, 1);
assert.equal(result.safeToProceed, false);
assert(!JSON.stringify(result).includes('"docId"'), 'No devolver identificadores ni datos del documento');


// El esquema antiguo aceptaba 12 particiones declaradas + cero documentos:
// sin prueba de fin de lectura, eso era una falsa autorización de migración.
const unverified = partitions.map(({ businessId, module }) => ({ businessId, module }));
result = run([], unverified);
assert.equal(result.safeToProceed, false, 'no aceptar cobertura sin evidencia de lectura completa');
assert.equal(result.counts.incompletePartitions, 12);
assert(result.issues.some(i => i.code === 'INCOMPLETE_OR_INVALID_PARTITION_SCAN'));

for (const patch of [
  { complete: false }, { complete: null }, { complete: 'true' },
  { documentCount: -1 }, { documentCount: 1.5 },
  { documentCount: '1' }, { documentCount: Number.POSITIVE_INFINITY },
  { documentCount: Number.MAX_SAFE_INTEGER + 1 },
]) {
  result = run(valid, partitions.map((p, i) => i === 0 ? { ...p, ...patch } : p));
  assert.equal(result.safeToProceed, false, 'metadatos de escaneo inválidos bloquean');
  assert.equal(result.counts.incompletePartitions, 1);
}
result = run(valid, partitions.map((p, i) => i === 0
  ? { businessId: p.businessId, module: p.module, complete: true } : p));
assert.equal(result.safeToProceed, false, 'no aceptar recuento ausente');

result = run(valid.slice(1));
assert.equal(result.safeToProceed, false, 'una página omitida no es un inventario vacío');
assert.equal(result.counts.countMismatchPartitions, 1);
assert(result.issues.some(i => i.code === 'PARTITION_DOCUMENT_COUNT_MISMATCH'));

result = run(valid, partitions.map((p, i) => i === 0 ? { ...p, documentCount: 2 } : p));
assert.equal(result.safeToProceed, false, 'un recuento superior a los documentos recibidos bloquea');
assert.equal(result.counts.countMismatchPartitions, 1);

result = run(valid, partitions.map((p, i) => i === 0 ? { ...p, documentCount: 0 } : p));
assert.equal(result.safeToProceed, false, 'un recuento inferior a los documentos recibidos bloquea');
assert.equal(result.counts.countMismatchPartitions, 1);
assert(!JSON.stringify(result).includes('"docId"'), 'el fallo de conteo no expone IDs');

const snapshot = JSON.stringify(valid);
run(valid);
assert.equal(JSON.stringify(valid), snapshot, 'El preflight no modifica el inventario');
console.log('PASS preflight histórico: 6 módulos x 2 tenants; lectura completa y recuentos obligatorios, truncamiento/ausencia/cruce/duplicado bloquean; sin escrituras.');
