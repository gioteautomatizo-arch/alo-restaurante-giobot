import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  PublicTableOrder,
  RestaurantOrder,
  RestaurantOrderStatus,
  StaffUser,
} from '../types';
import { sanitizeFirestorePayload } from './firestoreService';
import { getActiveRestaurantId } from './restaurantContext';

export const ORDERS_COLLECTION = 'restaurant_orders';
export const PUBLIC_TABLE_ORDERS_COLLECTION = 'public_table_orders';
export const ORDERS_EVENT = 'alo_orders_updated';
export const RESTAURANT_ID = 'alo-restaurante' as const;

export type PreparationStation = 'COCINA' | 'CAFETERIA';
export type PreparationStationStatus = 'NUEVO' | 'PREPARANDO' | 'LISTO';

type StationAwareOrder = RestaurantOrder & {
  stationStatuses?: Partial<Record<PreparationStation, PreparationStationStatus>>;
};

type RestaurantOrdersSubscriber = (orders: RestaurantOrder[]) => void;

const restaurantOrdersSubscribers = new Set<RestaurantOrdersSubscriber>();
let restaurantOrdersFirestoreUnsubscribe: (() => void) | null = null;
let restaurantOrdersCache: RestaurantOrder[] = [];
let restaurantOrdersHasSnapshot = false;

function notifyRestaurantOrdersSubscribers(orders: RestaurantOrder[]) {
  restaurantOrdersCache = orders;
  restaurantOrdersHasSnapshot = true;

  [...restaurantOrdersSubscribers].forEach((subscriber) => {
    subscriber(orders);
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ORDERS_EVENT, { detail: orders }));
  }
}

function ensureRestaurantOrdersListener() {
  if (restaurantOrdersFirestoreUnsubscribe) return;

  const q = query(
    collection(db, ORDERS_COLLECTION),
    where('restaurantId', '==', getActiveRestaurantId())
  );

  restaurantOrdersFirestoreUnsubscribe = onSnapshot(
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

      notifyRestaurantOrdersSubscribers(orders);
    },
    (error) => {
      console.warn('[ordersService] listener error:', error);
      restaurantOrdersCache = [];
      restaurantOrdersHasSnapshot = true;
      [...restaurantOrdersSubscribers].forEach((subscriber) => subscriber([]));
      restaurantOrdersFirestoreUnsubscribe = null;
    }
  );
}

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
    restaurantId: getActiveRestaurantId(),
    status: 'NUEVO' as RestaurantOrderStatus,
    billingStatus: 'PENDIENTE',
    createdAt: now,
    updatedAt: now,
  }) as Omit<RestaurantOrder, 'id'>;

  const ref = await addDoc(collection(db, ORDERS_COLLECTION), payload);

  if (payload.orderType === 'dine_in' && payload.tableNumber) {
    const publicPayload: Omit<PublicTableOrder, 'id'> = {
      orderId: ref.id,
      code: payload.code,
      restaurantId: getActiveRestaurantId(),
      tableNumber: payload.tableNumber,
      tableSessionId: payload.tableSessionId,
      accountId: payload.accountId,
      accountLabel: payload.accountLabel,
      orderSource: payload.orderSource,
      items: payload.items,
      total: Number(payload.total || 0),
      status: payload.status,
      billingStatus: payload.billingStatus,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    };
    await setDoc(
      doc(db, PUBLIC_TABLE_ORDERS_COLLECTION, ref.id),
      sanitizeFirestorePayload(publicPayload)
    ).catch((error) => {
      console.warn('[ordersService] comanda creada, no se pudo publicar resumen de mesa:', error);
    });
  }

  return { ...payload, id: ref.id } as RestaurantOrder;
}

/**
 * Suscripción global compartida para el panel administrativo.
 * Todos los consumidores internos reutilizan un único onSnapshot de Firestore.
 */
