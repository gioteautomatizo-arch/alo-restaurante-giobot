/**
 * Paso 2: puerta OFFLINE para planear el corte del listado directo de
 * businessMemberships al directorio privado. NO conecta Firebase, no lee
 * cuentas ni cambia flags, reglas, clientes o endpoints.
 *
 * Todas las evidencias son declaraciones externas, NO verificaciones
 * automáticas. Ninguna salida autoriza despliegue.
 */
export const BUSINESS_LIST_MODES = Object.freeze([
  'legacy-direct', 'server-prepared', 'private-read', 'rollback-blocked',
]);

export const BUSINESS_LIST_PREPARE_EVIDENCE = Object.freeze([
  'historicalInventoryAuthorizedAndReviewed',
  'membershipCollisionAuditClean',
  'directMembershipConsumersEnumerated',
  'legacyClientCompatibilityReviewed',
  'privateEndpointAuthAndRevocationReviewed',
  'adminSdkTenantIsolationReviewed',
  'abuseAndReadCostsReviewed',
  'backupRestoreVerified',
  'rollbackPlanReviewed',
]);

export const BUSINESS_LIST_CUTOVER_EVIDENCE = Object.freeze([
  'serverEndpointDeployedAndVerified',
  'clientNoDirectFallbackVerified',
  'effectiveRulesFingerprintVerified',
  'legacyDirectReadersContained',
  'twoBusinessABJourneyVerified',
  'androidIpadVisualVerified',
  'rollbackPreservesPrivateReadVerified',
]);

const verified = (evidence, key) =>
  evidence !== null && typeof evidence === 'object' && !Array.isArray(evidence)
  && Object.prototype.hasOwnProperty.call(evidence, key)
  && evidence[key] === 'verified';

const missing = (evidence, keys) => keys.filter(key => !verified(evidence, key));

/**
 * Simula transiciones. No admite saltar preparación ni volver a una ruta
 * directa que podría entregar membresías históricas inconsistentes.
 *
 * @param {{ currentMode?: string, requestedMode?: string,
 *   evidence?: Record<string, unknown> }} input
 * @returns {{ decision: string, simulatedMode: string,
 *   deploymentAuthorized: false, missing: string[], reason: string }}
 */
export function evaluateBusinessListCutover(input = {}) {
  const current = input?.currentMode;
  const requested = input?.requestedMode;
  const evidence = input?.evidence;
  const blocked = (reason, missingEvidence = [], mode = current) => ({
    decision: 'BLOCKED', simulatedMode: mode,
    deploymentAuthorized: false, missing: missingEvidence, reason,
  });
  const review = (mode, reason) => ({
    decision: 'REVIEW_REQUIRED', simulatedMode: mode,
    deploymentAuthorized: false, missing: [], reason,
  });

  if (!BUSINESS_LIST_MODES.includes(current) || !BUSINESS_LIST_MODES.includes(requested)) {
    return blocked('Modo desconocido: denegar por defecto.', [], 'rollback-blocked');
  }
  if (current === 'rollback-blocked') {
    return blocked('Bloqueo de reversión: requiere recuperación y revisión independiente.',
      [], 'rollback-blocked');
  }
  if (current === requested) {
    return {
      decision: 'NO_CHANGE', simulatedMode: current,
      deploymentAuthorized: false, missing: [],
      reason: 'Sin transición. No demuestra que el modo declarado sea real o seguro.',
    };
  }
  if (requested === 'legacy-direct' && current !== 'legacy-direct') {
    return blocked('No reabrir list directo de membresías históricas en un rollback.',
      [], 'rollback-blocked');
  }
  if (current === 'legacy-direct' && requested === 'server-prepared') {
    const required = missing(evidence, BUSINESS_LIST_PREPARE_EVIDENCE);
    return required.length
      ? blocked('Faltan revisiones para preparar el directorio privado.', required)
      : review('server-prepared', 'Preparación declarada; servidor y flags siguen sin autorización.');
  }
  if (current === 'server-prepared' && requested === 'private-read') {
    const required = missing(evidence, [
      ...BUSINESS_LIST_PREPARE_EVIDENCE, ...BUSINESS_LIST_CUTOVER_EVIDENCE,
    ]);
    return required.length
      ? blocked('No cerrar list directo sin compatibilidad, reglas y recorrido verificados.', required)
      : review('private-read', 'Corte declarado completo; requiere aprobación externa y ejecución controlada.');
  }
  if (current === 'private-read' && requested === 'server-prepared') {
    return blocked('No desactivar la lectura privada y reabrir list directo durante rollback.',
      [], 'rollback-blocked');
  }
  return blocked('Transición no admitida: no saltar preparación ni relajar reglas.');
}
