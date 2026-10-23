/**
 * Bitácora local mínima para operaciones de Venta rápida sin confirmación final.
 * Solo guarda IDs aleatorios, tenant y fecha: nunca teléfono, nombres, precios,
 * PIN ni datos bancarios. No reemplaza Firestore ni permite cobrar por sí sola.
 */
export interface PendingQuickSale {
  id: string;
  businessId: string;
  createdAt: string;
}
const PREFIX = 'gioteautomatizo_quick_sale_pending_v1_';
const MAX_PENDING = 50;
const KEY_REGEX = /^quick-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValid = (value: unknown, businessId: string): value is PendingQuickSale =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (value as PendingQuickSale).businessId === businessId
  && typeof (value as PendingQuickSale).id === 'string'
  && KEY_REGEX.test((value as PendingQuickSale).id)
  && typeof (value as PendingQuickSale).createdAt === 'string'
  && Number.isFinite(Date.parse((value as PendingQuickSale).createdAt));

export function generateQuickSaleId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Este dispositivo no puede generar un ID seguro de venta. No se inició el cobro.');
  }
  return 'quick-' + crypto.randomUUID();
}

export function listPendingQuickSales(businessId: string): PendingQuickSale[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(PREFIX + businessId) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => isValid(entry, businessId));
  } catch {
    return [];
  }
}

export function rememberPendingQuickSale(entry: PendingQuickSale): PendingQuickSale[] {
  if (!isValid(entry, entry.businessId) || typeof localStorage === 'undefined') {
    throw new Error('No se puede conservar el identificador de la venta en este navegador.');
  }
  const previous = listPendingQuickSales(entry.businessId);
  const next = previous.some((item) => item.id === entry.id)
    ? previous : [...previous, entry];
  if (next.length > MAX_PENDING) {
    throw new Error('Hay demasiadas ventas sin confirmar. Revisa los cobros antes de registrar otra.');
  }
  try {
    localStorage.setItem(PREFIX + entry.businessId, JSON.stringify(next));
    // Verificar que Safari/iPad conservó el ID antes de emitir la operación.
    if (!listPendingQuickSales(entry.businessId).some((item) => item.id === entry.id)) {
      throw new Error('No se pudo conservar la operación.');
    }
    return next;
  } catch {
    throw new Error('No pudimos guardar el control anti-duplicados en este navegador. No se inició el cobro.');
  }
}

export function forgetPendingQuickSale(businessId: string, operationId: string): PendingQuickSale[] {
  if (typeof localStorage === 'undefined') throw new Error('No está disponible el almacenamiento local.');
  const next = listPendingQuickSales(businessId).filter((item) => item.id !== operationId);
  localStorage.setItem(PREFIX + businessId, JSON.stringify(next));
  return next;
}
