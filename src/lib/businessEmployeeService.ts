import { initializeApp, deleteApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
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

async function createEmployeeAuth(email: string, password: string, businessId: string): Promise<string> {
  const name = secondaryAuthName(businessId);
  const existing = getApps().find((app) => app.name === name);
  const app = existing || initializeApp(firebaseConfig, name);
  const secondaryAuth = getAuth(app);

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim().toLowerCase(), password);
    return credential.user.uid;
  } finally {
    // Keep the primary app/auth session intact. The secondary app exists only
    // long enough to create the employee account.
    await deleteApp(app);
  }
}

export async function listBusinessEmployees(businessId: string): Promise<BusinessEmployee[]> {
  const snap = await getDocs(query(
    collection(db, COLLECTION),
    where('restaurantId', '==', businessId),
  ));

  return snap.docs
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
}): Promise<BusinessEmployee> {
  if (!MANAGEABLE_EMPLOYEE_ROLES.includes(input.role)) {
    throw new Error('Ese rol no puede asignarse desde Empleados.');
  }

  const email = input.email.trim().toLowerCase();
  if (!input.name.trim() || !email || input.password.length < 6) {
    throw new Error('Completa nombre, correo y una contraseña temporal de al menos 6 caracteres.');
  }

  const userId = await createEmployeeAuth(email, input.password, input.businessId);
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
    await setDoc(membershipRef(input.businessId, userId), employee);
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

  await updateDoc(membershipRef(businessId, userId), {
    ...changes,
    ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
    updatedAt: new Date().toISOString(),
  });
}

export async function removeBusinessEmployee(businessId: string, userId: string): Promise<void> {
  await deleteDoc(membershipRef(businessId, userId));
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
