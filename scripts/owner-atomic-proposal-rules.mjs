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


/**
 * Experimento adicional (NO desplegable): una reserva permanente del ID se
 * crea junto con businesses/{id} y su OWNER, y nunca se elimina por SDK
 * cliente. Aunque un administrador borre businesses/{id}, la reserva impide
 * reabrir ese ID, incluso por el propietario anterior.
 *
 * Requiere cambiar el batch de registerBusiness y hacer backfill auditado de
 * IDs históricos ANTES de aplicar reglas equivalentes. Las reglas NO pueden
 * restringir operaciones privilegiadas del Admin SDK.
 */
export function buildAtomicOwnerAndPermanentHandleProposalRules(staged) {
  const noDelete = buildAtomicOwnerAndNoClientDeleteProposalRules(staged);
  const createAnchor = `        && !exists(/databases/$(database)/documents/businesses/$(businessId))
        && existsAfter(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid))`;
  assert.equal(noDelete.split(createAnchor).length, 2,
    'ALTO: cambió la creación OWNER; revisar el contrato de reserva.');
  const createWithReservation = `        && !exists(/databases/$(database)/documents/businesses/$(businessId))
        // El ID nunca puede reabrirse si alguna vez fue reservado.
        && !exists(/databases/$(database)/documents/businessHandleReservations/$(businessId))
        && existsAfter(/databases/$(database)/documents/businessHandleReservations/$(businessId))
        && getAfter(/databases/$(database)/documents/businessHandleReservations/$(businessId)).data.businessId == businessId
        && getAfter(/databases/$(database)/documents/businessHandleReservations/$(businessId)).data.ownerUserId == request.auth.uid
        && existsAfter(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid))`;
  const businessAnchor = '    match /businesses/{businessId} {';
  assert.equal(noDelete.split(businessAnchor).length, 2,
    'ALTO: cambió el bloque businesses; revisar la reserva permanente.');
  const reservationRules = `    // Solo propuesta para emulador. Nunca borrar reservas al cerrar un negocio.
    match /businessHandleReservations/{businessId} {
      allow read: if false;
      allow create: if isSignedIn()
        && businessId != 'alo-restaurante'
        && request.resource.data.keys().hasOnly(['businessId', 'ownerUserId'])
        && request.resource.data.businessId == businessId
        && request.resource.data.ownerUserId == request.auth.uid
        && !exists(/databases/$(database)/documents/businesses/$(businessId))
        && existsAfter(/databases/$(database)/documents/businesses/$(businessId))
        && getAfter(/databases/$(database)/documents/businesses/$(businessId)).data.restaurantId == businessId
        && getAfter(/databases/$(database)/documents/businesses/$(businessId)).data.ownerUserId == request.auth.uid;
      allow update, delete: if false;
    }

`;
  return noDelete.replace(createAnchor, createWithReservation)
    .replace(businessAnchor, reservationRules + businessAnchor);
}


/**
 * Puerta temporal de migración, SOLO para ensayos en Firebase Emulator.
 * Congela nuevas raíces de negocio (clientes de dos o tres documentos) y
 * borrados desde cliente, pero conserva las operaciones autorizadas de los
 * negocios ya existentes. No sirve para migrar IDs históricos ni impide
 * acciones privilegiadas del Admin SDK. No modificar ni desplegar staged.
 *
 * La reversión segura del contrato candidato debe usar una puerta de este
 * tipo mientras se decide la compatibilidad, NUNCA volver directamente a
 * staged, que permitiría nuevas altas sin reserva permanente.
 */
export function buildRegistrationFreezeProposalRules(staged) {
  const createAnchor = `      allow create: if isSignedIn()
        && request.resource.data.restaurantId == businessId
        && request.resource.data.ownerUserId == request.auth.uid
        && businessId != 'alo-restaurante'
        && !exists(/databases/$(database)/documents/businesses/$(businessId));`;
  const deleteAnchor = `      allow delete: if isSignedIn()
        && (
          (
            hasActiveMembership(businessId)
            && getCallerMembershipRole(businessId) == 'OWNER'
          )
          || isPlatformSuperAdmin()
        );`;
  const businessAnchor = '    match /businesses/{businessId} {';
  assert.equal(staged.split(businessAnchor).length, 2,
    'ALTO: cambió el bloque businesses; revisar la congelación.');
  assert.equal(staged.split(createAnchor).length, 2,
    'ALTO: cambió el contrato de alta; revisar la congelación.');
  assert.equal(staged.split(deleteAnchor).length, 2,
    'ALTO: cambió el permiso de borrado; revisar la congelación.');
  return staged.replace(createAnchor,
    `      // Puerta de migración en emulador: ninguna nueva alta de negocio.
      allow create: if false;`)
    .replace(deleteAnchor,
      `      // Preservar ID y datos dependientes durante la transición.
      allow delete: if false;`);
}
