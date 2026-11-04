/**
 * Cuota compartida de pedidos públicos. SOLO servidor con Firebase Admin.
 * Firestore Emulator en pruebas; colección no expuesta a clientes.
 *
 * Dos contadores transaccionales por ventana:
 *  - cliente: app verificada + negocio + IP remota (IP solo hash)
 *  - negocio: todos los clientes y apps juntos
 *
 * Sin disponibilidad de Firestore, el endpoint debe FALLAR CERRADO (503).
 * No sustituye defensa de infraestructura contra DDoS ni App Check real.
 */
import { createHash } from 'node:crypto';
import type { Firestore, DocumentSnapshot, Transaction } from 'firebase-admin/firestore';

export const PUBLIC_ORDER_QUOTA_WINDOW_MS = 60_000;
export const PUBLIC_ORDER_QUOTA_CLIENT_LIMIT = 25;
export const PUBLIC_ORDER_QUOTA_TENANT_LIMIT = 120;
const TTL_MS = 24 * 60 * 60 * 1000;

const digest = (input: string) => createHash('sha256').update(input).digest('hex');

export function publicOrderQuotaKeys(businessId: string, appId: string, remoteAddress: string) {
  return {
    client: 'client_' + digest([businessId, appId, remoteAddress].join('\0')),
    tenant: 'tenant_' + digest(businessId),
  };
}

type Counter = { count: number; resetAt: number };
function counter(snapshot: DocumentSnapshot, now: number): Counter {
  if (!snapshot.exists) return { count: 0, resetAt: now + PUBLIC_ORDER_QUOTA_WINDOW_MS };
  const data = snapshot.data();
  if (!data || !Number.isSafeInteger(data.count) || data.count < 0 ||
      !Number.isSafeInteger(data.resetAt) || data.resetAt <= 0) {
    throw new Error('CUOTA_INTEGRA: registro inválido.'); // fail closed
  }
  return data.resetAt <= now
    ? { count: 0, resetAt: now + PUBLIC_ORDER_QUOTA_WINDOW_MS }
    : { count: data.count, resetAt: data.resetAt };
}

export interface PublicOrderQuotaDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function consumePublicOrderQuota(
  db: Firestore,
  input: { businessId: string; appId: string; remoteAddress: string; now?: number },
): Promise<PublicOrderQuotaDecision> {
  const { businessId, appId, remoteAddress } = input;
  const now = input.now ?? Date.now();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(businessId) ||
      !appId || appId.length > 256 ||
      typeof remoteAddress !== 'string' || remoteAddress.length > 1024 ||
      !Number.isSafeInteger(now) || now <= 0) {
    throw new Error('CUOTA_INVALIDA: identidad o instante inválidos.');
  }
  const keys = publicOrderQuotaKeys(businessId, appId, remoteAddress);
  const tenantRef = db.collection('public_order_rate_limits').doc(keys.tenant);
  const clientRef = db.collection('public_order_rate_limits').doc(keys.client);
  return db.runTransaction(async (tx: Transaction) => {
    const [tenantSnap, clientSnap] = await Promise.all([tx.get(tenantRef), tx.get(clientRef)]);
    const tenant = counter(tenantSnap, now);
    const client = counter(clientSnap, now);
    if (tenant.count >= PUBLIC_ORDER_QUOTA_TENANT_LIMIT ||
        client.count >= PUBLIC_ORDER_QUOTA_CLIENT_LIMIT) {
      const retryAt = Math.min(
        tenant.count >= PUBLIC_ORDER_QUOTA_TENANT_LIMIT ? tenant.resetAt : Infinity,
        client.count >= PUBLIC_ORDER_QUOTA_CLIENT_LIMIT ? client.resetAt : Infinity,
      );
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)) };
    }
    const expiresAt = new Date(now + TTL_MS);
    // El Hash del ID evita guardar IP o identificadores personales sin procesar.
    // TTL opcional en Firebase para purgar documentos caducados.
    tx.set(tenantRef, { count: tenant.count + 1, resetAt: tenant.resetAt, expiresAt });
    tx.set(clientRef, { count: client.count + 1, resetAt: client.resetAt, expiresAt });
    return { allowed: true, retryAfterSeconds: 0 };
  });
}
