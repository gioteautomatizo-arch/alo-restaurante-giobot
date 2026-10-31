/**
 * PROPUESTA AISLADA, NO ACTIVADA: reserva create-only de membresías de empleados.
 *
 * Solo para pruebas con Firebase Emulator. No hay endpoint, import de producción
 * ni verificación de ID token aquí. Un futuro backend DEBE autenticar al llamante
 * antes de pasar managerUid y someter este contrato a revisión de seguridad.
 * Admin SDK omite las reglas Firestore: toda autorización debe ser explícita.
 */
import { FieldValue } from 'firebase-admin/firestore';

const EMPLOYEE_ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE'];
const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];
const JUNIOR_ROLES = ['CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE'];

function validId(id) {
  return typeof id === 'string' && !!id.trim() && !id.includes('/');
}

function precondition(message) {
  const error = new Error(message);
  error.name = 'EmployeeReservationPreconditionError';
  return error;
}

/**
 * El managerUid se considera YA VERIFICADO por un backend futuro.
 * `transaction.create` falla si existe cualquier documento con ese ID,
 * incluso si una membresía histórica no figura en employeeUserIds.
 */
export async function reserveEmployeeCreateOnly({ db, businessId, managerUid, employee }) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw precondition('Propuesta deshabilitada fuera de Firestore Emulator.');
  }
  if (!validId(businessId) || !validId(managerUid) || !validId(employee?.userId)
      || employee.userId === managerUid || !EMPLOYEE_ROLES.includes(employee.role)
      || typeof employee.name !== 'string' || !employee.name.trim()
      || typeof employee.email !== 'string' || !employee.email.trim()
      || typeof employee.createdAt !== 'string' || !employee.createdAt
      || typeof employee.updatedAt !== 'string' || !employee.updatedAt) {
    throw precondition('Datos de alta inválidos.');
  }
  const memberId = businessId + '_' + employee.userId;
  const managerRef = db.collection('businessMemberships').doc(businessId + '_' + managerUid);
  const targetRef = db.collection('businessMemberships').doc(memberId);
  const rootRef = db.collection('businesses').doc(businessId);
  const record = {
    restaurantId: businessId,
    userId: employee.userId,
    role: employee.role,
    active: true,
    name: employee.name.trim(),
    email: employee.email.trim().toLowerCase(),
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };

  await db.runTransaction(async tx => {
    // Todas las lecturas se realizan antes de las escrituras de la transacción.
    const [managerSnap, rootSnap] = await Promise.all([tx.get(managerRef), tx.get(rootRef)]);
    const manager = managerSnap.exists ? managerSnap.data() : null;
    const root = rootSnap.exists ? rootSnap.data() : null;
    if (!manager || manager.restaurantId !== businessId || manager.userId !== managerUid
        || manager.active !== true || !MANAGER_ROLES.includes(manager.role)) {
      throw precondition('Responsable sin membresía válida y activa.');
    }
    if (!root || root.restaurantId !== businessId || !validId(root.ownerUserId)
        || (manager.role === 'OWNER' && root.ownerUserId !== managerUid)) {
      throw precondition('Identidad o propietario del negocio inconsistente.');
    }
    if (manager.role === 'MANAGER' && !JUNIOR_ROLES.includes(employee.role)) {
      throw precondition('El responsable no puede asignar ese rol.');
    }
    const ids = root.employeeUserIds ?? [];
    if (!Array.isArray(ids) || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length) {
      throw precondition('Índice de empleados inconsistente.');
    }
    if (ids.includes(employee.userId)) {
      throw precondition('Empleado ya indexado; no recrear membresía.');
    }
    // A diferencia de Web SDK set(), Admin SDK create() incorpora una
    // precondición exists=false al commit, sin necesitar leer el documento.
    tx.create(targetRef, record);
    tx.update(rootRef, { employeeUserIds: FieldValue.arrayUnion(employee.userId) });
  });
  return { id: memberId, ...record };
}
