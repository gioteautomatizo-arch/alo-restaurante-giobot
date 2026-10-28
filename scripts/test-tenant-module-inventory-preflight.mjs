import assert from 'node:assert/strict';
import { auditTenantModuleInventory, TENANT_MODULES } from './tenant-module-inventory-preflight.mjs';

const businesses = ['tenant-A', 'tenant-B'];
const partitions = businesses.flatMap(businessId =>
  TENANT_MODULES.map(module => ({ businessId, module })));
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
assert.equal(run([], partitions).safeToProceed, true, 'inventario vacío completo es válido');

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

const snapshot = JSON.stringify(valid);
run(valid);
assert.equal(JSON.stringify(valid), snapshot, 'El preflight no modifica el inventario');
console.log('PASS preflight histórico: 6 módulos x 2 tenants, cobertura completa, ausencia/cruce/duplicado/invalidez bloquean; sin escrituras.');
