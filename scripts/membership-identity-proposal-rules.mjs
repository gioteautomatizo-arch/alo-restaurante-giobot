/**
 * Candidato de reglas SOLO para Firestore Emulator: las membresías históricas
 * mal asociadas nunca deben autorizar acceso a otro tenant.
 * No modifica ni despliega las reglas STAGED ni las reglas de producción.
 */
import assert from 'node:assert/strict';

export function buildMembershipIdentityProposalRules(staged) {
  const start = '    function hasActiveMembership(businessId) {';
  const end = '    function canAssignRole(managerRole, targetRole) {';
  assert.equal(staged.split(start).length, 2,
    'ALTO: cambió la función hasActiveMembership; revisar la propuesta.');
  assert.equal(staged.split(end).length, 2,
    'ALTO: cambió la función canAssignRole; revisar la propuesta.');
  const begin = staged.indexOf(start);
  const finish = staged.indexOf(end);
  assert(begin >= 0 && finish > begin, 'ALTO: bloque de membresías ambiguo.');
  const membershipPath = "/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)";
  const replacement = `    // CANDIDATO NO DESPLEGADO: identidad y rol deben coincidir con la ruta.
    // El SDK cliente no puede corregir históricos corruptos; inventariar antes.
    function hasVerifiedTenantMembership(businessId) {
      return isSignedIn()
        && get(${membershipPath}).data.active == true
        && get(${membershipPath}).data.restaurantId == businessId
        && get(${membershipPath}).data.userId == request.auth.uid
        && get(${membershipPath}).data.role in ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE', 'CLIENT'];
    }

    function hasActiveMembership(businessId) {
      return hasVerifiedTenantMembership(businessId);
    }

    function getCallerMembershipRole(businessId) {
      return hasVerifiedTenantMembership(businessId)
        ? get(${membershipPath}).data.role
        : (isPlatformSuperAdmin() ? 'SUPER_ADMIN' : 'NONE');
    }

    function canManageMembership(businessId) {
      return isSignedIn()
        && (
          (
            hasVerifiedTenantMembership(businessId)
            && get(${membershipPath}).data.role in ['OWNER', 'ADMIN', 'MANAGER']
          )
          || isPlatformSuperAdmin()
        );
    }

`;
  const result = staged.slice(0, begin) + replacement + staged.slice(finish);
  assert.notEqual(result, staged);
  return result;
}
