import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  RestaurantOrder,
  SaleReceipt,
  SaleReceiptOrderSnapshot,
  SaleReceiptPaymentSnapshot,
  StaffUser,
  TablePayment,
  TableSession,
} from '../types';
import { sanitizeFirestorePayload } from './firestoreService';

export const SALE_RECEIPTS_COLLECTION = 'sale_receipts';
export const RESTAURANT_ID = 'alo-restaurante' as const;

export function subscribeToSaleReceipts(
  callback: (receipts: SaleReceipt[]) => void
): () => void {
  const q = query(
    collection(db, SALE_RECEIPTS_COLLECTION),
    where('restaurantId', '==', RESTAURANT_ID)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const receipts = snapshot.docs.map((snap) => ({
        ...(snap.data() as SaleReceipt),
        id: snap.id,
      }));
      receipts.sort((a, b) => (Date.parse(b.closedAt) || 0) - (Date.parse(a.closedAt) || 0));
      callback(receipts);
    },
    (error) => {
      console.warn('[saleReceiptsService] listener error:', error);
      callback([]);
    }
  );
}

function receiptCode(tableNumber: number): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = String(now.getSeconds()).padStart(2, '0');
  return `T-${yyyy}${mm}${dd}-M${tableNumber}-${hh}${min}${sec}`;
}

function orderSnapshot(order: RestaurantOrder): SaleReceiptOrderSnapshot {
  return {
    orderId: order.id,
    code: order.code,
    orderSource: order.orderSource,
    capturedByName: order.capturedByName,
    createdAt: order.createdAt,
    items: order.items,
    total: Number(order.total || 0),
  };
}

function paymentSnapshot(payment: TablePayment): SaleReceiptPaymentSnapshot {
  return {
    paymentId: payment.id,
    code: payment.code,
    total: Number(payment.total || 0),
    discountAmount: Number(payment.discountAmount || 0),
    tipAmount: Number(payment.tipAmount || 0),
    paymentMethod: payment.paymentMethod,
    paymentBreakdown: payment.paymentBreakdown,
    createdAt: payment.createdAt,
    chargedByName: payment.chargedByName,
  };
}

export async function createFinalSaleReceipt(input: {
  tableNumber: number;
  session: TableSession;
  orders: RestaurantOrder[];
  payments: TablePayment[];
  user: Pick<StaffUser, 'id' | 'name'>;
}): Promise<SaleReceipt> {
  const sessionId = input.session.id;
  if (!sessionId) {
    throw new Error('La mesa no tiene una sesión válida para generar el ticket final.');
  }

  const existingQuery = query(
    collection(db, SALE_RECEIPTS_COLLECTION),
    where('restaurantId', '==', RESTAURANT_ID),
    where('tableSessionId', '==', sessionId)
  );
  const existing = await getDocs(existingQuery);
  if (!existing.empty) {
    const snap = existing.docs[0];
    return { ...(snap.data() as SaleReceipt), id: snap.id };
  }

  const validOrders = input.orders
    .filter((order) =>
      order.orderType === 'dine_in' &&
      order.tableNumber === input.tableNumber &&
      order.tableSessionId === sessionId &&
      order.status !== 'CANCELADO'
    )
    .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));

  const validPayments = input.payments
    .filter((payment) =>
      payment.status === 'PAGADO' &&
      payment.tableNumber === input.tableNumber &&
      payment.tableSessionId === sessionId
    )
    .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));

  const subtotal = validPayments.reduce((sum, payment) => sum + Number(payment.subtotal || 0), 0);
  const discountAmount = validPayments.reduce((sum, payment) => sum + Number(payment.discountAmount || 0), 0);
  const tipAmount = validPayments.reduce((sum, payment) => sum + Number(payment.tipAmount || 0), 0);
  const totalPaid = validPayments.reduce((sum, payment) => sum + Number(payment.total || 0), 0);
  const closedAt = new Date().toISOString();

  const receipt: SaleReceipt = {
    code: receiptCode(input.tableNumber),
    restaurantId: RESTAURANT_ID,
    tableNumber: input.tableNumber,
    tableSessionId: sessionId,
    guestCount: Number(input.session.guestCount || 0),
    waiterId: input.session.waiterId,
    waiterName: input.session.waiterName,
    openedAt: input.session.openedAt,
    closedAt,
    closedById: input.user.id,
    closedByName: input.user.name,
    orderIds: validOrders.map((order) => order.id).filter(Boolean) as string[],
    paymentIds: validPayments.map((payment) => payment.id).filter(Boolean) as string[],
    orders: validOrders.map(orderSnapshot),
    payments: validPayments.map(paymentSnapshot),
    subtotal,
    discountAmount,
    tipAmount,
    totalPaid,
    status: 'PAGADO',
  };

  const ref = doc(collection(db, SALE_RECEIPTS_COLLECTION));
  await setDoc(ref, sanitizeFirestorePayload(receipt));
  return { ...receipt, id: ref.id };
}
