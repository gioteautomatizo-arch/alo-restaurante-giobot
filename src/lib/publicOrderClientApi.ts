/**
 * Adaptador del cliente para el checkout con precios autoritativos.
 *
 * OFF por defecto. Nunca vuelve a escrituras Firestore directas si el servidor
 * o App Check fallan: un fallback reabriría la manipulación de precios.
 * Debe activarse SOLO con backend + App Check + cierre de reglas coordinados.
 */
import type { AppCheck } from 'firebase/app-check';
import type { PublicCartLine } from './businessPublicPage';

export interface ConfirmedPublicOrder {
  id: string;
  code: string;
  total: number;
  items: Array<{ productId: string; name: string; quantity: number; totalPrice: number; customizationSummary?: string }>;
  created: boolean;
}

export interface PublicOrderSubmission {
  businessId: string;
  attemptId: string;
  tableNumber?: number;
  guestCount?: number;
  customerName: string;
  notes?: string;
  cart: PublicCartLine[];
}

const WEB_ATTEMPT = /^web_[0-9a-f]{32}$/;
let appCheckPromise: Promise<AppCheck> | undefined;

export function isSecurePublicCheckoutEnabled(): boolean {
  return import.meta.env?.VITE_SECURE_PUBLIC_ORDER_API === 'true';
}

export async function getGioteAppCheckToken(): Promise<string> {
  const siteKey = import.meta.env?.VITE_FIREBASE_APPCHECK_SITE_KEY;
  if (typeof siteKey !== 'string' || !siteKey.trim()) {
    throw new Error('La verificación de pedidos no está configurada. Conservamos tu carrito; consulta al negocio.');
  }
  if (!appCheckPromise) {
    appCheckPromise = Promise.all([
      import('firebase/app'),
      import('firebase/app-check'),
    ]).then(([firebase, appCheck]) => appCheck.initializeAppCheck(firebase.getApp(), {
      provider: new appCheck.ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })).catch(error => {
      appCheckPromise = undefined;
      throw error;
    });
  }
  const { getToken } = await import('firebase/app-check');
  const result = await getToken(await appCheckPromise, false);
  if (!result.token) throw new Error('No se pudo comprobar esta aplicación.');
  return result.token;
}

function safeOrderResponse(raw: unknown): ConfirmedPublicOrder {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Respuesta incompleta del servidor. Revisa el pedido antes de repetirlo.');
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.orderId !== 'string' || !WEB_ATTEMPT.test(data.orderId) ||
      typeof data.code !== 'string' || !data.code.trim() || data.code.length > 80 ||
      typeof data.created !== 'boolean' ||
      typeof data.total !== 'number' || !Number.isSafeInteger(Math.round(data.total * 100)) ||
      data.total < 0 || Math.abs(data.total * 100 - Math.round(data.total * 100)) > 0.000001 ||
      !Array.isArray(data.items) || data.items.length === 0 || data.items.length > 50) {
    throw new Error('Respuesta inválida del servidor. Consulta al negocio antes de repetir el pedido.');
  }
  const items = data.items.map(rawItem => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      throw new Error('El comprobante recibido no contiene partidas válidas.');
    }
    const i = rawItem as Record<string, unknown>;
    if (typeof i.productId !== 'string' || !i.productId ||
        typeof i.name !== 'string' || !i.name ||
        typeof i.quantity !== 'number' || !Number.isInteger(i.quantity) || i.quantity < 1 ||
        typeof i.totalPrice !== 'number' || !Number.isFinite(i.totalPrice) || i.totalPrice < 0 ||
        (i.customizationSummary !== undefined && typeof i.customizationSummary !== 'string')) {
      throw new Error('El comprobante recibido no contiene partidas válidas.');
    }
    return {
      productId: i.productId, name: i.name, quantity: i.quantity, totalPrice: i.totalPrice,
      ...(i.customizationSummary !== undefined ? { customizationSummary: i.customizationSummary as string } : {}),
    };
  });
  const amountCents = items.reduce((sum, item) => sum + Math.round(item.totalPrice * 100), 0);
  if (!Number.isSafeInteger(amountCents) || amountCents !== Math.round(data.total * 100)) {
    throw new Error('Los importes del comprobante no coinciden. Consulta al negocio antes de reenviar.');
  }
  return { id: data.orderId, code: data.code, total: data.total, created: data.created, items };
}

/** No aceptar campos como precio, descuento ni totales del carrito. */
export function buildTrustedPublicOrderDraft(input: PublicOrderSubmission) {
  if (!input.businessId || !WEB_ATTEMPT.test(input.attemptId) ||
      !Array.isArray(input.cart) || !input.cart.length || input.cart.length > 50) {
    throw new Error('No pudimos preparar el pedido seguro. Conservamos tu carrito.');
  }
  if (input.tableNumber !== undefined &&
      (!Number.isInteger(input.tableNumber) || input.tableNumber < 1 || input.tableNumber > 60 ||
       !Number.isInteger(input.guestCount) || Number(input.guestCount) < 1 || Number(input.guestCount) > 10)) {
    throw new Error('El número de mesa o de personas no es válido.');
  }
  if (input.tableNumber === undefined && input.guestCount !== undefined) {
    throw new Error('Un pedido para llevar no puede incluir una mesa.');
  }
  if (input.notes !== undefined && input.notes.length > 300) {
    throw new Error('Las notas deben tener máximo 300 caracteres.');
  }
  const lines = input.cart.map(line => {
    if (!line.item?.id || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new Error('Revisa los productos y las cantidades del carrito.');
    }
    const selections = line.selection || {};
    if (Object.values(selections).some(values => !Array.isArray(values) ||
        values.some(value => typeof value !== 'string'))) {
      throw new Error('Las opciones del producto no son válidas.');
    }
    return { productId: line.item.id, quantity: line.quantity, selections };
  });
  return {
    businessId: input.businessId, attemptId: input.attemptId,
    orderType: input.tableNumber !== undefined ? 'dine_in' : 'pickup',
    ...(input.tableNumber !== undefined ? { tableNumber: input.tableNumber, guestCount: input.guestCount } : {}),
    customerName: input.customerName.trim() || 'Cliente web',
    paymentMethod: 'efectivo',
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    lines,
  };
}

export async function submitTrustedPublicOrder(input: PublicOrderSubmission): Promise<ConfirmedPublicOrder> {
  if (!isSecurePublicCheckoutEnabled()) {
    throw new Error('El envío seguro está desactivado.');
  }
  const draft = buildTrustedPublicOrderDraft(input);
  // Obtener token antes de cualquier llamada al servidor. Nunca usar el
  // mismo intento para alternar sin control entre la API y Firestore directo.
  const token = await getGioteAppCheckToken();
  let response: Response;
  try {
    response = await fetch('/api/public-orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': token,
      },
      body: JSON.stringify(draft),
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('No se pudo confirmar el pedido. Conservamos tu carrito y el mismo intento para evitar duplicados.');
  }
  if (!response.ok) {
    throw new Error(response.status === 409
      ? 'El servidor detectó un conflicto con este intento. Consulta al negocio antes de reenviar.'
      : response.status === 401 || response.status === 403
        ? 'No pudimos verificar esta aplicación. Conservamos tu carrito.'
        : response.status === 404 || response.status === 503
          ? 'El servicio seguro no está disponible. Conservamos tu carrito; no se enviará por otra ruta.'
          : 'No se pudo confirmar el pedido. Conservamos tu carrito y el mismo intento para evitar duplicados.');
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error('La respuesta del servidor fue incompleta. Consulta al negocio antes de reenviar.');
  }
  return safeOrderResponse(raw);
}
