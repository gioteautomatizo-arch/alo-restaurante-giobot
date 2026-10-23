import type { RestaurantOrder } from '../types';
import { mexicoDayKey } from './businessReports';

export interface BusinessOrderSnapshot {
  ordersToday: number;
  activeOrders: number;
  paidTodayCount: number;
  paidTodayTotal: number;
  pendingTodayCount: number;
  pendingTodayTotal: number;
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
  const paidToday = valid.filter((o) =>
    o.billingStatus === 'PAGADO'
    && !!today
    && mexicoDayKey(o.paidAt || o.createdAt || '') === today
  );
  const pendingToday = createdToday.filter((o) => o.billingStatus !== 'PAGADO');
  return {
    ordersToday: createdToday.length,
    activeOrders: valid.filter((o) => ['NUEVO', 'PREPARANDO', 'LISTO'].includes(o.status)).length,
    paidTodayCount: paidToday.length,
    paidTodayTotal: money(paidToday.reduce((sum, o) => sum + amount(o), 0)),
    pendingTodayCount: pendingToday.length,
    pendingTodayTotal: money(pendingToday.reduce((sum, o) => sum + amount(o), 0)),
  };
}
