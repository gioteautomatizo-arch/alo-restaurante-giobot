// Paso 2: simulación offline; ninguna conexión, cuenta ni regla Firebase.
import assert from 'node:assert/strict';
import {
  BUSINESS_LIST_PREPARE_EVIDENCE,
  BUSINESS_LIST_CUTOVER_EVIDENCE,
  evaluateBusinessListCutover,
} from './business-list-cutover-gate.mjs';

const verified = keys => Object.fromEntries(keys.map(key => [key, 'verified']));
const all = verified([...BUSINESS_LIST_PREPARE_EVIDENCE, ...BUSINESS_LIST_CUTOVER_EVIDENCE]);
const evaluate = (currentMode, requestedMode, evidence) =>
  evaluateBusinessListCutover({ currentMode, requestedMode, evidence });
let checks = 0;
function expectBlocked(label, input, expectedMissing) {
  const result = evaluateBusinessListCutover(input);
  assert.equal(result.decision, 'BLOCKED', label);
  assert.equal(result.deploymentAuthorized, false, label);
  if (expectedMissing) assert(result.missing.includes(expectedMissing),
    label + ': falta ' + expectedMissing + ' en ' + JSON.stringify(result.missing));
  checks++;
  return result;
}
const empty = expectBlocked('Sin parámetros', {});
assert.equal(empty.simulatedMode, 'rollback-blocked');
expectBlocked('Modo desconocido', { currentMode: 'unknown', requestedMode: 'private-read' });
expectBlocked('No saltar preparación', {
  currentMode: 'legacy-direct', requestedMode: 'private-read', evidence: all,
});
expectBlocked('No saltar de legacy a rollback-blocked', {
  currentMode: 'legacy-direct', requestedMode: 'rollback-blocked',
});
expectBlocked('Preparación sin inventario autorizado', {
  currentMode: 'legacy-direct', requestedMode: 'server-prepared',
  evidence: verified(BUSINESS_LIST_PREPARE_EVIDENCE.filter(
    key => key !== 'historicalInventoryAuthorizedAndReviewed')),
}, 'historicalInventoryAuthorizedAndReviewed');
expectBlocked('Inventario coherente no sustituye auditoría de colisiones', {
  currentMode: 'legacy-direct', requestedMode: 'server-prepared',
  evidence: verified(BUSINESS_LIST_PREPARE_EVIDENCE.filter(
    key => key !== 'membershipCollisionAuditClean')),
}, 'membershipCollisionAuditClean');
expectBlocked('No basta activar el endpoint sin inventariar lectores directos', {
  currentMode: 'legacy-direct', requestedMode: 'server-prepared',
  evidence: verified(BUSINESS_LIST_PREPARE_EVIDENCE.filter(
    key => key !== 'directMembershipConsumersEnumerated')),
}, 'directMembershipConsumersEnumerated');
expectBlocked('Un booleano no es evidencia', {
  currentMode: 'legacy-direct', requestedMode: 'server-prepared',
  evidence: { ...verified(BUSINESS_LIST_PREPARE_EVIDENCE), backupRestoreVerified: true },
}, 'backupRestoreVerified');
expectBlocked('No aceptar herencia prototípica como evidencia', {
  currentMode: 'legacy-direct', requestedMode: 'server-prepared',
  evidence: Object.create(all),
}, 'historicalInventoryAuthorizedAndReviewed');

const prepareEvidence = verified(BUSINESS_LIST_PREPARE_EVIDENCE);
const prepare = evaluate('legacy-direct', 'server-prepared', prepareEvidence);
assert.equal(prepare.decision, 'REVIEW_REQUIRED');
assert.equal(prepare.simulatedMode, 'server-prepared');
assert.equal(prepare.deploymentAuthorized, false);
assert.deepEqual(prepare.missing, []);
checks++;

for (const key of BUSINESS_LIST_CUTOVER_EVIDENCE) {
  expectBlocked('Corte sin ' + key, {
    currentMode: 'server-prepared', requestedMode: 'private-read',
    evidence: { ...all, [key]: 'PENDIENTE' },
  }, key);
}
expectBlocked('Corte con inventario incompleto pese a checks finales', {
  currentMode: 'server-prepared', requestedMode: 'private-read',
  evidence: { ...all, historicalInventoryAuthorizedAndReviewed: false },
}, 'historicalInventoryAuthorizedAndReviewed');
expectBlocked('No volver de private a lectura directa', {
  currentMode: 'private-read', requestedMode: 'legacy-direct', evidence: all,
});
const rollback = expectBlocked('Rollback a server-prepared no puede reabrir list', {
  currentMode: 'private-read', requestedMode: 'server-prepared', evidence: all,
});
assert.equal(rollback.simulatedMode, 'rollback-blocked');
expectBlocked('Modo rollback-blocked es terminal', {
  currentMode: 'rollback-blocked', requestedMode: 'private-read', evidence: all,
});

const cut = evaluate('server-prepared', 'private-read', all);
assert.equal(cut.decision, 'REVIEW_REQUIRED');
assert.equal(cut.simulatedMode, 'private-read');
assert.equal(cut.deploymentAuthorized, false);
assert.deepEqual(cut.missing, []);
checks++;
for (const mode of ['legacy-direct', 'server-prepared', 'private-read']) {
  const unchanged = evaluate(mode, mode, all);
  assert.equal(unchanged.decision, 'NO_CHANGE');
  assert.equal(unchanged.deploymentAuthorized, false);
  checks++;
}
assert.equal(prepareEvidence.historicalInventoryAuthorizedAndReviewed, 'verified',
  'No modificar las evidencias recibidas');
assert.equal(all.effectiveRulesFingerprintVerified, 'verified');

console.log('PASS: ' + checks +
  ' escenarios de corte privado de membresías, compatibilidad, rollback y evidencia incompleta; no autoriza despliegue.');
console.warn('PENDIENTE: inventario REAL autorizado, revisión de lectores históricos, reglas efectivas, costos, Android/iPad y aprobación humana.');
