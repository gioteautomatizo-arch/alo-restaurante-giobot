import {
  collection,
  doc,
  getDoc,
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
import { getActiveRestaurantId } from './restaurantContext';

export const SALE_RECEIPTS_COLLECTION = 'sale_receipts';
export const RESTAURANT_ID = 'alo-restaurante' as const;

export function subscribeToSaleReceipts(
  callback: (receipts: SaleReceipt[]) => void
): () => void {
  const q = query(
    collection(db, SALE_RECEIPTS_COLLECTION),
    where('restaurantId', '==', getActiveRestaurantId())
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

function receiptDocumentId(session: TableSession): string {
  const stamp = Date.parse(session.openedAt || '') || Date.now();
  return `${session.id || `table-${session.tableNumber}`}-${stamp}`;
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
  waiterId?: string;
  waiterName?: string;
}): Promise<SaleReceipt> {
  const sessionId = input.session.id;
  if (!sessionId) {
    throw new Error('La mesa no tiene una sesión válida para generar el ticket final.');
  }

  const receiptRef = doc(db, SALE_RECEIPTS_COLLECTION, receiptDocumentId(input.session));
  // En Firestore, la lectura de un documento aún inexistente puede estar denegada
  // por reglas basadas en resource.data. Si eso ocurre, intentamos crear; las reglas
  // de create siguen siendo la autoridad y rechazarán cualquier escritura no autorizada.
  try {
    const existing = await getDoc(receiptRef);
    if (existing.exists()) {
      return { ...(existing.data() as SaleReceipt), id: existing.id };
    }
  } catch (readError) {
    console.warn('[saleReceiptsService] no se pudo consultar ticket previo; se intentará crear sin sobrescribir:', readError);
  }

  const openedAtMs = Date.parse(input.session.openedAt || '') || 0;

  const validOrders = input.orders
    .filter((order) =>
      order.orderType === 'dine_in' &&
      order.tableNumber === input.tableNumber &&
      order.tableSessionId === sessionId &&
      order.status !== 'CANCELADO' &&
      (Date.parse(order.createdAt || '') || 0) >= openedAtMs
    )
    .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));

  const validPayments = input.payments
    .filter((payment) =>
      payment.status === 'PAGADO' &&
      payment.tableNumber === input.tableNumber &&
      payment.tableSessionId === sessionId &&
      (Date.parse(payment.createdAt || '') || 0) >= openedAtMs
    )
    .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));

  const subtotal = validPayments.reduce((sum, payment) => sum + Number(payment.subtotal || 0), 0);
  const discountAmount = validPayments.reduce((sum, payment) => sum + Number(payment.discountAmount || 0), 0);
  const tipAmount = validPayments.reduce((sum, payment) => sum + Number(payment.tipAmount || 0), 0);
  const totalPaid = validPayments.reduce((sum, payment) => sum + Number(payment.total || 0), 0);
  const closedAt = new Date().toISOString();
  // La sesión suele tener al mesero asignado, pero sesiones antiguas o abiertas
  // desde caja pueden no conservarlo. Recuperar primero de la mesa y después
  // del primer pedido capturado por un mesero para no imprimir "Sin mesero".
  const waiterOrder = validOrders.find((order) =>
    order.orderSource === 'MESERO' && Boolean(order.capturedByName?.trim())
  );
  const waiterId = input.session.waiterId || input.waiterId;
  const waiterName = input.session.waiterName?.trim() || input.waiterName?.trim() || waiterOrder?.capturedByName?.trim();

  const receipt: SaleReceipt = {
    code: receiptCode(input.tableNumber),
    restaurantId: getActiveRestaurantId(),
    tableNumber: input.tableNumber,
    tableSessionId: sessionId,
    guestCount: Number(input.session.guestCount || 0),
    waiterId,
    waiterName,
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

  await setDoc(receiptRef, sanitizeFirestorePayload(receipt));
  return { ...receipt, id: receiptRef.id };
}

