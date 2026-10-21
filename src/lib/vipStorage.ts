import { VipProfile, OrderType } from '../types';
import { getRestaurantInfo } from './adminStorage';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { normalizePhone, normalizePin, computeVipDocId, computePinHash } from './vipCrypto';

const VIP_KEY = 'calientito_vip_profile';
export const RESTAURANT_ID = 'alo-restaurante';

// La identidad del negocio es explícita por operación; no hay estado global mutable.
// Conservar la llave original permite que Calientito siga leyendo las tarjetas existentes.
const vipKey = (businessId: string): string =>
  businessId === RESTAURANT_ID ? VIP_KEY : `${VIP_KEY}__${businessId}`;

function assertVipBusiness(profile: VipProfile, businessId: string): void {
  // Los registros locales anteriores a multinegocio no tenían restaurantId.
  if (profile.restaurantId === businessId) return;
  if (businessId === RESTAURANT_ID && !profile.restaurantId) return;
  throw new Error('La tarjeta VIP pertenece a otro negocio.');
}

// Activación gradual: solo probar cuando el servidor tenga credenciales administrativas seguras.
const SECURE_VIP_API = import.meta.env.VITE_SECURE_VIP_API === 'true';
const sessionKey = (businessId: string) => `gioteautomatizo_vip_session__${businessId}`;
function tokenFor(businessId: string): string | null {
  try { return sessionStorage.getItem(sessionKey(businessId)); } catch { return null; }
}
function storeSession(businessId: string, token: string): void {
  try { sessionStorage.setItem(sessionKey(businessId), token); } catch { /* sin almacenamiento persistente */ }
}
async function vipRequest<T>(path: string, method: 'GET' | 'POST' | 'PATCH', businessId: string, body?: unknown): Promise<T> {
  const token = tokenFor(businessId);
  const url = method === 'GET' ? `${path}?businessId=${encodeURIComponent(businessId)}` : path;
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    if (response.status === 401 && token) {
      try { sessionStorage.removeItem(sessionKey(businessId)); } catch { /* ignorar */ }
      notifyVipChange();
    }
    throw new Error(result.error || 'No se pudo completar la operación VIP.');
  }
  return result;
}

export const VIP_DATA_EVENT = 'alo_vip_data_updated';

function notifyVipChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(VIP_DATA_EVENT));
  }
}

/**
 * Lee el perfil VIP guardado en localStorage (operación instantánea local-first)
 */
export const getVipProfile = (businessId: string = RESTAURANT_ID): VipProfile | null => {
  if (!businessId.trim()) return null;
  try {
    const dataStr = localStorage.getItem(vipKey(businessId));
    if (!dataStr) return null;
    const profile = JSON.parse(dataStr) as VipProfile;
    assertVipBusiness(profile, businessId);
    if (SECURE_VIP_API && !tokenFor(businessId)) {
      // Mostrar tarjetas solo locales (sin ID ni sincronización) mientras
      // se completa su migración. Perfiles cloud requieren sesión verificada.
      if (profile.id || profile.syncedWithCloud === true) return null;
    }
    return profile;
  } catch (err) {
    console.error('Error reading VIP profile from localStorage:', err);
    return null;
  }
};

/**
 * Guarda o actualiza el perfil en localStorage
 */
export const saveLocalVipProfile = (profile: VipProfile, businessId: string = RESTAURANT_ID): void => {
  if (!businessId.trim()) throw new Error('Se requiere el identificador del negocio.');
  assertVipBusiness(profile, businessId);
  try {
    localStorage.setItem(vipKey(businessId), JSON.stringify(profile));
    notifyVipChange();
  } catch (err) {
    console.error('Error saving VIP profile to localStorage:', err);
  }
};

/**
 * Registra una tarjeta VIP en la nube de Firestore (Validación Estricta: stamps=0, totalOrders=0, rewardAvailable=false)
 */
