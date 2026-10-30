import { initializeApp, deleteApp, getApps } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  BusinessRole,
  BusinessPermission,
  ROLE_PERMISSIONS,
  hasBusinessPermission,
} from './restaurantCore';

export interface BusinessEmployee {
  id: string;
  restaurantId: string;
  userId: string;
  name: string;
  email: string;
  role: BusinessRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const MANAGEABLE_EMPLOYEE_ROLES: BusinessRole[] = [
  'ADMIN',
  'MANAGER',
  'CASHIER',
  'WAITER',
  'KITCHEN',
  'EMPLOYEE',
];

const COLLECTION = 'businessMemberships';
function membershipRef(businessId: string, userId: string) {
  return doc(db, COLLECTION, `${businessId}_${userId}`);
}

type EmployeeManagerAccess = { uid: string; role: BusinessRole };

function assertEmployeeSession(uid: string): void {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('La sesión cambió durante la gestión de empleados. Vuelve a iniciar sesión.');
  }
}

/**
 * Preflight del responsable antes de abrir Auth secundaria o escribir.
 * Las reglas Firestore siguen siendo la autoridad en el commit final.
 */
async function assertEmployeeManager(businessId: string, targetRole?: BusinessRole): Promise<EmployeeManagerAccess> {
  if (!businessId.trim() || businessId.includes('/')) {
    throw new Error('Identificador de negocio inválido.');
  }
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión para administrar empleados.');
  // Nunca iniciar Auth secundaria con permisos procedentes de caché offline.
  const snap = await getDocFromServer(membershipRef(businessId, user.uid));
  assertEmployeeSession(user.uid);
  const membership = snap.exists() ? snap.data() as Partial<BusinessEmployee> : null;
  if (!membership || snap.id !== `${businessId}_${user.uid}`
      || membership.restaurantId !== businessId || membership.userId !== user.uid
      || membership.active !== true
      || !(['OWNER', 'ADMIN', 'MANAGER'] as BusinessRole[]).includes(membership.role as BusinessRole)) {
    throw new Error('No tienes permiso para administrar empleados de este negocio.');
  }
  const role = membership.role as BusinessRole;
  if (targetRole && !canManageEmployeeRole(role, targetRole)) {
    throw new Error('Tu rol no permite administrar ese puesto.');
  }
  const businessSnap = await getDocFromServer(doc(db, 'businesses', businessId));
  assertEmployeeSession(user.uid);
  const business = businessSnap.exists() ? businessSnap.data() : null;
  if (!business || business.restaurantId !== businessId
      || (role === 'OWNER' && business.ownerUserId !== undefined && business.ownerUserId !== user.uid)) {
    throw new Error('La identidad del negocio o propietario es inconsistente.');
  }
  return { uid: user.uid, role };
}

async function assertEditableEmployee(businessId: string, userId: string, newRole?: BusinessRole): Promise<string> {
  const manager = await assertEmployeeManager(businessId, newRole);
  if (!userId.trim() || userId.includes('/') || userId === manager.uid) {
    throw new Error('No puedes modificar tu propia membresía desde Empleados.');
  }
  const snap = await getDocFromServer(membershipRef(businessId, userId));
  assertEmployeeSession(manager.uid);
  const target = snap.exists() ? snap.data() as Partial<BusinessEmployee> : null;
  if (!target || snap.id !== `${businessId}_${userId}`
      || target.restaurantId !== businessId || target.userId !== userId
      || !MANAGEABLE_EMPLOYEE_ROLES.includes(target.role as BusinessRole)) {
    throw new Error('La membresía del empleado es inexistente o inconsistente.');
  }
  if (!canManageEmployeeRole(manager.role, target.role as BusinessRole)) {
    throw new Error('Tu rol no permite modificar a este empleado.');
  }
  const latest = await assertEmployeeManager(businessId, newRole);
  if (latest.uid !== manager.uid || latest.role !== manager.role) {
    throw new Error('Tus permisos cambiaron durante la gestión de empleados.');
  }
  return manager.uid;
}

function secondaryAuthName(businessId: string) {
  return `employee-creator-${businessId}`;
}

async function withSecondaryAuth<T>(
  businessId: string,
  action: (secondaryAuth: ReturnType<typeof getAuth>) => Promise<T>,
): Promise<T> {
  const name = secondaryAuthName(businessId);
  const existing = getApps().find((app) => app.name === name);
  const app = existing || initializeApp(firebaseConfig, name);
  const secondaryAuth = getAuth(app);

  try {
    return await action(secondaryAuth);
  } finally {
    // Keep the primary app/auth session intact. The secondary app exists only
    // long enough to create or authenticate the employee account.
    await deleteApp(app);
  }
}

