/** Auditoría SIN ESCRITURAS de la correspondencia entre pagos y pedidos de mesa.
 * Los dos arrays deben ser snapshots completos y autorizados del mismo tenant.
 * Un resultado sin incidencias NO certifica que los snapshots estén completos,
 * sincronizados con el servidor o que las reglas desplegadas sean correctas.
 * No conectar este resultado al cierre automático de Caja.
 */
import type { RestaurantOrder, TablePayment } from '../types';
import { computeShiftSalesFromPayments, isValidOrderPaymentAmount, type ShiftSalesTotals } from './shiftSales';

export type TableReconciliationIssueCode =
  | 'TENANT_AJENO' | 'ID_DUPLICADO' | 'ID_AUSENTE' | 'FECHA_INVALIDA'
  | 'PAGO_SIN_PEDIDOS' | 'REFERENCIA_DUPLICADA' | 'PEDIDO_INEXISTENTE'
  | 'PEDIDO_NO_ES_MESA' | 'PEDIDO_NO_COBRADO' | 'PEDIDO_CANCELADO'
  | 'REFERENCIA_NO_RECIPROCA' | 'PEDIDO_EN_DOS_PAGOS'
  | 'FECHA_COBRO_DISCREPANTE' | 'IMPORTE_DISCREPANTE'
  | 'METODO_O_DESGLOSE_INVALIDO' | 'PEDIDO_COBRADO_SIN_PAGO';

export interface TableReconciliationIssue {
  code: TableReconciliationIssueCode;
  paymentId?: string;
  orderId?: string;
}

export interface TableReconciliationResult {
  /** Nulo si cualquier dato impide atribuir importes con seguridad. */
  tableTotals: ShiftSalesTotals | null;
  issues: TableReconciliationIssue[];
  inspectedPayments: number;
  /** Siempre requiere validación externa antes de cerrar un turno. */
  authorizesClose: false;
}

const cents = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const scaled = Math.round(value * 100);
  return Number.isSafeInteger(scaled) && Math.abs(value * 100 - scaled) < 0.000001 ? scaled : null;
};

const validTime = (iso: unknown): number | null => {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
};

/** El tenant explícito se comprueba EN TODAS las filas, también las externas.
 * Si aparece una fila ajena, no se devuelve ningún total ni dato de ese tenant.
 */
