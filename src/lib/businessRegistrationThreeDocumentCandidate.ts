/**
 * Paso 2 — CANDIDATO INACTIVO de registro de tres documentos.
 * NO se importa desde el onboarding de producción. Activar únicamente después
 * de revisar reglas, backfill histórico, compatibilidad y rollback autorizados.
 * Nunca consultar la reserva desde el SDK cliente: las reglas la mantienen privada.
 */
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';
import { seedBusinessCatalogIfMissing, createCatalogItemId } from './businessCatalogService';
import { getBusinessCatalogTemplate } from '../data/businessCatalogTemplates';
import {
  createRestaurantTenant, normalizeRestaurantSlug,
  type BusinessRole, type BusinessType, type RestaurantMembership, type RestaurantTenant,
} from './restaurantCore';
import type { RegisterBusinessInput, RegisterBusinessResult } from './businessAuthService';

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

export async function registerBusinessThreeDocumentCandidate(input: RegisterBusinessInput): Promise<RegisterBusinessResult> {
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

  // El tenant, OWNER y reserva permanente se crean en una sola operación: todos se guardan
  // o ninguno. Las reglas candidatas validan el UID mediante getAfter().
  // Un fallo no deja negocios huérfanos sin acceso administrativo.
  const batch = writeBatch(db);
  batch.set(businessRef(businessId), tenant);
  batch.set(membershipRef(businessId, userId), membership);
  batch.set(doc(db, 'businessHandleReservations', businessId), { businessId, ownerUserId: userId });
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

