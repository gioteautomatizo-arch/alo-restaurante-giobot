import { doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import type { RestaurantOrder } from '../types';
export const MAX_BUSINESS_TABLES = 60;
export const validBusinessTable = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_BUSINESS_TABLES;
export const validTableCount = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MAX_BUSINESS_TABLES;
export function legacyTableCount(businessId: string): number {
  try { const n = Number(localStorage.getItem(`gio_table_count_${businessId}`) || 0); return validTableCount(n) ? n : 0; } catch { return 0; }
}
export function businessTableNumbers(count: number, orders: RestaurantOrder[], businessId: string): number[] {
  const numbers = new Set(Array.from({ length: validTableCount(count) ? count : 0 }, (_, i) => i + 1));
  // Reducir la configuración nunca oculta una cuenta pendiente de cobro.
  for (const order of orders) if (order.restaurantId === businessId && order.orderType === 'dine_in' && order.status !== 'CANCELADO' && order.billingStatus === 'PENDIENTE' && validBusinessTable(order.tableNumber)) numbers.add(order.tableNumber);
  return [...numbers].sort((a, b) => a - b);
}
export function subscribeBusinessTableCount(db: Firestore, businessId: string, next: (count: number | null) => void, error: (e: Error) => void) {
  return onSnapshot(doc(db, 'businesses', businessId), snapshot => {
    if (!snapshot.exists() || snapshot.data().restaurantId !== businessId) { error(new Error('No se pudo verificar la configuración del negocio.')); return; }
    const value = snapshot.data().tableCount;
    if (value !== undefined && !validTableCount(value)) { error(new Error('La configuración de mesas requiere revisión.')); return; }
    next(value === undefined ? null : value);
  }, error);
}
export async function saveBusinessTableCount(db: Firestore, businessId: string, count: number, expected: number | null) {
  if (!validTableCount(count)) throw new Error('Elige entre 0 y 60 mesas.');
  await runTransaction(db, async tx => {
    const ref = doc(db, 'businesses', businessId), snapshot = await tx.get(ref);
    if (!snapshot.exists() || snapshot.data().restaurantId !== businessId) throw new Error('No se encontró el negocio.');
    if ((snapshot.data().tableCount ?? null) !== expected) throw new Error('Otra persona cambió las mesas. Revisa la configuración antes de guardar.');
    tx.update(ref, { tableCount: count });
  });
}
