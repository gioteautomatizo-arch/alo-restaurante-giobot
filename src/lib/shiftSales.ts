import type { SaleReceipt } from '../types';

export interface ShiftSalesTotals {
  cash: number;
  card: number;
  platforms: number; // transferencia + Mercado Pago / apps
  total: number;
  count: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Solo métodos explícitos y MIXTO con desglose íntegro pueden clasificarse.
 * No completar diferencias con transferencia ni sumar un MIXTO parcial/excesivo.
 * El registro histórico se conserva para revisión; esta función nunca lo corrige.
 */
function classifiedPaymentParts(
  method: string | undefined,
  total: number | undefined,
  breakdown?: Array<{ method: string; amount: number }>,
): Array<{ method: string; amount: number }> | null {
  const cents = (value: number | undefined): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    const scaled = Math.round(value * 100);
    return Number.isSafeInteger(scaled) && Math.abs(value * 100 - scaled) < 0.000001 ? scaled : null;
  };
  const totalCents = cents(total);
  if (totalCents === null) return null;
  const known = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'];
  // Un desglose no puede convertir un método principal desconocido en cobro clasificado.
  if (method !== 'MIXTO' && !known.includes(method || '')) return null;
  if (method === 'MIXTO' || (breakdown && breakdown.length > 0)) {
    // Para un pago no MIXTO, el desglose debe coincidir con su único método.
    if (method !== 'MIXTO' && (breakdown?.length !== 1 || breakdown[0].method !== method)) return null;
    if (!breakdown || (method === 'MIXTO' && breakdown.length < 2) || breakdown.length === 0) return null;
    const seen = new Set<string>();
    let sum = 0;
    for (const part of breakdown) {
      const partCents = cents(part.amount);
      if (!known.includes(part.method) || seen.has(part.method) || partCents === null) return null;
      seen.add(part.method);
      sum += partCents;
    }
    if (sum !== totalCents) return null;
    return breakdown;
  }
  if (!method || !known.includes(method)) return null;
  return [{ method, amount: totalCents / 100 }];
}


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
    if (method === 'EFECTIVO') cash += amount;
    else if (method === 'TARJETA') card += amount;
    else if (method === 'TRANSFERENCIA') platforms += amount;
  };

  for (const receipt of receipts) {
    const closedMs = Date.parse(receipt.closedAt || '') || 0;
    if (closedMs < start || closedMs > end) continue;
    count += 1;
    for (const payment of receipt.payments || []) {
      const parts = classifiedPaymentParts(payment.paymentMethod, payment.total, payment.paymentBreakdown);
      parts?.forEach((part) => add(part.method, part.amount));
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
    // createdAt nunca prueba la fecha de cobro, incluso si paidAt falta.
    const at = Date.parse(o.paidAt || '');
    if (!Number.isFinite(at) || at < start || at > end) continue;
    const amount = Number(o.total);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (!['efectivo', 'tarjeta', 'transferencia'].includes(o.paymentMethod || '')) continue;
    count += 1;
    if (o.paymentMethod === 'efectivo') cash += amount;
    else if (o.paymentMethod === 'tarjeta') card += amount;
    else if (o.paymentMethod === 'transferencia') platforms += amount;
  }
  cash = round2(cash);
  card = round2(card);
  platforms = round2(platforms);
  return { cash, card, platforms, total: round2(cash + card + platforms), count };
}

/** Anomalías de pedidos pagados dentro del turno que no pueden clasificarse.
 * No incluye pedidos sin paidAt: ya tienen una guarda específica de fechas.
 * Solo devuelve agregados; no modifica ni atribuye métodos/importes.
 */
export function auditUnclassifiedPaidOrders(
  orders: Array<{ status?: string; billingStatus?: string; paymentMethod?: string; total?: number; paidAt?: string }>,
  shiftStartIso: string,
): { count: number; positiveAmount: number } {
  const start = Date.parse(shiftStartIso);
  if (!Number.isFinite(start)) return { count: 0, positiveAmount: 0 };
  let count = 0;
  let positiveAmount = 0;
  for (const order of orders) {
    if (order.status === 'CANCELADO' || order.billingStatus !== 'PAGADO') continue;
    const paidAt = Date.parse(order.paidAt || '');
    if (!Number.isFinite(paidAt) || paidAt < start) continue;
    const total = Number(order.total);
    if (Number.isFinite(total) && total > 0 &&
        ['efectivo', 'tarjeta', 'transferencia'].includes(order.paymentMethod || '')) continue;
    count += 1;
    if (Number.isFinite(total) && total > 0) positiveAmount += total;
  }
  return { count, positiveAmount: round2(positiveAmount) };
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
    const at = Date.parse(o.paidAt || '');
    if (!Number.isFinite(at) || new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) !== dayKey) continue;
    total += Number(o.total || 0);
    count += 1;
  }
  return { total: round2(total), count };
}

