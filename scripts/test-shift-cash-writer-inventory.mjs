/** Prueba estática de deriva de escritores conocidos: sin Firebase ni cobros. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CASH_WRITER_SITE_COUNTS,
  auditCashWriterSites,
} from '../src/lib/shiftCashWriterInventoryPreflight.mjs';

const sources = Object.fromEntries(Object.keys(CASH_WRITER_SITE_COUNTS).map((path) => [
  path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'),
]));
const checkBlocked = (result) => {
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.canCloseCash, false);
  assert.equal(result.canActivate, false);
  assert.equal(result.reconciled, false);
  assert.equal(result.snapshotCertified, false);
  assert.equal(result.writerInventoryComplete, false);
};
const baseline = auditCashWriterSites(sources);
checkBlocked(baseline);
assert.equal(baseline.knownWriterSitesStable, true,
  'Cambió un escritor conocido: revisar inventario y protocolo antes de seguir.');
assert.deepEqual(baseline.issues, [
  'CASH_CUTOVER_NOT_AUTHORIZED',
  'HISTORICAL_CLIENT_WRITERS_UNVERIFIED',
  'SHARED_EPOCH_NOT_ENFORCED',
  'WRITER_DISCOVERY_NOT_EXHAUSTIVE',
]);
assert.equal(Object.keys(baseline.observed).length, 11);

const orderPath = 'src/lib/ordersService.ts';
const removedWrite = {
  ...sources,
  [orderPath]: sources[orderPath].replace('await setDoc(ref, payload);', ''),
};
assert.notEqual(removedWrite[orderPath], sources[orderPath]);
const removedResult = auditCashWriterSites(removedWrite);
checkBlocked(removedResult);
assert.equal(removedResult.knownWriterSitesStable, false);
assert.ok(removedResult.issues.includes('WRITER_SITE_DRIFT'));

const addedWrite = {
  ...sources,
  [orderPath]: sources[orderPath] + '\nawait updateDoc(rogueRef, roguePayload);\n',
};
assert.ok(auditCashWriterSites(addedWrite).issues.includes('WRITER_SITE_DRIFT'));

const shiftPath = 'src/components/platform/BusinessShiftView.tsx';
const shifted = sources[shiftPath].replace(
  /(await saveModuleDoc\(\s*businessId,\s*)'shifts'/,
  "$1'vault'",
);
assert.notEqual(shifted, sources[shiftPath], 'El fixture debe alterar la llamada real');
const shiftedResult = auditCashWriterSites({ ...sources, [shiftPath]: shifted });
checkBlocked(shiftedResult);
assert.equal(shiftedResult.knownWriterSitesStable, false);
assert.ok(shiftedResult.issues.includes('WRITER_TENANT_BINDING_DRIFT'));

const missing = { ...sources };
delete missing['src/lib/paymentsService.ts'];
const missingResult = auditCashWriterSites(missing);
checkBlocked(missingResult);
assert.ok(missingResult.issues.includes('WRITER_SOURCE_MISSING'));
assert.equal(missingResult.knownWriterSitesStable, false);

const unknown = auditCashWriterSites({
  ...sources, 'src/lib/otherCashWriter.ts': 'await updateDoc(ref, payload)',
});
checkBlocked(unknown);
assert.ok(unknown.issues.includes('UNREVIEWED_WRITER_SOURCE'));
assert.equal(unknown.knownWriterSitesStable, false);
assert.throws(() => auditCashWriterSites(null), /INVALID_CASH_WRITER_SOURCE_MAP/);

console.log('PASS: sitios de escritura conocidos, enlaces tenant, deriva positiva/negativa y bloqueo preventivo.');
console.log('PENDIENTE: inventario exhaustivo de clientes legados, época compartida, pagos históricos/MIXTO/mesa y conciliación de Caja.');
