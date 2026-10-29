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
import { seedBusinessCatalogIfMissing, createCatalogItemId } from './businessCatalogService';
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

// Contrato mínimo del selector: nunca tratar la tarjeta de un endpoint privado
// como si fuera la raíz completa del negocio.
export type BusinessDirectoryCard = Pick<RestaurantTenant, 'restaurantId'> & {
  branding: Pick<RestaurantTenant['branding'], 'restaurantName' | 'publicSlug' | 'logoUrl'>;
};

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
  let confirmedTenant = tenant;
  let confirmedMembership = membership;
  try {
    await batch.commit();
  } catch (commitError) {
    // El servidor puede haber confirmado el lote aunque la respuesta se haya
    // perdido. Recuperar SOLO una alta propia con OWNER válido; una colisión de
    // handle ajeno debe conservar el error original y nunca tomar ese negocio.
    try {
      assertCurrentBusinessSession(userId);
      const existingMembershipSnap = await getDoc(membershipRef(businessId, userId));
      assertCurrentBusinessSession(userId);
      if (!existingMembershipSnap.exists()) throw commitError;
      const existingMembership = existingMembershipSnap.data() as RestaurantMembership;
      if (!hasValidMembership(existingMembership, businessId, userId) || existingMembership.role !== 'OWNER') {
        throw commitError;
      }
      const existingTenantSnap = await getDoc(businessRef(businessId));
      assertCurrentBusinessSession(userId);
      if (!existingTenantSnap.exists()) throw commitError;
      const existingTenant = existingTenantSnap.data() as RestaurantTenant;
      if (existingTenant.restaurantId !== businessId || existingTenant.ownerUserId !== userId) {
        throw commitError;
      }
      confirmedTenant = existingTenant;
      confirmedMembership = existingMembership;
    } catch {
      throw commitError;
    }
  }

  // El lote ya pudo haberse guardado: no informar un falso fallo de alta si
  // cambió Auth después. Evitar sembrar catálogo usando la sesión de otro UID.
  if (auth.currentUser?.uid !== userId) {
    console.warn('Alta guardada; sesión cambiada antes del catálogo. Revisar el negocio con su propietario.');
    return { tenant: confirmedTenant, membership: confirmedMembership };
  }

  // La siembra transaccional solo crea un catálogo ausente; ni un segundo
  // reintento/pestaña ni una lectura antigua pueden sobrescribir ediciones.
  try {
    const catalogTemplate = getBusinessCatalogTemplate(
      confirmedTenant.templateId || confirmedTenant.businessType || 'restaurant'
    );
    if (catalogTemplate?.items.length) {
      await seedBusinessCatalogIfMissing(
        businessId,
        catalogTemplate.items.map((item, index) => ({
          ...item,
          id: `${createCatalogItemId(item.name)}-${index + 1}`,
          available: true,
        })),
        confirmedTenant.branding.restaurantName
      );
    }
  } catch (error) {
    // Tenant y OWNER ya están confirmados: el dueño puede reparar el catálogo
    // desde su editor o reintentar el alta sin duplicar el negocio.
    console.warn('El negocio fue creado, pero no se pudo comprobar o sembrar el catálogo:', error);
  }

  return { tenant: confirmedTenant, membership: confirmedMembership };
}

export async function loginBusinessOwner(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logoutBusinessOwner(): Promise<void> {
  await firebaseSignOut(auth);
}

// Corte coordinado futuro: ambos flags deben habilitarse tras revisar
// históricos y cerrar la consulta directa en reglas. No hay fallback a
// Firestore si la ruta protegida falla: eso reabriría la exposición.
const SECURE_BUSINESS_LIST_ENABLED = import.meta.env?.VITE_SECURE_BUSINESS_LIST === 'true';

async function getBusinessesFromVerifiedApi(userId: string): Promise<BusinessDirectoryCard[]> {
  assertCurrentBusinessSession(userId);
  const user = auth.currentUser!;
  const token = await user.getIdToken();
  assertCurrentBusinessSession(userId);
  const response = await fetch('/api/businesses/mine', {
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token },
  });
  assertCurrentBusinessSession(userId);
  if (!response.ok) {
    throw new Error('No pudimos cargar tus negocios desde el servicio protegido. Reintenta o consulta al administrador.');
  }
  const payload: unknown = await response.json();
  assertCurrentBusinessSession(userId);
  if (!payload || typeof payload !== 'object' || !('businesses' in payload) ||
      !Array.isArray(payload.businesses)) {
    throw new Error('El servicio protegido devolvió una respuesta inválida.');
  }
  const seen = new Set<string>();
  const businesses: BusinessDirectoryCard[] = [];
  for (const value of payload.businesses) {
    const branding = value?.branding;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some(key => key !== 'restaurantId' && key !== 'branding') ||
        typeof value.restaurantId !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value.restaurantId) ||
        seen.has(value.restaurantId) ||
        !branding || typeof branding !== 'object' || Array.isArray(branding) ||
        Object.keys(branding).some(key => !['restaurantName', 'publicSlug', 'logoUrl'].includes(key)) ||
        typeof branding.restaurantName !== 'string' ||
        typeof branding.publicSlug !== 'string' ||
        (branding.logoUrl !== undefined && typeof branding.logoUrl !== 'string')) {
      throw new Error('El servicio protegido devolvió datos de negocios inconsistentes.');
    }
    seen.add(value.restaurantId);
    businesses.push(value as BusinessDirectoryCard);
  }
  assertCurrentBusinessSession(userId);
  return businesses;
}

