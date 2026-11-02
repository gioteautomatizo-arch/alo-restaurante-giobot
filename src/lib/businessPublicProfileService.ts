import { doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isPlatformAdmin } from './businessAuthService';
import type { RestaurantTenant } from './restaurantCore';

export type PublicBusinessProfile = {
  businessId: string;
  restaurantId: string;
  businessType?: string;
  branding: {
    restaurantName: string;
    publicSlug: string;
    logoUrl?: string;
    coverUrl?: string;
    tagline?: string;
    description?: string;
    whatsapp?: string;
    address?: string;
    hoursText?: string;
    instagramUrl?: string;
    facebookUrl?: string;
    primaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    surfaceColor?: string;
    textColor?: string;
    vipEnabled?: boolean;
    loyaltyProgramName?: string;
    vipStampsRequired?: number;
    vipRewardDescription?: string;
  };
  published: boolean;
  updatedAt: string;
};

export function makePublicBusinessProfile(businessId: string, tenant: RestaurantTenant): PublicBusinessProfile {
  const b = tenant.branding;
  const branding: PublicBusinessProfile['branding'] = {
    restaurantName: b.restaurantName || businessId,
    publicSlug: b.publicSlug || businessId,
  };
  for (const key of ['logoUrl','coverUrl','tagline','description','whatsapp','address','hoursText','instagramUrl','facebookUrl'] as const) {
    const value = b[key];
    if (typeof value === 'string' && value.trim()) branding[key] = value.trim();
  }
  for (const key of ['primaryColor','accentColor','backgroundColor','surfaceColor','textColor'] as const) {
    const value = b[key];
    if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim())) branding[key] = value.trim();
  }
  if (b.vipEnabled) {
    branding.vipEnabled = true;
    if (b.loyaltyProgramName?.trim()) branding.loyaltyProgramName = b.loyaltyProgramName.trim();
    if (b.vipRewardDescription?.trim()) branding.vipRewardDescription = b.vipRewardDescription.trim();
    if (Number.isFinite(b.vipStampsRequired)) branding.vipStampsRequired = Math.min(20, Math.max(1, Math.round(Number(b.vipStampsRequired))));
  }
  return {
    businessId,
    restaurantId: businessId,
    ...(tenant.businessType ? { businessType: tenant.businessType } : {}),
    branding,
    published: true,
    updatedAt: new Date().toISOString(),
  };
}

