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
 * Ensayo de retiro de negocio (NO desplegar). Mantiene la lectura del
 * directorio como está: un get/consulta pública condicionado por exists(root)
 * podría invalidar listados de Firestore, cuyas reglas no son filtros.
 *
 * - Un perfil huérfano NO autoriza pedidos ni lectura pública del catálogo.
 * - Ningún OWNER residual puede volver a publicar si falta la raíz.
 * - El administrador DEBE despublicar el perfil ANTES de borrar la raíz:
 *   un borrado privilegiado incorrecto deja visible el perfil ya publicado.
 * No modifica staged ni impide acciones del Admin SDK.
 */
export function buildPermanentHandleRetirementGuardProposalRules(staged) {
  const permanent = buildAtomicOwnerAndPermanentHandleProposalRules(staged);
  const publishedAnchor = `        && get(/databases/$(database)/documents/publicBusinessProfiles/$(businessId)).data.published == true;`;
  assert.equal(permanent.split(publishedAnchor).length, 2,
    'ALTO: cambió isPublishedBusiness; revisar la defensa de baja.');
  const withRootGuard = permanent.replace(publishedAnchor,
    `        && get(/databases/$(database)/documents/publicBusinessProfiles/$(businessId)).data.published == true
        && exists(/databases/$(database)/documents/businesses/$(businessId));`);

  const start = '    match /publicBusinessProfiles/{businessId} {';
  const end = '    match /businesses/{businessId}/catalog/{catalogDoc} {';
  assert.equal(withRootGuard.split(start).length, 2,
    'ALTO: cambió el bloque de perfiles públicos.');
  assert.equal(withRootGuard.split(end).length, 2,
    'ALTO: cambió el bloque de catálogo.');
  const prefix = withRootGuard.slice(0, withRootGuard.indexOf(start));
  const middle = withRootGuard.slice(withRootGuard.indexOf(start), withRootGuard.indexOf(end));
  const suffix = withRootGuard.slice(withRootGuard.indexOf(end));
  const writeAnchor = `      allow create, update: if isSignedIn()
        && (`;
  assert.equal(middle.split(writeAnchor).length, 2,
    'ALTO: cambió la escritura de perfiles; revisar la defensa de baja.');
  return prefix + middle.replace(writeAnchor,
    `      allow create, update: if isSignedIn()
        && exists(/databases/$(database)/documents/businesses/$(businessId))
        && (`) + suffix;
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


/**
 * Extensión estricta SOLO para ensayos de recuperación del cliente 3-doc.
 * Una ficha legacy sin reserva no puede obtener el marcador mediante update
 * del OWNER, y una nueva alta 3-doc debe traerlo en el lote atómico.
 * El marcador NO sustituye una atestación privilegiada de la reserva real.
 * No modifica staged ni autoriza despliegues.
 */
export function buildThreeDocumentRecoveryMarkerProposalRules(staged) {
  const rules = buildPermanentHandleRetirementGuardProposalRules(staged);
  const start = '    match /businesses/{businessId} {';
  const end = '    match /businesses/{businessId}/employees/{employeeUserId} {';
  assert.equal(rules.split(start).length, 2, 'ALTO: bloque raíz de negocio ambiguo.');
  assert.equal(rules.split(end).length, 2, 'ALTO: límite de bloque raíz ambiguo.');
  const prefix = rules.slice(0, rules.indexOf(start));
  const root = rules.slice(rules.indexOf(start), rules.indexOf(end));
  const suffix = rules.slice(rules.indexOf(end));
  const createAnchor = `      allow create: if isSignedIn()
        && request.resource.data.restaurantId == businessId
        && request.resource.data.ownerUserId == request.auth.uid`;
  assert.equal(root.split(createAnchor).length, 2,
    'ALTO: cambió el alta raíz; revisar contrato de marcador.');
  const updateAnchor = '      allow update: if isSignedIn()';
  assert.equal(root.split(updateAnchor).length, 3,
    'ALTO: deben existir exactamente dos permisos de actualización raíz.');
  const guardedRoot = root.replace(createAnchor,
    createAnchor + '\n        && request.resource.data.registrationContractVersion == 3')
    .replaceAll(updateAnchor,
      `      allow update: if request.resource.data.get('registrationContractVersion', null) == resource.data.get('registrationContractVersion', null)
        && isSignedIn()`);
  return prefix + guardedRoot + suffix;
}
