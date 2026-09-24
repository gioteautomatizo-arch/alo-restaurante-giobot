import { CartItem } from '../types';

const CART_DRAFT_TTL_MS = 3 * 60 * 1000;
const CART_DRAFT_PREFIX = 'alo_customer_cart_draft_v1';

interface CustomerCartDraft {
  savedAt: number;
  items: CartItem[];
}

export function buildCustomerCartDraftKey(tableNumber: number | null, qrSource: string | null): string {
  const context = tableNumber !== null ? `mesa-${tableNumber}` : qrSource ? `qr-${encodeURIComponent(qrSource)}` : 'directo';
  return `${CART_DRAFT_PREFIX}_${context}`;
}

export function loadCustomerCartDraft(key: string): CustomerCartDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as CustomerCartDraft;
    if (!draft || !Array.isArray(draft.items) || typeof draft.savedAt !== 'number') {
      window.localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - draft.savedAt > CART_DRAFT_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveCustomerCartDraft(key: string, items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), items }));
  } catch {
    // localStorage unavailable/full: the normal in-memory cart still works.
  }
}

export function clearCustomerCartDraft(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
