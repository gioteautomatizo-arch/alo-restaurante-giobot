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


/**
 * Variante experimental adicional: impide borrar businesses/{id} desde el
 * cliente mientras existan membresías y subcolecciones referidas por ese ID.
 * No cubre borrados privilegiados (Admin SDK): requieren tombstone/limpieza
 * auditada antes de permitir reutilización del identificador.
 * NO modifica ni despliega reglas versionadas.
 */
export function buildAtomicOwnerAndNoClientDeleteProposalRules(staged) {
  const atomicRules = buildAtomicOwnerProposalRules(staged);
  const deleteAnchor = `      allow delete: if isSignedIn()
        && (
          (
            hasActiveMembership(businessId)
            && getCallerMembershipRole(businessId) == 'OWNER'
          )
          || isPlatformSuperAdmin()
        );`;
  assert.equal(atomicRules.split(deleteAnchor).length, 2,
    'ALTO: cambió el permiso de eliminación de businesses; revisar la propuesta.');
  return atomicRules.replace(deleteAnchor, `      // Propuesta aislada: impedir borrado desde SDK cliente; los datos
      // asociados no se eliminan en cascada al borrar el documento raíz.
      allow delete: if false;`);
}
