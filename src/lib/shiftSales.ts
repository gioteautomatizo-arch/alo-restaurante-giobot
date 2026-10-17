import type { SaleReceipt } from '../types';

export interface ShiftSalesTotals {
  cash: number;
  card: number;
  platforms: number; // transferencia + Mercado Pago / apps
  total: number;
  count: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Suma lo cobrado en los tickets cerrados desde que abrió el turno.
 * Usa el desglose de pago (cobros mixtos) y, si no hay, el método principal.
 */
export function computeShiftSalesFromReceipts(
  receipts: SaleReceipt[],
  shiftStartIso?: string,
  shiftEndIso?: string
): ShiftSalesTotals {
  const start = Date.parse(shiftStartIso || '') || 0;
  const end = Date.parse(shiftEndIso || '') || Infinity;
  let cash = 0;
  let card = 0;
  let platforms = 0;
  let count = 0;

  const add = (method: string, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (method === 'EFECTIVO') cash += amount;
    else if (method === 'TARJETA') card += amount;
    else platforms += amount; // TRANSFERENCIA, MERCADO_PAGO u otros
  };

  for (const receipt of receipts) {
    const closedMs = Date.parse(receipt.closedAt || '') || 0;
    if (closedMs < start || closedMs > end) continue;
    count += 1;
    for (const payment of receipt.payments || []) {
      const parts = (payment.paymentBreakdown || []).filter((p) => Number(p.amount) > 0);
      if (parts.length > 0) {
        parts.forEach((p) => add(p.method, Number(p.amount)));
      } else if (payment.paymentMethod !== 'MIXTO') {
        add(payment.paymentMethod, Number(payment.total || 0));
      }
    }
  }

  cash = round2(cash);
  card = round2(card);
  platforms = round2(platforms);
  return { cash, card, platforms, total: round2(cash + card + platforms), count };
}

/** Misma suma, pero para los pedidos de un negocio (POS, página pública y mesas). */
export function computeShiftSalesFromOrders(
  orders: Array<{ status?: string; billingStatus?: string; paymentMethod?: string; total?: number; paidAt?: string; createdAt?: string }>,
  shiftStartIso: string,
  shiftEndIso?: string,
): ShiftSalesTotals {
  const start = Date.parse(shiftStartIso) || 0;
  const end = Date.parse(shiftEndIso || '') || Infinity;
  let cash = 0;
  let card = 0;
  let platforms = 0;
  let count = 0;
  for (const o of orders) {
    if (o.status === 'CANCELADO' || o.billingStatus !== 'PAGADO') continue;
    const at = Date.parse(o.paidAt || o.createdAt || '') || 0;
    if (at < start || at > end) continue;
    const amount = Number(o.total || 0);
    if (!(amount > 0)) continue;
    count += 1;
    if (o.paymentMethod === 'efectivo') cash += amount;
    else if (o.paymentMethod === 'tarjeta') card += amount;
    else platforms += amount;
  }
  cash = round2(cash);
  card = round2(card);
  platforms = round2(platforms);
  return { cash, card, platforms, total: round2(cash + card + platforms), count };
}

/** Pedido para llevar / domicilio / WhatsApp: se cobra directo en Caja (no pasa por mesa). */
export function isOffTableOrder(order: { orderType?: string }): boolean {
  return order.orderType === 'pickup' || order.orderType === 'delivery';
}

/** Une lo cobrado en tickets de mesa con lo cobrado en pedidos para llevar/domicilio. */
export function computeShiftSalesCombined(
  receipts: SaleReceipt[],
  orders: Array<{ orderType?: string; status?: string; billingStatus?: string; paymentMethod?: string; total?: number; paidAt?: string; createdAt?: string }>,
  shiftStartIso?: string,
  shiftEndIso?: string,
): ShiftSalesTotals {
  const fromReceipts = computeShiftSalesFromReceipts(receipts, shiftStartIso, shiftEndIso);
  const off = computeShiftSalesFromOrders(orders.filter(isOffTableOrder), shiftStartIso || '', shiftEndIso);
  return {
    cash: round2(fromReceipts.cash + off.cash),
    card: round2(fromReceipts.card + off.card),
    platforms: round2(fromReceipts.platforms + off.platforms),
    total: round2(fromReceipts.total + off.total),
    count: fromReceipts.count + off.count,
  };
}

/** Total cobrado en un día (clave yyyy-mm-dd, zona México) por pedidos para llevar/domicilio. */
export function offTableSalesForDay(
  orders: Array<{ orderType?: string; status?: string; billingStatus?: string; total?: number; paidAt?: string; createdAt?: string }>,
  dayKey: string,
): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const o of orders) {
    if (!isOffTableOrder(o) || o.status === 'CANCELADO' || o.billingStatus !== 'PAGADO') continue;
    const at = o.paidAt || o.createdAt || '';
    if (!at || new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) !== dayKey) continue;
    total += Number(o.total || 0);
    count += 1;
  }
  return { total: round2(total), count };
}
