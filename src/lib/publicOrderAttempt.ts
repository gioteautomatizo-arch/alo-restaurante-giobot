import type { PublicCartLine } from './businessPublicPage';
import { lineUnitPrice } from './businessPublicPage';

/** Identificador temporal del intento; no contiene nombre, teléfono, notas ni productos. */
const TTL_MS = 12 * 60 * 60 * 1000;
const VALID_ID = /^web_[0-9a-f]{32}$/;
const VALID_FINGERPRINT = /^[0-9a-f]{16}$/;

export function publicOrderAttemptKey(businessId: string, tableNumber?: number): string {
  return 'gio_public_order_attempt_v1:' + encodeURIComponent(businessId) + ':' + (tableNumber ?? 'directo');
}

/** Huella local de carrito/mesa: no guarda el contenido del carrito en storage. No es un control de seguridad. */
export function publicCartAttemptFingerprint(lines: PublicCartLine[], guestCount: number | null): string {
  const normalized = lines.map(line => [line.key, line.item.id, line.quantity, lineUnitPrice(line)])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const input = JSON.stringify([guestCount, normalized]);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    hash = (hash ^ BigInt(input.charCodeAt(i))) * 0x100000001b3n & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * El mismo carrito conserva el mismo ID tras un error incierto, incluso tras recargar esta pestaña.
 * Si no se puede persistir el intento, se bloquea el envío para no crear un reintento inseguro.
 */
export function getOrCreatePublicOrderAttempt(
  businessId: string,
  tableNumber: number | undefined,
  fingerprint: string,
  now = Date.now(),
): string {
  if (!businessId.trim() || !VALID_FINGERPRINT.test(fingerprint)) {
    throw new Error('Identidad de pedido inválida.');
  }
  const key = publicOrderAttemptKey(businessId, tableNumber);
  try {
    const raw = sessionStorage.getItem(key);
    if (raw !== null) {
      const existing: unknown = JSON.parse(raw);
      if (!existing || typeof existing !== 'object') throw new Error('Intento corrupto.');
      const attempt = existing as { id?: unknown; fingerprint?: unknown; createdAt?: unknown };
      if (!VALID_ID.test(String(attempt.id || '')) || !VALID_FINGERPRINT.test(String(attempt.fingerprint || ''))
        || typeof attempt.createdAt !== 'number' || !Number.isFinite(attempt.createdAt)) {
        throw new Error('Intento corrupto.');
      }
      if (attempt.fingerprint === fingerprint && now >= attempt.createdAt && now - attempt.createdAt <= TTL_MS) {
        return attempt.id as string;
      }
    }
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    const id = 'web_' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(key, JSON.stringify({ id, fingerprint, createdAt: now }));
    return id;
  } catch {
    throw new Error('No se pudo conservar el identificador de este pedido. Revisa el almacenamiento del navegador antes de enviarlo.');
  }
}

/** Solo borra el intento que recibió confirmación; no elimina uno más reciente. */
export function clearPublicOrderAttempt(businessId: string, tableNumber: number | undefined, id: string): void {
  try {
    const key = publicOrderAttemptKey(businessId, tableNumber);
    const raw = sessionStorage.getItem(key);
    if (raw && (JSON.parse(raw) as { id?: string }).id === id) sessionStorage.removeItem(key);
  } catch { /* No borrar otros intentos ni convertir un pedido confirmado en error. */ }
}
