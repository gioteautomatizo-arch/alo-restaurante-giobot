/**
 * Propuesta OWNER atómica únicamente para emuladores.
 * Deriva reglas en memoria; nunca escribe archivos ni despliega reglas.
 * Mantener un único origen para las pruebas de reglas y del flujo real.
 */
import assert from 'node:assert/strict';

export function buildAtomicOwnerProposalRules(staged) {
  const anchor = '        && !exists(/databases/$(database)/documents/businesses/$(businessId));';
  assert.equal(staged.split(anchor).length, 2,
    'ALTO: el bloque de alta cambió; revisar la propuesta antes de ejecutarla.');
  const membershipPath = '/databases/$(database)/documents/businessMemberships/$(businessId + \'_\' + request.auth.uid)';
  const replacement = `        && !exists(/databases/$(database)/documents/businesses/$(businessId))
        && existsAfter(${membershipPath})
        && getAfter(${membershipPath}).data.restaurantId == businessId
        && getAfter(${membershipPath}).data.userId == request.auth.uid
        && getAfter(${membershipPath}).data.role == 'OWNER'
        && getAfter(${membershipPath}).data.active == true;`;
  const proposedRules = staged.replace(anchor, replacement);
  assert.notEqual(proposedRules, staged);
  return proposedRules;
}
