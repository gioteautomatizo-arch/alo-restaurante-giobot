import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { sanitizeFirestorePayload } from './firestoreService';
import { StaffUser } from '../types';

export const PAYMENT_SETTINGS_DOC_PATH = 'daily_menu/payment_settings';
const RESTAURANT_ID = 'alo-restaurante' as const;

export interface PaymentSettings {
  restaurantId: typeof RESTAURANT_ID;
  bankName: string;
  accountHolder: string;
  clabe: string;
  accountNumber: string;
  transferInstructions: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const EMPTY_PAYMENT_SETTINGS: PaymentSettings = {
  restaurantId: RESTAURANT_ID,
  bankName: '',
  accountHolder: '',
  clabe: '',
  accountNumber: '',
  transferInstructions: 'Transfiere el total exacto de tu cuenta y después sube tu comprobante.',
};

function normalizePaymentSettings(data?: Partial<PaymentSettings> | null): PaymentSettings {
  return {
    ...EMPTY_PAYMENT_SETTINGS,
    ...(data || {}),
    restaurantId: RESTAURANT_ID,
    bankName: String(data?.bankName || '').trim(),
    accountHolder: String(data?.accountHolder || '').trim(),
    clabe: String(data?.clabe || '').replace(/\D/g, '').slice(0, 18),
    accountNumber: String(data?.accountNumber || '').replace(/\s+/g, '').slice(0, 30),
    transferInstructions: String(
      data?.transferInstructions || EMPTY_PAYMENT_SETTINGS.transferInstructions
    ).trim(),
  };
}

export function isTransferConfigured(settings: PaymentSettings): boolean {
  return Boolean(
    settings.bankName.trim() &&
    settings.accountHolder.trim() &&
    (settings.clabe.trim().length === 18 || settings.accountNumber.trim().length >= 6)
  );
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const ref = doc(db, 'daily_menu', 'payment_settings');
  const snap = await getDoc(ref);
  if (!snap.exists()) return EMPTY_PAYMENT_SETTINGS;
  return normalizePaymentSettings(snap.data() as Partial<PaymentSettings>);
}

export function subscribeToPaymentSettings(
  callback: (settings: PaymentSettings) => void
): () => void {
  const ref = doc(db, 'daily_menu', 'payment_settings');
  return onSnapshot(
    ref,
    (snap) => {
      callback(
        snap.exists()
          ? normalizePaymentSettings(snap.data() as Partial<PaymentSettings>)
          : EMPTY_PAYMENT_SETTINGS
      );
    },
    (error) => {
      console.warn('[paymentSettingsService] listener error:', error);
      callback(EMPTY_PAYMENT_SETTINGS);
    }
  );
}

export async function savePaymentSettings(
  input: Partial<PaymentSettings>,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<PaymentSettings> {
  const normalized = normalizePaymentSettings(input);

  if (!normalized.bankName) throw new Error('Ingresa el banco que recibirá las transferencias.');
  if (!normalized.accountHolder) throw new Error('Ingresa el nombre del titular de la cuenta.');
  if (!normalized.clabe && !normalized.accountNumber) {
    throw new Error('Ingresa una CLABE o número de cuenta.');
  }
  if (normalized.clabe && normalized.clabe.length !== 18) {
    throw new Error('La CLABE debe tener exactamente 18 dígitos.');
  }

  const updated: PaymentSettings = {
    ...normalized,
    updatedAt: new Date().toISOString(),
    updatedBy: user.name,
  };

  await setDoc(
    doc(db, 'daily_menu', 'payment_settings'),
    sanitizeFirestorePayload(updated),
    { merge: true }
  );

  return updated;
}
