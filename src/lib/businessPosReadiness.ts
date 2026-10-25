import type { BusinessCatalogItem } from './businessCatalogService';
export interface BusinessPosCartLine { item: BusinessCatalogItem; quantity: number; }
/** El POS básico no captura personalizaciones; nunca omitir selecciones obligatorias. */
export function isSimpleBusinessPosItem(item: BusinessCatalogItem): boolean {
  return !!item.id.trim() && !!item.name.trim() && item.available
    && typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0
    && !(item.optionGroups || []).some((group) => group.required);
}
/** No reutilizar productos retirados, agotados o con precios cambiados. */
export function outdatedBusinessPosCartIds(lines: BusinessPosCartLine[], catalog: BusinessCatalogItem[]): string[] {
  const current = new Map(catalog.map((item) => [item.id, item] as const));
  return lines.filter((line) => {
    const latest = current.get(line.item.id);
    return !latest || !isSimpleBusinessPosItem(latest)
      || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
      || latest.name !== line.item.name || latest.price !== line.item.price;
  }).map((line) => line.item.id);
}
export function canSubmitBusinessPosOrder(
  catalogStatus: 'loading' | 'ready' | 'error',
  lines: BusinessPosCartLine[], catalog: BusinessCatalogItem[], saving: boolean,
): boolean {
  return catalogStatus === 'ready' && !saving && lines.length > 0
    && outdatedBusinessPosCartIds(lines, catalog).length === 0;
}
