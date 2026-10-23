/**
 * Referencias recuperables a pedidos de Venta rápida ya creados en Firestore.
 * Esto NO evita que se creen dos pedidos distintos por una pérdida de conexión:
 * solo facilita aclarar un cobro interrumpido SIN volver a cobrar.
 *
 * Se conservan únicamente ID de Firestore, tenant y fecha. No se almacenan
 * nombres, teléfonos, productos, importes ni métodos de pago.
 */
export interface QuickSaleReviewEntry {
  orderId: string;
  businessId: string;
  recordedAt: string;
}

const PREFIX = 'gioteautomatizo_quick_sale_review_v1_';
const MAX_ITEMS = 40;
const FIRESTORE_AUTO_ID = /^[A-Za-z0-9]{20}$/;

const validBusinessId = (value: string): boolean =>
  /^[A-Za-z0-9_-]{1,100}$/.test(value);

export function validQuickSaleReviewEntry(
  value: unknown, businessId: string
): value is QuickSaleReviewEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<QuickSaleReviewEntry>;
  return validBusinessId(businessId)
    && record.businessId === businessId
    && typeof record.orderId === 'string'
    && FIRESTORE_AUTO_ID.test(record.orderId)
    && typeof record.recordedAt === 'string'
    && Number.isFinite(Date.parse(record.recordedAt));
}

export function listQuickSaleReviews(businessId: string): QuickSaleReviewEntry[] {
  if (!validBusinessId(businessId) || typeof localStorage === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PREFIX + businessId) || '[]');
    if (!Array.isArray(parsed)) return [];
    const ids = new Set<string>();
    return parsed.filter((entry): entry is QuickSaleReviewEntry => {
      if (!validQuickSaleReviewEntry(entry, businessId) || ids.has(entry.orderId)) return false;
      ids.add(entry.orderId);
      return true;
    }).slice(-MAX_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Best effort: no interrumpe una venta ya guardada si Safari bloquea localStorage.
 * Devuelve false para mostrar al cajero una advertencia de control manual.
 */
export function rememberQuickSaleForReview(entry: QuickSaleReviewEntry): boolean {
  if (!validQuickSaleReviewEntry(entry, entry.businessId) || typeof localStorage === 'undefined') {
    return false;
  }
  try {
    const saved = listQuickSaleReviews(entry.businessId);
    if (saved.some((x) => x.orderId === entry.orderId)) return true;
    // No eliminamos referencias inciertas silenciosamente para hacer espacio.
    if (saved.length >= MAX_ITEMS) return false;
    localStorage.setItem(PREFIX + entry.businessId, JSON.stringify([...saved, entry]));
    return listQuickSaleReviews(entry.businessId).some((x) => x.orderId === entry.orderId);
  } catch {
    return false;
  }
}

/** Solo se usa después de confirmar un comprobante existente o recién creado. */
export function clearQuickSaleReview(businessId: string, orderId: string): boolean {
  if (!validBusinessId(businessId) || !FIRESTORE_AUTO_ID.test(orderId)
    || typeof localStorage === 'undefined') return false;
  try {
    const updated = listQuickSaleReviews(businessId).filter((x) => x.orderId !== orderId);
    localStorage.setItem(PREFIX + businessId, JSON.stringify(updated));
    return !listQuickSaleReviews(businessId).some((x) => x.orderId === orderId);
  } catch {
    return false;
  }
}
