import type { PublicCartLine } from './businessPublicPage';
import { lineUnitPrice } from './businessPublicPage';

/** Identificador temporal del intento; no contiene nombre, teléfono, notas ni productos. */
const TTL_MS = 12 * 60 * 60 * 1000;
const VALID_ID = /^web_[0-9a-f]{32}$/;
const VALID_FINGERPRINT = /^[0-9a-f]{16}$/;

/** No crear otro folio mientras el resultado del anterior siga sin confirmarse. */
export class PublicOrderAttemptReviewRequiredError extends Error {
  constructor(reason: 'changed' | 'expired' | 'clock' | 'conflict') {
    super(reason === 'changed'
      ? 'Este carrito cambió desde un envío sin confirmar. Consulta al negocio antes de iniciar otro pedido para evitar duplicados.'
      : reason === 'expired'
        ? 'El intento anterior tiene más de 12 horas y no está confirmado. Consulta al negocio antes de iniciar otro pedido.'
        : reason === 'clock'
          ? 'La fecha del intento anterior no coincide con este dispositivo. Consulta al negocio antes de iniciar otro pedido.'
          : 'Hay intentos diferentes del mismo pedido en dos pestañas. Consulta al negocio antes de iniciar otro pedido.');
    this.name = 'PublicOrderAttemptReviewRequiredError';
  }
}

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
 * Comparte únicamente una referencia técnica entre pestañas del mismo navegador.
 * sessionStorage mantiene compatibilidad con intentos existentes y con navegadores
 * que bloquean localStorage. No es un bloqueo atómico entre pestañas simultáneas.
 */
function attemptStores(key: string): { tab: Storage | null; shared: Storage | null } {
  let tab: Storage | null = null;
  let shared: Storage | null = null;
  try { sessionStorage.getItem(key); tab = sessionStorage; } catch { /* storage de pestaña bloqueado */ }
  try { localStorage.getItem(key); shared = localStorage; } catch { /* modo privado/restricción */ }
  if (!tab && !shared) throw new Error('Almacenamiento no disponible.');
  return { tab, shared };
}

function parseAttempt(raw: string): { id: string; fingerprint: string; createdAt: number } {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Intento corrupto.');
  const attempt = parsed as { id?: unknown; fingerprint?: unknown; createdAt?: unknown };
  if (typeof attempt.id !== 'string' || !VALID_ID.test(attempt.id)
    || typeof attempt.fingerprint !== 'string' || !VALID_FINGERPRINT.test(attempt.fingerprint)
    || typeof attempt.createdAt !== 'number' || !Number.isFinite(attempt.createdAt)) {
    throw new Error('Intento corrupto.');
  }
  return { id: attempt.id, fingerprint: attempt.fingerprint, createdAt: attempt.createdAt };
}

/**
 * El mismo carrito conserva el mismo ID tras un error incierto, incluso en otra
 * pestaña que comparta localStorage. Si hay referencias incompatibles, se bloquea.
 * Un intento incierto nunca se reemplaza automáticamente por cambios o caducidad.
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
    const { tab, shared } = attemptStores(key);
    const tabRaw = tab?.getItem(key) ?? null;
    const sharedRaw = shared?.getItem(key) ?? null;
    // Un cambio de pestaña, restauración de sesión o corrupción no debe escoger
    // arbitrariamente uno de dos folios potencialmente confirmados.
    if (tabRaw !== null && sharedRaw !== null) {
      const a = parseAttempt(tabRaw);
      const b = parseAttempt(sharedRaw);
      if (a.id !== b.id || a.fingerprint !== b.fingerprint || a.createdAt !== b.createdAt) {
        throw new PublicOrderAttemptReviewRequiredError('conflict');
      }
    }
    const raw = sharedRaw ?? tabRaw;
    if (raw !== null) {
      const attempt = parseAttempt(raw);
      if (attempt.fingerprint !== fingerprint) throw new PublicOrderAttemptReviewRequiredError('changed');
      if (now < attempt.createdAt) throw new PublicOrderAttemptReviewRequiredError('clock');
      if (now - attempt.createdAt > TTL_MS) throw new PublicOrderAttemptReviewRequiredError('expired');
      // Migración de intentos de la pestaña y sincronización con otras pestañas.
      if (shared && sharedRaw === null) {
        shared.setItem(key, raw);
        if (shared.getItem(key) !== raw) throw new Error('Migración no persistida.');
      }
      if (tab && tabRaw === null) {
        try { tab.setItem(key, raw); } catch { /* la referencia compartida basta */ }
      }
      return attempt.id;
    }
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    const id = 'web_' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const encoded = JSON.stringify({ id, fingerprint, createdAt: now });
    // Escribir primero la referencia compartida; sin ella se conserva el
    // comportamiento previo de una sola pestaña.
    if (shared) {
      shared.setItem(key, encoded);
      // Algunos navegadores/extensiones aceptan setItem sin persistirlo.
      // No permitir la escritura si la referencia compartida no se conserva.
      if (shared.getItem(key) !== encoded) throw new Error('Intento compartido no persistido.');
    }
    if (tab) {
      try {
        tab.setItem(key, encoded);
        // Un navegador puede aceptar setItem sin conservar el valor también
        // en sessionStorage. Sin referencia durable, el reintento duplicaría.
        if (tab.getItem(key) !== encoded) throw new Error('Intento de pestaña no persistido.');
      } catch (error) {
        if (!shared) throw error;
      }
    }
    return id;
  } catch (error) {
    if (error instanceof PublicOrderAttemptReviewRequiredError) throw error;
    throw new Error('No se pudo conservar el identificador de este pedido. Revisa el almacenamiento del navegador antes de enviarlo.');
  }
}

