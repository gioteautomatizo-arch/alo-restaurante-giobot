/** Contrato sintético de épocas contables: sin Firebase, escrituras ni saldos. */
import assert from 'node:assert/strict';
import { CASH_VERSION_SOURCES as SOURCES, auditCashVersionCoordinationPreflight as audit }
  from '../src/lib/shiftCashVersionCoordinationPreflight.mjs';

const tenant = 'tenant-a';
const fixture = () => ({
  businessId: tenant,
  before: { businessId: tenant, epoch: 7 },
  after: { businessId: tenant, epoch: 7 },
  sourceReads: SOURCES.map((source) => ({ source, businessId: tenant, observedEpoch: 7 })),
  expectedWriterIds: ['orders-payments', 'shifts-other'],
  writerManifest: [
    { id: 'orders-payments', businessId: tenant, coordinatedInSameTransaction: true,
      sources: ['orders', 'payments'] },
    { id: 'shifts-other', businessId: tenant, coordinatedInSameTransaction: true,
      sources: ['shifts', 'authority', 'expenses', 'vault'] },
  ],
});
const issue = (input, code) => {
  const result = audit(input);
  assert.ok(result.issues.includes(code), 'Falta ' + code + ': ' + result.issues);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.canCloseCash, false);
  assert.equal(result.canActivate, false);
  assert.equal(result.reconciled, false);
  assert.equal(result.snapshotCertified, false);
  return result;
};
const stable = audit(fixture());
assert.equal(stable.versionUnchanged, true);
assert.equal(stable.declaredWriterCoverage, true, 'solo cobertura DECLARADA');
assert.deepEqual(stable.issues, [
  'CUTOVER_APPROVAL_REQUIRED', 'HISTORICAL_EVIDENCE_PENDING',
  'CROSS_SOURCE_ATOMIC_SNAPSHOT_UNPROVEN', 'WRITER_COVERAGE_NOT_INDEPENDENTLY_VERIFIED',
].sort());
assert.equal(stable.inventoryComplete, false);

// Carrera: pedido leído con época 7 y pago cambiado a época 8.
const racing = fixture();
racing.after.epoch = 8;
racing.sourceReads.find((row) => row.source === 'payments').observedEpoch = 8;
issue(racing, 'VERSION_CHANGED_DURING_READ');
issue(racing, 'SOURCE_NEWER_THAN_START');
assert.equal(audit(racing).versionUnchanged, false);

// Cambio después de la segunda marca, o escritor legado que omite la marca:
// épocas iguales NO demuestran snapshot atómico ni permiten cerrar Caja.
issue(fixture(), 'CROSS_SOURCE_ATOMIC_SNAPSHOT_UNPROVEN');
issue(fixture(), 'WRITER_COVERAGE_NOT_INDEPENDENTLY_VERIFIED');

const foreignVersion = fixture();
foreignVersion.after.businessId = 'tenant-b';
issue(foreignVersion, 'VERSION_TENANT_MISMATCH');
assert.equal(audit(foreignVersion).versionUnchanged, false);
const foreignRead = fixture();
foreignRead.sourceReads[0].businessId = 'tenant-b';
issue(foreignRead, 'SOURCE_TENANT_MISMATCH');
const foreignWriter = fixture();
foreignWriter.writerManifest[0].businessId = 'tenant-b';
issue(foreignWriter, 'WRITER_TENANT_MISMATCH');
issue(foreignWriter, 'SOURCE_WRITER_UNCOVERED');
assert.equal(audit(foreignWriter).declaredWriterCoverage, false);

const missingRead = fixture();
missingRead.sourceReads.pop();
issue(missingRead, 'SOURCE_READ_MISSING');
const duplicateRead = fixture();
duplicateRead.sourceReads.push({ ...duplicateRead.sourceReads[0] });
issue(duplicateRead, 'SOURCE_READ_DUPLICATE');
const invalidRead = fixture();
invalidRead.sourceReads[0].observedEpoch = -1;
issue(invalidRead, 'SOURCE_EPOCH_INVALID');
const badReadName = fixture();
badReadName.sourceReads[0].source = 'clients';
issue(badReadName, 'SOURCE_READ_INVALID');

const missingWriter = fixture();
missingWriter.writerManifest.pop();
issue(missingWriter, 'WRITER_MISSING');
issue(missingWriter, 'SOURCE_WRITER_UNCOVERED');
const uncoordinated = fixture();
uncoordinated.writerManifest[0].coordinatedInSameTransaction = false;
issue(uncoordinated, 'WRITER_NOT_COORDINATED');
assert.equal(audit(uncoordinated).declaredWriterCoverage, false);
const unknownWriter = fixture();
unknownWriter.writerManifest[0].id = 'unregistered';
issue(unknownWriter, 'WRITER_NOT_IN_INVENTORY');
issue(unknownWriter, 'WRITER_MISSING');
const duplicateWriter = fixture();
duplicateWriter.writerManifest.push({ ...duplicateWriter.writerManifest[0] });
issue(duplicateWriter, 'WRITER_DUPLICATE');
const emptyInventory = fixture();
emptyInventory.expectedWriterIds = [];
issue(emptyInventory, 'WRITER_INVENTORY_EMPTY');

const rollback = fixture();
rollback.after.epoch = 6;
issue(rollback, 'VERSION_EPOCH_ROLLBACK');
const invalidEpoch = fixture();
invalidEpoch.before.epoch = 1.5;
issue(invalidEpoch, 'VERSION_MARKER_INVALID');
const missingMarker = fixture();
missingMarker.after = null;
issue(missingMarker, 'VERSION_MARKER_INVALID');
assert.throws(() => audit({ businessId: tenant }), /INVALID_VERSION_PREFLIGHT_INPUT/);
assert.throws(() => audit({ ...fixture(), businessId: 'tenant/b' }),
  /INVALID_VERSION_PREFLIGHT_INPUT/);

console.log('PASS: preflight de versiones A/B, carrera pedido/pago, cobertura incompleta, fail-closed y NO autorización.');
console.log('PENDIENTE: escritores reales no coordinados, historial, MIXTO, mesa, reglas desplegadas y validación visual; Caja NO conciliada.');
