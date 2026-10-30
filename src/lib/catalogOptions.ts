import type { BusinessCatalogItem, CatalogOptionGroup } from './businessCatalogService';

/**
 * Opciones de producto (guiso, sabor, extras, paquete…). Funciones puras.
 * Selección: id del grupo -> nombres de las opciones elegidas.
 */
export type OptionSelection = Record<string, string[]>;

const money = (n: number) => Math.round(n * 100) / 100;

/** Limpia lo que escribe el dueño: quita opciones vacías, normaliza precios y banderas. */
export function cleanOptionGroups(groups: CatalogOptionGroup[] | undefined): CatalogOptionGroup[] {
  if (!Array.isArray(groups)) return [];
  const result: CatalogOptionGroup[] = [];
  groups.forEach((group, index) => {
    const name = String(group?.name ?? '').trim();
    const seen = new Set<string>();
    const choices = (Array.isArray(group?.choices) ? group.choices : [])
      .map((choice) => ({
        name: String(choice?.name ?? '').trim(),
        price: Number.isFinite(Number(choice?.price)) && Number(choice.price) > 0 ? money(Number(choice.price)) : 0,
      }))
      .filter((choice) => {
        if (!choice.name || seen.has(choice.name.toLowerCase())) return false;
        seen.add(choice.name.toLowerCase());
        return true;
      });
    if (!name || choices.length === 0) return;
    result.push({ id: group.id || `grupo-${index + 1}`, name, required: !!group.required, multiple: !!group.multiple, choices });
  });
  return result;
}

/**
 * Validar ANTES de cleanOptionGroups: la normalización histórica convertía
 * precios inválidos en $0 y descartaba opciones con nombre repetido. Eso
 * cambiaría silenciosamente el precio que introdujo el negocio.
 * Se permiten placeholders completamente vacíos mientras se edita y cadenas
 * numéricas válidas de consumidores antiguos; ningún extra con nombre puede
 * guardarse con precio inválido o duplicado.
 */
export function assertValidOptionChoicesBeforeCleaning(groups: CatalogOptionGroup[] | undefined): void {
  if (!Array.isArray(groups)) return;
  for (const group of groups) {
    const groupName = String(group?.name ?? '').trim();
    const choices = Array.isArray(group?.choices) ? group.choices : [];
    const namedChoices = choices.filter(choice => String(choice?.name ?? '').trim());
    // Grupo nuevo sin completar: no tiene contenido que se vaya a publicar.
    if (!groupName && namedChoices.length === 0) continue;
    if (!groupName || namedChoices.length === 0
        || typeof group.required !== 'boolean' || typeof group.multiple !== 'boolean') {
      throw new Error('OPCIONES_CATALOGO_INVALIDAS: Completa el nombre y las opciones del grupo antes de guardar.');
    }
    const seen = new Set<string>();
    for (const choice of namedChoices) {
      const name = String(choice.name).trim().toLowerCase();
      const rawPrice: unknown = choice.price;
      const price = typeof rawPrice === 'number' ? rawPrice
        : typeof rawPrice === 'string' && rawPrice.trim() !== '' ? Number(rawPrice) : NaN;
      // El carrito opera con centavos: evitar desbordamiento o precisión
      // insegura incluso si el número original es finito.
      if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 100))) {
        throw new Error('OPCIONES_CATALOGO_INVALIDAS: Un extra tiene precio inválido. Revisa los importes antes de guardar.');
      }
      if (seen.has(name)) {
        throw new Error('OPCIONES_CATALOGO_INVALIDAS: Hay opciones con nombres repetidos en un mismo grupo.');
      }
      seen.add(name);
    }
  }
}

/**
 * No permitir dos grupos con la misma clave de selección o nombre.
 * El carrito indexa selecciones por group.id; IDs repetidos aplican una
 * elección a ambos grupos y pueden duplicar el importe de los extras.
 * Rechazar antes de escribir, sin eliminar ni renombrar opciones del dueño.
 */
export function assertUniqueOptionGroupIdentity(groups: CatalogOptionGroup[]): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const group of groups) {
    const id = group.id;
    const name = group.name;
    if (typeof id !== 'string' || !id.trim() || id.trim() !== id
        || typeof name !== 'string' || !name.trim()
        || ids.has(id) || names.has(name.toLowerCase())) {
      throw new Error('OPCIONES_CATALOGO_INVALIDAS: Hay grupos de opciones con identificadores o nombres repetidos. Revisa las opciones antes de guardar.');
    }
    ids.add(id);
    names.add(name.toLowerCase());
  }
}

/** Elegir en un grupo: si es de una sola opción reemplaza; si es múltiple, activa/desactiva. */
export function toggleChoice(group: CatalogOptionGroup, current: string[] | undefined, choiceName: string): string[] {
  const list = current || [];
  if (!group.multiple) return list.length === 1 && list[0] === choiceName && !group.required ? [] : [choiceName];
  return list.includes(choiceName) ? list.filter((name) => name !== choiceName) : [...list, choiceName];
}

/** Nombres de los grupos obligatorios que faltan por elegir. */
export function missingRequired(item: Pick<BusinessCatalogItem, 'optionGroups'>, selection: OptionSelection): string[] {
  return (item.optionGroups || [])
    .filter((group) => group.required && !(selection[group.id] || []).some((name) => group.choices.some((c) => c.name === name)))
    .map((group) => group.name);
}

/** Precio de una pieza: base + lo que suman las opciones elegidas. */
export function unitPriceFor(item: Pick<BusinessCatalogItem, 'price' | 'optionGroups'>, selection: OptionSelection): number {
  let total = Number(item.price) || 0;
  (item.optionGroups || []).forEach((group) => {
    (selection[group.id] || []).forEach((name) => {
      const choice = group.choices.find((c) => c.name === name);
      if (choice) total += choice.price;
    });
  });
  return money(total);
}

/** Texto corto: "Guiso: Nopales · Paquete: Con papas". */
export function selectionSummary(item: Pick<BusinessCatalogItem, 'optionGroups'>, selection: OptionSelection): string {
  return (item.optionGroups || [])
    .map((group) => {
      const names = group.choices.filter((c) => (selection[group.id] || []).includes(c.name)).map((c) => c.name);
      return names.length ? `${group.name}: ${names.join(', ')}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/** Identifica una línea del pedido: mismo producto con otras opciones es otra línea. */
export function selectionKey(itemId: string, item: Pick<BusinessCatalogItem, 'optionGroups'>, selection: OptionSelection): string {
  return `${itemId}::${selectionSummary(item, selection)}`;
}

/** ¿Muestra "desde"? Cuando una opción obligatoria cambia el precio. */
export function hasPriceFrom(item: Pick<BusinessCatalogItem, 'optionGroups'>): boolean {
  return (item.optionGroups || []).some((group) => group.required && group.choices.some((c) => c.price > 0));
}