/** Solo invocar después de confirmar explícitamente que se consultó al negocio. */
export function discardPublicOrderAttemptAfterReview(businessId: string, tableNumber?: number): void {
  if (!businessId.trim()) throw new Error('Identidad de negocio inválida.');
  try {
    const key = publicOrderAttemptKey(businessId, tableNumber);
    const { tab, shared } = attemptStores(key);
    // Si falla la eliminación de pestaña, conservar intacta la referencia
    // compartida para que otras pestañas no creen un folio nuevo.
    if (tab) tab.removeItem(key);
    if (shared) shared.removeItem(key);
    if ((shared && shared.getItem(key) !== null) || (tab && tab.getItem(key) !== null)) throw new Error('No se pudo eliminar el intento.');
  } catch {
    throw new Error('No se pudo iniciar otro intento seguro. Revisa el almacenamiento del navegador.');
  }
}

/** Solo borra el ID confirmado; nunca elimina una referencia diferente. */
export function clearPublicOrderAttempt(businessId: string, tableNumber: number | undefined, id: string): void {
  try {
    const key = publicOrderAttemptKey(businessId, tableNumber);
    const { tab, shared } = attemptStores(key);
    for (const store of [shared, tab]) {
      if (!store) continue;
      const raw = store.getItem(key);
      if (raw && parseAttempt(raw).id === id) store.removeItem(key);
    }
  } catch { /* No borrar otros intentos ni convertir un pedido confirmado en error. */ }
}

/**
 * Serializa la elección inicial del folio entre pestañas del mismo origen
 * cuando el navegador ofrece Web Locks. El lock NO cubre el envío de red ni
 * sustituye idempotencia del servidor; localStorage sigue siendo necesario
 * para compartir la referencia. En navegadores sin Web Locks, se conserva
 * la coordinación best-effort previa.
 */
export async function getOrCreatePublicOrderAttemptCoordinated(
  businessId: string,
  tableNumber: number | undefined,
  fingerprint: string,
  now = Date.now(),
): Promise<string> {
  let locks: LockManager | undefined;
  try {
    locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  } catch {
    throw new Error('No se pudo acceder a la coordinación del navegador. Conservamos tu pedido sin enviarlo.');
  }
  if (!locks?.request) return getOrCreatePublicOrderAttempt(businessId, tableNumber, fingerprint, now);
  try {
    return await locks.request(
      'gio-public-order:' + publicOrderAttemptKey(businessId, tableNumber),
      { mode: 'exclusive' },
      () => getOrCreatePublicOrderAttempt(businessId, tableNumber, fingerprint, now),
    );
  } catch (error) {
    if (error instanceof PublicOrderAttemptReviewRequiredError) throw error;
    throw new Error('No se pudo coordinar el identificador entre pestañas. Conservamos tu pedido sin enviarlo.');
  }
}
