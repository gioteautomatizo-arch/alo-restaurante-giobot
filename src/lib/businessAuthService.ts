import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  createRestaurantTenant,
  normalizeRestaurantSlug,
  RestaurantMembership,
  RestaurantTenant,
} from './restaurantCore';

const BUSINESSES_COLLECTION = 'businesses';
const MEMBERSHIPS_COLLECTION = 'businessMemberships';

export interface RegisterBusinessInput {
  businessName: string;
  handle: string;
  email: string;
  password: string;
  logoUrl?: string;
}

export interface RegisterBusinessResult {
  tenant: RestaurantTenant;
  membership: RestaurantMembership;
}

function businessRef(businessId: string) {
  return doc(db, BUSINESSES_COLLECTION, businessId);
}

function membershipRef(businessId: string, userId: string) {
  return doc(db, MEMBERSHIPS_COLLECTION, `${businessId}_${userId}`);
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const cleanEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, removeUndefinedDeep(entryValue)]);
    return Object.fromEntries(cleanEntries) as T;
  }

  return value;
}

export async function registerBusiness(input: RegisterBusinessInput): Promise<RegisterBusinessResult> {
  const businessId = normalizeRestaurantSlug(input.handle || input.businessName);
  if (!businessId) {
    throw new Error('El nombre de usuario del negocio no es válido.');
  }

  const existing = await getDoc(businessRef(businessId));
  if (existing.exists()) {
    throw new Error('Ese nombre de negocio ya está en uso. Elige otro.');
  }

  let userId: string;

  try {
    const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
    userId = credential.user.uid;
  } catch (err: any) {
    if (err?.code !== 'auth/email-already-in-use') {
      throw err;
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const currentUser = auth.currentUser;

    if (currentUser?.email?.trim().toLowerCase() === normalizedEmail) {
      userId = currentUser.uid;
    } else {
      try {
        const credential = await signInWithEmailAndPassword(auth, input.email, input.password);
        userId = credential.user.uid;
      } catch {
        throw new Error('Este correo ya está registrado. Usa la contraseña de esa cuenta o utiliza otro correo.');
      }
    }
  }

  const tenant = removeUndefinedDeep(createRestaurantTenant({
    restaurantId: businessId,
    restaurantName: input.businessName,
    publicSlug: businessId,
    logoUrl: input.logoUrl,
  }));

  const membership: RestaurantMembership = {
    restaurantId: businessId,
    userId,
    role: 'OWNER',
    active: true,
  };

  await runTransaction(db, async (tx) => {
    const ref = businessRef(businessId);
    const current = await tx.get(ref);
    if (current.exists()) {
      throw new Error('Ese nombre de negocio ya está en uso. Elige otro.');
    }
    tx.set(ref, tenant);
    tx.set(membershipRef(businessId, userId), membership);
  });

  return { tenant, membership };
}

export async function loginBusinessOwner(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logoutBusinessOwner(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function getBusinessesForUser(userId: string): Promise<RestaurantTenant[]> {
  const membershipsQuery = query(
    collection(db, MEMBERSHIPS_COLLECTION),
    where('userId', '==', userId),
    where('active', '==', true)
  );
  const membershipsSnap = await getDocs(membershipsQuery);
  const businessIds = membershipsSnap.docs.map(
    (docSnap) => (docSnap.data() as RestaurantMembership).restaurantId
  );

  const tenants: RestaurantTenant[] = [];
  for (const businessId of businessIds) {
    const snap = await getDoc(businessRef(businessId));
    if (snap.exists()) tenants.push(snap.data() as RestaurantTenant);
  }
  return tenants;
}

/**
 * Obtiene un negocio concreto validando primero que el usuario autenticado
 * tenga una membresía activa sobre ese tenant.
 */
export async function getBusinessForUser(
  userId: string,
  businessId: string
): Promise<RestaurantTenant | null> {
  const membershipSnap = await getDoc(membershipRef(businessId, userId));
  if (!membershipSnap.exists()) return null;

  const membership = membershipSnap.data() as RestaurantMembership;
  if (membership.userId !== userId || !membership.active) return null;

  const businessSnap = await getDoc(businessRef(businessId));
  return businessSnap.exists() ? (businessSnap.data() as RestaurantTenant) : null;
}
