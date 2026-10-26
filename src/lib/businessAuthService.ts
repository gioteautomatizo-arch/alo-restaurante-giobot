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
  where,
  writeBatch,
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

// Las membresías son documentos externos: validar también su contenido y su
// clave, no solo la ruta que se consultó o el tipo TypeScript.
const BUSINESS_ROLES = new Set<BusinessRole>([
  'SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'CASHIER',
  'WAITER', 'KITCHEN', 'EMPLOYEE', 'CLIENT',
]);

function hasValidMembership(data: RestaurantMembership, businessId: string, userId: string): boolean {
  return data.restaurantId === businessId
    && data.userId === userId
    && data.active === true
    && BUSINESS_ROLES.has(data.role);
}

function assertCurrentBusinessSession(userId: string): void {
  if (!userId || auth.currentUser?.uid !== userId) {
    throw new Error('La sesión cambió durante la consulta. Vuelve a entrar y reintenta.');
  }
}

export interface RegisterBusinessInput {
  businessName: string;
  businessType?: string;
  handle: string;
  email: string;
  password: string;
  logoUrl?: string;
  templateId?: string;
  capabilities?: string[];
  assistantName?: string;
  assistantMode?: 'GIOBOT_BASE' | 'CUSTOM_AVATAR';
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
  if (!businessId || businessId === 'alo-restaurante') {
    throw new Error('El nombre de usuario del negocio no es válido o está reservado.');
  }

  // La regla de Firestore impide crear un ID que ya exista. No leemos fichas privadas
  // de otros negocios para comprobar disponibilidad del identificador.

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
    ownerUserId: userId,
    restaurantName: input.businessName,
    businessType: (input.businessType as BusinessType) || 'restaurant',
    publicSlug: businessId,
    logoUrl: input.logoUrl,
    templateId: input.templateId,
    capabilities: input.capabilities,
    assistant: {
      name: input.assistantMode === 'CUSTOM_AVATAR' ? (input.assistantName?.trim() || 'Giobot') : 'Giobot',
      plan: input.assistantMode === 'CUSTOM_AVATAR' ? 'CUSTOM_AVATAR' : 'GIOBOT_BASE',
    },
  }));

  const membership: RestaurantMembership = {
    restaurantId: businessId,
    userId,
    role: 'OWNER' as BusinessRole,
    active: true,
  };

  // Auth puede cambiar de cuenta mientras se resuelve el registro.
  // No intentar crear un tenant para un UID distinto del que sigue conectado.
  if (auth.currentUser?.uid !== userId) {
    throw new Error('La sesión cambió durante el alta. Comprueba tu cuenta antes de reintentar.');
  }

  // El tenant y su OWNER se crean en una sola operación: ambos se guardan
  // o ninguno. Las reglas validan el UID del creador mediante getAfter().
  // Un fallo no deja negocios huérfanos sin acceso administrativo.
  const batch = writeBatch(db);
  batch.set(businessRef(businessId), tenant);
  batch.set(membershipRef(businessId, userId), membership);
  await batch.commit();

  // El lote ya pudo haberse guardado: no informar un falso fallo de alta si
  // cambió Auth después. Evitar sembrar catálogo usando la sesión de otro UID.
  if (auth.currentUser?.uid !== userId) {
    console.warn('Alta guardada; sesión cambiada antes del catálogo. Revisar el negocio con su propietario.');
    return { tenant, membership };
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
  assertCurrentBusinessSession(userId);
  const membershipsQuery = query(
    collection(db, MEMBERSHIPS_COLLECTION),
    where('userId', '==', userId),
    where('active', '==', true)
  );
  const membershipsSnap = await getDocs(membershipsQuery);
  assertCurrentBusinessSession(userId);
  const businessIds = [...new Set(membershipsSnap.docs.map((docSnap) => {
    const membership = docSnap.data() as RestaurantMembership;
    const businessId = membership.restaurantId;
    if (typeof businessId !== 'string' || !businessId
      || docSnap.id !== `${businessId}_${userId}`
      || !hasValidMembership(membership, businessId, userId)) {
      throw new Error('Una membresía de la cuenta tiene datos inconsistentes.');
    }
    return businessId;
  }))];

  // Una lectura parcial NO significa que el usuario tenga menos negocios.
  // Propagar el fallo permite al Portal mostrar Reintentar en vez de una lista
  // incompleta o el mensaje engañoso de que no hay negocios registrados.
  const businesses = await Promise.all(businessIds.map(async (businessId) => {
    if (typeof businessId !== 'string' || !businessId) {
      throw new Error('Una membresía contiene un identificador de negocio inválido.');
    }
    try {
      const snap = await getDoc(businessRef(businessId));
      assertCurrentBusinessSession(userId);
      if (!snap.exists()) throw new Error('La membresía apunta a un negocio inexistente.');
      const tenant = snap.data() as RestaurantTenant;
      if (tenant.restaurantId !== businessId) throw new Error('El identificador del negocio no coincide con su membresía.');
      return tenant;
    } catch (err) {
      console.warn('No se pudo leer el negocio asociado a una membresía', businessId, err);
      throw new Error('No pudimos cargar todos tus negocios. Revisa tu conexión o permisos y reintenta.');
    }
  }));
  assertCurrentBusinessSession(userId);
  return businesses;
}

/**
 * Obtiene un negocio concreto validando primero que el usuario autenticado
 * tenga una membresía activa sobre ese tenant.
 */
export async function getBusinessForUser(
  userId: string,
  businessId: string
): Promise<RestaurantTenant | null> {
  assertCurrentBusinessSession(userId);
  const membershipSnap = await getDoc(membershipRef(businessId, userId));
  assertCurrentBusinessSession(userId);
  if (!membershipSnap.exists()) return null;

  const membership = membershipSnap.data() as RestaurantMembership;
  if (!hasValidMembership(membership, businessId, userId)) return null;

  const businessSnap = await getDoc(businessRef(businessId));
  assertCurrentBusinessSession(userId);
  if (!businessSnap.exists()) return null;
  const tenant = businessSnap.data() as RestaurantTenant;
  return tenant.restaurantId === businessId ? tenant : null;
}



export async function getBusinessMembership(
  userId: string,
  businessId: string
): Promise<RestaurantMembership | null> {
  assertCurrentBusinessSession(userId);
  const snap = await getDoc(membershipRef(businessId, userId));
  assertCurrentBusinessSession(userId);
  if (!snap.exists()) return null;
  const membership = snap.data() as RestaurantMembership;
  return hasValidMembership(membership, businessId, userId) ? membership : null;
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

