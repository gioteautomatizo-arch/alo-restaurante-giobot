import type { BusinessCatalogDocument, BusinessCatalogItem } from './businessCatalogService';
import type { RestaurantOrderItem } from '../types';

/**
 * Núcleo PURO de cotización para un futuro backend de pedidos públicos.
 * NO invocar con un catálogo enviado por el navegador: el backend debe leerlo
 * desde Firestore, dentro de la transacción que escribe el pedido.
 *
 * Este módulo no crea pedidos, no reserva inventario, no aplica descuentos ni
 * autoriza el acceso. No está conectado al checkout actual.
 */
export interface PublicOrderAuthorityInput {
  businessId: string;
  profile: { businessId?: string; restaurantId?: string; published?: boolean };
  catalog: BusinessCatalogDocument;
  /** Datos NO confiables: solo productId, quantity y selections. */
  lines: unknown;
}

export interface PublicOrderAuthorityQuote {
  items: RestaurantOrderItem[];
  subtotal: number;
  total: number;
  catalogRevision: string | null;
}

const MAX_LINES = 50;
const MAX_QUANTITY = 99;
const MAX_TOTAL_QUANTITY = 500;
const MAX_ORDER_CENTS = 100_000_000; // $1,000,000 MXN; límite preventivo, sujeto a revisión.

function invalid(message: string): never {
  throw new Error(`PEDIDO_NO_VALIDO: ${message}`);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    invalid('La solicitud contiene campos no autorizados.');
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) {
    invalid(`${label} inválido.`);
  }
  return value;
}

function cents(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    invalid(`${label} inválido.`);
  }
  const result = Math.round(value * 100);
  if (!Number.isSafeInteger(result) || result > MAX_ORDER_CENTS ||
      Math.abs(value * 100 - result) > 0.000001) {
    invalid(`${label} fuera de rango o con más de dos decimales.`);
  }
  return result;
}

function itemOptions(item: BusinessCatalogItem, raw: unknown): {
  additionalCents: number;
  summary: string;
} {
  if (!record(raw)) invalid('Las opciones deben ser un objeto.');
  const groups = item.optionGroups ?? [];
  if (!Array.isArray(groups)) invalid('Configuración de opciones inválida.');
  const groupIds = new Set<string>();
  const parts: string[] = [];
  let additionalCents = 0;

  for (const group of groups) {
    if (!record(group)) invalid('Grupo de opciones inválido.');
    const id = nonEmptyString(group.id, 'ID de grupo');
    const name = nonEmptyString(group.name, 'Nombre de grupo');
    if (groupIds.has(id)) invalid('El catálogo tiene grupos duplicados.');
    groupIds.add(id);
    if (typeof group.required !== 'boolean' || typeof group.multiple !== 'boolean' ||
        !Array.isArray(group.choices) || group.choices.length > 100) {
      invalid('Grupo de opciones mal configurado.');
    }
    const chosen = raw[id] ?? [];
    if (!Array.isArray(chosen) || chosen.some((value) => typeof value !== 'string') ||
        chosen.length > 100) {
      invalid('Selección de opciones inválida.');
    }
    const choices = new Map<string, { name: string; priceCents: number }>();
    for (const choice of group.choices) {
      if (!record(choice)) invalid('Opción del catálogo inválida.');
      const choiceName = nonEmptyString(choice.name, 'Nombre de opción');
      if (choices.has(choiceName.toLowerCase())) invalid('Opciones duplicadas en el catálogo.');
      choices.set(choiceName.toLowerCase(), { name: choiceName, priceCents: cents(choice.price, 'Precio de opción') });
    }
    if (group.required && chosen.length === 0) invalid('Falta una opción obligatoria.');
    if (!group.multiple && chosen.length > 1) invalid('Se eligieron demasiadas opciones.');
    if (new Set(chosen).size !== chosen.length) invalid('Hay opciones repetidas.');
    for (const choiceName of chosen) {
      const exact = choices.get(choiceName.toLowerCase());
      if (!exact) invalid('Opción inexistente.');
      // No aceptar mayúsculas o variantes distintas a la opción exacta del catálogo.
      if (exact.name !== choiceName) invalid('Opción no coincide con el catálogo.');
      additionalCents += exact.priceCents;
      if (additionalCents > MAX_ORDER_CENTS) invalid('Importe de opciones excesivo.');
    }
    if (chosen.length) {
      const canonical = group.choices.map((choice) => choice.name).filter((choiceName) => chosen.includes(choiceName));
      parts.push(`${name}: ${canonical.join(', ')}`);
    }
  }
  if (Object.keys(raw).some((id) => !groupIds.has(id))) invalid('Grupo de opciones inexistente.');
  return { additionalCents, summary: parts.join(' · ') };
}