// La sincronización automática puede exigir que siga vigente la ficha que leyó.
// La publicación manual conserva su contrato de tres argumentos.
async function setBusinessPublicationChecked(
  businessId: string, tenant: RestaurantTenant, published: boolean,
  expectedProfileState?: string
): Promise<void> {
  // Defensa adicional: aun si una vista conserva estado viejo, nunca publicarlo bajo otro negocio.
  if (!businessId.trim() || tenant.restaurantId !== businessId) {
    throw new Error('La identidad del negocio no coincide. Vuelve a abrir tu espacio de trabajo.');
  }
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión para publicar tu negocio.');
  const membershipRef = doc(db, 'businessMemberships', businessId + '_' + user.uid);
  const isValidOwner = (data: Record<string, unknown> | null): boolean =>
    !!data && data.restaurantId === businessId && data.userId === user.uid
    && data.active === true && data.role === 'OWNER';

  // No autorizar publicación/ocultación con caché offline; fallar cerrado.
  const membershipSnap = await getDocFromServer(membershipRef);
  const ownerAccess = isValidOwner(membershipSnap.exists() ? membershipSnap.data() : null);
  // Conservar la ruta de Super Admin sin concederle implícitamente un OWNER ajeno.
  const adminAccess = !ownerAccess && await isPlatformAdmin(user.uid);
  if (!ownerAccess && !adminAccess) {
    throw new Error('Solo el propietario del negocio puede publicar su página.');
  }
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error('La sesión cambió antes de publicar el negocio. Vuelve a iniciar sesión.');
  }

  // El documento pasado por la vista puede estar obsoleto o pertenecer a otra
  // raíz. No basta con una membresía OWNER si el propietario explícito difiere.
  const businessRef = doc(db, 'businesses', businessId);
  // Validar dos veces: preflight para informar pronto y lectura transaccional
  // para impedir que una edición concurrente de la raíz publique branding viejo.
  const assertRootMatchesView = (business: Record<string, unknown> | null): void => {
    if (!business || business.restaurantId !== businessId
        || (ownerAccess && business.ownerUserId !== undefined && business.ownerUserId !== user.uid)) {
      throw new Error('La identidad del negocio o propietario es inconsistente.');
    }
    const rootBranding = business.branding as Record<string, unknown> | null;
    if (!rootBranding || typeof rootBranding !== 'object' || Array.isArray(rootBranding)
        || typeof rootBranding.restaurantName !== 'string'
        || !rootBranding.restaurantName.trim()
        || typeof rootBranding.publicSlug !== 'string'
        || !rootBranding.publicSlug.trim()) {
      throw new Error('La configuración pública de la raíz es inconsistente. Solicita revisión.');
    }
    const serverProfile = makePublicBusinessProfile(businessId, business as unknown as RestaurantTenant);
    const viewProfile = makePublicBusinessProfile(businessId, tenant);
    if (sortedJson(serverProfile.branding) !== sortedJson(viewProfile.branding)
        || (business.businessType ?? null) !== (tenant.businessType ?? null)) {
      throw new Error('CONFLICTO_PUBLICACION: La configuración del negocio cambió. Actualiza antes de publicar u ocultar.');
    }
  };
  const businessSnap = await getDocFromServer(businessRef);
  assertRootMatchesView(businessSnap.exists() ? businessSnap.data() : null);
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error('La sesión cambió antes de publicar el negocio. Vuelve a iniciar sesión.');
  }

  // Una revocación entre la primera lectura y la raíz no debe confirmar una
  // publicación basada en permisos ya obsoletos. Firestore sigue siendo autoridad.
  if (ownerAccess) {
    const latestSnap = await getDocFromServer(membershipRef);
    if (!isValidOwner(latestSnap.exists() ? latestSnap.data() : null)) {
      throw new Error('Los permisos de publicación cambiaron. Vuelve a entrar y reintenta.');
    }
  } else if (!await isPlatformAdmin(user.uid)) {
    throw new Error('Los permisos de publicación cambiaron. Vuelve a entrar y reintenta.');
  }
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error('La sesión cambió antes de publicar el negocio. Vuelve a iniciar sesión.');
  }
  const ref = doc(db, 'publicBusinessProfiles', businessId);
  // La lectura del perfil y su escritura deben ser UNA operación atómica.
  // Un getDocFromServer seguido de setDoc permite que otra sesión modifique
  // el perfil entre ambas operaciones y se sobrescriba una identidad ajena.
  // Firestore reintenta transacciones si el documento leído cambia; no aceptar
  // un reintento automático como autorización para sobrescribir otro estado.
  let attempts = 0;
  await runTransaction(db, async (transaction) => {
    const attempt = ++attempts;
    if (auth.currentUser?.uid !== user.uid) {
      throw new Error('La sesión cambió antes de publicar el negocio. Vuelve a iniciar sesión.');
    }
    const existingProfile = await transaction.get(ref);
    if (auth.currentUser?.uid !== user.uid) {
      throw new Error('La sesión cambió antes de publicar el negocio. Vuelve a iniciar sesión.');
    }
    // La raíz participa en el mismo conjunto de lecturas que la ficha pública.
    // Si cambia durante la transacción, Firestore reintenta y la puerta de
    // attempts > 1 impide aceptar una publicación basada en una vista antigua.
    const currentRootSnap = await transaction.get(businessRef);
    if (auth.currentUser?.uid !== user.uid) {
      throw new Error('La sesión cambió antes de publicar el negocio. Vuelve a iniciar sesión.');
    }
    assertRootMatchesView(currentRootSnap.exists() ? currentRootSnap.data() : null);
    if (existingProfile.exists()) {
      assertPublicProfileIdentity(businessId, existingProfile.data());
    }
    // Evitar que una sincronización automática vuelva a publicar una ficha
    // ocultada, borrada o editada por otra sesión desde su lectura inicial.
    if (expectedProfileState !== undefined && (!existingProfile.exists()
        || publicProfileStateFingerprint(existingProfile.data()) !== expectedProfileState)) {
      throw new Error('CONFLICTO_PUBLICACION: La página cambió durante la sincronización. Actualiza antes de reintentar.');
    }
    if (attempt > 1) {
      throw new Error('CONFLICTO_PUBLICACION: La página cambió durante la operación. Recarga su estado antes de reintentar.');
    }
    if (auth.currentUser?.uid !== user.uid) {
      throw new Error('La sesión cambió antes de publicar el negocio. Vuelve a iniciar sesión.');
    }
    if (published) {
      transaction.set(ref, makePublicBusinessProfile(businessId, tenant));
    } else {
      transaction.set(ref, { businessId, restaurantId: businessId, published: false, updatedAt: new Date().toISOString() }, { merge: true });
    }
  });
}

