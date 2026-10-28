/** Orden descendente local tras filtrar el tenant; faltantes siempre al final. */
export function sortModuleRows<T extends { id: string }>(rows: T[], field: string): T[] {
  const normalize = (value: unknown): string | number | null => {
    if (value == null) return null;
    if (typeof value === 'number' || typeof value === 'string') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object' && 'toMillis' in value
      && typeof value.toMillis === 'function') return value.toMillis();
    return String(value);
  };
  return [...rows].sort((left, right) => {
    const a = normalize((left as Record<string, unknown>)[field]);
    const b = normalize((right as Record<string, unknown>)[field]);
    if (a === null && b === null) return left.id.localeCompare(right.id);
    if (a === null) return 1;
    if (b === null) return -1;
    const order = typeof a === 'number' && typeof b === 'number'
      ? b - a : String(b).localeCompare(String(a));
    return order || left.id.localeCompare(right.id);
  });
}