export function reconcileTenantTablePayments(
  businessId: string,
  payments: TablePayment[],
  orders: RestaurantOrder[],
  shiftStartIso: string,
  shiftEndIso?: string,
): TableReconciliationResult {
  const issues: TableReconciliationIssue[] = [];
  const fail = (code: TableReconciliationIssueCode, paymentId?: string, orderId?: string) => {
    issues.push({ code, ...(paymentId ? { paymentId } : {}), ...(orderId ? { orderId } : {}) });
  };
  const result = (tableTotals: ShiftSalesTotals | null, inspectedPayments: number): TableReconciliationResult =>
    ({ tableTotals, issues, inspectedPayments, authorizesClose: false });

  const start = validTime(shiftStartIso);
  const end = shiftEndIso === undefined ? Infinity : validTime(shiftEndIso);
  if (!businessId || businessId.trim() !== businessId) fail('ID_AUSENTE');
  if (start === null || start <= 0 || end === null || end < start) fail('FECHA_INVALIDA');
  if (payments.some((p) => p.restaurantId !== businessId) ||
      orders.some((o) => o.restaurantId !== businessId)) fail('TENANT_AJENO');
  if (issues.length) return result(null, 0);

  const orderById = new Map<string, RestaurantOrder>();
  for (const order of orders) {
    if (!order.id) { fail('ID_AUSENTE'); continue; }
    if (orderById.has(order.id)) fail('ID_DUPLICADO', undefined, order.id);
    else orderById.set(order.id, order);
  }

  const paymentIds = new Set<string>();
  const claimedOrders = new Map<string, string>();
  const inWindow: TablePayment[] = [];
  for (const payment of payments) {
    if (payment.id && paymentIds.has(payment.id)) fail('ID_DUPLICADO', payment.id);
    if (payment.id) paymentIds.add(payment.id);
    if (payment.status === 'ANULADO') continue;
    if (payment.status !== 'PAGADO') { fail('METODO_O_DESGLOSE_INVALIDO', payment.id); continue; }
    if (!payment.id) fail('ID_AUSENTE');
    const at = validTime(payment.createdAt);
    if (at === null) { fail('FECHA_INVALIDA', payment.id); continue; }
    if (at < start! || at > end!) continue;
    inWindow.push(payment);

    if (computeShiftSalesFromPayments([payment], shiftStartIso, shiftEndIso).count !== 1) {
      fail('METODO_O_DESGLOSE_INVALIDO', payment.id);
    }
    if (!Array.isArray(payment.orderIds) || payment.orderIds.length === 0) {
      fail('PAGO_SIN_PEDIDOS', payment.id);
      continue;
    }
    const subtotal = cents(payment.subtotal);
    const discount = cents(payment.discountAmount);
    const tip = cents(payment.tipAmount);
    const total = cents(payment.total);
    if (subtotal === null || discount === null || tip === null || total === null ||
        total <= 0 || discount > subtotal || subtotal - discount + tip !== total) {
      fail('IMPORTE_DISCREPANTE', payment.id);
    }

    const seen = new Set<string>();
    let orderSum = 0;
    let sumIsValid = true;
    for (const orderId of payment.orderIds) {
      if (!orderId) { fail('ID_AUSENTE', payment.id); continue; }
      if (seen.has(orderId)) { fail('REFERENCIA_DUPLICADA', payment.id, orderId); continue; }
      seen.add(orderId);
      const otherPayment = claimedOrders.get(orderId);
      if (otherPayment && otherPayment !== payment.id) fail('PEDIDO_EN_DOS_PAGOS', payment.id, orderId);
      else claimedOrders.set(orderId, payment.id || '');
      const order = orderById.get(orderId);
      if (!order) { fail('PEDIDO_INEXISTENTE', payment.id, orderId); continue; }
      if (order.orderType !== 'dine_in') fail('PEDIDO_NO_ES_MESA', payment.id, orderId);
      if (order.status === 'CANCELADO') fail('PEDIDO_CANCELADO', payment.id, orderId);
      if (order.billingStatus !== 'PAGADO') fail('PEDIDO_NO_COBRADO', payment.id, orderId);
      if (order.paymentId !== payment.id) fail('REFERENCIA_NO_RECIPROCA', payment.id, orderId);
      const paidAt = validTime(order.paidAt);
      if (paidAt === null || paidAt !== at) fail('FECHA_COBRO_DISCREPANTE', payment.id, orderId);
      if (!isValidOrderPaymentAmount(order.total)) sumIsValid = false;
      else orderSum += Math.round(order.total * 100);
    }
    if (!sumIsValid || subtotal === null || orderSum !== subtotal) fail('IMPORTE_DISCREPANTE', payment.id);
  }

  // Un pedido de mesa marcado como PAGADO dentro del turno no puede quedar
  // fuera de los pagos observados, aunque tenga paymentId en su documento.
  for (const order of orders) {
    if (order.orderType !== 'dine_in' || order.billingStatus !== 'PAGADO') continue;
    const paidAt = validTime(order.paidAt);
    if (paidAt === null) {
      fail('FECHA_COBRO_DISCREPANTE', order.paymentId, order.id);
      continue;
    }
    if (paidAt >= start! && paidAt <= end! && (!order.id || !claimedOrders.has(order.id))) {
      fail('PEDIDO_COBRADO_SIN_PAGO', order.paymentId, order.id);
    }
  }

  return result(issues.length ? null : computeShiftSalesFromPayments(inWindow, shiftStartIso, shiftEndIso), inWindow.length);
}
