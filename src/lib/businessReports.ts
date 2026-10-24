import type { RestaurantOrder } from '../types';

/**
 * Reportes de ventas del negocio, calculados en el navegador con los pedidos que ya
 * existen. No usa IA ni consultas extra: no genera costo.
 * Las fechas se agrupan por día de Ciudad de México, igual que el resto de la app.
 */

export type ReportPeriod = 1 | 7 | 30;

export interface ReportDay {
  key: string; // yyyy-mm-dd
  label: string; // dd/mm
  total: number;
  count: number;
}

export interface ReportProduct {
  name: string;
  quantity: number;
  revenue: number;
}

export interface SalesReport {
  period: ReportPeriod;
  totalSales: number;
  orderCount: number;
  averageTicket: number;
  cancelledCount: number;
  /** Pedidos marcados como pagados sin fecha de cobro comprobable, en todo el historial consultado. */
  unreconciledPaidCount: number;
  /** Importe pagado con método no reconocido: incluido en ventas, pendiente de clasificar. */
  unclassifiedPaymentTotal: number;
  byPayment: Record<'efectivo' | 'transferencia' | 'tarjeta', number>;
  topProducts: ReportProduct[];
  days: ReportDay[];
}

const TZ = 'America/Mexico_City';

export function mexicoDayKey(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '';
  return value.toLocaleDateString('en-CA', { timeZone: TZ });
}

function shiftDayKey(key: string, deltaDays: number): string {
  const base = new Date(`${key}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

export function buildSalesReport(orders: RestaurantOrder[], period: ReportPeriod, now: Date = new Date()): SalesReport {
  const todayKey = mexicoDayKey(now);
  const dayKeys: string[] = [];
  for (let i = period - 1; i >= 0; i -= 1) dayKeys.push(shiftDayKey(todayKey, -i));

  const days = new Map<string, ReportDay>(
    dayKeys.map((key) => [key, { key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, total: 0, count: 0 }]),
  );
  const byPayment = { efectivo: 0, transferencia: 0, tarjeta: 0 };
  const products = new Map<string, ReportProduct>();
  let totalSales = 0;
  let orderCount = 0;
  let cancelledCount = 0;
  let unreconciledPaidCount = 0;
  let unclassifiedPaymentTotal = 0;

  for (const order of orders) {
    // Nunca atribuir un cobro a la fecha de creación cuando falta paidAt.
    // Puede haberse cobrado otro día: excluirlo de totales y mostrar alerta.
    if (order.status !== 'CANCELADO' && order.billingStatus === 'PAGADO' && !Number.isFinite(Date.parse(order.paidAt || ''))) {
      unreconciledPaidCount += 1;
      continue;
    }
    const key = mexicoDayKey(order.paidAt || order.createdAt || '');
    const day = days.get(key);
    if (!day) continue;

    if (order.status === 'CANCELADO') {
      cancelledCount += 1;
      continue;
    }

    if (order.billingStatus !== 'PAGADO') continue;

    const total = Number(order.total) || 0;
    totalSales += total;
    orderCount += 1;
    day.total += total;
    day.count += 1;

    if (order.paymentMethod === 'efectivo' || order.paymentMethod === 'transferencia' || order.paymentMethod === 'tarjeta') {
      byPayment[order.paymentMethod] += total;
    } else {
      // No inventar un método para pedidos históricos o registros inesperados.
      unclassifiedPaymentTotal += total;
    }

    for (const item of order.items || []) {
      const name = String(item.name || 'Producto').trim();
      const entry = products.get(item.productId || name) || { name, quantity: 0, revenue: 0 };
      entry.quantity += Number(item.quantity) || 0;
      entry.revenue += Number(item.totalPrice) || 0;
      products.set(item.productId || name, entry);
    }
  }

  const round = (value: number) => Math.round(value * 100) / 100;

  return {
    period,
    totalSales: round(totalSales),
    orderCount,
    averageTicket: orderCount ? round(totalSales / orderCount) : 0,
    cancelledCount,
    unreconciledPaidCount,
    unclassifiedPaymentTotal: round(unclassifiedPaymentTotal),
    byPayment: {
      efectivo: round(byPayment.efectivo),
      transferencia: round(byPayment.transferencia),
      tarjeta: round(byPayment.tarjeta),
    },
    topProducts: Array.from(products.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 5)
      .map((product) => ({ ...product, revenue: round(product.revenue) })),
    days: dayKeys.map((key) => days.get(key)!).map((day) => ({ ...day, total: round(day.total) })),
  };
}
