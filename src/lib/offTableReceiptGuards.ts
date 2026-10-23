import type { RestaurantOrder, SaleReceipt } from '../types';

/**
 * Confirma que un comprobante previamente guardado corresponde exactamente
 * a la venta pagada que intentamos recuperar. No escribe ni cobra.
 *
 * La validación es deliberadamente estricta: ante un ticket dudoso se detiene
 * la recuperación y se deriva a revisión de Caja, nunca se sobrescribe.
 */
export function assertMatchingOffTableReceipt(
  existing: SaleReceipt,
  order: RestaurantOrder
): void {
  const amount = Number(order.total);
  const receiptAmount = Number(existing.totalPaid);
  const itemSnapshot = Array.isArray(existing.orders) && existing.orders.length === 1
    ? existing.orders[0] : null;

  const valid = typeof order.id === 'string' && order.id.length > 0
    && order.billingStatus === 'PAGADO'
    && order.status !== 'CANCELADO'
    && ['pickup', 'delivery'].includes(order.orderType)
    && Number.isFinite(amount) && amount >= 0
    && Number.isFinite(receiptAmount) && receiptAmount >= 0
    && Math.round(amount * 100) === Math.round(receiptAmount * 100)
    && existing.restaurantId === order.restaurantId
    && existing.receiptType === 'OFF_TABLE'
    && existing.status === 'PAGADO'
    && existing.code === order.code
    && existing.tableNumber === 0
    && Array.isArray(existing.orderIds)
    && existing.orderIds.length === 1
    && existing.orderIds[0] === order.id
    && !!itemSnapshot
    && itemSnapshot.orderId === order.id
    && itemSnapshot.code === order.code
    && Number.isFinite(Number(itemSnapshot.total))
    && Math.round(Number(itemSnapshot.total) * 100) === Math.round(amount * 100);
  if (!valid) {
    throw new Error('El ticket existente no coincide con esta venta. Revisar Caja sin sobrescribir.');
  }
}
