import { VipProfile, OrderType } from '../types';

const VIP_KEY = 'calientito_vip_profile';

export const getVipProfile = (): VipProfile | null => {
  try {
    const dataStr = localStorage.getItem(VIP_KEY);
    if (!dataStr) return null;
    return JSON.parse(dataStr) as VipProfile;
  } catch (err) {
    console.error('Error reading VIP profile:', err);
    return null;
  }
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
    createdAt: existing?.createdAt || new Date().toLocaleDateString('es-MX'),
  };

  localStorage.setItem(VIP_KEY, JSON.stringify(updated));
  return updated;
};

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
    // Auto register if not registered yet!
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
    // Create dummy default profile if none exists
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

  if (newStamps >= 5) {
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

  localStorage.setItem(VIP_KEY, JSON.stringify(updated));
  return updated;
};

export const redeemVipReward = (): VipProfile | null => {
  const existing = getVipProfile();
  if (!existing) return null;

  const updated: VipProfile = {
    ...existing,
    rewardAvailable: false,
  };

  localStorage.setItem(VIP_KEY, JSON.stringify(updated));
  return updated;
};

export const clearVipProfile = (): void => {
  localStorage.removeItem(VIP_KEY);
};
