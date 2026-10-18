import {
  addDoc,
  collection,
  doc,
  getDoc,
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
import { getActiveRestaurantId, isCalientitoTenant } from './restaurantContext';
import { getRestaurantInfo } from './adminStorage';

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

/** Los pedidos viejos de Calientito se guardaron con folio ALO-; se muestran como CAL- (el dato guardado no se toca). */
export function normalizeLegacyOrderCode<T extends { code?: string; restaurantId?: string }>(order: T): T {
  if (order.restaurantId === 'alo-restaurante' && typeof order.code === 'string' && /^ALO-/i.test(order.code)) {
    return { ...order, code: 'CAL-' + order.code.slice(4) };
  }
  return order;
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
        const data = normalizeLegacyOrderCode(snap.data() as RestaurantOrder);
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
  const info = getRestaurantInfo();
  const activeId = getActiveRestaurantId();
  const rawPrefix = info.orderFolioPrefix || (isCalientitoTenant() || activeId === 'alo-restaurante' ? 'CAL' : activeId.slice(0, 3));
  const prefix = (rawPrefix || 'CAL').toUpperCase().trim();
  return `${prefix}-${hh}${mm}-${suffix}`;
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

/**
 * Suscripción de pedidos aislada para el espacio multinegocio.
 * A diferencia del listener histórico, recibe el tenant explícitamente y no depende
 * de un restaurantId global almacenado en el dispositivo.
 */
export function subscribeToBusinessRestaurantOrders(
  businessId: string,
  callback: RestaurantOrdersSubscriber
): () => void {
  if (!businessId.trim()) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, ORDERS_COLLECTION),
    where('restaurantId', '==', businessId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const orders = snapshot.docs.map((snap) => ({
        ...(snap.data() as RestaurantOrder),
        id: snap.id,
      }));
      orders.sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
      callback(orders);
    },
    (error) => {
      console.warn('[ordersService] business order listener error:', businessId, error);
      callback([]);
    }
  );
}

function buildBusinessOrderCode(businessId: string): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const suffix = Math.floor(100 + Math.random() * 900);
  const prefix = businessId === 'alo-restaurante'
    ? ((getRestaurantInfo().orderFolioPrefix || 'CAL').toUpperCase().trim())
    : businessId.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  return `${prefix}-${hh}${mm}-${suffix}`;
}

/** Crea un pedido para el tenant indicado; evita depender del contexto global de Calientito. */
export async function createBusinessRestaurantOrder(
  businessId: string,
  order: Omit<RestaurantOrder, 'id' | 'code' | 'restaurantId' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<RestaurantOrder> {
  if (!businessId.trim()) throw new Error('No se indicó el negocio del pedido.');

  const now = new Date().toISOString();
  const payload = sanitizeFirestorePayload({
    ...order,
    code: buildBusinessOrderCode(businessId),
    restaurantId: businessId,
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
      restaurantId: businessId,
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
    await setDoc(doc(db, PUBLIC_TABLE_ORDERS_COLLECTION, ref.id), sanitizeFirestorePayload(publicPayload))
      .catch((error) => console.warn('[ordersService] no se pudo publicar resumen de mesa del tenant:', error));
  }

  return { ...payload, id: ref.id } as RestaurantOrder;
}

/** Actualiza un pedido solo si su documento pertenece al tenant que abrió el panel. */
export async function updateBusinessRestaurantOrderStatus(
  businessId: string,
  orderId: string,
  status: RestaurantOrderStatus,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  const orderSnap = await getDoc(doc(db, ORDERS_COLLECTION, orderId));
  if (!orderSnap.exists()) throw new Error('El pedido ya no existe.');
  if ((orderSnap.data() as RestaurantOrder).restaurantId !== businessId) {
    throw new Error('Este pedido pertenece a otro negocio.');
  }
  await updateRestaurantOrderStatus(orderId, status, user);
}

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
/**
 * Cobra un pedido para llevar / domicilio / WhatsApp directamente en Caja.
 * Marca el pedido como PAGADO con su método y quién cobró; de ahí suma a Caja,
 * Resumen y Control de Turno.
 */
export async function chargeOffTableOrder(
  order: RestaurantOrder,
  method: 'efectivo' | 'tarjeta' | 'transferencia',
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  if (!order.id) throw new Error('El pedido no tiene identificador.');
  if (order.billingStatus === 'PAGADO') return;
  const now = new Date().toISOString();
  await updateDoc(doc(db, ORDERS_COLLECTION, order.id), sanitizeFirestorePayload({
    status: order.status,
    billingStatus: 'PAGADO',
    paymentMethod: method,
    paidAt: now,
    chargedById: user.id,
    chargedByName: user.name,
    updatedAt: now,
  }));
}

/** Corrige un pedido para llevar / domicilio que todavía no se cobra (productos, datos del cliente, tipo, cancelación). */
export async function updateOffTableOrderDetails(
  order: RestaurantOrder,
  patch: Partial<Pick<RestaurantOrder,
    'orderType' | 'customerName' | 'phone' | 'address' | 'addressReference' | 'paymentMethod' | 'notes' |
    'items' | 'subtotal' | 'discountAmount' | 'deliveryFee' | 'total' | 'status'>>,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  if (!order.id) throw new Error('El pedido no tiene identificador.');
  if (order.billingStatus === 'PAGADO') throw new Error('Este pedido ya está cobrado y no se puede editar.');
  const now = new Date().toISOString();
  await updateDoc(doc(db, ORDERS_COLLECTION, order.id), sanitizeFirestorePayload({
    ...patch,
    status: patch.status || order.status,
    editedById: user.id,
    editedByName: user.name,
    editedAt: now,
    updatedAt: now,
  }));
}
