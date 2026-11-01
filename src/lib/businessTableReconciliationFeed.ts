/** Coordinador de diagnóstico de pagos/pedidos de mesa, SIN escrituras.
 * Firestore no ofrece una instantánea atómica entre dos queries: incluso si ambas
 * responden desde servidor, este diagnóstico NO autoriza cerrar Caja.
 * Mantener desconectado del cierre hasta revisar consistencia, permisos reales y UX.
 */
import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import type { RestaurantOrder, TablePayment } from '../types';
import { db } from './firebase';
import { ORDERS_COLLECTION } from './ordersService';
import { TABLE_PAYMENTS_COLLECTION } from './paymentsService';
import { reconcileTenantTablePayments, type TableReconciliationResult } from './tablePaymentReconciliation';

export type TableReconciliationFeedUpdate =
  | { status: 'loading'; businessId: string }
  | { status: 'error'; businessId: string; error: Error }
  | {
      status: 'diagnostic';
      businessId: string;
      reconciliation: TableReconciliationResult;
      /** Confirmadas por servidor POR SEPARADO, nunca una transacción conjunta. */
      source: 'separate-server-snapshots';
      atomic: false;
      authorizesClose: false;
    };

export function subscribeToBusinessTableReconciliation(
  businessId: string,
  shiftStartIso: string,
  shiftEndIso: string | undefined,
  onUpdate: (state: TableReconciliationFeedUpdate) => void,
  firestore: Firestore = db,
): () => void {
  if (!businessId || businessId.trim() !== businessId) {
    throw new Error('Se requiere un identificador de negocio válido.');
  }
  let active = true;
  let failed = false;
  let payments: TablePayment[] | null = null;
  let orders: RestaurantOrder[] | null = null;
  const stops: Array<() => void> = [];
  const emit = () => {
    if (!active || failed) return;
    if (!payments || !orders) {
      onUpdate({ status: 'loading', businessId });
      return;
    }
    try {
      const reconciliation = reconcileTenantTablePayments(businessId, payments, orders, shiftStartIso, shiftEndIso);
      onUpdate({
        status: 'diagnostic', businessId, reconciliation,
        source: 'separate-server-snapshots', atomic: false, authorizesClose: false,
      });
    } catch (error) {
      fail(error instanceof Error ? error : new Error('No se pudo auditar el turno.'));
    }
  };
  const fail = (error: Error) => {
    if (!active || failed) return;
    failed = true;
    payments = null;
    orders = null;
    onUpdate({ status: 'error', businessId, error });
  };
  const scoped = (collectionName: string) =>
    query(collection(firestore, collectionName), where('restaurantId', '==', businessId));

  onUpdate({ status: 'loading', businessId });
  try {
    stops.push(onSnapshot(
      scoped(TABLE_PAYMENTS_COLLECTION),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active || failed) return;
        // Una respuesta de caché o con escrituras pendientes NO acredita datos de servidor.
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          payments = null;
          emit();
          return;
        }
        const next: TablePayment[] = [];
        for (const row of snapshot.docs) {
          const data = row.data() as TablePayment;
          if (data.restaurantId !== businessId) {
            fail(new Error('La consulta de pagos devolvió un negocio diferente.'));
            return;
          }
          next.push({ ...data, id: row.id });
        }
        payments = next;
        emit();
      },
      (error) => fail(error),
    ));
    stops.push(onSnapshot(
      scoped(ORDERS_COLLECTION),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active || failed) return;
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          orders = null;
          emit();
          return;
        }
        const next: RestaurantOrder[] = [];
        for (const row of snapshot.docs) {
          const data = row.data() as RestaurantOrder;
          if (data.restaurantId !== businessId) {
            fail(new Error('La consulta de pedidos devolvió un negocio diferente.'));
            return;
          }
          next.push({ ...data, id: row.id });
        }
        orders = next;
        emit();
      },
      (error) => fail(error),
    ));
  } catch (error) {
    stops.forEach((stop) => stop());
    active = false;
    throw error;
  }
  return () => {
    active = false;
    stops.forEach((stop) => stop());
    payments = null;
    orders = null;
  };
}