/** Crea un ticket idempotente para una venta pagada fuera de mesa (WhatsApp/mostrador). */
export async function createOffTableSaleReceipt(
  order: RestaurantOrder,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<SaleReceipt> {
  if (!order.id) throw new Error('El pedido no tiene identificador para el ticket.');
  if (order.billingStatus !== 'PAGADO') throw new Error('No se puede generar ticket para una venta que no está pagada.');
  const receiptRef = doc(db, SALE_RECEIPTS_COLLECTION, `offtable-${order.id}`);
  try {
    const existing = await getDoc(receiptRef);
    if (existing.exists()) return { ...(existing.data() as SaleReceipt), id: existing.id };
  } catch (readError) {
    console.warn('[saleReceiptsService] no se pudo consultar ticket previo de venta rápida; se intentará crear sin sobrescribir:', readError);
  }
  const paidAt = order.paidAt || order.updatedAt || new Date().toISOString();
  const total = Number(order.total || 0);
  const receipt: SaleReceipt = {
    receiptType: 'OFF_TABLE',
    code: order.code,
    restaurantId: order.restaurantId || getActiveRestaurantId(),
    tableNumber: 0,
    guestCount: 0,
    openedAt: order.createdAt,
    closedAt: paidAt,
    closedById: user.id,
    closedByName: user.name,
    orderIds: [order.id],
    paymentIds: [],
    orders: [orderSnapshot(order)],
    payments: [],
    subtotal: Number(order.subtotal ?? total),
    discountAmount: Number(order.discountAmount || 0),
    tipAmount: 0,
    totalPaid: total,
    status: 'PAGADO',
  };
  await setDoc(receiptRef, sanitizeFirestorePayload(receipt));
  return { ...receipt, id: receiptRef.id };
}

export interface MissingReceiptWork {
  sessions: Array<{ key: string; tableNumber: number; payments: TablePayment[]; orders: RestaurantOrder[] }>;
  offTable: RestaurantOrder[];
}

/**
 * Busca cobros ya registrados (pagos de mesa y ventas fuera de mesa) que no tienen ticket.
 * Solo considera mesas cuya cuenta quedó totalmente pagada.
 */
export function findMissingReceiptWork(
  payments: TablePayment[],
  orders: RestaurantOrder[],
  receipts: SaleReceipt[],
  sinceMs: number
): MissingReceiptWork {
  const receiptSessionIds = new Set(receipts.map((r) => r.tableSessionId).filter(Boolean) as string[]);
  const receiptOrderIds = new Set(receipts.flatMap((r) => r.orderIds || []));
  const byKey = new Map<string, TablePayment[]>();
  payments
    .filter((p) => p.status === 'PAGADO' && (Date.parse(p.createdAt || '') || 0) >= sinceMs)
    .forEach((p) => {
      const key = p.tableSessionId || `pago-${p.id || p.code}`;
      if (receiptSessionIds.has(key)) return;
      if ((p.orderIds || []).length > 0 && p.orderIds.every((id) => receiptOrderIds.has(id))) return;
      byKey.set(key, [...(byKey.get(key) || []), p]);
    });

  const sessions: MissingReceiptWork['sessions'] = [];
  byKey.forEach((group, key) => {
    const paymentOrderIds = new Set(group.flatMap((p) => p.orderIds || []));
    const sessionOrders = orders.filter((o) =>
      o.orderType === 'dine_in' &&
      o.status !== 'CANCELADO' &&
      (paymentOrderIds.has(o.id || '') || (group[0].tableSessionId && o.tableSessionId === group[0].tableSessionId))
    );
    // Si aún queda algo sin cobrar en esa mesa, la cuenta sigue abierta y no se genera ticket.
    if (sessionOrders.some((o) => o.billingStatus !== 'PAGADO')) return;
    sessions.push({ key, tableNumber: group[0].tableNumber, payments: group, orders: sessionOrders });
  });

  const offTable = orders.filter((o) =>
    (o.orderType === 'pickup' || o.orderType === 'delivery') &&
    o.status !== 'CANCELADO' &&
    o.billingStatus === 'PAGADO' &&
    Boolean(o.id) &&
    !receiptOrderIds.has(o.id as string) &&
    (Date.parse(o.paidAt || o.updatedAt || o.createdAt || '') || 0) >= sinceMs
  );
  return { sessions, offTable };
}

/** Crea los tickets que faltan a partir de los cobros guardados. Cada ticket usa un id fijo: no se duplica. */
export async function recoverMissingReceipts(
  work: MissingReceiptWork,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<{ created: number; failed: string[] }> {
  let created = 0;
  const failed: string[] = [];

  for (const group of work.sessions) {
    try {
      const sortedPayments = [...group.payments].sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
      const sortedOrders = [...group.orders].sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
      const lastPayment = sortedPayments[sortedPayments.length - 1];
      const waiterOrder = sortedOrders.find((o) => o.orderSource === 'MESERO' && Boolean(o.capturedByName?.trim()));
      const receipt: SaleReceipt = {
        code: receiptCode(group.tableNumber),
        restaurantId: lastPayment.restaurantId || getActiveRestaurantId(),
        tableNumber: group.tableNumber,
        tableSessionId: group.key,
        guestCount: 0,
        waiterName: waiterOrder?.capturedByName?.trim(),
        openedAt: sortedOrders[0]?.createdAt || sortedPayments[0].createdAt,
        closedAt: lastPayment.createdAt,
        closedById: lastPayment.chargedById || user.id,
        closedByName: lastPayment.chargedByName || user.name,
        orderIds: sortedOrders.map((o) => o.id).filter(Boolean) as string[],
        paymentIds: sortedPayments.map((p) => p.id).filter(Boolean) as string[],
        orders: sortedOrders.map(orderSnapshot),
        payments: sortedPayments.map(paymentSnapshot),
        subtotal: sortedPayments.reduce((s, p) => s + Number(p.subtotal || 0), 0),
        discountAmount: sortedPayments.reduce((s, p) => s + Number(p.discountAmount || 0), 0),
        tipAmount: sortedPayments.reduce((s, p) => s + Number(p.tipAmount || 0), 0),
        totalPaid: sortedPayments.reduce((s, p) => s + Number(p.total || 0), 0),
        status: 'PAGADO',
      };
      await setDoc(doc(db, SALE_RECEIPTS_COLLECTION, `recovered-${group.key}`), sanitizeFirestorePayload(receipt));
      created += 1;
    } catch (err: any) {
      failed.push(`Mesa ${group.tableNumber}: ${err?.message || 'error'}`);
    }
  }

  for (const order of work.offTable) {
    try {
      await createOffTableSaleReceipt(order, { id: (order as any).chargedById || user.id, name: (order as any).chargedByName || user.name });
      created += 1;
    } catch (err: any) {
      failed.push(`Pedido ${order.code}: ${err?.message || 'error'}`);
    }
  }
  return { created, failed };
}
