/** Guardrails de lectura para el corte de caja multinegocio. Sin Firebase ni escrituras. */
export const SHIFT_FEED_NAMES = ['shifts', 'orders', 'expenses', 'vault'] as const;
export type ShiftFeedName = typeof SHIFT_FEED_NAMES[number];
export type ShiftFeedStatus = 'loading' | 'ready' | 'error';
export type ShiftFeedState = { businessId: string; status: ShiftFeedStatus };
export type ShiftFeedStates = Record<ShiftFeedName, ShiftFeedState>;

export function initialShiftFeedStates(businessId: string): ShiftFeedStates {
  return {
    shifts: { businessId, status: 'loading' },
    orders: { businessId, status: 'loading' },
    expenses: { businessId, status: 'loading' },
    vault: { businessId, status: 'loading' },
  };
}

export function getShiftReadiness(
  businessId: string,
  sources: ShiftFeedStates,
  openShifts: number,
): {
  ready: boolean;
  loading: ShiftFeedName[];
  errors: ShiftFeedName[];
  duplicateOpenShifts: boolean;
} {
  const loading = SHIFT_FEED_NAMES.filter((key) =>
    sources[key].businessId !== businessId || sources[key].status === 'loading',
  );
  const errors = SHIFT_FEED_NAMES.filter((key) =>
    sources[key].businessId === businessId && sources[key].status === 'error',
  );
  const duplicateOpenShifts = openShifts > 1;
  return {
    ready: businessId.trim().length > 0 && loading.length === 0 && errors.length === 0 && !duplicateOpenShifts,
    loading,
    errors,
    duplicateOpenShifts,
  };
}

/** Devuelve importes de efectivo positivos o cero y con máximo dos decimales. */
export function parseShiftCashAmount(value: string): number | null {
  const input = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return null;
  const amount = Number(input);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * Señala cobros cuya fecha real no se puede conciliar dentro de este turno.
 * Solo considera pedidos creados desde la apertura: los anteriores necesitan
 * revisión histórica separada porque no sabemos cuándo fueron cobrados.
 * No cambia el estado de los pedidos ni escribe en Firestore.
 */
export function countPaidOrdersMissingPaymentDate(
  orders: Array<{ status?: string; billingStatus?: string; createdAt?: string; paidAt?: string }>,
  shiftStartIso: string,
): number {
  const start = Date.parse(shiftStartIso);
  if (!Number.isFinite(start)) return 0;
  return orders.filter((order) => {
    if (order.status === 'CANCELADO' || order.billingStatus !== 'PAGADO') return false;
    const created = Date.parse(order.createdAt || '');
    if (!Number.isFinite(created) || created < start) return false;
    return !Number.isFinite(Date.parse(order.paidAt || ''));
  }).length;
}
