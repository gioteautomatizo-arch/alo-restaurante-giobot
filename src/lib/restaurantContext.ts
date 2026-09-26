import { normalizeRestaurantSlug } from './restaurantCore';

const DEFAULT_RESTAURANT_ID = 'alo-restaurante';

function getRestaurantIdFromHash(): string | null {
  if (typeof window === 'undefined') return null;

  const match = window.location.hash.match(/^#business\/([^/]+)$/);
  if (!match) return null;

  const decoded = decodeURIComponent(match[1] || '').trim();
  if (!decoded) return null;

  return normalizeRestaurantSlug(decoded) || null;
}

/**
 * Tenant activo para los servicios operativos.
 *
 * - La aplicación pública de Calientito conserva alo-restaurante como fallback.
 * - Las rutas de plataforma #business/{businessId} cambian automáticamente al tenant.
 * - No dependemos todavía de una migración masiva de datos: el tenant legado sigue intacto.
 */
export function getActiveRestaurantId(): string {
  return getRestaurantIdFromHash() || DEFAULT_RESTAURANT_ID;
}

export function isCalientitoTenant(): boolean {
  return getActiveRestaurantId() === DEFAULT_RESTAURANT_ID;
}