export function subscribeToRestaurantOrders(
  callback: RestaurantOrdersSubscriber
): () => void {
  restaurantOrdersSubscribers.add(callback);

  if (restaurantOrdersHasSnapshot) {
    callback(restaurantOrdersCache);
  }

  ensureRestaurantOrdersListener();

  return () => {
    restaurantOrdersSubscribers.delete(callback);

    if (restaurantOrdersSubscribers.size === 0 && restaurantOrdersFirestoreUnsubscribe) {
      restaurantOrdersFirestoreUnsubscribe();
      restaurantOrdersFirestoreUnsubscribe = null;
      restaurantOrdersCache = [];
      restaurantOrdersHasSnapshot = false;
    }
  };
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
    where('restaurantId', '==', getActiveRestaurantId()),
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


export function subscribeToPublicTableOrders(
  tableNumber: number,
  callback: (orders: PublicTableOrder[]) => void
): () => void {
  if (!tableNumber || isNaN(tableNumber)) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, PUBLIC_TABLE_ORDERS_COLLECTION),
    where('restaurantId', '==', getActiveRestaurantId()),
    where('tableNumber', '==', tableNumber)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const orders: PublicTableOrder[] = [];
      snapshot.forEach((snap) => {
        orders.push({ ...(snap.data() as PublicTableOrder), id: snap.id });
      });
      orders.sort((a, b) => {
        const aTime = Date.parse(a.createdAt || '') || 0;
        const bTime = Date.parse(b.createdAt || '') || 0;
        return aTime - bTime;
      });
      callback(orders);
    },
    (error) => {
      console.warn('[ordersService] public table listener error:', error);
      callback([]);
    }
  );
}

export function getRestaurantOrderStationStatus(
  order: RestaurantOrder,
  station: PreparationStation
): PreparationStationStatus {
  const stationAware = order as StationAwareOrder;
  const explicit = stationAware.stationStatuses?.[station];
  if (explicit) return explicit;

  // En comandas nuevas, en cuanto existe stationStatuses cada estación es independiente.
  // Si una estación todavía no tiene estado explícito, debe seguir como NUEVO aunque
  // el estado global ya sea PREPARANDO porque la otra estación comenzó.
  if (stationAware.stationStatuses) return 'NUEVO';

  // Compatibilidad con comandas anteriores a la separación por estaciones.
  if (order.status === 'LISTO' || order.status === 'ENTREGADO') return 'LISTO';
  if (order.status === 'PREPARANDO') return 'PREPARANDO';
  return 'NUEVO';
}

/**
 * Avanza sólo la estación que está preparando la comanda.
 * El estado global pasa a LISTO únicamente cuando todas las estaciones requeridas
 * terminaron. Así Cocina no puede marcar por accidente como listo algo pendiente
 * de Cafetería y viceversa.
 */
export async function updateRestaurantOrderStationStatus(
  order: RestaurantOrder,
  station: PreparationStation,
  stationStatus: PreparationStationStatus,
  requiredStations: PreparationStation[],
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  if (!order.id) return;
  if (order.status === 'CANCELADO' || order.status === 'ENTREGADO') return;

  const now = new Date().toISOString();
  const stationAware = order as StationAwareOrder;
  const previousStatuses = stationAware.stationStatuses || {};
  const nextStatuses: Partial<Record<PreparationStation, PreparationStationStatus>> = {
    ...previousStatuses,
    [station]: stationStatus,
  };

  const effectiveStations = requiredStations.length > 0 ? requiredStations : [station];
  const resolveStatus = (target: PreparationStation): PreparationStationStatus => {
    const explicit = nextStatuses[target];
    if (explicit) return explicit;
    if (order.status === 'LISTO' || order.status === 'ENTREGADO') return 'LISTO';
    // En comandas viejas sin stationStatuses respetamos el estado existente.
    if (!stationAware.stationStatuses && order.status === 'PREPARANDO') return 'PREPARANDO';
    return 'NUEVO';
  };

  const allReady = effectiveStations.every((target) => resolveStatus(target) === 'LISTO');
  const anyStarted = effectiveStations.some((target) => {
    const status = resolveStatus(target);
    return status === 'PREPARANDO' || status === 'LISTO';
  });

  const globalStatus: RestaurantOrderStatus = allReady
    ? 'LISTO'
    : anyStarted
    ? 'PREPARANDO'
    : 'NUEVO';

  const patch: Record<string, unknown> = {
    stationStatuses: nextStatuses,
    status: globalStatus,
    updatedAt: now,
  };

  if (stationStatus === 'PREPARANDO') {
    patch.claimedById = user.id;
    patch.claimedByName = user.name;
  }
  if (allReady) patch.readyAt = now;

  await updateDoc(doc(db, ORDERS_COLLECTION, order.id), sanitizeFirestorePayload(patch));
  if (order.orderType === 'dine_in' && order.tableNumber) {
    await updateDoc(doc(db, PUBLIC_TABLE_ORDERS_COLLECTION, order.id), sanitizeFirestorePayload({
      status: globalStatus,
      updatedAt: now,
    })).catch(() => {});
  }
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
  await updateDoc(doc(db, PUBLIC_TABLE_ORDERS_COLLECTION, orderId), sanitizeFirestorePayload({
    status,
    updatedAt: now,
  })).catch(() => {});
}