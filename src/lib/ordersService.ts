import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  runTransaction,
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
  callback: RestaurantOrdersSubscriber,
  onError?: (error: Error) => void
): () => void {
  if (!businessId.trim()) {
    if (onError) onError(new Error('Falta identificar el negocio.'));
    else callback([]);
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
      // En Caja no debemos convertir un fallo de permisos/conexión en ventas = 0.
      if (onError) onError(error);
      else callback([]); // compatibilidad con consumidores que no manejan errores
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
  order: Omit<RestaurantOrder, 'id' | 'code' | 'restaurantId' | 'status' | 'createdAt' | 'updatedAt'>,
  orderDocumentId?: string,
): Promise<RestaurantOrder> {
  if (!businessId.trim()) throw new Error('No se indicó el negocio del pedido.');
  // IDs estables únicamente para intentos web; no cambiar el flujo de Caja/POS.
  if (orderDocumentId !== undefined && !/^web_[0-9a-f]{32}$/.test(orderDocumentId)) {
    throw new Error('Identificador de intento web inválido.');
  }

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

  // Calientito heredado tiene reglas de update más amplias para usuarios internos:
  // no usar setDoc estable allí hasta revisar su contrato, pues podría sobrescribir.
  const stableWebId = orderDocumentId !== undefined && businessId !== 'alo-restaurante';
  const ref = stableWebId
    ? doc(db, ORDERS_COLLECTION, orderDocumentId!)
    : await addDoc(collection(db, ORDERS_COLLECTION), payload);
  // En los otros tenants, reintentar el mismo ID no crea otro documento;
  // las reglas de update deniegan reemplazar un pedido web existente.
  if (stableWebId) await setDoc(ref, payload);

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

/**
 * Transición atómica de pedidos del módulo multinegocio.
 * La pertenencia y el estado se comprueban en la misma transacción que escribe:
 * dos operadores con pantallas antiguas no pueden retroceder una comanda.
 * Calientito conserva el flujo heredado hasta revisar su contrato de reglas.
 */
export async function updateBusinessRestaurantOrderStatus(
  businessId: string,
  orderId: string,
  status: RestaurantOrderStatus,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  if (!businessId.trim() || !orderId.trim()) throw new Error('Falta identificar el negocio o el pedido.');
  const ref = doc(db, ORDERS_COLLECTION, orderId);
  if (businessId === 'alo-restaurante') {
    const legacySnap = await getDoc(ref);
    if (!legacySnap.exists()) throw new Error('El pedido ya no existe.');
    if ((legacySnap.data() as RestaurantOrder).restaurantId !== businessId) {
      throw new Error('Este pedido pertenece a otro negocio.');
    }
    await updateRestaurantOrderStatus(orderId, status, user);
    return;
  }

  const next: Partial<Record<RestaurantOrderStatus, RestaurantOrderStatus>> = {
    NUEVO: 'PREPARANDO',
    PREPARANDO: 'LISTO',
    LISTO: 'ENTREGADO',
  };
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updatedAt: now };
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

  const changed = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('El pedido ya no existe.');
    const current = snap.data() as RestaurantOrder;
    if (current.restaurantId !== businessId) throw new Error('Este pedido pertenece a otro negocio.');
    const retry = current.status === status;
    if (!retry && status === 'CANCELADO') {
      if (!['NUEVO', 'PREPARANDO', 'LISTO'].includes(current.status)) {
        throw new Error('El pedido ya fue entregado o cancelado; no puede cancelarse desde esta pantalla.');
      }
      if (current.billingStatus !== 'PENDIENTE') {
        throw new Error('El pedido tiene un cobro registrado o desconocido. Revisa Caja antes de cancelarlo.');
      }
    } else if (!retry && next[current.status] !== status) {
      throw new Error('El estado del pedido cambió en otro dispositivo. Actualiza la lista antes de continuar.');
    }

    // La lectura del espejo ocurre antes de cualquier escritura: Firestore confirma
    // pedido y resumen juntos, o revierte ambos. Nunca tocar un espejo de otro tenant.
    let missingMirror = false;
    if (current.orderType === 'dine_in' && current.tableNumber) {
      const mirrorRef = doc(db, PUBLIC_TABLE_ORDERS_COLLECTION, orderId);
      const mirrorSnap = await transaction.get(mirrorRef);
      if (!mirrorSnap.exists()) {
        // Algunos pedidos históricos fueron creados antes de la sincronización.
        // No detener cocina por un espejo ausente; dejar advertencia verificable.
        missingMirror = true;
      } else {
        const mirror = mirrorSnap.data() as PublicTableOrder;
        if (mirror.restaurantId !== businessId || mirror.orderId !== orderId
          || mirror.tableNumber !== current.tableNumber || mirror.code !== current.code) {
          throw new Error('El resumen de mesa no coincide con el pedido. Revisa la mesa antes de continuar.');
        }
        const effectiveUpdatedAt = retry ? current.updatedAt : now;
        // Un reintento de estado ya confirmado también repara un espejo rezagado
        // sin reescribir fechas del pedido principal.
        if (mirror.status !== status || mirror.updatedAt !== effectiveUpdatedAt) {
          transaction.update(mirrorRef, sanitizeFirestorePayload({
            status, updatedAt: effectiveUpdatedAt,
          }));
        }
      }
    }
    if (!retry) transaction.update(ref, sanitizeFirestorePayload(patch));
    return { missingMirror };
  });

  if (changed.missingMirror) {
    console.warn('[ordersService] PENDIENTE: falta resumen público de mesa para pedido', orderId,
      'del negocio', businessId, '; requiere reconciliación autorizada.');
  }
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
export interface OffTableChargeResult {
  order: RestaurantOrder;
  /** true significa que se encontró un pago anterior; NO se hizo otro cobro. */
  alreadyPaid: boolean;
}