async function createEmployeeAuth(email: string, password: string, businessId: string): Promise<string> {
  return withSecondaryAuth(businessId, async (secondaryAuth) => {
    try {
      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email.trim().toLowerCase(),
        password,
      );
      return credential.user.uid;
    } catch (error: any) {
      if (error?.code === 'auth/email-already-in-use') {
        throw new Error(
          'Ese correo ya tiene una cuenta de Firebase. Selecciona "Usar cuenta existente".'
        );
      }
      throw error;
    }
  });
}

async function findExistingEmployeeAuth(
  email: string,
  password: string,
  businessId: string,
): Promise<string> {
  return withSecondaryAuth(businessId, async (secondaryAuth) => {
    const normalizedEmail = email.trim().toLowerCase();

    if (password.trim()) {
      try {
        const credential = await signInWithEmailAndPassword(
          secondaryAuth,
          normalizedEmail,
          password,
        );
        return credential.user.uid;
      } catch {
        // Algunas cuentas existentes fueron creadas con Google y no tienen
        // proveedor de correo/contraseña. En ese caso validamos la identidad
        // mediante Google sin tocar la sesión principal del propietario.
      }
    }

    try {
      const credential = await signInWithPopup(
        secondaryAuth,
        new GoogleAuthProvider(),
      );
      const googleEmail = credential.user.email?.trim().toLowerCase();

      if (!googleEmail || googleEmail !== normalizedEmail) {
        throw new Error(
          `Selecciona en Google la cuenta ${email.trim()} para vincularla a este negocio.`,
        );
      }

      return credential.user.uid;
    } catch (error: any) {
      if (error?.message?.startsWith('Selecciona en Google')) {
        throw error;
      }

      throw new Error(
        'No pudimos validar la cuenta existente. Usa la contraseña de esa cuenta o inicia sesión con Google con el mismo correo.'
      );
    }
  });
}

export async function listBusinessEmployees(businessId: string): Promise<BusinessEmployee[]> {
  const requesterId = auth.currentUser?.uid;
  if (!requesterId) throw new Error('Inicia sesión para consultar el equipo.');
  if (!businessId.trim() || businessId.includes('/')) throw new Error('Identificador de negocio inválido.');
  const assertSession = () => {
    if (auth.currentUser?.uid !== requesterId) {
      throw new Error('La sesión cambió durante la consulta del equipo. Vuelve a entrar y reintenta.');
    }
  };
  // Ambas comprobaciones (antes y después del roster) requieren servidor.
  const readManagerRole = async (): Promise<BusinessRole> => {
    const snap = await getDocFromServer(membershipRef(businessId, requesterId));
    assertSession();
    const member = snap.exists() ? snap.data() as Partial<BusinessEmployee> : null;
    if (!member || snap.id !== `${businessId}_${requesterId}` ||
        member.restaurantId !== businessId || member.userId !== requesterId ||
        member.active !== true ||
        !(['OWNER', 'ADMIN', 'MANAGER'] as BusinessRole[]).includes(member.role as BusinessRole)) {
      throw new Error('No tienes permiso para consultar el equipo de este negocio.');
    }
    return member.role as BusinessRole;
  };

  // Comprobar permisos incluso si el índice está vacío: una lista vacía no
  // debe aparentar autorización para una cuenta revocada o de otro negocio.
  const initialRole = await readManagerRole();
  // Firestore cannot safely authorize a collection query over businessMemberships:
  // read the deterministic membership IDs from the tenant's roster instead.
  const businessSnap = await getDocFromServer(doc(db, 'businesses', businessId));
  assertSession();
  if (!businessSnap.exists() || businessSnap.data().restaurantId !== businessId) {
    throw new Error('El negocio no existe o su identificador es inconsistente.');
  }
  if (initialRole === 'OWNER' && businessSnap.data().ownerUserId !== undefined &&
      businessSnap.data().ownerUserId !== requesterId) {
    throw new Error('La identidad del propietario es inconsistente.');
  }

  const rawIds: unknown = businessSnap.data().employeeUserIds;
  if (rawIds !== undefined && !Array.isArray(rawIds)) {
    throw new Error('El índice de empleados del negocio es inconsistente.');
  }
  const employeeUserIds = [...new Set((rawIds || []) as unknown[])];
  if (employeeUserIds.some((id) => typeof id !== 'string' || !id.trim() || id.includes('/'))) {
    throw new Error('El índice de empleados del negocio contiene identificadores inválidos.');
  }
  if (employeeUserIds.length === 0) {
    if (await readManagerRole() !== initialRole) throw new Error('Tus permisos cambiaron durante la consulta del equipo.');
    return [];
  }

  const memberships = await Promise.all(
    (employeeUserIds as string[]).map((userId) => getDocFromServer(membershipRef(businessId, userId))),
  );
  assertSession();

  // A broken membership is not an empty employee. Do not silently return a
  // partial roster or expose a document whose internal tenant/UID disagrees
  // with the deterministic ID that was read.
  const employees = memberships.map((item, index) => {
    const userId = employeeUserIds[index] as string;
    const expectedId = `${businessId}_${userId}`;
    if (!item.exists() || item.id !== expectedId) {
      throw new Error('El equipo contiene una membresía ausente o inconsistente.');
    }
    const data = item.data() as Partial<BusinessEmployee>;
    if (data.restaurantId !== businessId || data.userId !== userId
      || !MANAGEABLE_EMPLOYEE_ROLES.includes(data.role as BusinessRole)
      || typeof data.active !== 'boolean'
      || typeof data.name !== 'string' || typeof data.email !== 'string') {
      throw new Error('El equipo contiene una membresía con datos inconsistentes.');
    }
    return { ...data, id: item.id } as BusinessEmployee;
  });
  assertSession();
  if (await readManagerRole() !== initialRole) {
    throw new Error('Tus permisos cambiaron durante la consulta del equipo.');
  }
  return employees.sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
}