export async function setBusinessPublication(businessId: string, tenant: RestaurantTenant, published: boolean): Promise<void> {
  return setBusinessPublicationChecked(businessId, tenant, published);
}

// Una ficha de otro negocio o una ficha histórica corrupta nunca debe
// certificar el estado del tenant consultado ni ser sobrescrita en silencio.
function assertPublicProfileIdentity(businessId: string, data: unknown): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('La identidad de la página pública es inconsistente. Solicita revisión antes de publicarla.');
  }
  const profile = data as Record<string, unknown>;
  if (profile.businessId !== businessId || profile.restaurantId !== businessId
      || typeof profile.published !== 'boolean') {
    throw new Error('La identidad de la página pública es inconsistente. Solicita revisión antes de publicarla.');
  }
  // El directorio descarta fichas publicadas sin identidad visual mínima.
  // El panel no debe presentarlas como publicadas ni sobrescribirlas en silencio.
  // Una ficha histórica OCULTA sí puede carecer de branding y seguir siendo editable.
  if (profile.published) {
    const branding = profile.branding;
    if (!branding || typeof branding !== 'object' || Array.isArray(branding)) {
      throw new Error('La identidad de la página pública es inconsistente. Solicita revisión antes de publicarla.');
    }
    const identity = branding as Record<string, unknown>;
    if (typeof identity.restaurantName !== 'string' || !identity.restaurantName.trim()
        || typeof identity.publicSlug !== 'string' || !identity.publicSlug.trim()) {
      throw new Error('La identidad de la página pública es inconsistente. Solicita revisión antes de publicarla.');
    }
  }
}

function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, part) => part && typeof part === 'object' && !Array.isArray(part)
    ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => a.localeCompare(b)))
    : part) ?? '';
}

function publicProfileStateFingerprint(value: unknown): string {
  const profile = value as Record<string, unknown>;
  return sortedJson({ published: profile.published, updatedAt: profile.updatedAt, branding: profile.branding });
}

export async function getBusinessPublicationStatus(businessId: string): Promise<boolean> {
  // El estado de publicación también debe venir del servidor.
  const snap = await getDocFromServer(doc(db, 'publicBusinessProfiles', businessId));
  if (!snap.exists()) return false;
  const profile = snap.data();
  assertPublicProfileIdentity(businessId, profile);
  return profile.published;
}


/**
 * Mantiene al día la copia pública del negocio (colores, logo, VIP…).
 * Solo escribe si el negocio está publicado y la copia quedó distinta; lo hace el dueño.
 */
export async function syncPublicProfileIfNeeded(businessId: string, tenant: RestaurantTenant): Promise<boolean> {
  if (!businessId.trim() || tenant.restaurantId !== businessId) return false;
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await getDocFromServer(doc(db, 'publicBusinessProfiles', businessId));
  if (!snap.exists()) return false;
  const profile = snap.data();
  assertPublicProfileIdentity(businessId, profile);
  if (!profile.published) return false;
  if (!profile.branding || typeof profile.branding !== 'object' || Array.isArray(profile.branding)
      || typeof profile.updatedAt !== 'string' || !profile.updatedAt.trim()) {
    throw new Error('La página pública contiene datos de sincronización inconsistentes. Solicita revisión.');
  }
  const expected = makePublicBusinessProfile(businessId, tenant).branding;
  if (sortedJson(profile.branding) === sortedJson(expected)) return false;
  await setBusinessPublicationChecked(businessId, tenant, true, publicProfileStateFingerprint(profile));
  return true;
}
