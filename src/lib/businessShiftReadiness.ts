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
