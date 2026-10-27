/**
 * Preflight consultivo para el corte 2-doc -> 3-doc. No se importa en el
 * onboarding ni autoriza despliegues. La evidencia se proporciona manualmente:
 * "verified" NO demuestra por sí mismo que Firebase tenga esas reglas.
 */
export const REGISTRATION_MODES = Object.freeze([
  'legacy', 'freeze', 'candidate', 'rollback-blocked',
]);

export const CANDIDATE_EVIDENCE = Object.freeze([
  'freezeEnforced',
  'candidateRulesDeployed',
  'deployedRulesFingerprintMatches',
  'legacyClientsContained',
  'historicalHandlesReserved',
  'backupRestoreVerified',
  'independentSecurityReviewApproved',
  'twoTenantEmulatorVerified',
  'rollbackPreservesReservationsVerified',
]);

export const SAFE_FREEZE_EVIDENCE = Object.freeze([
  'freezeEnforced',
  'freezeRulesPreserveReservations',
  'freezeRulesDeploymentVerified',
  'rollbackExerciseVerified',
]);

const isVerified = (evidence, key) =>
  evidence !== null && typeof evidence === 'object'
  && Object.prototype.hasOwnProperty.call(evidence, key)
  && evidence[key] === 'verified';

const missingEvidence = (evidence, keys) =>
  keys.filter((key) => !isVerified(evidence, key));

/**
 * Simula decisiones de transición. Incluso cuando todas las evidencias
 * declaradas pasan, deploymentAuthorized permanece false: falta verificar
 * pruebas, revisión independiente y ejecución controlada fuera de esta función.
 *
 * @param {{ currentMode?: string, requestedMode?: string, evidence?: Record<string, unknown> }} input
 * @returns {{ decision: string, simulatedMode: string, deploymentAuthorized: false, missing: string[], reason: string }}
 */
export function evaluateRegistrationCutover(input = {}) {
  const currentMode = input?.currentMode;
  const requestedMode = input?.requestedMode;
  const evidence = input?.evidence;

  const blocked = (reason, missing = [], mode = currentMode) => ({
    decision: 'BLOCKED',
    simulatedMode: mode,
    deploymentAuthorized: false,
    missing,
    reason,
  });
  const review = (mode, reason) => ({
    decision: 'REVIEW_REQUIRED',
    simulatedMode: mode,
    deploymentAuthorized: false,
    missing: [],
    reason,
  });

  if (!REGISTRATION_MODES.includes(currentMode)
      || !REGISTRATION_MODES.includes(requestedMode)) {
    return blocked('Modo desconocido: denegación por defecto.', [], 'rollback-blocked');
  }
  if (currentMode === 'rollback-blocked') {
    return blocked('Bloqueo de rollback: requiere intervención y revisión independiente.',
      [], 'rollback-blocked');
  }
  if (currentMode === requestedMode) {
    return {
      decision: 'NO_CHANGE',
      simulatedMode: currentMode,
      deploymentAuthorized: false,
      missing: [],
      reason: 'Sin transición. No implica autorización de despliegue.',
    };
  }
  if (requestedMode === 'legacy' && currentMode !== 'legacy') {
    return blocked('No revertir directamente a reglas legacy: podrían perderse las reservas permanentes.',
      [], 'rollback-blocked');
  }
  if (currentMode === 'legacy' && requestedMode === 'freeze') {
    const missing = missingEvidence(evidence, ['freezeEnforced']);
    return missing.length
      ? blocked('No hay evidencia de congelación de altas.', missing)
      : review('freeze', 'Congelación declarada: comprobar en entorno aislado y revisión humana.');
  }
  if (currentMode === 'freeze' && requestedMode === 'candidate') {
    const missing = missingEvidence(evidence, CANDIDATE_EVIDENCE);
    return missing.length
      ? blocked('No se cumplen todas las puertas del contrato de tres documentos.', missing)
      : review('candidate', 'Evidencias declaradas completas; no habilitar sin validación independiente.');
  }
  if (currentMode === 'candidate' && requestedMode === 'freeze') {
    const missing = missingEvidence(evidence, SAFE_FREEZE_EVIDENCE);
    return missing.length
      ? blocked('No se demostró que el freeze de reversión preserve las reservas.',
          missing, 'rollback-blocked')
      : review('freeze', 'Reversión a freeze preservando reservas: requiere aprobación externa.');
  }
  return blocked('Transición no admitida: no saltar la congelación ni relajar las reglas.');
}
