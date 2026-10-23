import type { RestaurantOrder } from '../types';

/** Resumen sin datos personales para la campana del negocio. */
export interface BusinessOrderAlert {
  id: string;
  title: string;
  summary: string;
  at: string;
}

export function businessOrderAlert(order: RestaurantOrder): BusinessOrderAlert | null {
  if (!order.id || !order.createdAt || !Number.isFinite(Date.parse(order.createdAt))) return null;
  const code = typeof order.code === 'string' ? order.code.slice(0, 40) : 'Sin folio';
  const total = Number(order.total);
  const amount = Number.isFinite(total) && total >= 0 ? total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : 'Importe por revisar';
  return {
    id: 'order:' + order.id,
    title: 'Pedido recibido · ' + code,
    summary: (order.status === 'CANCELADO' ? 'Cancelado' : order.billingStatus === 'PAGADO' ? 'Pagado' : order.billingStatus === 'PENDIENTE' ? 'Sin cobro registrado' : 'Cobro por verificar') + ' · ' + amount,
    at: order.createdAt,
  };
}