export async function getBusinessesForUser(userId: string): Promise<BusinessDirectoryCard[]> {
  assertCurrentBusinessSession(userId);
  if (SECURE_BUSINESS_LIST_ENABLED) return getBusinessesFromVerifiedApi(userId);
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
  // El selector heredado conserva la lectura Firestore directa hasta el corte
  // coordinado. Aun así, su salida y validación deben coincidir con el contrato
  // mínimo del candidato privado: no propagar la raíz completa al Portal.
  // IMPORTANTE: proyectar aquí NO evita que Firestore haya enviado la raíz al
  // navegador; la exposición en red solo se cerrará con reglas/corte aprobados.
  const ownerBusinessIds = new Set(membershipsSnap.docs
    .filter(docSnap => (docSnap.data() as RestaurantMembership).role === 'OWNER')
    .map(docSnap => (docSnap.data() as RestaurantMembership).restaurantId));
  const businesses = await Promise.all(businessIds.map(async (businessId): Promise<BusinessDirectoryCard> => {
    if (typeof businessId !== 'string' || !businessId) {
      throw new Error('Una membresía contiene un identificador de negocio inválido.');
    }
    try {
      const snap = await getDoc(businessRef(businessId));
      assertCurrentBusinessSession(userId);
      if (!snap.exists()) throw new Error('La membresía apunta a un negocio inexistente.');
      const tenant = snap.data() as RestaurantTenant;
      const branding = tenant.branding;
      if (tenant.restaurantId !== businessId ||
          !branding || typeof branding.restaurantName !== 'string' ||
          typeof branding.publicSlug !== 'string' ||
          (branding.logoUrl !== undefined && typeof branding.logoUrl !== 'string') ||
          (ownerBusinessIds.has(businessId) &&
            tenant.ownerUserId !== undefined && tenant.ownerUserId !== userId)) {
        throw new Error('La raíz del negocio o su propietario tiene datos inconsistentes.');
      }
      return {
        restaurantId: businessId,
        branding: {
          restaurantName: branding.restaurantName,
          publicSlug: branding.publicSlug,
          ...(branding.logoUrl !== undefined ? { logoUrl: branding.logoUrl } : {}),
        },
      };
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
  if (tenant.restaurantId !== businessId ||
      (membership.role === 'OWNER' && tenant.ownerUserId !== undefined && tenant.ownerUserId !== userId)) {
    return null;
  }

  // La membresía pudo revocarse mientras se leía la raíz. No entregar al
  // Workspace una raíz privada usando permisos de una lectura obsoleta.
  // Esta defensa de cliente no impide que Firestore ya haya enviado la raíz.
  const latestMembershipSnap = await getDoc(membershipRef(businessId, userId));
  assertCurrentBusinessSession(userId);
  if (!latestMembershipSnap.exists()) return null;
  const latestMembership = latestMembershipSnap.data() as RestaurantMembership;
  if (!hasValidMembership(latestMembership, businessId, userId) ||
      latestMembership.role !== membership.role) return null;
  return tenant;
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
  // No aceptar una respuesta de permisos iniciada por una cuenta anterior.
  if (!userId || auth.currentUser?.uid !== userId) return false;
  try {
    const snap = await getDoc(doc(db, PLATFORM_ADMINS_COLLECTION, userId));
    assertCurrentBusinessSession(userId);
    if (!snap.exists()) return false;
    const data = snap.data();
    // Mantener compatibilidad con los documentos históricos sin campo active.
    return data?.active !== false;
  } catch (err) {
    console.warn('Error verificando platform admin:', err);
    return false;
  }
}

/**
 * Obtiene todos los negocios para un Super Admin de la sesión actual.
 * Excluye Calientito (tenant histórico). No devolver lecturas parciales,
 * datos discordantes ni resultados de una cuenta que ya cerró sesión.
 */
export async function getAllBusinesses(userId: string): Promise<RestaurantTenant[]> {
  assertCurrentBusinessSession(userId);
  if (!(await isPlatformAdmin(userId))) {
    throw new Error('La cuenta actual no tiene permisos de Super Admin.');
  }
  assertCurrentBusinessSession(userId);
  try {
    const snap = await getDocs(collection(db, BUSINESSES_COLLECTION));
    assertCurrentBusinessSession(userId);
    const tenants: RestaurantTenant[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as RestaurantTenant;
      if (!data.restaurantId || data.restaurantId !== docSnap.id) {
        throw new Error('Un negocio de la plataforma tiene un identificador inconsistente.');
      }
      // Mantener Calientito fuera de la lista de tenants nuevos.
      if (data.restaurantId !== 'alo-restaurante') tenants.push(data);
    });
    return tenants;
  } catch (err) {
    console.error('Error fetching all businesses for super admin:', err);
    throw err;
  }
}

