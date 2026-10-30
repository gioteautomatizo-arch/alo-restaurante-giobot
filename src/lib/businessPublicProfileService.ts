import { doc, getDocFromServer, setDoc } from 'firebase/firestore';
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

export async function setBusinessPublication(businessId: string, tenant: RestaurantTenant, published: boolean): Promise<void> {
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
  const businessSnap = await getDocFromServer(doc(db, 'businesses', businessId));
  const business = businessSnap.exists() ? businessSnap.data() : null;
  if (!business || business.restaurantId !== businessId
      || (ownerAccess && business.ownerUserId !== undefined && business.ownerUserId !== user.uid)) {
    throw new Error('La identidad del negocio o propietario es inconsistente.');
  }
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
  if (published) {
    await setDoc(ref, makePublicBusinessProfile(businessId, tenant));
  } else {
    await setDoc(ref, { businessId, restaurantId: businessId, published: false, updatedAt: new Date().toISOString() }, { merge: true });
  }
}

export async function getBusinessPublicationStatus(businessId: string): Promise<boolean> {
  // El estado de publicación también debe venir del servidor.
  const snap = await getDocFromServer(doc(db, 'publicBusinessProfiles', businessId));
  return snap.exists() && snap.data().published === true;
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
  if (!snap.exists() || snap.data().published !== true) return false;
  const expected = makePublicBusinessProfile(businessId, tenant).branding;
  const sortedJson = (value: unknown) => JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
  if (sortedJson(snap.data().branding) === sortedJson(expected)) return false;
  await setBusinessPublication(businessId, tenant, true);
  return true;
}
