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
