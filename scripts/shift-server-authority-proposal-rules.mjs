/** Solo propuesta aislada en memoria: NO modificar reglas STAGED ni desplegar.
 * La autoridad de abrir/cerrar turnos deberá ser un servicio transaccional
 * autenticado antes de que este candidato pueda activarse.
 */
export function buildShiftServerAuthorityProposalRules(staged) {
  if (typeof staged !== 'string' || !staged.includes('match /businesses/{businessId}/{moduleCol}/{moduleDoc}')) {
    throw new Error('Falta el bloque de módulos de negocio en reglas STAGED.');
  }
  const createAnchor = "allow create: if isTenantModule(moduleCol)\n        && request.resource.data.businessId == businessId";
  const updateAnchor = "allow update: if isTenantModule(moduleCol)\n        && moduleCol != 'auditLog'";
  for (const anchor of [createAnchor, updateAnchor]) {
    if (staged.split(anchor).length !== 2) {
      throw new Error('Cambió el contrato de reglas: no aplicar sustitución insegura.');
    }
  }
  const candidate = staged
    .replace(createAnchor, "allow create: if isTenantModule(moduleCol)\n        && moduleCol != 'shifts'\n        && request.resource.data.businessId == businessId")
    .replace(updateAnchor, "allow update: if isTenantModule(moduleCol)\n        && moduleCol != 'auditLog'\n        && moduleCol != 'shifts'");
  if (candidate === staged) throw new Error('La propuesta no cambió las reglas.');
  return candidate;
}
