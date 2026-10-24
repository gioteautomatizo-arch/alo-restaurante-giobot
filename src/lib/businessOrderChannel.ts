import type { RestaurantOrder } from '../types';

type OrderChannelFields = Pick<RestaurantOrder,
  'orderOrigin' | 'orderSource' | 'tableNumber' | 'orderType' | 'notes'
>;

/**
 * Etiqueta de procedencia del pedido, sin nombres ni teléfonos.
 * Los pedidos QR de mesa siguen pendientes de asignación a sesión/mesa
 * hasta que se valide ese flujo de forma independiente.
 */
export function businessOrderChannelLabel(order: OrderChannelFields): string {
  const explicitTable = Number.isInteger(order.tableNumber) && Number(order.tableNumber) > 0
    && Number(order.tableNumber) <= 999 ? order.tableNumber : undefined;
  // Compatibilidad de lectura con pedidos QR antiguos que solo guardaron "Mesa N" en notas.
  const oldTable = order.orderSource === 'CLIENTE_QR'
    ? /^Mesa ([1-9]\d{0,2})(?: ·|$)/.exec(order.notes || '')?.[1]
    : undefined;
  const table = explicitTable ?? (oldTable ? Number(oldTable) : undefined);
  if (order.orderOrigin === 'MESA_QR' || (order.orderSource === 'CLIENTE_QR' && oldTable)) {
    return table ? `QR · Mesa ${table}` : 'QR de mesa';
  }
  if (order.orderSource === 'CLIENTE_QR' || order.orderOrigin === 'QR_EXTERNO') return 'QR / enlace';
  if (order.orderSource === 'CAJA') return 'Capturado en caja';
  if (order.orderType === 'dine_in') return table ? `Mesa ${table}` : 'En sucursal';
  if (order.orderType === 'delivery') return 'Domicilio';
  return 'Para llevar';
}
