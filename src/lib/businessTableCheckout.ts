import { collection, doc, runTransaction, type Firestore } from 'firebase/firestore';
import type { RestaurantOrder } from '../types';
import { isValidOrderPaymentAmount } from './shiftSales';

import { validBusinessTable } from './businessTables';
export type BusinessTableCharge = {
  businessId: string; tableNumber: number; orders: RestaurantOrder[];
  method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'; cashReceived: number;
  user: { id: string; name: string };
};

/** Confirmación de pedidos explícitos. Pago y pedidos se guardan juntos;
 * una carrera o un cambio desde que se abrió la cuenta obliga a revisarla.
 * No cierra sesiones ni marca la mesa libre. No procesa tarjetas bancarias.
 */
export async function chargeBusinessTable(
  firestore: Firestore, input: BusinessTableCharge, currentUid: () => string | undefined,
): Promise<{ paymentId: string; total: number; changeDue: number }> {
  const { businessId, tableNumber, orders, method, user } = input;
  if (!businessId || businessId.includes('/') || businessId.trim() !== businessId
      || !validBusinessTable(tableNumber) || !user.id || user.id.includes('/')
      || !user.name.trim() || !['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].includes(method)
      || orders.length === 0 || orders.length > 100
      || orders.some(o => !o.id || o.id.includes('/'))
      || new Set(orders.map(o => o.id)).size !== orders.length) {
    throw new Error('La cuenta no es válida. Actualiza los pedidos.');
  }
  const assertSession = () => {
    if (currentUid() !== user.id) throw new Error('Cambió la sesión. Vuelve a entrar antes de cobrar.');
  };
  assertSession();
  const paymentRef = doc(collection(firestore, 'table_payments'));
  return runTransaction(firestore, async tx => {
    assertSession();
    const member = await tx.get(doc(firestore, 'businessMemberships', `${businessId}_${user.id}`));
    const membership = member.data();
    if (!membership || membership.active !== true || membership.restaurantId !== businessId
        || membership.userId !== user.id || !['OWNER', 'ADMIN', 'CASHIER'].includes(membership.role)) {
      throw new Error('Tu cuenta no tiene permiso para cobrar en este negocio.');
    }
    const freshOrders: RestaurantOrder[] = [];
    for (const expected of orders) {
      const snapshot = await tx.get(doc(firestore, 'restaurant_orders', expected.id!));
      const fresh = snapshot.data() as RestaurantOrder | undefined;
      if (!fresh || fresh.restaurantId !== businessId || expected.restaurantId !== businessId
          || fresh.orderType !== 'dine_in' || fresh.tableNumber !== tableNumber
          || fresh.status === 'CANCELADO' || fresh.billingStatus !== 'PENDIENTE'
          || fresh.paymentId || fresh.paidAt || !isValidOrderPaymentAmount(fresh.total)
          || fresh.total !== expected.total || fresh.updatedAt !== expected.updatedAt) {
        throw new Error('La cuenta cambió o contiene un pedido ya cobrado. Cierra y revisa los pedidos antes de confirmar.');
      }
      freshOrders.push({ ...fresh, id: snapshot.id });
    }
    assertSession();
    const totalCents = freshOrders.reduce((sum, o) => sum + Math.round(o.total * 100), 0);
    if (!Number.isSafeInteger(totalCents)) throw new Error('El importe no es válido.');
    const total = totalCents / 100;
    if (method === 'EFECTIVO' && (!isValidOrderPaymentAmount(input.cashReceived) || input.cashReceived < total)) {
      throw new Error('El efectivo recibido debe cubrir el total.');
    }
    const changeDue = method === 'EFECTIVO' ? (Math.round(input.cashReceived * 100) - totalCents) / 100 : 0;
    const now = new Date().toISOString();
    tx.set(paymentRef, {
      id: paymentRef.id, code: `P-${paymentRef.id.slice(0, 8).toUpperCase()}`,
      restaurantId: businessId, tableNumber, orderIds: freshOrders.map(o => o.id),
      subtotal: total, discountAmount: 0, tipAmount: 0, total, paymentMethod: method,
      cashReceived: method === 'EFECTIVO' ? input.cashReceived : 0, changeDue,
      status: 'PAGADO', createdAt: now, chargedById: user.id, chargedByName: user.name,
    });
    for (const order of freshOrders) tx.update(doc(firestore, 'restaurant_orders', order.id!), {
      billingStatus: 'PAGADO', paymentId: paymentRef.id, paidAt: now, updatedAt: now,
      paymentMethod: method.toLowerCase(), chargedById: user.id, chargedByName: user.name,
    });
    return { paymentId: paymentRef.id, total, changeDue };
  });
}