export async function createBusinessEmployee(input: {
  businessId: string;
  name: string;
  email: string;
  password: string;
  role: BusinessRole;
  accountMode?: 'new' | 'existing';
}): Promise<BusinessEmployee> {
  if (!MANAGEABLE_EMPLOYEE_ROLES.includes(input.role)) {
    throw new Error('Ese rol no puede asignarse desde Empleados.');
  }

  const email = input.email.trim().toLowerCase();
  const needsPassword = input.accountMode !== 'existing';
  if (!input.name.trim() || !email || (needsPassword && input.password.length < 6)) {
    throw new Error(
      needsPassword
        ? 'Completa nombre, correo y una contraseña temporal de al menos 6 caracteres.'
        : 'Completa nombre y correo. Puedes dejar vacía la contraseña si la cuenta existente usa Google.',
    );
  }

  // No crear cuentas Auth antes de verificar el permiso y la raíz del tenant.
  const manager = await assertEmployeeManager(input.businessId, input.role);
  const userId = input.accountMode === 'existing'
    ? await findExistingEmployeeAuth(email, input.password, input.businessId)
    : await createEmployeeAuth(email, input.password, input.businessId);

  // La autenticación de la cuenta del empleado se realiza en una app Firebase
  // secundaria para no sustituir la sesión del propietario. Verificamos que la
  // sesión primaria siga siendo la del responsable antes de tocar Firestore.
  const primaryAuth = getAuth();
  const managerUser = primaryAuth.currentUser;
  if (!managerUser || managerUser.uid !== manager.uid || auth.currentUser?.uid !== manager.uid) {
    throw new Error(
      'La cuenta del empleado se validó, pero cambió la sesión del responsable. Vuelve a iniciar sesión antes de vincularla.'
    );
  }

  // Comparar también por correo: si el proveedor Google no está vinculado a
  // la cuenta Firebase original, puede devolver otro UID para el mismo correo.
  // El propietario no debe convertirse en empleado con una identidad duplicada.
  if (
    managerUser.uid === userId ||
    managerUser.email?.trim().toLowerCase() === email
  ) {
    throw new Error(
      'Ese correo pertenece a la sesión del propietario. No necesitas agregarlo como empleado; usa el correo de la persona que tendrá acceso.'
    );
  }

  // Una cuenta Auth recién creada no concede permisos: volver a validar
  // el responsable y el rol antes de enviar la escritura atómica a Firestore.
  const latestManager = await assertEmployeeManager(input.businessId, input.role);
  if (latestManager.uid !== manager.uid || latestManager.role !== manager.role) {
    throw new Error('Tus permisos cambiaron durante el alta del empleado. No se vinculó la cuenta.');
  }

  const now = new Date().toISOString();
  const employee: BusinessEmployee = {
    id: `${input.businessId}_${userId}`,
    restaurantId: input.businessId,
    userId,
    name: input.name.trim(),
    email,
    role: input.role,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  // Membresía e índice de empleados se confirman juntos o se revierten juntos.
  // Esto evita dejar empleados sin acceso visible o IDs huérfanos si fallan las reglas.
  const batch = writeBatch(db);
  batch.set(membershipRef(input.businessId, userId), employee);
  batch.update(doc(db, 'businesses', input.businessId), {
    employeeUserIds: arrayUnion(userId),
  });
  try {
    await batch.commit();
  } catch (error: any) {
    // Un timeout puede ocurrir DESPUÉS de que Firestore confirme el batch.
    // Nunca deducir que no hubo escritura ni usar caché para confirmarla.
    // La marca createdAt identifica este intento: una membresía anterior
    // parecida no basta para declarar éxito.
    try {
      assertEmployeeSession(manager.uid);
      const membershipSnap = await getDocFromServer(membershipRef(input.businessId, userId));
      assertEmployeeSession(manager.uid);
      const saved = membershipSnap.exists() ? membershipSnap.data() as Partial<BusinessEmployee> : null;
      const exactMembership = membershipSnap.id === employee.id
        && saved?.restaurantId === employee.restaurantId
        && saved?.userId === employee.userId
        && saved?.role === employee.role
        && saved?.active === true
        && saved?.name === employee.name
        && saved?.email === employee.email
        && saved?.createdAt === employee.createdAt
        && saved?.updatedAt === employee.updatedAt;
      if (exactMembership) {
        const rootSnap = await getDocFromServer(doc(db, 'businesses', input.businessId));
        assertEmployeeSession(manager.uid);
        const root = rootSnap.exists() ? rootSnap.data() : null;
        if (root?.restaurantId === input.businessId
          && Array.isArray(root.employeeUserIds)
          && root.employeeUserIds.includes(userId)
          && (manager.role !== 'OWNER' || root.ownerUserId === undefined || root.ownerUserId === manager.uid)) {
          const currentManager = await assertEmployeeManager(input.businessId, input.role);
          if (currentManager.uid === manager.uid && currentManager.role === manager.role) {
            return employee;
          }
        }
      }
    } catch {
      // Sin servidor, sesión vigente o permisos no existe confirmación fiable.
      // No ocultar el fallo original ni asumir que el batch fue revertido.
    }
    console.warn('No se pudo confirmar la vinculación del empleado:', {
      code: error?.code,
      businessId: input.businessId,
      operation: 'create-employee-atomic',
    });
    throw new Error(
      `No se pudo confirmar la vinculación del empleado (${error?.code || 'error'}). Comprueba el equipo antes de reintentar: el acceso podría haberse guardado. La cuenta de acceso también puede existir.`,
    );
  }

  return employee;
}

export async function updateBusinessEmployee(
  businessId: string,
  userId: string,
  changes: { role?: BusinessRole; active?: boolean; name?: string },
): Promise<void> {
  if (changes.role !== undefined && !MANAGEABLE_EMPLOYEE_ROLES.includes(changes.role)) {
    throw new Error('No puedes asignar ese rol desde Empleados.');
  }
  if (changes.active !== undefined && typeof changes.active !== 'boolean') {
    throw new Error('El estado del empleado es inválido.');
  }
  if (changes.name !== undefined && (typeof changes.name !== 'string' || !changes.name.trim())) {
    throw new Error('El nombre del empleado es inválido.');
  }
  if (changes.role === undefined && changes.active === undefined && changes.name === undefined) {
    throw new Error('No hay cambios válidos para guardar.');
  }
  const managerUid = await assertEditableEmployee(businessId, userId, changes.role);
  const changesToApply = {
    ...(changes.role !== undefined ? { role: changes.role } : {}),
    ...(changes.active !== undefined ? { active: changes.active } : {}),
    ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
    updatedAt: new Date().toISOString(),
  };
  assertEmployeeSession(managerUid);
  await updateDoc(membershipRef(businessId, userId), changesToApply);
}

export async function removeBusinessEmployee(businessId: string, userId: string): Promise<void> {
  const managerUid = await assertEditableEmployee(businessId, userId);
  assertEmployeeSession(managerUid);
  const batch = writeBatch(db);
  batch.delete(membershipRef(businessId, userId));
  batch.update(doc(db, 'businesses', businessId), {
    employeeUserIds: arrayRemove(userId),
  });
  assertEmployeeSession(managerUid);
  await batch.commit();
}

export function getRolePermissions(role: BusinessRole): BusinessPermission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function canManageEmployeeRole(managerRole: BusinessRole, targetRole: BusinessRole): boolean {
  if (managerRole === 'OWNER' || managerRole === 'SUPER_ADMIN') {
    return MANAGEABLE_EMPLOYEE_ROLES.includes(targetRole);
  }

  if (managerRole === 'ADMIN') {
    return MANAGEABLE_EMPLOYEE_ROLES.includes(targetRole);
  }

  if (managerRole === 'MANAGER') {
    return ['CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE'].includes(targetRole);
  }

  return false;
}

export { hasBusinessPermission };
