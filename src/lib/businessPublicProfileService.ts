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
