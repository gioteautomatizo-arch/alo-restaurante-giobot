import { RestaurantOrder, RestaurantOrderItem } from '../types';
import type { PreparationStation } from './ordersService';

const CAFETERIA_PRODUCT_IDS = new Set([
  'espresso',
  'americano',
  'cappuccino',
  'latte',
  'chai',
  'cafe-olla',
  'cafe-de-olla',
  'chocolate',
  'chocolate-blanco',
  'mocca',
  'te',
  'ice-coffee',
  'ice-coffee-leche',
  'naranjada-mineral',
  'limonada-mineral',
  'te-frio',
  'frappe-mocca',
  'frappe-chocolate',
  'frappe-chocolate-blanco',
  'frappe-cookies-cream',
  'frappuccino',
  'refresco',
  'agua-botella-05',
  'agua-botella-1',
  'agua-botella-15',
  'licuado-1-fruta',
  'licuado-combinado',
  'agua-fresca',
  'cocktail-frutas',
  'jugo-natural',
  'jugo-combinado',
]);

function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function looksLikeCafeteriaProduct(item: RestaurantOrderItem): boolean {
  if (CAFETERIA_PRODUCT_IDS.has(item.productId)) return true;

  const text = normalize(`${item.productId} ${item.name}`);
  return [
    'cafe',
    'espresso',
    'americano',
    'cappuccino',
    'latte',
    'chai',
    'chocolate',
    'mocca',
    'te frio',
    'frappe',
    'frappuccino',
    'refresco',
    'agua fresca',
    'botella de agua',
    'licuado',
    'jugo',
    'naranjada',
    'limonada',
    'cocktail de frutas',
    'coctel de frutas',
  ].some((term) => text.includes(term));
}

function isExactBreakfastPackageChoice(extra: string): boolean {
  const text = normalize(extra);
  return (
    text === 'paquete jugo' ||
    text === 'paquete fruta' ||
    text === 'paquete cafe de olla' ||
    text === 'paquete te'
  );
}

function isLegacyBreakfastPackage(extra: string): boolean {
  const text = normalize(extra);
  return text.includes('hazlo paquete') || text.includes('paquete desayuno');
}

function isCafeteriaExtra(extra: string): boolean {
  const text = normalize(extra);
  if (isExactBreakfastPackageChoice(extra) || isLegacyBreakfastPackage(extra)) return true;
  return [
    'jugo',
    'fruta',
    'cafe',
    'te',
    'licuado',
    'bebida',
  ].some((term) => text.includes(term));
}

function cafeteriaDisplayLabel(extra: string): string {
  const value = String(extra || '').trim();
  if (!value) return '';
  if (isLegacyBreakfastPackage(value)) return 'Paquete de desayuno';
  return value.replace(/^Paquete\s*:?\s*/i, '').trim();
}

function routedInstruction(value: string | undefined, station: PreparationStation): string | undefined {
  if (!value) return undefined;

  const kitchenMatch = value.match(/(?:^|\|)\s*Cocina:\s*([^|]+)/i)?.[1]?.trim();
  const cafeteriaMatch = value.match(/(?:^|\|)\s*Cafeter[ií]a:\s*([^|]+)/i)?.[1]?.trim();

  if (kitchenMatch || cafeteriaMatch) {
    return station === 'COCINA' ? kitchenMatch || undefined : cafeteriaMatch || undefined;
  }

  // Compatibilidad con pedidos anteriores: una nota sin prefijo sigue siendo del platillo.
  return station === 'COCINA' ? value : undefined;
}

export function getCafeteriaExtras(item: RestaurantOrderItem): string[] {
  const extras = item.extras || [];
  const exactChoices = extras.filter(isExactBreakfastPackageChoice);
  if (exactChoices.length > 0) return exactChoices;
  return extras.filter(isCafeteriaExtra);
}

export function getKitchenExtras(item: RestaurantOrderItem): string[] {
  return (item.extras || []).filter((extra) => !isCafeteriaExtra(extra));
}

export function getItemStations(item: RestaurantOrderItem): PreparationStation[] {
  if (looksLikeCafeteriaProduct(item)) return ['CAFETERIA'];

  const stations: PreparationStation[] = ['COCINA'];
  if (getCafeteriaExtras(item).length > 0) stations.push('CAFETERIA');
  return stations;
}

export function getOrderRequiredStations(order: RestaurantOrder): PreparationStation[] {
  const stations = new Set<PreparationStation>();
  order.items.forEach((item) => getItemStations(item).forEach((station) => stations.add(station)));
  return Array.from(stations);
}

export function getOrderItemsForStation(
  order: RestaurantOrder,
  station: PreparationStation
): RestaurantOrderItem[] {
  const result: RestaurantOrderItem[] = [];

  order.items.forEach((item) => {
    const baseIsCafeteria = looksLikeCafeteriaProduct(item);

    if (station === 'CAFETERIA') {
      if (baseIsCafeteria) {
        result.push({
          ...item,
          specialInstructions: routedInstruction(item.specialInstructions, 'CAFETERIA'),
        });
        return;
      }

      const cafeteriaExtras = getCafeteriaExtras(item);
      if (cafeteriaExtras.length > 0) {
        const preparationNames = cafeteriaExtras
          .map(cafeteriaDisplayLabel)
          .filter(Boolean);

        result.push({
          ...item,
          name: preparationNames.join(' + ') || item.name,
          selectedSize: undefined,
          selectedOption: undefined,
          customizationSummary: `Del platillo: ${item.name}`,
          extras: undefined,
          specialInstructions: routedInstruction(item.specialInstructions, 'CAFETERIA'),
        });
      }
      return;
    }

    if (!baseIsCafeteria) {
      result.push({
        ...item,
        extras: getKitchenExtras(item),
        specialInstructions: routedInstruction(item.specialInstructions, 'COCINA'),
      });
    }
  });

  return result;
}