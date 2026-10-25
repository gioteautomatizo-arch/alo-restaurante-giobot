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
  activeShiftOpenedAt?: string,
): {
  ready: boolean;
  loading: ShiftFeedName[];
  errors: ShiftFeedName[];
  duplicateOpenShifts: boolean;
  invalidActiveShiftStart: boolean;
} {
  const loading = SHIFT_FEED_NAMES.filter((key) =>
    sources[key].businessId !== businessId || sources[key].status === 'loading',
  );
  const errors = SHIFT_FEED_NAMES.filter((key) =>
    sources[key].businessId === businessId && sources[key].status === 'error',
  );
  const duplicateOpenShifts = openShifts > 1;
  // Sin apertura válida, sumar ventas desde epoch (0) daría un corte falso.
  const parsedStart = Date.parse(activeShiftOpenedAt || '');
  const invalidActiveShiftStart = openShifts === 1 && (!Number.isFinite(parsedStart) || parsedStart <= 0);
  return {
    ready: businessId.trim().length > 0 && loading.length === 0 && errors.length === 0 && !duplicateOpenShifts && !invalidActiveShiftStart,
    loading,
    errors,
    duplicateOpenShifts,
    invalidActiveShiftStart,
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

/**
 * Cuenta pagos sin fecha verificable que podrían corresponder a otro turno.
 * Incluye pedidos creados antes de la apertura o sin fecha de creación.
 * Solo informa: nunca asigna un cobro a un turno ni modifica importes.
 */
export function countHistoricalPaidOrdersMissingPaymentDate(
  orders: Array<{ status?: string; billingStatus?: string; createdAt?: string; paidAt?: string }>,
  shiftStartIso: string,
): number {
  const start = Date.parse(shiftStartIso);
  if (!Number.isFinite(start) || start <= 0) return 0;
  return orders.filter((order) => {
    if (order.status === 'CANCELADO' || order.billingStatus !== 'PAGADO') return false;
    if (Number.isFinite(Date.parse(order.paidAt || ''))) return false;
    const created = Date.parse(order.createdAt || '');
    return !Number.isFinite(created) || created < start;
  }).length;
}
