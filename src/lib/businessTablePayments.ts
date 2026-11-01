/** Lectura de pagos de mesa por tenant. NO realiza cobros ni modifica documentos.
 * No usar el listener legado basado en getActiveRestaurantId() para una vista
 * multinegocio: al cambiar de negocio, su contexto global puede quedar obsoleto.
 * Un error de permisos no equivale a una lista vacía de pagos.
 */
import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import type { TablePayment } from '../types';
import { db } from './firebase';
import { TABLE_PAYMENTS_COLLECTION } from './paymentsService';

export function subscribeToBusinessTablePayments(
  businessId: string,
  onData: (payments: TablePayment[]) => void,
  onError: (error: Error) => void,
  firestore: Firestore = db,
): () => void {
  if (!businessId || businessId.trim() !== businessId) {
    throw new Error('Se requiere un identificador de negocio válido para consultar pagos.');
  }
  const scopedQuery = query(
    collection(firestore, TABLE_PAYMENTS_COLLECTION),
    where('restaurantId', '==', businessId),
  );
  return onSnapshot(
    scopedQuery,
    (snapshot) => {
      const payments: TablePayment[] = [];
      for (const row of snapshot.docs) {
        const data = row.data() as TablePayment;
        // Defensa adicional: nunca entregar datos ajenos ni un corte parcial.
        if (data.restaurantId !== businessId) {
          onError(new Error('La respuesta de pagos contiene un negocio diferente.'));
          return;
        }
        payments.push({ ...data, id: row.id });
      }
      payments.sort((a, b) =>
        (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0),
      );
      onData(payments);
    },
    (error) => onError(error),
  );
}
