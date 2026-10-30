/**
 * Propuesta aislada de identidad OWNER contra la raíz del negocio.
 * SOLO compone reglas en memoria para Firebase Emulator; no toca STAGED.
 * Se aplica DESPUÉS de buildMembershipIdentityProposalRules.
 */
import assert from 'node:assert/strict';

export function buildOwnerRootIdentityProposalRules(identityRules) {
  const start = '    function hasVerifiedTenantMembership(businessId) {';
  const end = '    function hasActiveMembership(businessId) {';
  assert.equal(identityRules.split(start).length, 2,
    'ALTO: no existe el helper de identidad de membresía esperado.');
  assert.equal(identityRules.split(end).length, 2,
    'ALTO: cambió el límite del helper de membresía.');
  const begin = identityRules.indexOf(start);
  const finish = identityRules.indexOf(end);
  assert(begin >= 0 && finish > begin, 'ALTO: helper de membresía ambiguo.');
  const original = identityRules.slice(begin, finish);
  const roleAnchor = "        && get(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)).data.role in ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE', 'CLIENT'];";
  assert.equal(original.split(roleAnchor).length, 2,
    'ALTO: cambió el control de roles; revisar la identidad OWNER.');
  const replacement = `        && get(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)).data.role in ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE', 'CLIENT']
        // CANDIDATO NO DESPLEGADO: una membresía OWNER con ruta y UID
        // correctos NO concede permisos si la raíz declara otro propietario.
        // Las raíces históricas sin ownerUserId requieren revisión manual.
        && (
          get(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)).data.role != 'OWNER'
          || (
            exists(/databases/$(database)/documents/businesses/$(businessId))
            && get(/databases/$(database)/documents/businesses/$(businessId)).data.restaurantId == businessId
            && get(/databases/$(database)/documents/businesses/$(businessId)).data.ownerUserId == request.auth.uid
          )
        );`;
  return identityRules.slice(0, begin)
    + original.replace(roleAnchor, replacement)
    + identityRules.slice(finish);
}