/**
 * Calcula importes exclusivamente desde catálogo/perfil suministrados por el
 * servidor. Rechaza importes, estados, descuentos y otros campos del cliente.
 * La comprobación de revisión y el alta atómica deben ocurrir después, en el
 * backend transaccional; esta función NO cierra el bloqueo de seguridad.
 */
export function quotePublicOrderFromTrustedCatalog(input: PublicOrderAuthorityInput): PublicOrderAuthorityQuote {
  const businessId = nonEmptyString(input.businessId, 'Negocio');
  if (businessId.includes('/') || !record(input.profile) ||
      input.profile.published !== true || input.profile.businessId !== businessId ||
      (input.profile.restaurantId !== undefined && input.profile.restaurantId !== businessId)) {
    invalid('El negocio no está publicado o no coincide.');
  }
  if (!record(input.catalog) || input.catalog.businessId !== businessId ||
      !Array.isArray(input.catalog.items)) {
    invalid('El catálogo no pertenece al negocio.');
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > MAX_LINES) {
    invalid('Cantidad de partidas inválida.');
  }

  const products = new Map<string, BusinessCatalogItem>();
  for (const product of input.catalog.items) {
    if (!record(product)) invalid('Producto del catálogo inválido.');
    const id = nonEmptyString(product.id, 'ID de producto');
    if (products.has(id)) invalid('El catálogo tiene IDs duplicados.');
    products.set(id, product);
  }

  const items: RestaurantOrderItem[] = [];
  const seenLines = new Set<string>();
  let totalCents = 0;
  let totalQuantity = 0;

  for (const rawLine of input.lines) {
    if (!record(rawLine)) invalid('Partida inválida.');
    onlyKeys(rawLine, ['productId', 'quantity', 'selections']);
    const productId = nonEmptyString(rawLine.productId, 'Producto');
    const quantity = rawLine.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) ||
        quantity < 1 || quantity > MAX_QUANTITY) invalid('Cantidad inválida.');
    totalQuantity += quantity;
    if (totalQuantity > MAX_TOTAL_QUANTITY) invalid('Cantidad total excesiva.');

    const product = products.get(productId);
    if (!product || product.available !== true) invalid('Producto inexistente o agotado.');
    const name = nonEmptyString(product.name, 'Nombre de producto');
    const baseCents = cents(product.price, 'Precio de producto');
    const selections = rawLine.selections ?? {};
    const { additionalCents, summary } = itemOptions(product, selections);
    const unitCents = baseCents + additionalCents;
    const lineCents = unitCents * quantity;
    if (!Number.isSafeInteger(lineCents) || lineCents > MAX_ORDER_CENTS) {
      invalid('Importe de partida excesivo.');
    }
    const lineKey = JSON.stringify([productId, summary]);
    if (seenLines.has(lineKey)) invalid('Partida duplicada.');
    seenLines.add(lineKey);
    totalCents += lineCents;
    if (!Number.isSafeInteger(totalCents) || totalCents > MAX_ORDER_CENTS) {
      invalid('Importe total excesivo.');
    }
    items.push({
      productId, name, quantity, unitPrice: unitCents / 100,
      totalPrice: lineCents / 100,
      ...(summary ? { customizationSummary: summary } : {}),
    });
  }
  return {
    items, subtotal: totalCents / 100, total: totalCents / 100,
    catalogRevision: input.catalog.revision ?? input.catalog.updatedAt ?? null,
  };
}
