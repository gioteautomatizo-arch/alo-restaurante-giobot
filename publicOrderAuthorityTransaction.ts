/**
 * EXPERIMENTO SOLO SERVIDOR, SIN RUTA HTTP NI ACTIVACIÓN.
 * Requiere Firestore Admin proporcionado por un proceso de confianza.
 * NO importar desde React ni conectar al checkout hasta aprobar reglas,
 * autenticación, límites de abuso, compatibilidad y plan de corte.
 */
import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { quotePublicOrderFromTrustedCatalog } from './src/lib/publicOrderAuthority';
import type { BusinessCatalogDocument } from './src/lib/businessCatalogService';

export interface TrustedPublicOrderDraft {
  businessId: string;
  attemptId: string;
  orderType: 'pickup' | 'dine_in';
  tableNumber?: number;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta';
  customerName: string;
  lines: unknown;
}

export interface TrustedPublicOrderResult {
  orderId: string;
  code: string;
  total: number;
  created: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateDraft(raw: unknown): TrustedPublicOrderDraft {
  if (!isRecord(raw) || Object.keys(raw).some(key =>
    !['businessId', 'attemptId', 'orderType', 'tableNumber', 'paymentMethod', 'customerName', 'lines'].includes(key))) {
    throw new Error('PEDIDO_NO_VALIDO: campos no autorizados.');
  }
  if (typeof raw.businessId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(raw.businessId) ||
      raw.businessId === 'alo-restaurante') {
    throw new Error('PEDIDO_NO_VALIDO: tenant no autorizado para el experimento.');
  }
  if (typeof raw.attemptId !== 'string' || !/^web_[0-9a-f]{32}$/.test(raw.attemptId)) {
    throw new Error('PEDIDO_NO_VALIDO: clave de intento inválida.');
  }
  if (raw.orderType !== 'pickup' && raw.orderType !== 'dine_in') {
    throw new Error('PEDIDO_NO_VALIDO: tipo de pedido inválido.');
  }
  if (raw.orderType === 'dine_in') {
    if (!Number.isInteger(raw.tableNumber) || (raw.tableNumber as number) < 1 ||
        (raw.tableNumber as number) > 99) {
      throw new Error('PEDIDO_NO_VALIDO: mesa inválida.');
    }
  } else if (raw.tableNumber !== undefined) {
    throw new Error('PEDIDO_NO_VALIDO: pickup no admite mesa.');
  }
  if (!['efectivo', 'transferencia', 'tarjeta'].includes(raw.paymentMethod as string)) {
    throw new Error('PEDIDO_NO_VALIDO: método de pago inválido.');
  }
  if (typeof raw.customerName !== 'string' || !raw.customerName.trim() ||
      raw.customerName.length > 80) {
    throw new Error('PEDIDO_NO_VALIDO: nombre inválido.');
  }
  return raw as unknown as TrustedPublicOrderDraft;
}

/** El ID es distinto por tenant incluso si dos clientes reutilizan una misma clave. */
export function deriveTrustedOrderId(businessId: string, attemptId: string): string {
  return 'web_' + createHash('sha256').update(businessId + '\0' + attemptId).digest('hex').slice(0, 32);
}

/**
 * Una sola transacción lee intento, perfil, catálogo y destinos antes de escribir.
 * Los reintentos con el mismo payload devuelven el resultado anterior incluso si
 * el catálogo cambió. Un mismo intento con payload diferente falla cerrado.
 * No realiza cobros, descuentos, envíos ni reservas de stock.
 */
export async function commitTrustedPublicOrder(
  db: Firestore, raw: unknown,
): Promise<TrustedPublicOrderResult> {
  const draft = validateDraft(raw);
  const businessId = draft.businessId;
  const orderId = deriveTrustedOrderId(businessId, draft.attemptId);
  const code = 'WEB-' + orderId.slice(-8).toUpperCase();
  const fingerprint = createHash('sha256').update(JSON.stringify(draft)).digest('hex');
  const attemptRef = db.doc(`businesses/${businessId}/publicOrderAttempts/${draft.attemptId}`);
  const profileRef = db.doc(`publicBusinessProfiles/${businessId}`);
  const catalogRef = db.doc(`businesses/${businessId}/catalog/menu_catalog`);
  const orderRef = db.doc(`restaurant_orders/${orderId}`);
  // Revisar colisiones de espejo incluso para pickup: un ID no puede reciclarse.\n  const mirrorRef = db.doc(`public_table_orders/${orderId}`);
  const now = new Date().toISOString();

  return db.runTransaction(async tx => {
    const attempt = await tx.get(attemptRef);
    if (attempt.exists) {
      const prior = attempt.data();
      if (prior?.businessId !== businessId || prior?.fingerprint !== fingerprint ||
          prior?.orderId !== orderId || typeof prior?.total !== 'number') {
        throw new Error('CONFLICTO_INTENTO: clave reutilizada con otro pedido.');
      }
      const savedOrder = await tx.get(orderRef);
      if (!savedOrder.exists || savedOrder.data()?.restaurantId !== businessId ||
          savedOrder.data()?.total !== prior.total ||
          savedOrder.data()?.code !== prior.code || typeof prior.code !== 'string') {
        throw new Error('INTEGRIDAD_PEDIDO: pedido previo ausente o discordante.');
      }
      const mirror = await tx.get(mirrorRef);
      if (draft.orderType === 'dine_in') {
        if (!mirror.exists || mirror.data()?.restaurantId !== businessId ||
            mirror.data()?.orderId !== orderId ||
            mirror.data()?.tableNumber !== draft.tableNumber) {
          throw new Error('INTEGRIDAD_PEDIDO: resumen de mesa ausente o discordante.');
        }
      } else if (mirror.exists) {
        throw new Error('INTEGRIDAD_PEDIDO: pickup no puede tener espejo de mesa.');
      }
      return { orderId, code: prior.code as string, total: prior.total as number, created: false };
    }

    const profile = await tx.get(profileRef);
    const catalog = await tx.get(catalogRef);
    const existingOrder = await tx.get(orderRef);
    const existingMirror = await tx.get(mirrorRef);
    if (!profile.exists || !catalog.exists) {
      throw new Error('PEDIDO_NO_VALIDO: negocio o catálogo no disponible.');
    }
    if (existingOrder.exists || existingMirror.exists) {
      throw new Error('CONFLICTO_ID: identificador de pedido o espejo ya ocupado.');
    }
    const quote = quotePublicOrderFromTrustedCatalog({
      businessId,
      profile: profile.data() as { businessId?: string; restaurantId?: string; published?: boolean },
      catalog: catalog.data() as BusinessCatalogDocument,
      lines: draft.lines,
    });
    const payload = {
      restaurantId: businessId,
      code,
      orderType: draft.orderType,
      ...(draft.tableNumber !== undefined ? { tableNumber: draft.tableNumber } : {}),
      orderSource: 'CLIENTE_QR',
      orderOrigin: draft.orderType === 'dine_in' ? 'MESA_QR' : 'QR_EXTERNO',
      customerName: draft.customerName.trim(),
      paymentMethod: draft.paymentMethod,
      bringOwnContainer: false,
      items: quote.items,
      subtotal: quote.subtotal,
      discountAmount: 0,
      deliveryFee: 0,
      total: quote.total,
      status: 'NUEVO',
      billingStatus: 'PENDIENTE',
      createdAt: now,
      updatedAt: now,
    };
    tx.create(orderRef, payload);
    if (draft.orderType === 'dine_in') {
      tx.create(mirrorRef, {
        orderId, code, restaurantId: businessId, tableNumber: draft.tableNumber,
        orderSource: 'CLIENTE_QR', orderOrigin: 'MESA_QR',
        items: quote.items, total: quote.total,
        status: 'NUEVO', billingStatus: 'PENDIENTE', createdAt: now, updatedAt: now,
      });
    }
    tx.create(attemptRef, {
      businessId, orderId, code, fingerprint, total: quote.total,
      catalogRevision: quote.catalogRevision, createdAt: now,
    });
    return { orderId, code, total: quote.total, created: true };
  });
}