/**
 * Idempotencia de cobro por ID de pedido. Una transacción vuelve a leer el
 * registro de Firestore y modifica PENDIENTE -> PAGADO una sola vez, incluso
 * si dos dispositivos lo intentan simultáneamente.
 *
 * No evita dos pedidos diferentes creados accidentalmente; para esa protección
 * hace falta un identificador estable al crear el pedido.
 */
export async function chargeOffTableOrder(
  order: RestaurantOrder,
  method: 'efectivo' | 'tarjeta' | 'transferencia',
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<OffTableChargeResult> {
  if (!order.id) throw new Error('El pedido no tiene identificador.');
  const restaurantId = getActiveRestaurantId();
  const ref = doc(db, ORDERS_COLLECTION, order.id);
  return runTransaction(db, async (transaction) => {
    const freshSnap = await transaction.get(ref);
    if (!freshSnap.exists()) throw new Error('No existe el pedido. Revisa Caja antes de repetir la operación.');
    const fresh = { ...(freshSnap.data() as RestaurantOrder), id: freshSnap.id };
    if (fresh.restaurantId !== restaurantId ||
        (order.restaurantId && order.restaurantId !== fresh.restaurantId)) {
      throw new Error('El pedido pertenece a otro negocio.');
    }
    if (!['pickup', 'delivery'].includes(fresh.orderType) || fresh.status === 'CANCELADO') {
      throw new Error('El pedido no es una venta válida de mostrador o domicilio.');
    }
    if (fresh.billingStatus === 'PAGADO') return { order: fresh, alreadyPaid: true };
    if (fresh.billingStatus !== 'PENDIENTE') {
      throw new Error('Estado de cobro desconocido. Revisa el pedido antes de continuar.');
    }
    const now = new Date().toISOString();
    const patch = {
      status: fresh.status,
      billingStatus: 'PAGADO' as const,
      paymentMethod: method,
      paidAt: now,
      chargedById: user.id,
      chargedByName: user.name,
      updatedAt: now,
    };
    transaction.update(ref, sanitizeFirestorePayload(patch));
    return { order: { ...fresh, ...patch }, alreadyPaid: false };
  });
}

/**
 * Corrige pedidos para llevar/domicilio solo mientras siguen pendientes.
 * La comprobación de cobro, tenant y versión ocurre dentro de la transacción:
 * no permite que una edición abierta antes de cobrar altere el pedido cobrado.
 * La autorización final sigue dependiendo de las reglas Firestore vigentes.
 */
export async function updateOffTableOrderDetails(
  order: RestaurantOrder,
  patch: Partial<Pick<RestaurantOrder,
    'orderType' | 'customerName' | 'phone' | 'address' | 'addressReference' | 'paymentMethod' | 'notes' |
    'items' | 'subtotal' | 'discountAmount' | 'deliveryFee' | 'total' | 'status'>>,
  user: Pick<StaffUser, 'id' | 'name'>
): Promise<void> {
  if (!order.id) throw new Error('El pedido no tiene identificador.');
  if (patch.status && patch.status !== 'CANCELADO') {
    throw new Error('Solo se permite cancelar el pedido desde este formulario.');
  }
  const restaurantId = getActiveRestaurantId();
  if (!restaurantId) throw new Error('No hay un negocio activo. Actualiza la pantalla.');
  const ref = doc(db, ORDERS_COLLECTION, order.id);
  await runTransaction(db, async (transaction) => {
    const freshSnap = await transaction.get(ref);
    if (!freshSnap.exists()) throw new Error('El pedido ya no existe.');
    const fresh = freshSnap.data() as RestaurantOrder;
    if (getActiveRestaurantId() !== restaurantId) {
      throw new Error('Cambió la sesión del negocio. Actualiza la pantalla antes de editar.');
    }
    if (fresh.restaurantId !== restaurantId || (order.restaurantId && fresh.restaurantId !== order.restaurantId)) {
      throw new Error('El pedido pertenece a otro negocio.');
    }
    if (!['pickup', 'delivery'].includes(fresh.orderType)) {
      throw new Error('Los pedidos de mesa no se editan desde este formulario.');
    }
    if (fresh.billingStatus !== 'PENDIENTE') {
      throw new Error('El pedido tiene un cobro registrado o desconocido. Revisa Caja antes de editar o cancelar.');
    }
    if (fresh.status === 'CANCELADO' || fresh.status === 'ENTREGADO') {
      throw new Error('Este pedido ya fue cancelado o entregado. Actualiza la pantalla.');
    }
    // La interfaz puede llevar minutos abierta. No reemplazar un cambio posterior
    // de otro empleado, ni siquiera si el pedido todavía no está cobrado.
    if ((order.updatedAt && fresh.updatedAt !== order.updatedAt)
      || (order.status && fresh.status !== order.status)
      || (order.orderType && fresh.orderType !== order.orderType)) {
      throw new Error('El pedido cambió en otro dispositivo. Actualiza la lista antes de editar.');
    }
    const now = new Date().toISOString();
    transaction.update(ref, sanitizeFirestorePayload({
      ...patch,
      status: patch.status || fresh.status,
      ...(patch.status === 'CANCELADO' ? {
        cancelledAt: now,
        cancelledBy: user.name,
        cancelledById: user.id,
      } : {}),
      editedById: user.id,
      editedByName: user.name,
      editedAt: now,
      updatedAt: now,
    }));
  });
}
