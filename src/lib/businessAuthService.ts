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
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { saveBusinessCatalog, createCatalogItemId } from './businessCatalogService';
import { getBusinessCatalogTemplate } from '../data/businessCatalogTemplates';
import {
  createRestaurantTenant,
  normalizeRestaurantSlug,
  BusinessRole,
  BusinessType,
  RestaurantMembership,
  RestaurantTenant,
} from './restaurantCore';

const BUSINESSES_COLLECTION = 'businesses';
const MEMBERSHIPS_COLLECTION = 'businessMemberships';

export interface RegisterBusinessInput {
  businessName: string;
  businessType?: string;
  handle: string;
  email: string;
  password: string;
  logoUrl?: string;
  templateId?: string;
  capabilities?: string[];
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
    businessType: (input.businessType as BusinessType) || 'restaurant',
    publicSlug: businessId,
    logoUrl: input.logoUrl,
    templateId: input.templateId,
    capabilities: input.capabilities,
  }));

  const membership: RestaurantMembership = {
    restaurantId: businessId,
    userId,
    role: 'OWNER' as BusinessRole,
    active: true,
  };

  // Crear primero el negocio y después su membresía.
  // Esto mantiene el alta compatible con las reglas de Firestore que
  // requieren que businesses/{businessId} exista antes de crear
  // businessMemberships/{businessId}_{userId}.
  const ref = businessRef(businessId);
  const current = await getDoc(ref);
  if (current.exists()) {
    throw new Error('Ese nombre de negocio ya está en uso. Elige otro.');
  }

  await setDoc(ref, tenant);

  try {
    await setDoc(membershipRef(businessId, userId), membership);
  } catch (err) {
    console.error('El negocio se creó, pero no se pudo crear la membresía del propietario:', err);
    throw new Error(
      'El negocio se creó, pero no pudimos asignarte como propietario. No vuelvas a registrarlo todavía; revisaremos los permisos de Firebase.'
    );
  }

  // A business starts with a real, editable catalog instead of an empty shell.
  // The template is structural starter data; the owner can replace it immediately.
  // Se siembra UNA sola vez: primero la plantilla elegida (templateId) y, si no hay,
  // la del giro (businessType). Si falla, el negocio ya existe y el dueño puede
  // cargar su catálogo después, por eso solo se avisa en consola.
  const catalogTemplate = getBusinessCatalogTemplate(input.templateId || input.businessType || 'restaurant');
  if (catalogTemplate?.items.length) {
    try {
      await saveBusinessCatalog(
        businessId,
        catalogTemplate.items.map((item, index) => ({
          ...item,
          id: `${createCatalogItemId(item.name)}-${index + 1}`,
          available: true,
        })),
        input.businessName.trim()
      );
    } catch (error) {
      console.warn('El negocio fue creado, pero no se pudo sembrar el catálogo de la plantilla:', error);
    }
  }

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



export async function getBusinessMembership(
  userId: string,
  businessId: string
): Promise<RestaurantMembership | null> {
  const snap = await getDoc(membershipRef(businessId, userId));
  if (!snap.exists()) return null;
  const membership = snap.data() as RestaurantMembership;
  if (membership.userId !== userId || !membership.active) return null;
  return membership;
}

export const PLATFORM_ADMINS_COLLECTION = 'platformAdmins';

/**
 * Determina si el usuario autenticado está registrado como Super Admin en la plataforma.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const snap = await getDoc(doc(db, PLATFORM_ADMINS_COLLECTION, userId));
    if (!snap.exists()) return false;
    const data = snap.data();
    return data?.active !== false;
  } catch (err) {
    console.warn('Error verificando platform admin:', err);
    return false;
  }
}

/**
 * Obtiene todos los negocios registrados en la plataforma para el panel Super Admin.
 * Excluye Calientito ya que es el tenant histórico predeterminado.
 */
export async function getAllBusinesses(): Promise<RestaurantTenant[]> {
  try {
    const snap = await getDocs(collection(db, BUSINESSES_COLLECTION));
    const tenants: RestaurantTenant[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as RestaurantTenant;
      // Mantener Calientito fuera de la lista de tenants nuevos porque es el tenant histórico
      if (data.restaurantId && data.restaurantId !== 'alo-restaurante') {
        tenants.push(data);
      }
    });
    return tenants;
  } catch (err) {
    console.error('Error fetching all businesses for super admin:', err);
    throw err;
  }
}

