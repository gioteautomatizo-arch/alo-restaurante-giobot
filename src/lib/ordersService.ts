import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  RestaurantOrder,
  RestaurantOrderStatus,
  StaffUser,
} from '../types';
import { sanitizeFirestorePayload } from './firestoreService';

export const ORDERS_COLLECTION = 'restaurant_orders';
export const ORDERS_EVENT = 'alo_orders_updated';
export const RESTAURANT_ID = 'alo-restaurante' as const;

function buildOrderCode(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const suffix = Math.floor(100 + Math.random() * 900);
  return `ALO-${hh}${mm}-${suffix}`;
}

export async function createRestaurantOrder(
  order: Omit<RestaurantOrder, 'id' | 'code' | 'restaurantId' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<RestaurantOrder> {
  const now = new Date().toISOString();
  const payload = sanitizeFirestorePayload({
    ...order,
    code: buildOrderCode(),
    restaurantId: RESTAURANT_ID,
    status: 'NUEVO' as RestaurantOrderStatus,
    billingStatus: 'PENDIENTE',
    createdAt: now,
    updatedAt: now,
  }) as Omit<RestaurantOrder, 'id'>;

  const ref = await addDoc(collection(db, ORDERS_COLLECTION), payload);
  return { ...payload, id: ref.id } as RestaurantOrder;
}

export function subscribeToRestaurantOrders(
  callback: (orders: RestaurantOrder[]) => void
): () => void {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    where('restaurantId', '==', RESTAURANT_ID)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const orders: RestaurantOrder[] = [];
      snapshot.forEach((snap) => {
        const data = snap.data() as RestaurantOrder;
        orders.push({ ...data, id: snap.id });
      });

      orders.sort((a, b) => {
        const aTime = Date.parse(a.createdAt || '') || 0;
        const bTime = Date.parse(b.createdAt || '') || 0;
        return bTime - aTime;
      });
      callback(orders);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ORDERS_EVENT, { detail: orders }));
      }
    },
    (error) => {
      console.warn('[ordersService] listener error:', error);
      callback([]);
    }
  );
}

/**
 * Suscripción en tiempo real filtrada exclusivamente para una mesa específica.
 * Consulta Firestore limitando por restaurantId y tableNumber.
 * Un comensal de Mesa 1 no descarga ni procesa comandas de otras mesas.
 */
export function subscribeToTableOrders(
  tableNumber: number,
  callback: (orders: RestaurantOrder[]) => void
): () => void {
  if (!tableNumber || isNaN(tableNumber)) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, ORDERS_COLLECTION),
    where('restaurantId', '==', RESTAURANT_ID),
    where('tableNumber', '==', tableNumber)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const orders: RestaurantOrder[] = [];
      snapshot.forEach((snap) => {
        const data = snap.data() as RestaurantOrder;
        orders.push({ ...data, id: snap.id });
      });

      orders.sort((a, b) => {
        const aTime = Date.parse(a.createdAt || '') || 0;
        const bTime = Date.parse(b.createdAt || '') || 0;
        return bTime - aTime;
      });

      callback(orders);
    },
    (error) => {
      console.warn(`[ordersService] listener error para mesa ${tableNumber}:`, error);
      callback([]);
    }
  );
}

export async function updateRestaurantOrderStatus(
  orderId: string,
  status: RestaurantOrderStatus,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    updatedAt: now,
  };

  if (status === 'PREPARANDO') {
    patch.claimedById = user.id;
    patch.claimedByName = user.name;
  }
  if (status === 'LISTO') patch.readyAt = now;
  if (status === 'ENTREGADO') patch.deliveredAt = now;
  if (status === 'CANCELADO') {
    patch.cancelledAt = now;
    patch.cancelledBy = user.name;
  }

  await updateDoc(doc(db, ORDERS_COLLECTION, orderId), sanitizeFirestorePayload(patch));
}
