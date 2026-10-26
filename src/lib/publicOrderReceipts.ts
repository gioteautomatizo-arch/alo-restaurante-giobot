/** Comprobantes del cliente en esta pestaña. No consulta pedidos privados ni inventa estados de cocina. */
export interface PublicOrderReceipt {
  id: string;
  businessId: string;
  tableNumber?: number;
  guestCount?: number;
  code: string;
  sentAt: string;
  total: number;
  items: Array<{ name: string; quantity: number; totalPrice: number; customizationSummary?: string }>;
}
const TTL = 12 * 60 * 60 * 1000;
const LIMIT = 10;
export function publicReceiptKey(businessId: string, tableNumber?: number): string {
  return `gio_public_receipts_v1:${encodeURIComponent(businessId)}:${tableNumber ?? 'directo'}`;
}
export function readPublicReceipts(businessId: string, tableNumber?: number, now = Date.now()): PublicOrderReceipt[] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(publicReceiptKey(businessId, tableNumber)) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is PublicOrderReceipt => {
      if (!r || typeof r !== 'object' || r.businessId !== businessId || r.tableNumber !== tableNumber) return false;
      const age = now - Date.parse(r.sentAt);
      return typeof r.id === 'string' && typeof r.code === 'string' && r.code.length > 0
        && Number.isFinite(age) && age >= 0 && age <= TTL
        && typeof r.total === 'number' && Number.isFinite(r.total) && r.total >= 0
        && (r.guestCount === undefined || (Number.isInteger(r.guestCount) && r.guestCount >= 1 && r.guestCount <= 10))
        && Array.isArray(r.items) && r.items.length > 0 && r.items.every((item: PublicOrderReceipt['items'][number]) =>
          item && typeof item.name === 'string' && Number.isInteger(item.quantity) && item.quantity > 0
          && Number.isFinite(item.totalPrice) && item.totalPrice >= 0
          && (item.customizationSummary === undefined || typeof item.customizationSummary === 'string'));
    }).slice(0, LIMIT);
  } catch { return []; }
}
export function addPublicReceipt(current: PublicOrderReceipt[], receipt: PublicOrderReceipt): PublicOrderReceipt[] {
  const next = [receipt, ...current.filter(r => r.businessId === receipt.businessId && r.tableNumber === receipt.tableNumber && r.id !== receipt.id)].slice(0, LIMIT);
  try { sessionStorage.setItem(publicReceiptKey(receipt.businessId, receipt.tableNumber), JSON.stringify(next)); } catch { /* Conserva comprobante en memoria si el navegador bloquea almacenamiento. */ }
  return next;
}
