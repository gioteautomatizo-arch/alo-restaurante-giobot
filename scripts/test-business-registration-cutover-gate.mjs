import assert from 'node:assert/strict';
import {
  CANDIDATE_EVIDENCE, SAFE_FREEZE_EVIDENCE, evaluateRegistrationCutover,
} from './business-registration-cutover-gate.mjs';

const verified = (keys) => Object.fromEntries(keys.map((key) => [key, 'verified']));
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};

const noEvidence = evaluateRegistrationCutover();
check(noEvidence.decision === 'BLOCKED' && noEvidence.deploymentAuthorized === false,
  'ausencia de parámetros debe denegarse');
check(noEvidence.simulatedMode === 'rollback-blocked', 'modo desconocido queda bloqueado');

const direct = evaluateRegistrationCutover({
  currentMode: 'legacy', requestedMode: 'candidate',
  evidence: verified(CANDIDATE_EVIDENCE),
});
check(direct.decision === 'BLOCKED', 'no saltar freeze aun con todas las evidencias');

const freezeMissing = evaluateRegistrationCutover({currentMode:'legacy',requestedMode:'freeze'});
check(freezeMissing.missing.includes('freezeEnforced'), 'freeze sin evidencia debe bloquear');
const freezeReady = evaluateRegistrationCutover({
  currentMode:'legacy',requestedMode:'freeze',evidence:{freezeEnforced:'verified'},
});
check(freezeReady.decision === 'REVIEW_REQUIRED' && !freezeReady.deploymentAuthorized,
  'freeze solo habilita revisión, no despliegue');

const candidateMissing = evaluateRegistrationCutover({
  currentMode:'freeze',requestedMode:'candidate',evidence:{freezeEnforced:'verified'},
});
check(candidateMissing.decision === 'BLOCKED'
  && candidateMissing.missing.includes('historicalHandlesReserved')
  && candidateMissing.missing.includes('backupRestoreVerified'),
  'faltantes de inventario y restauración deben impedir candidate');
const wrongBoolean = evaluateRegistrationCutover({
  currentMode:'freeze',requestedMode:'candidate',
  evidence:{...verified(CANDIDATE_EVIDENCE), candidateRulesDeployed:true},
});
check(wrongBoolean.decision === 'BLOCKED'
  && wrongBoolean.missing.includes('candidateRulesDeployed'),
  'true no equivale a evidencia verificada');
const mismatchedRules = evaluateRegistrationCutover({
  currentMode:'freeze',requestedMode:'candidate',
  evidence:{...verified(CANDIDATE_EVIDENCE), deployedRulesFingerprintMatches:'mismatch'},
});
check(mismatchedRules.decision === 'BLOCKED'
  && mismatchedRules.missing.includes('deployedRulesFingerprintMatches'),
  'fingerprint discordante bloquea');
const ready = evaluateRegistrationCutover({
  currentMode:'freeze',requestedMode:'candidate',evidence:verified(CANDIDATE_EVIDENCE),
});
check(ready.decision === 'REVIEW_REQUIRED' && ready.simulatedMode === 'candidate'
  && ready.deploymentAuthorized === false,
  'evidencia declarada completa NO autoriza deploy');
check(ready.missing.length === 0, 'sin evidencias faltantes');

const directRollback = evaluateRegistrationCutover({
  currentMode:'candidate',requestedMode:'legacy',
  evidence:verified([...CANDIDATE_EVIDENCE,...SAFE_FREEZE_EVIDENCE]),
});
check(directRollback.decision === 'BLOCKED'
  && directRollback.simulatedMode === 'rollback-blocked',
  'rollback directo inseguro bloqueado aun con checks completos');
const unsafeFreeze = evaluateRegistrationCutover({
  currentMode:'candidate',requestedMode:'freeze',evidence:{freezeEnforced:'verified'},
});
check(unsafeFreeze.decision === 'BLOCKED'
  && unsafeFreeze.missing.includes('freezeRulesPreserveReservations')
  && unsafeFreeze.simulatedMode === 'rollback-blocked',
  'rollback a freeze sin preservar reservas bloqueado');
const safeFreeze = evaluateRegistrationCutover({
  currentMode:'candidate',requestedMode:'freeze',evidence:verified(SAFE_FREEZE_EVIDENCE),
});
check(safeFreeze.decision === 'REVIEW_REQUIRED' && !safeFreeze.deploymentAuthorized,
  'rollback conservador sigue requiriendo revisión');
const terminal = evaluateRegistrationCutover({
  currentMode:'rollback-blocked',requestedMode:'candidate',evidence:verified(CANDIDATE_EVIDENCE),
});
check(terminal.decision === 'BLOCKED', 'rollback-blocked es terminal');
const noop = evaluateRegistrationCutover({currentMode:'legacy',requestedMode:'legacy'});
check(noop.decision === 'NO_CHANGE' && !noop.deploymentAuthorized,
  'no-op no autoriza despliegue');
const invalid = evaluateRegistrationCutover({currentMode:'freeze',requestedMode:'published'});
check(invalid.decision === 'BLOCKED', 'modo desconocido no admitido');
const bypass = evaluateRegistrationCutover({
  currentMode:'legacy',requestedMode:'rollback-blocked',
});
check(bypass.decision === 'BLOCKED', 'transiciones inesperadas bloqueadas');

console.log(`PASS: ${checks} comprobaciones de corte 2/3-doc; nunca autoriza despliegue.`);
