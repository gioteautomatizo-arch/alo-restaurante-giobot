const PROMO_PLACEHOLDERS = new Set([
  '',
  'proximamente',
  'próximamente',
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

/**
 * Convierte el campo de promociones del restaurante en una lista utilizable.
 * Se conserva el esquema actual (string) para no migrar Firestore: cada línea
 * representa una promoción. Valores de relleno como "Próximamente" no se
 * consideran promociones activas.
 */
export function parseActivePromotions(value?: string | null): string[] {
  if (!value) return [];

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !PROMO_PLACEHOLDERS.has(normalize(line)));
}

export function promotionsForStorage(value?: string | null): string {
  const promos = parseActivePromotions(value);
  return promos.length > 0 ? promos.join('\n') : 'Sin promociones activas';
}

export function promotionsForEditor(value?: string | null): string {
  return parseActivePromotions(value).join('\n');
}
