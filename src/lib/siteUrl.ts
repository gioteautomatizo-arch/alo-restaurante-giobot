/**
 * Dirección base de la app para armar enlaces y QR.
 * Si la URL de la app cambia (por ejemplo al publicarla en otro dominio), se guarda aquí
 * UNA sola vez y todos los enlaces y QR nuevos se arman con ella.
 */
const KEY = 'gio_site_base_url';

function clean(url: string): string {
  return url.trim().replace(/[#?].*$/, '').replace(/\/index\.html$/i, '').replace(/\/+$/, '');
}

export function getCurrentOrigin(): string {
  return clean(window.location.origin);
}

export function getSavedSiteBaseUrl(): string {
  try {
    return clean(localStorage.getItem(KEY) || '');
  } catch {
    return '';
  }
}

export function getSiteBaseUrl(): string {
  return getSavedSiteBaseUrl() || getCurrentOrigin();
}

export function setSiteBaseUrl(url: string): string {
  const value = clean(url);
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    // sin almacenamiento: se usa la dirección actual
  }
  return value;
}

export function isValidBaseUrl(url: string): boolean {
  return /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url.trim());
}

/** Nombres que no pueden usarse como enlace corto porque la app los usa para otra cosa. */
export const RESERVED_PATHS = ['api', 'assets', 'negocio', 'admin', 'explorar', 'business', 'business-new', 'platform-admin', 'index', 'favicon'];

/** Página pública de un negocio de la plataforma (enlace corto: /nombre-del-negocio). */
export function businessPageUrl(businessId: string): string {
  const id = encodeURIComponent(businessId);
  return RESERVED_PATHS.includes(businessId.toLowerCase())
    ? `${getSiteBaseUrl()}/negocio/${id}`
    : `${getSiteBaseUrl()}/${id}`;
}

/** Menú público de Restaurante Calientito (la dirección que va en Google). */
export function calientitoMenuUrl(): string {
  return `${getSiteBaseUrl()}/restaurante-calientito`;
}

export function calientitoTableUrl(tableNumber: number): string {
  return `${getSiteBaseUrl()}/restaurante-calientito?table=${tableNumber}`;
}

/** QR de una mesa de cualquier negocio de la plataforma. */
export function businessTableUrl(businessId: string, tableNumber: number): string {
  return `${businessPageUrl(businessId)}?table=${tableNumber}`;
}

/** Las direcciones temporales de AI Studio (ais-dev) dejan de funcionar al cambiar o reiniciar la app. */
export function looksTemporary(url: string): boolean {
  return /ais-dev-|localhost|127\.0\.0\.1|\.usercontent\.goog/i.test(url);
}
