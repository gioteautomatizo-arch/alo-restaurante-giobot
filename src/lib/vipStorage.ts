import { VipProfile, OrderType } from '../types';
import { getRestaurantInfo } from './adminStorage';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { normalizePhone, normalizePin, computeVipDocId, computePinHash } from './vipCrypto';

const VIP_KEY = 'calientito_vip_profile';
export const RESTAURANT_ID = 'alo-restaurante';

export const VIP_DATA_EVENT = 'alo_vip_data_updated';

function notifyVipChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(VIP_DATA_EVENT));
  }
}

/**
 * Lee el perfil VIP guardado en localStorage (operación instantánea local-first)
 */
export const getVipProfile = (): VipProfile | null => {
  try {
    const dataStr = localStorage.getItem(VIP_KEY);
    if (!dataStr) return null;
    return JSON.parse(dataStr) as VipProfile;
  } catch (err) {
    console.error('Error reading VIP profile from localStorage:', err);
    return null;
  }
};

/**
 * Guarda o actualiza el perfil en localStorage
 */
export const saveLocalVipProfile = (profile: VipProfile): void => {
  try {
    localStorage.setItem(VIP_KEY, JSON.stringify(profile));
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

  const docId = await computeVipDocId(normPhone, normPin);
  const pinHash = await computePinHash(normPin, normPhone);

  // Verificar si ya existe en Firestore
  const docRef = doc(db, 'vip_profiles', docId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    // Si ya existe con este teléfono y PIN, recuperamos el perfil existente
    const existingCloudData = docSnap.data() as VipProfile;
    const syncedProfile: VipProfile = {
      ...existingCloudData,
      id: docId,
      syncedWithCloud: true,
    };
    saveLocalVipProfile(syncedProfile);
    return syncedProfile;
  }

  const now = new Date().toISOString();
  const existingLocal = getVipProfile();
  const memberId = existingLocal?.memberId || `VIP-${Math.floor(1000 + Math.random() * 9000)}`;

  // Perfil nuevo: cumple estrictamente las reglas públicas de Firestore
  const newProfile: VipProfile = {
    id: docId,
    restaurantId: RESTAURANT_ID,
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
  saveLocalVipProfile(newProfile);
  return newProfile;
};

/**
 * Recupera una tarjeta VIP desde otro dispositivo usando Teléfono (10 dígitos) + PIN
 */
export const recoverCloudVipProfile = async (phone: string, pin: string): Promise<VipProfile> => {
  const normPhone = normalizePhone(phone);
  const normPin = normalizePin(pin);

  if (normPhone.length !== 10) {
    throw new Error('El teléfono debe tener 10 dígitos.');
  }
  if (!normPin) {
    throw new Error('Por favor ingresa tu PIN de 4 dígitos.');
  }

  const docId = await computeVipDocId(normPhone, normPin);
  const docRef = doc(db, 'vip_profiles', docId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('No encontramos una tarjeta VIP con este teléfono y PIN. Verifica tus datos o regístrate si es tu primera vez.');
  }

  const cloudData = docSnap.data() as VipProfile;
  const recovered: VipProfile = {
    ...cloudData,
    id: docId,
    syncedWithCloud: true,
  };

  saveLocalVipProfile(recovered);
  return recovered;
};

/**
 * Refresca los sellos y datos del perfil local consultando Firestore (lectura O(1) segura)
 */
export const refreshCloudVipProfile = async (): Promise<VipProfile | null> => {
  const local = getVipProfile();
  if (!local || !local.id) return local;

  try {
    const docRef = doc(db, 'vip_profiles', local.id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const cloudData = docSnap.data() as VipProfile;
      const updated: VipProfile = {
        ...local,
        ...cloudData,
        id: local.id,
        syncedWithCloud: true,
      };
      saveLocalVipProfile(updated);
      return updated;
    }
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
}): Promise<VipProfile> => {
  const existing = getVipProfile();
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

  saveLocalVipProfile(updatedLocal);

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
export const migrateLocalVipProfileWithPin = async (pin: string): Promise<VipProfile> => {
  const existing = getVipProfile();
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

  return await createCloudVipProfile({
    customerName: existing.customerName,
    phone: existing.phone,
    pin: normPin,
    address: existing.address,
    reference: existing.reference,
    preferredPayment: existing.preferredPayment,
    preferredOrderType: existing.preferredOrderType,
    pendingStampsToValidate: pendingStamps,
  });
};

/**
 * Guardado local simple de respaldo (compatibilidad retroactiva)
 */
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

export const clearVipProfile = (): void => {
  localStorage.removeItem(VIP_KEY);
  notifyVipChange();
};

// -------------------------------------------------------------------
// MÉTODOS EXCLUSIVOS PARA ADMINISTRACIÓN AUTENTICADA EN FIRESTORE
// -------------------------------------------------------------------

/**
 * Consulta la lista de clientes VIP en Firestore (solo para administradores autenticados)
 */
export const adminFetchVipProfiles = async (): Promise<VipProfile[]> => {
  try {
    const q = query(collection(db, 'vip_profiles'), where('restaurantId', '==', RESTAURANT_ID));
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
 * Actualiza campos administrativos de una tarjeta VIP (sellos, totalOrders, recompensa) en Firestore
 */
export const adminUpdateVipProfile = async (
  profileId: string,
  updates: Partial<VipProfile>
): Promise<void> => {
  const docRef = doc(db, 'vip_profiles', profileId);
  const dataToUpdate = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(docRef, dataToUpdate);

  // Si el perfil que se modificó es el mismo activo en esta pantalla local, sincronizar localmente
  const local = getVipProfile();
  if (local && local.id === profileId) {
    saveLocalVipProfile({
      ...local,
      ...updates,
      updatedAt: dataToUpdate.updatedAt,
    });
  }
};
