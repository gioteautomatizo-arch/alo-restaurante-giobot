import { doc, getDoc, setDoc } from 'firebase/firestore';
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
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión para publicar tu negocio.');
  const membershipSnap = await getDoc(doc(db, 'businessMemberships', businessId + '_' + user.uid));
  const membership = membershipSnap.exists() ? membershipSnap.data() : null;
  if (!await isPlatformAdmin(user.uid) &&
      (!membership || membership.userId !== user.uid || membership.active !== true || membership.role !== 'OWNER')) {
    throw new Error('Solo el propietario del negocio puede publicar su página.');
  }
  const ref = doc(db, 'publicBusinessProfiles', businessId);
  if (published) {
    await setDoc(ref, makePublicBusinessProfile(businessId, tenant));
  } else {
    await setDoc(ref, { businessId, restaurantId: businessId, published: false, updatedAt: new Date().toISOString() }, { merge: true });
  }
}

export async function getBusinessPublicationStatus(businessId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'publicBusinessProfiles', businessId));
  return snap.exists() && snap.data().published === true;
}


/**
 * Mantiene al día la copia pública del negocio (colores, logo, VIP…).
 * Solo escribe si el negocio está publicado y la copia quedó distinta; lo hace el dueño.
 */
export async function syncPublicProfileIfNeeded(businessId: string, tenant: RestaurantTenant): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await getDoc(doc(db, 'publicBusinessProfiles', businessId));
  if (!snap.exists() || snap.data().published !== true) return false;
  const expected = makePublicBusinessProfile(businessId, tenant).branding;
  const sortedJson = (value: unknown) => JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
  if (sortedJson(snap.data().branding) === sortedJson(expected)) return false;
  await setBusinessPublication(businessId, tenant, true);
  return true;
}
