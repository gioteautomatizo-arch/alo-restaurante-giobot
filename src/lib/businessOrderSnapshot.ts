import type { RestaurantOrder } from '../types';
import { mexicoDayKey } from './businessReports';

export interface BusinessOrderSnapshot {
  ordersToday: number;
  activeOrders: number;
  paidTodayCount: number;
  paidTodayTotal: number;
  pendingTodayCount: number;
  pendingTodayTotal: number;
  unpaidTotalCount: number;
  unpaidTotalAmount: number;
  deliveredUnpaidCount: number;
  deliveredUnpaidAmount: number;
  paidCancelledCount: number;
  paidMissingDateCount: number;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const amount = (order: RestaurantOrder) => {
  const total = Number(order.total);
  return Number.isFinite(total) && total >= 0 ? total : 0;
};

/**
 * Pedidos y saldos marcados en Firestore; no sustituye el cierre/conciliación de caja.
 * Cuenta pagos según paidAt para incluir pedidos capturados ayer pero cobrados hoy.
 * Sin consultas extra, válido para cualquier tenant ya filtrado por el llamador.
 */
export function summarizeBusinessOrders(
  orders: RestaurantOrder[],
  now: Date = new Date()
): BusinessOrderSnapshot {
  const today = mexicoDayKey(now);
  const valid = orders.filter((o) => o.status !== 'CANCELADO');
  const createdToday = valid.filter((o) => !!today && mexicoDayKey(o.createdAt || '') === today);
  // Una fecha de pedido no demuestra que el pago se haya recibido ese día.
  // Usar solo paidAt válido, igual que Caja y Reportes.
  const paidToday = valid.filter((o) =>
    o.billingStatus === 'PAGADO'
    && !!today
    && Number.isFinite(Date.parse(o.paidAt || ''))
    && mexicoDayKey(o.paidAt!) === today
  );
  const pendingToday = createdToday.filter((o) => o.billingStatus !== 'PAGADO');
  // Solo PENDIENTE se considera saldo por revisar. No inferir dinero realmente adeudado.
  const unpaid = valid.filter((o) => o.billingStatus === 'PENDIENTE');
  const deliveredUnpaid = unpaid.filter((o) => o.status === 'ENTREGADO');
  return {
    ordersToday: createdToday.length,
    activeOrders: valid.filter((o) => ['NUEVO', 'PREPARANDO', 'LISTO'].includes(o.status)).length,
    paidTodayCount: paidToday.length,
    paidTodayTotal: money(paidToday.reduce((sum, o) => sum + amount(o), 0)),
    pendingTodayCount: pendingToday.length,
    pendingTodayTotal: money(pendingToday.reduce((sum, o) => sum + amount(o), 0)),
    unpaidTotalCount: unpaid.length,
    unpaidTotalAmount: money(unpaid.reduce((sum, o) => sum + amount(o), 0)),
    deliveredUnpaidCount: deliveredUnpaid.length,
    deliveredUnpaidAmount: money(deliveredUnpaid.reduce((sum, o) => sum + amount(o), 0)),
    paidCancelledCount: orders.filter((o) => o.status === 'CANCELADO' && o.billingStatus === 'PAGADO').length,
    paidMissingDateCount: valid.filter((o) =>
      o.billingStatus === 'PAGADO' && !Number.isFinite(Date.parse(o.paidAt || ''))
    ).length,
  };
}
