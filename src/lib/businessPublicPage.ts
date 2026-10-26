import type { BusinessCatalogItem } from './businessCatalogService';
import type { RestaurantOrder } from '../types';
import type { OptionSelection } from './catalogOptions';
import { missingRequired, selectionSummary, unitPriceFor } from './catalogOptions';

/**
 * Utilidades de la página pública de un negocio (lo que ve el cliente).
 * Son funciones puras para poder probarlas sin pantalla.
 */


/** Acepta QR antiguos con query y enlaces portables con query dentro del fragmento. */
export function readPublicTableParam(search: string, hash: string): string | null {
  const params = new URLSearchParams(search);
  if (params.has('table')) return params.get('table');
  const queryStart = hash.indexOf('?');
  return queryStart < 0 ? null : new URLSearchParams(hash.slice(queryStart + 1)).get('table');
}

export function isValidPublicGuestCount(value: number | null): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10;
}

/** Interpreta la mesa enviada por el QR sin confiar en texto arbitrario. */
export function parsePublicTableNumber(raw: string | null): number | undefined {
  if (!raw || !/^\d{1,3}$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Preserva de dónde llegó el pedido sin convertir automáticamente el QR
 * en una sesión de mesa ni escribir en colecciones de mesas heredadas.
 */
export function publicOrderOrigin(tableNumber?: number): Pick<RestaurantOrder, 'orderOrigin' | 'tableNumber'> {
  return Number.isInteger(tableNumber) && Number(tableNumber) > 0 && Number(tableNumber) <= 999
    ? { orderOrigin: 'MESA_QR', tableNumber }
    : { orderOrigin: 'QR_EXTERNO' };
}

export interface PublicCartLine {
  /** Producto + opciones elegidas identifican la línea (ver selectionKey). */
  key: string;
  item: BusinessCatalogItem;
  quantity: number;
  selection?: OptionSelection;
}

export const lineUnitPrice = (line: PublicCartLine): number => unitPriceFor(line.item, line.selection || {});

/** Deja solo dígitos; un número mexicano de 10 dígitos recibe el prefijo 52. Vacío si no es usable. */
export function normalizeWhatsapp(raw: string | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `52${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return '';
}

/** Solo enlaces http/https; cualquier otra cosa (javascript:, vacío…) se descarta. */
export function safeExternalUrl(raw: string | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function formatMoney(value: number): string {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

/** Productos visibles para el cliente: disponibles, con nombre y precio. Agrupados por categoría. */
export function groupVisibleCatalog(items: BusinessCatalogItem[]): Array<{ category: string; items: BusinessCatalogItem[] }> {
  const groups = new Map<string, BusinessCatalogItem[]>();
  items
    .filter((item) => item.available && item.name.trim() && typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .forEach((item) => {
      const category = item.category?.trim() || 'Menú';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(item);
    });
  return Array.from(groups.entries()).map(([category, list]) => ({ category, items: list }));
}

export function cartTotal(lines: PublicCartLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + lineUnitPrice(line) * line.quantity, 0) * 100) / 100;
}

export function buildWhatsappOrderUrl(input: {
  whatsapp: string;
  businessName: string;
  lines: PublicCartLine[];
  customerName?: string;
  notes?: string;
  tableNumber?: number;
  orderCode?: string;
}): string {
  const phone = normalizeWhatsapp(input.whatsapp);
  if (!phone || input.lines.length === 0) return '';

  const rows = input.lines.map((line) => {
    const detail = selectionSummary(line.item, line.selection || {});
    return `• ${line.quantity} x ${line.item.name}${detail ? ` (${detail})` : ''} — ${formatMoney(lineUnitPrice(line) * line.quantity)}`;
  });
  const message = [
    `Hola, quiero hacer un pedido en ${input.businessName}:`,
    input.orderCode ? `Pedido ${input.orderCode}` : '',
    '',
    ...rows,
    '',
    `Total: ${formatMoney(cartTotal(input.lines))}`,
    input.tableNumber ? `Mesa: ${input.tableNumber}` : '',
    input.customerName?.trim() ? `Nombre: ${input.customerName.trim()}` : '',
    input.notes?.trim() ? `Notas: ${input.notes.trim()}` : '',
  ]
    .filter((row, index, all) => row !== '' || (index > 0 && all[index - 1] !== ''))
    .join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Convierte el carrito público en las partidas que entiende Pedidos y Caja. */
export function cartToOrderItems(lines: PublicCartLine[]): Array<{
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  customizationSummary?: string;
}> {
  return lines.map((line) => {
    const unitPrice = lineUnitPrice(line);
    const detail = selectionSummary(line.item, line.selection || {});
    return {
      productId: line.item.id,
      name: line.item.name,
      quantity: line.quantity,
      unitPrice,
      totalPrice: Math.round(unitPrice * line.quantity * 100) / 100,
      ...(detail ? { customizationSummary: detail } : {}),
    };
  });
}

/**
 * Detecta partidas cuyo producto, precio o personalización ya no coincide con
 * el último catálogo recibido. No modifica ni confirma pedidos en Firebase.
 * Hay que volver a elegirlas: nunca cambiar precios de un carrito en silencio.
 */
export function outdatedPublicCartKeys(lines: PublicCartLine[], latestCatalog: BusinessCatalogItem[]): string[] {
  const currentItems = new Map(groupVisibleCatalog(latestCatalog).flatMap((group) => group.items.map((item) => [item.id, item] as const)));
  return lines.filter((line) => {
    const latest = currentItems.get(line.item.id);
    if (!latest || !Number.isInteger(line.quantity) || line.quantity <= 0) return true;
    if (latest.name !== line.item.name || latest.price !== line.item.price) return true;
    const selection = line.selection || {};
    if (missingRequired(latest, selection).length > 0) return true;
    for (const [groupId, names] of Object.entries(selection)) {
      if (!Array.isArray(names)) return true;
      const group = latest.optionGroups?.find((item) => item.id === groupId);
      const originalGroup = line.item.optionGroups?.find((item) => item.id === groupId);
      if (names.length > 0 && (!group || (!group.multiple && names.length > 1))) return true;
      for (const name of names) {
        const choice = group?.choices.find((item) => item.name === name);
        const original = originalGroup?.choices.find((item) => item.name === name);
        if (!choice || !original || choice.price !== original.price) return true;
      }
    }
    return unitPriceFor(latest, selection) !== unitPriceFor(line.item, selection);
  }).map((line) => line.key);
}

/** No confirmar pedidos mientras la lectura del menú no sea fiable. */
export function canSubmitPublicCart(
  catalogStatus: 'loading' | 'ready' | 'error',
  lineCount: number,
  sending: boolean,
): boolean {
  return catalogStatus === 'ready' && Number.isInteger(lineCount) && lineCount > 0 && !sending;
}
