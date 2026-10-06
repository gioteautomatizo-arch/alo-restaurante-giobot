import { initializeApp, deleteApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
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
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email.trim().toLowerCase(),
      password,
    );
    return credential.user.uid;
  });
}

async function findExistingEmployeeAuth(
  email: string,
  password: string,
  businessId: string,
): Promise<string> {
  return withSecondaryAuth(businessId, async (secondaryAuth) => {
    try {
      const credential = await signInWithEmailAndPassword(
        secondaryAuth,
        email.trim().toLowerCase(),
        password,
      );
      return credential.user.uid;
    } catch {
      throw new Error(
        'No pudimos validar esa cuenta existente. Revisa el correo y la contraseña.',
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
  if (!input.name.trim() || !email || input.password.length < 6) {
    throw new Error('Completa nombre, correo y una contraseña temporal de al menos 6 caracteres.');
  }

  const userId = input.accountMode === 'existing'
    ? await findExistingEmployeeAuth(email, input.password, input.businessId)
    : await createEmployeeAuth(email, input.password, input.businessId);

  const existingMembership = await getDoc(membershipRef(input.businessId, userId));
  if (existingMembership.exists()) {
    throw new Error('Esta cuenta ya tiene acceso a este negocio.');
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

  try {
    const batch = writeBatch(db);
    batch.set(membershipRef(input.businessId, userId), employee);
    batch.update(doc(db, 'businesses', input.businessId), {
      employeeUserIds: arrayUnion(userId),
    });
    await batch.commit();
  } catch (error) {
    throw new Error(
      'La cuenta de acceso se creó, pero no pudimos asignar el empleado al negocio. No vuelvas a registrarlo todavía; revisaremos los permisos de Firebase.'
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