export const createCloudVipProfile = async (params: {
  customerName: string;
  phone: string;
  pin: string;
  address?: string;
  reference?: string;
  preferredPayment?: 'efectivo' | 'transferencia' | 'tarjeta';
  preferredOrderType?: OrderType;
  pendingStampsToValidate?: number;
  businessId?: string;
}): Promise<VipProfile> => {
  const normPhone = normalizePhone(params.phone);
  const normPin = normalizePin(params.pin);

  if (!params.customerName.trim()) {
    throw new Error('Por favor ingresa tu nombre completo.');
  }
  if (normPhone.length !== 10) {
    throw new Error('El teléfono debe tener exactamente 10 dígitos numéricos.');
  }
  if (normPin.length < 4) {
    throw new Error('El PIN debe tener al menos 4 dígitos.');
  }

  const businessId = params.businessId?.trim() || RESTAURANT_ID;
  if (SECURE_VIP_API) {
    const result = await vipRequest<{ profile: VipProfile; sessionToken: string }>(
      '/api/vip/register', 'POST', businessId, { ...params, businessId },
    );
    storeSession(businessId, result.sessionToken);
    saveLocalVipProfile(result.profile, businessId);
    return result.profile;
  }
  const baseDocId = await computeVipDocId(normPhone, normPin);
  const docId = businessId === RESTAURANT_ID ? baseDocId : `${businessId}_${baseDocId}`;
  const pinHash = await computePinHash(normPin, normPhone);

  // Verificar si ya existe en Firestore
  const docRef = doc(db, 'vip_profiles', docId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    // Si ya existe con este teléfono y PIN, recuperamos el perfil existente
    const existingCloudData = docSnap.data() as VipProfile;
    if (existingCloudData.restaurantId !== businessId) {
      throw new Error('Esta tarjeta VIP pertenece a otro negocio.');
    }
    const syncedProfile: VipProfile = {
      ...existingCloudData,
      id: docId,
      syncedWithCloud: true,
    };
    saveLocalVipProfile(syncedProfile, businessId);
    return syncedProfile;
  }

  const now = new Date().toISOString();
  const existingLocal = getVipProfile(businessId);
  const memberId = existingLocal?.memberId || `VIP-${Math.floor(1000 + Math.random() * 9000)}`;

  // Perfil nuevo: cumple estrictamente las reglas públicas de Firestore
  const newProfile: VipProfile = {
    id: docId,
    restaurantId: businessId,
    memberId: memberId,
    customerName: params.customerName.trim(),
    phone: normPhone,
    pinHash: pinHash,
    address: params.address?.trim() || '',
    reference: params.reference?.trim() || '',
    preferredPayment: params.preferredPayment || 'efectivo',
    preferredOrderType: params.preferredOrderType || 'pickup',
    stamps: 0, // Cumple regla pública: stamps == 0
    totalOrders: 0, // Cumple regla pública: totalOrders == 0
    rewardAvailable: false, // Cumple regla pública: rewardAvailable == false
    pendingStampsToValidate: params.pendingStampsToValidate || 0,
    syncedWithCloud: true,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(docRef, newProfile);
  saveLocalVipProfile(newProfile, businessId);
  return newProfile;
};

/**
 * Recupera una tarjeta VIP desde otro dispositivo usando Teléfono (10 dígitos) + PIN
 */
export const recoverCloudVipProfile = async (phone: string, pin: string, businessId: string = RESTAURANT_ID): Promise<VipProfile> => {
  const normPhone = normalizePhone(phone);
  const normPin = normalizePin(pin);

  if (normPhone.length !== 10) {
    throw new Error('El teléfono debe tener 10 dígitos.');
  }
  if (!normPin) {
    throw new Error('Por favor ingresa tu PIN de 4 dígitos.');
  }

  const scopedBusinessId = businessId.trim() || RESTAURANT_ID;
  if (SECURE_VIP_API) {
    const result = await vipRequest<{ profile: VipProfile; sessionToken: string }>(
      '/api/vip/recover', 'POST', scopedBusinessId, { businessId: scopedBusinessId, phone: normPhone, pin: normPin },
    );
    storeSession(scopedBusinessId, result.sessionToken);
    saveLocalVipProfile(result.profile, scopedBusinessId);
    return result.profile;
  }
  const baseDocId = await computeVipDocId(normPhone, normPin);
  const docId = scopedBusinessId === RESTAURANT_ID ? baseDocId : `${scopedBusinessId}_${baseDocId}`;
  const docRef = doc(db, 'vip_profiles', docId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('No encontramos una tarjeta VIP con este teléfono y PIN. Verifica tus datos o regístrate si es tu primera vez.');
  }

  const cloudData = docSnap.data() as VipProfile;
  if ((cloudData as VipProfile).restaurantId !== scopedBusinessId) {
    throw new Error('Esta tarjeta VIP no pertenece a este negocio.');
  }
  const recovered: VipProfile = {
    ...cloudData,
    id: docId,
    syncedWithCloud: true,
  };

  saveLocalVipProfile(recovered, scopedBusinessId);
  return recovered;
};

/**
 * Refresca los sellos y datos del perfil local consultando Firestore (lectura O(1) segura)
 */
export const refreshCloudVipProfile = async (businessId: string = RESTAURANT_ID): Promise<VipProfile | null> => {
  const local = getVipProfile(businessId);
  if (!local || !local.id) return local;

  try {
    if (SECURE_VIP_API) {
      if (!tokenFor(businessId)) return local;
      const result = await vipRequest<{ profile: VipProfile }>('/api/vip/profile', 'GET', businessId);
      saveLocalVipProfile(result.profile, businessId);
      return result.profile;
    }
    const docRef = doc(db, 'vip_profiles', local.id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const cloudData = docSnap.data() as VipProfile;
      if (cloudData.restaurantId !== businessId) {
        throw new Error('La tarjeta recuperada pertenece a otro negocio.');
      }
      const updated: VipProfile = {
        ...local,
        ...cloudData,
        id: local.id,
        syncedWithCloud: true,
      };
      saveLocalVipProfile(updated, businessId);
      return updated;
    }

    // Solo eliminamos la copia local si este perfil ya estaba sincronizado
    // con Firestore. Los perfiles locales/legacy deben conservarse y poder migrarse.
    if (local.syncedWithCloud === true) {
      clearVipProfile(businessId);
      return null;
    }

    return local;
  } catch (err) {
    console.warn('No se pudo refrescar el perfil VIP desde la nube (modo offline):', err);
  }
  return local;
};

/**
 * Actualiza únicamente los datos personales permitidos (nombre, dirección, pagos)
 * Respetando la regla de Firestore que prohíbe al cliente modificar sellos o métricas
 */
export const updatePersonalVipInfo = async (params: {
  customerName: string;
  address?: string;
  reference?: string;
  preferredPayment?: 'efectivo' | 'transferencia' | 'tarjeta';
  preferredOrderType?: OrderType;
}, businessId: string = RESTAURANT_ID): Promise<VipProfile> => {
  const existing = getVipProfile(businessId);
  if (!existing) {
    throw new Error('No se encontró un perfil VIP activo.');
  }

  const now = new Date().toISOString();
  const updatedLocal: VipProfile = {
    ...existing,
    customerName: params.customerName.trim(),
    address: params.address?.trim() || '',
    reference: params.reference?.trim() || '',
    preferredPayment: params.preferredPayment || existing.preferredPayment,
    preferredOrderType: params.preferredOrderType || existing.preferredOrderType,
    updatedAt: now,
  };

  if (SECURE_VIP_API) {
    const result = await vipRequest<{ profile: VipProfile }>('/api/vip/profile', 'PATCH', businessId, {
      businessId,
      updates: {
        customerName: updatedLocal.customerName,
        address: updatedLocal.address,
        reference: updatedLocal.reference,
        preferredPayment: updatedLocal.preferredPayment,
        preferredOrderType: updatedLocal.preferredOrderType,
      },
    });
    saveLocalVipProfile(result.profile, businessId);
    return result.profile;
  }
  saveLocalVipProfile(updatedLocal, businessId);

  // Si ya tiene ID en la nube, actualizar únicamente los campos permitidos en Firestore
  if (existing.id) {
    try {
      const docRef = doc(db, 'vip_profiles', existing.id);
      await updateDoc(docRef, {
        customerName: updatedLocal.customerName,
        address: updatedLocal.address,
        reference: updatedLocal.reference,
        preferredPayment: updatedLocal.preferredPayment,
        preferredOrderType: updatedLocal.preferredOrderType,
        updatedAt: now,
      });
    } catch (err) {
      console.error('Error al actualizar datos personales en Firestore:', err);
      throw err;
    }
  }

  return updatedLocal;
};

/**
 * Migra un perfil antiguo que residía solo en localStorage asignándole un PIN de seguridad
 * Mantiene los sellos existentes en pendingStampsToValidate para revisión administrativa segura
 */
export const migrateLocalVipProfileWithPin = async (pin: string, businessId: string = RESTAURANT_ID): Promise<VipProfile> => {
  const existing = getVipProfile(businessId);
  if (!existing) {
    throw new Error('No hay perfil local para migrar.');
  }
  if (!existing.phone || normalizePhone(existing.phone).length !== 10) {
    throw new Error('El perfil local no cuenta con un teléfono válido a 10 dígitos.');
  }

  const normPin = normalizePin(pin);
  if (normPin.length < 4) {
    throw new Error('El PIN debe tener al menos 4 dígitos.');
  }

  const pendingStamps = existing.stamps || 0;

  // La API protegida jamás debe confiar en sellos enviados por un cliente.
  // Hasta habilitar un procedimiento administrativo de validación, bloquear
  // la migración automática si hay historial para no sobrescribirlo por cero.
  if (SECURE_VIP_API && (
    pendingStamps > 0 ||
    (existing.pendingStampsToValidate || 0) > 0 ||
    (existing.totalOrders || 0) > 0 ||
    existing.rewardAvailable
  )) {
    throw new Error(
      'Tu tarjeta antigua conserva sellos o historial en este dispositivo. La migración automática está pausada para protegerlos; no borres la tarjeta. Pide al negocio que valide tus sellos antes de migrarla.',
    );
  }

  return await createCloudVipProfile({
    customerName: existing.customerName,
    phone: existing.phone,
    pin: normPin,
    address: existing.address,
    reference: existing.reference,
    preferredPayment: existing.preferredPayment,
    preferredOrderType: existing.preferredOrderType,
    pendingStampsToValidate: pendingStamps,
    businessId,
  });
};

/**
 * Guardado local simple de respaldo (compatibilidad retroactiva)
 */
/**
 * Garantiza que un perfil VIP local pueda quedar respaldado en Firestore.
 * Los perfiles que ya están sincronizados no se duplican.
 */
export const ensureVipProfileCloudSync = async (): Promise<VipProfile | null> => {
  const local = getVipProfile();
  if (!local) return null;

  if (local.syncedWithCloud === true && local.id) {
    return local;
  }

  if (!local.phone || normalizePhone(local.phone).length !== 10) {
    return local;
  }

  // El perfil legacy/local necesita un PIN para poder generar su identificador cloud.
  // No inventamos un PIN ni lo guardamos automáticamente: la migración segura
  // se realiza mediante migrateLocalVipProfileWithPin().
  return local;
};

export const saveVipProfile = (profileData: {
  customerName: string;
  phone: string;
  address?: string;
  reference?: string;
  preferredPayment?: 'efectivo' | 'transferencia' | 'tarjeta';
  preferredOrderType?: OrderType;
}): VipProfile => {
  const existing = getVipProfile();

  const updated: VipProfile = {
    ...existing,
    memberId: existing?.memberId || `VIP-${Math.floor(1000 + Math.random() * 9000)}`,
    customerName: profileData.customerName.trim(),
    phone: profileData.phone.trim(),
    address: profileData.address?.trim() || '',
    reference: profileData.reference?.trim() || '',
    preferredPayment: profileData.preferredPayment || 'efectivo',
    preferredOrderType: profileData.preferredOrderType || 'pickup',
    stamps: existing ? existing.stamps : 0,
    totalOrders: existing ? existing.totalOrders : 0,
    rewardAvailable: existing ? existing.rewardAvailable : false,
    pendingStampsToValidate: existing?.pendingStampsToValidate || 0,
    createdAt: existing?.createdAt || new Date().toLocaleDateString('es-MX'),
  };

  saveLocalVipProfile(updated);
  return updated;
};

/**
 * Modificación local de sellos tras orden (NOTA: NO automatiza en Firestore, se mantiene estrictamente local)
 */
export const addStampToVip = (orderData?: {
  customerName: string;
  phone: string;
  address?: string;
  reference?: string;
  paymentMethod?: 'efectivo' | 'transferencia' | 'tarjeta';
  orderType?: OrderType;
}): VipProfile => {
  let existing = getVipProfile();

  if (!existing && orderData && orderData.customerName) {
    existing = saveVipProfile({
      customerName: orderData.customerName,
      phone: orderData.phone || '',
      address: orderData.address || '',
      reference: orderData.reference || '',
      preferredPayment: orderData.paymentMethod || 'efectivo',
      preferredOrderType: orderData.orderType || 'pickup',
    });
  }

  if (!existing) {
    existing = {
      memberId: `VIP-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName: orderData?.customerName || 'Socio Calientito',
      phone: orderData?.phone || '',
      address: orderData?.address || '',
      reference: orderData?.reference || '',
      preferredPayment: orderData?.paymentMethod || 'efectivo',
      preferredOrderType: orderData?.orderType || 'pickup',
      stamps: 0,
      totalOrders: 0,
      rewardAvailable: false,
      createdAt: new Date().toLocaleDateString('es-MX'),
    };
  }

  let newStamps = existing.stamps + 1;
  let rewardAvailable = existing.rewardAvailable;

  const stampsRequired = getRestaurantInfo()?.vipStampsRequired || 5;
  if (newStamps >= stampsRequired) {
    newStamps = 0;
    rewardAvailable = true;
  }

  const updated: VipProfile = {
    ...existing,
    customerName: orderData?.customerName || existing.customerName,
    phone: orderData?.phone || existing.phone,
    address: orderData?.address !== undefined ? orderData.address : existing.address,
    reference: orderData?.reference !== undefined ? orderData.reference : existing.reference,
    preferredPayment: orderData?.paymentMethod || existing.preferredPayment,
    preferredOrderType: orderData?.orderType || existing.preferredOrderType,
    stamps: newStamps,
    totalOrders: existing.totalOrders + 1,
    rewardAvailable,
  };

  saveLocalVipProfile(updated);
  return updated;
};

export const redeemVipReward = (): VipProfile | null => {
  const existing = getVipProfile();
  if (!existing) return null;

  const updated: VipProfile = {
    ...existing,
    rewardAvailable: false,
  };

  saveLocalVipProfile(updated);
  return updated;
};

export const clearVipProfile = (businessId: string = RESTAURANT_ID): void => {
  if (!businessId.trim()) return;
  localStorage.removeItem(vipKey(businessId));
  try { sessionStorage.removeItem(sessionKey(businessId)); } catch { /* ignorar */ }
  notifyVipChange();
};

// -------------------------------------------------------------------
// MÉTODOS EXCLUSIVOS PARA ADMINISTRACIÓN AUTENTICADA EN FIRESTORE
// -------------------------------------------------------------------

/**
 * Consulta la lista de clientes VIP en Firestore (solo para administradores autenticados)
 */
export const adminFetchVipProfiles = async (businessId: string = RESTAURANT_ID): Promise<VipProfile[]> => {
  if (!businessId.trim()) throw new Error('Se requiere el identificador del negocio.');
  try {
    const q = query(collection(db, 'vip_profiles'), where('restaurantId', '==', businessId));
    const snap = await getDocs(q);
    const profiles: VipProfile[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as VipProfile;
      profiles.push({
        ...data,
        id: docSnap.id,
      });
    });
    return profiles;
  } catch (err) {
    console.error('Error fetching VIP profiles in admin:', err);
    throw err;
  }
};

/**
 * Elimina una tarjeta VIP desde administración.
 * Firestore es la fuente de verdad; la copia local del mismo perfil también se invalida.
 */
export const adminDeleteVipProfile = async (profileId: string, businessId: string = RESTAURANT_ID): Promise<void> => {
  if (!profileId) throw new Error('No se proporcionó el ID de la tarjeta VIP.');
  if (!businessId.trim()) throw new Error('Se requiere el identificador del negocio.');

  const docRef = doc(db, 'vip_profiles', profileId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw new Error('La tarjeta VIP ya no existe.');
  if ((snapshot.data() as VipProfile).restaurantId !== businessId) {
    throw new Error('La tarjeta VIP no pertenece a este negocio.');
  }
  await deleteDoc(docRef);

  const local = getVipProfile(businessId);
  if (local?.id === profileId) {
    clearVipProfile(businessId);
  }
};

/**
 * Actualiza campos administrativos de una tarjeta VIP (sellos, totalOrders, recompensa) en Firestore
 */
export const adminUpdateVipProfile = async (
  profileId: string,
  updates: Partial<VipProfile>,
  businessId: string = RESTAURANT_ID
): Promise<void> => {
  if (!profileId || !businessId.trim()) throw new Error('Se requiere la tarjeta y el negocio.');
  const docRef = doc(db, 'vip_profiles', profileId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw new Error('La tarjeta VIP ya no existe.');
  if ((snapshot.data() as VipProfile).restaurantId !== businessId) {
    throw new Error('La tarjeta VIP no pertenece a este negocio.');
  }
  // Impide alterar identidad, negocio, teléfono o PIN desde la edición administrativa.
  const allowedFields: Array<keyof VipProfile> = [
    'stamps', 'totalOrders', 'rewardAvailable', 'pendingStampsToValidate',
  ];
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([field]) => allowedFields.includes(field as keyof VipProfile)),
  ) as Partial<VipProfile>;
  if (Object.keys(safeUpdates).length !== Object.keys(updates).length) {
    throw new Error('No se permite modificar la identidad de una membresía.');
  }
  // Los sellos y las compras deben mantener integridad en todos los negocios,
  // aun antes de desplegar reglas mas restrictivas de Firestore.
  for (const key of ['stamps', 'totalOrders', 'pendingStampsToValidate'] as const) {
    const value = safeUpdates[key];
    if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 1000000)) {
      throw new Error('Los contadores VIP deben ser enteros no negativos.');
    }
  }
  if (safeUpdates.rewardAvailable !== undefined && typeof safeUpdates.rewardAvailable !== 'boolean') {
    throw new Error('La recompensa VIP debe ser verdadera o falsa.');
  }
  if (!Object.keys(safeUpdates).length) return;
  const dataToUpdate = {
    ...safeUpdates,
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(docRef, dataToUpdate);

  // Si el perfil que se modificó es el mismo activo en esta pantalla local, sincronizar localmente
  const local = getVipProfile(businessId);
  if (local && local.id === profileId) {
    saveLocalVipProfile({
      ...local,
      ...safeUpdates,
      updatedAt: dataToUpdate.updatedAt,
    }, businessId);
  }
};