/** Inicio efectivo del turno: si hubo cobros antes de abrir el primer turno del día, se cuentan en ese turno. */
export function effectiveShiftStart(
  shiftStartIso: string,
  otherShiftStartsIso: string[],
): string {
  const start = Date.parse(shiftStartIso) || 0;
  if (!start) return shiftStartIso;
  const dayKey = new Date(start).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const dayStart = Date.parse(`${dayKey}T00:00:00-06:00`);
  if (!dayStart || dayStart >= start) return shiftStartIso;
  const earlierToday = otherShiftStartsIso.some((iso) => {
    const t = Date.parse(iso) || 0;
    return t >= dayStart && t < start;
  });
  return earlierToday ? shiftStartIso : new Date(dayStart).toISOString();
}

type PaymentLike = {
  status?: string;
  total?: number;
  createdAt?: string;
  paymentMethod?: string;
  paymentBreakdown?: Array<{ method: string; amount: number }>;
};

/** Suma lo cobrado en mesas (cada pago registrado en Caja) dentro de la ventana del turno. */
export function computeShiftSalesFromPayments(
  payments: PaymentLike[],
  shiftStartIso?: string,
  shiftEndIso?: string,
): ShiftSalesTotals {
  const start = Date.parse(shiftStartIso || '') || 0;
  const end = Date.parse(shiftEndIso || '') || Infinity;
  let cash = 0;
  let card = 0;
  let platforms = 0;
  let count = 0;
  const add = (method: string, amount: number) => {
    if (method === 'EFECTIVO') cash += amount;
    else if (method === 'TARJETA') card += amount;
    else if (method === 'TRANSFERENCIA') platforms += amount;
  };
  for (const p of payments) {
    if (p.status && p.status !== 'PAGADO') continue;
    const at = Date.parse(p.createdAt || '') || 0;
    if (at < start || at > end) continue;
    count += 1;
    const parts = classifiedPaymentParts(p.paymentMethod, p.total, p.paymentBreakdown);
    parts?.forEach((part) => add(part.method, part.amount));
  }
  cash = round2(cash);
  card = round2(card);
  platforms = round2(platforms);
  return { cash, card, platforms, total: round2(cash + card + platforms), count };
}

/** Ventas del turno = pagos de mesa + pedidos para llevar/domicilio cobrados. */
export function computeShiftSalesAll(
  payments: PaymentLike[],
  orders: Array<{ orderType?: string; status?: string; billingStatus?: string; paymentMethod?: string; total?: number; paidAt?: string; createdAt?: string }>,
  shiftStartIso?: string,
  shiftEndIso?: string,
): ShiftSalesTotals {
  const a = computeShiftSalesFromPayments(payments, shiftStartIso, shiftEndIso);
  const b = computeShiftSalesFromOrders(orders.filter(isOffTableOrder), shiftStartIso || '', shiftEndIso);
  return {
    cash: round2(a.cash + b.cash),
    card: round2(a.card + b.card),
    platforms: round2(a.platforms + b.platforms),
    total: round2(a.total + b.total),
    count: a.count + b.count,
  };
}

/** Total cobrado en mesas durante un día (clave yyyy-mm-dd, zona México). */
export function paymentsSalesForDay(payments: PaymentLike[], dayKey: string): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const p of payments) {
    if ((p.status && p.status !== 'PAGADO') || !p.createdAt) continue;
    if (new Date(p.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) !== dayKey) continue;
    const parts = classifiedPaymentParts(p.paymentMethod, p.total, p.paymentBreakdown);
    if (!parts) continue;
    total += Number(p.total);
    count += 1;
  }
  return { total: round2(total), count };
}
