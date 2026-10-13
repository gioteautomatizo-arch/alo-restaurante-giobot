import type { BusinessCatalogItem } from './businessCatalogService';

/**
 * Utilidades de la página pública de un negocio (lo que ve el cliente).
 * Son funciones puras para poder probarlas sin pantalla.
 */

export interface PublicCartLine {
  item: BusinessCatalogItem;
  quantity: number;
}

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
    .filter((item) => item.available && item.name.trim() && typeof item.price === 'number')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .forEach((item) => {
      const category = item.category?.trim() || 'Menú';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(item);
    });
  return Array.from(groups.entries()).map(([category, list]) => ({ category, items: list }));
}

export function cartTotal(lines: PublicCartLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + Number(line.item.price || 0) * line.quantity, 0) * 100) / 100;
}

export function buildWhatsappOrderUrl(input: {
  whatsapp: string;
  businessName: string;
  lines: PublicCartLine[];
  customerName?: string;
  notes?: string;
}): string {
  const phone = normalizeWhatsapp(input.whatsapp);
  if (!phone || input.lines.length === 0) return '';

  const rows = input.lines.map(
    (line) => `• ${line.quantity} x ${line.item.name} — ${formatMoney(Number(line.item.price || 0) * line.quantity)}`,
  );
  const message = [
    `Hola, quiero hacer un pedido en ${input.businessName}:`,
    '',
    ...rows,
    '',
    `Total: ${formatMoney(cartTotal(input.lines))}`,
    input.customerName?.trim() ? `Nombre: ${input.customerName.trim()}` : '',
    input.notes?.trim() ? `Notas: ${input.notes.trim()}` : '',
  ]
    .filter((row, index, all) => row !== '' || (index > 0 && all[index - 1] !== ''))
    .join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
