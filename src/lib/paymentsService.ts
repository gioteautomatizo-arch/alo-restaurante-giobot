import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  RestaurantOrder,
  StaffUser,
  TablePayment,
  TablePaymentMethod,
} from '../types';
import { sanitizeFirestorePayload } from './firestoreService';

export const TABLE_PAYMENTS_COLLECTION = 'table_payments';
export const TABLE_PAYMENTS_EVENT = 'alo_table_payments_updated';
export const RESTAURANT_ID = 'alo-restaurante' as const;

export type CheckoutPaymentMethod = TablePaymentMethod | 'MIXTO';

export interface PaymentBreakdownItem {
  method: TablePaymentMethod;
  amount: number;
}

function buildPaymentCode(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const suffix = Math.floor(100 + Math.random() * 900);
  return `P-${yyyy}${mm}${dd}-${hh}${min}-${suffix}`;
}

export function subscribeToTablePayments(
  callback: (payments: TablePayment[]) => void
): () => void {
  const q = query(
    collection(db, TABLE_PAYMENTS_COLLECTION),
    where('restaurantId', '==', RESTAURANT_ID)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const payments: TablePayment[] = [];
      snapshot.forEach((snap) => {
        payments.push({ ...(snap.data() as TablePayment), id: snap.id });
      });
      payments.sort((a, b) => {
        const aTime = Date.parse(a.createdAt || '') || 0;
        const bTime = Date.parse(b.createdAt || '') || 0;
        return bTime - aTime;
      });
      callback(payments);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(TABLE_PAYMENTS_EVENT, { detail: payments }));
      }
    },
    (error) => {
      console.warn('[paymentsService] listener error:', error);
      callback([]);
    }
  );
}

export interface SettleTableAccountInput {
  tableNumber: number;
  tableSessionId?: string;
  accountId?: string;
  accountLabel?: string;
  orders: RestaurantOrder[];
  paymentMethod: CheckoutPaymentMethod;
  paymentBreakdown?: PaymentBreakdownItem[];
  discountAmount?: number;
  tipAmount?: number;
  cashReceived?: number;
  user: Pick<StaffUser, 'id' | 'name'>;
}

function normalizePaymentBreakdown(items?: PaymentBreakdownItem[]): PaymentBreakdownItem[] {
  const allowedMethods: TablePaymentMethod[] = [
    'EFECTIVO',
    'TARJETA',
    'TRANSFERENCIA',
    'MERCADO_PAGO',
  ];
  const seen = new Set<TablePaymentMethod>();
  const normalized: PaymentBreakdownItem[] = [];

  (items || []).forEach((item) => {
    if (!allowedMethods.includes(item.method) || seen.has(item.method)) return;
    const amount = Math.round(Math.max(0, Number(item.amount || 0)) * 100) / 100;
    if (amount <= 0) return;
    seen.add(item.method);
    normalized.push({ method: item.method, amount });
  });

  return normalized;
}

export async function settleTableAccount(
  input: SettleTableAccountInput
): Promise<TablePayment> {
  const candidateOrderIds = input.orders
    .filter(
      (order) =>
        !!order.id &&
        order.orderType === 'dine_in' &&
        order.tableNumber === input.tableNumber &&
        order.status !== 'CANCELADO' &&
        order.billingStatus !== 'PAGADO'
    )
    .map((order) => order.id as string);

  if (candidateOrderIds.length === 0) {
    throw new Error('Esta mesa no tiene pedidos pendientes de cobro.');
  }

  const paymentRef = doc(collection(db, TABLE_PAYMENTS_COLLECTION));

  return runTransaction(db, async (transaction) => {
    // Releer las comandas dentro de la transacción evita cobrar dos veces si
    // dos cajas intentan cerrar la misma mesa casi al mismo tiempo.
    const freshOrders: RestaurantOrder[] = [];
    for (const orderId of candidateOrderIds) {
      const orderRef = doc(db, 'restaurant_orders', orderId);
      const snap = await transaction.get(orderRef);
      if (!snap.exists()) continue;
      const order = { ...(snap.data() as RestaurantOrder), id: snap.id };
      if (
        order.restaurantId === RESTAURANT_ID &&
        order.orderType === 'dine_in' &&
        order.tableNumber === input.tableNumber &&
        order.status !== 'CANCELADO' &&
        order.billingStatus !== 'PAGADO'
      ) {
        freshOrders.push(order);
      }
    }

    if (freshOrders.length === 0) {
      throw new Error('La cuenta ya fue cobrada o no quedan comandas pendientes.');
    }

    const subtotal = freshOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const discountAmount = Math.max(0, Math.min(Number(input.discountAmount || 0), subtotal));
    const tipAmount = Math.max(0, Number(input.tipAmount || 0));
    const total = Math.max(0, subtotal - discountAmount + tipAmount);
    const paymentBreakdown = input.paymentMethod === 'MIXTO'
      ? normalizePaymentBreakdown(input.paymentBreakdown)
      : undefined;

    if (input.paymentMethod === 'MIXTO') {
      if (!paymentBreakdown || paymentBreakdown.length < 2) {
        throw new Error('El pago mixto debe usar al menos dos métodos de pago.');
      }
      const allocatedTotal = paymentBreakdown.reduce((sum, item) => sum + item.amount, 0);
      if (Math.abs(allocatedTotal - total) > 0.01) {
        throw new Error(`El desglose del pago mixto debe sumar exactamente $${total.toFixed(2)}.`);
      }
    }

    const mixedCashAmount = paymentBreakdown?.find((item) => item.method === 'EFECTIVO')?.amount || 0;
    const cashReceived = input.paymentMethod === 'EFECTIVO'
      ? Math.max(0, Number(input.cashReceived || 0))
      : input.paymentMethod === 'MIXTO' && mixedCashAmount > 0
      ? mixedCashAmount
      : undefined;

    if (input.paymentMethod === 'EFECTIVO' && Number(cashReceived || 0) < total) {
      throw new Error('El efectivo recibido es menor al total a cobrar.');
    }

    const changeDue = input.paymentMethod === 'EFECTIVO'
      ? Math.max(0, Number(cashReceived || 0) - total)
      : 0;

    const now = new Date().toISOString();
    const payment = {
      id: paymentRef.id,
      code: buildPaymentCode(),
      restaurantId: RESTAURANT_ID,
      tableNumber: input.tableNumber,
      tableSessionId: input.tableSessionId,
      accountId: input.accountId,
      accountLabel: input.accountLabel,
      orderIds: freshOrders.map((o) => o.id as string),
      subtotal,
      discountAmount,
      tipAmount,
      total,
      paymentMethod: input.paymentMethod,
      paymentBreakdown,
      cashReceived,
      changeDue,
      status: 'PAGADO' as const,
      createdAt: now,
      chargedById: input.user.id,
      chargedByName: input.user.name,
    } as TablePayment & {
      paymentMethod: CheckoutPaymentMethod;
      paymentBreakdown?: PaymentBreakdownItem[];
    };

    transaction.set(paymentRef, sanitizeFirestorePayload(payment));
    freshOrders.forEach((order) => {
      if (!order.id) return;
      transaction.update(doc(db, 'restaurant_orders', order.id), sanitizeFirestorePayload({
        billingStatus: 'PAGADO',
        paidAt: now,
        paymentId: paymentRef.id,
        updatedAt: now,
      }));
    });

    return payment as TablePayment;
  });
}
