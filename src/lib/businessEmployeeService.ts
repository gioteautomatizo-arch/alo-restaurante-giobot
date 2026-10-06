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
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
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
  // Firestore cannot safely authorize a collection query over businessMemberships
  // because the rule must inspect each result document. The business keeps a small
  // roster of employee UIDs, and each membership is then read by its deterministic ID.
  const businessSnap = await getDoc(doc(db, 'businesses', businessId));
  if (!businessSnap.exists()) {
    throw new Error('El negocio no existe.');
  }

  const employeeUserIds = Array.isArray(businessSnap.data().employeeUserIds)
    ? (businessSnap.data().employeeUserIds as string[])
    : [];

  if (employeeUserIds.length === 0) return [];

  const memberships = await Promise.all(
    employeeUserIds.map((userId) => getDoc(membershipRef(businessId, userId))),
  );

  return memberships
    .filter((item) => item.exists())
    .map((item) => ({ id: item.id, ...(item.data() as Omit<BusinessEmployee, 'id'>) }))
    .filter((item) => item.role !== 'OWNER' && item.role !== 'SUPER_ADMIN')
    .sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
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

  const userId = input.accountMode === 'existing'
    ? await findExistingEmployeeAuth(email, input.password, input.businessId)
    : await createEmployeeAuth(email, input.password, input.businessId);

  // La autenticación de la cuenta del empleado se realiza en una app Firebase
  // secundaria para no sustituir la sesión del propietario. Verificamos que la
  // sesión primaria siga siendo la del responsable antes de tocar Firestore.
  const primaryAuth = getAuth();
  const managerUser = primaryAuth.currentUser;
  if (!managerUser) {
    throw new Error(
      'La cuenta del empleado se validó, pero se perdió la sesión del responsable. Vuelve a iniciar sesión como propietario y repite la operación.'
    );
  }

  // El propietario no debe agregarse a sí mismo como empleado. Su membresía
  // OWNER ya le da acceso al negocio y duplicar la identidad Firebase solo
  // genera conflictos de permisos y de roles.
  if (managerUser.uid === userId) {
    throw new Error(
      'Esta cuenta ya es la cuenta del propietario de este negocio. No necesitas agregarla como empleado.'
    );
  }

  // No hacemos un getDoc previo de la membresía. Para una cuenta nueva el
  // documento todavía no existe y las reglas de Firestore correctamente pueden
  // rechazar una lectura sobre un documento inexistente. La creación atómica
  // siguiente es la fuente de verdad: si ya existe, Firestore devuelve
  // ALREADY_EXISTS y no se modifica el roster.
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

  try {
    const batch = writeBatch(db);
    batch.set(membershipRef(input.businessId, userId), employee);
    batch.update(doc(db, 'businesses', input.businessId), {
      employeeUserIds: arrayUnion(userId),
    });
    await batch.commit();
  } catch (error: any) {
    console.error('Error asignando empleado al negocio:', {
      code: error?.code,
      message: error?.message,
      managerUid: managerUser.uid,
      managerEmail: managerUser.email,
      employeeUid: userId,
      businessId: input.businessId,
    });

    if (error?.code === 'already-exists') {
      throw new Error('Esta cuenta ya tiene acceso a este negocio.');
    }

    throw new Error(
      'La cuenta de acceso fue validada, pero Firebase rechazó la asignación del empleado al negocio. Revisa los permisos de Firestore.'
    );
  }

  return employee;
}

export async function updateBusinessEmployee(
  businessId: string,
  userId: string,
  changes: { role?: BusinessRole; active?: boolean; name?: string },
): Promise<void> {
  if (changes.role && !MANAGEABLE_EMPLOYEE_ROLES.includes(changes.role)) {
    throw new Error('No puedes asignar ese rol desde Empleados.');
  }

  const changesToApply = {
    ...changes,
    ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(membershipRef(businessId, userId), changesToApply);
}

export async function removeBusinessEmployee(businessId: string, userId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(membershipRef(businessId, userId));
  batch.update(doc(db, 'businesses', businessId), {
    employeeUserIds: arrayRemove(userId),
  });
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
