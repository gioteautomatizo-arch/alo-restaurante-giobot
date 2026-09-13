export const CALIENTITO_WEEKLY_PROMOTIONS = [
  'Lunes y viernes · Americano mediano 2x1 · 8:00 a.m. a 11:00 a.m.',
  'Martes · Hamburguesa sencilla $75 · Incluye papas y refresco · 3:00 p.m. a 7:00 p.m.',
  'Miércoles · 2 burritos especiales $150 · Todo el día',
  'Jueves · Frappuccino $40 con crema batida · 1:00 p.m. a 6:00 p.m.',
  'Sábado y domingo · Americano mediano + pan del día $40 · 9:30 a.m. a 12:00 p.m.',
] as const;

export const CALIENTITO_WEEKLY_PROMOTIONS_TEXT = CALIENTITO_WEEKLY_PROMOTIONS.join('\n');

const LEGACY_PROMO_PLACEHOLDERS = new Set([
  '',
  'proximamente',
  'próximamente',
  '10% de descuento por traer recipientes propios',
]);

const EMPTY_PROMO_VALUES = new Set([
  'ninguna',
  'sin promociones',
  'sin promociones activas',
  'no hay promociones',
  'no hay promociones activas',
]);

const normalize = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase('es-MX')
    .replace(/[.!]+$/g, '');

export function shouldMigrateLegacyPromotions(value?: string | null): boolean {
  if (value == null) return true;
  return LEGACY_PROMO_PLACEHOLDERS.has(normalize(value));
}

/**
 * Convierte el campo de promociones del restaurante en una lista utilizable.
 * El esquema sigue siendo string para no migrar Firestore: cada línea representa
 * una promoción. Los valores heredados ("Próximamente" y la antigua promo eco)
 * se resuelven automáticamente al calendario semanal real de Calientito.
 */
export function parseActivePromotions(value?: string | null): string[] {
  if (shouldMigrateLegacyPromotions(value)) {
    return [...CALIENTITO_WEEKLY_PROMOTIONS];
  }
  if (!value || EMPTY_PROMO_VALUES.has(normalize(value))) return [];

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !EMPTY_PROMO_VALUES.has(normalize(line)));
}

export function promotionsForStorage(value?: string | null): string {
  const promos = parseActivePromotions(value);
  return promos.length > 0 ? promos.join('\n') : 'Sin promociones activas';
}

export function promotionsForEditor(value?: string | null): string {
  return parseActivePromotions(value).join('\n');
}
