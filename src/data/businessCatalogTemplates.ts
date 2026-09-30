import type { BusinessCatalogItem } from '../lib/businessCatalogService';

type TemplateItem = Omit<BusinessCatalogItem, 'id' | 'available'>;

export interface BusinessCatalogTemplate {
  id: string;
  label: string;
  items: TemplateItem[];
}

export const BUSINESS_CATALOG_TEMPLATES: Record<string, BusinessCatalogTemplate> = {
  restaurant: {
    id: 'restaurant',
    label: 'Restaurante',
    items: [
      { name: 'Desayuno de la casa', description: 'Desayuno completo preparado al momento.', price: 85, category: 'Desayunos', sortOrder: 10, popular: true },
      { name: 'Huevos al gusto', description: 'Huevos preparados a tu elección con guarnición.', price: 75, category: 'Desayunos', sortOrder: 20 },
      { name: 'Comida corrida', description: 'Menú del día con opciones que pueden cambiar según disponibilidad.', price: 95, category: 'Comida', sortOrder: 30, popular: true },
      { name: 'Platillo de la casa', description: 'Especialidad del restaurante preparada al momento.', price: 120, category: 'Platillos', sortOrder: 40, popular: true },
      { name: 'Ensalada de la casa', description: 'Ensalada fresca con ingredientes seleccionados.', price: 85, category: 'Platillos', sortOrder: 50 },
      { name: 'Café americano', description: 'Café caliente recién preparado.', price: 35, category: 'Bebidas', sortOrder: 60 },
      { name: 'Licuado de fresa', description: 'Licuado de fresa preparado al momento.', price: 50, category: 'Bebidas', sortOrder: 70 },
      { name: 'Jugo de naranja', description: 'Jugo de naranja natural.', price: 45, category: 'Bebidas', sortOrder: 80 },
    ],
  },
  creperia: {
    id: 'creperia',
    label: 'Crepas / Cafetería',
    items: [
      { name: 'Crepa de Nutella y fresa', description: 'Crepa dulce rellena de Nutella y fresas frescas.', price: 65, category: 'Crepas dulces', sortOrder: 10, popular: true },
      { name: 'Crepa de cajeta con nuez', description: 'Crepa dulce con cajeta y nuez picada.', price: 60, category: 'Crepas dulces', sortOrder: 20 },
      { name: 'Crepa de jamón y queso', description: 'Crepa salada con jamón y queso gratinado.', price: 70, category: 'Crepas saladas', sortOrder: 30, popular: true },
      { name: 'Crepa de champiñones y queso', description: 'Crepa salada con champiñones salteados y queso.', price: 75, category: 'Crepas saladas', sortOrder: 40 },
      { name: 'Café americano', description: 'Café de grano recién hecho.', price: 35, category: 'Bebidas calientes', sortOrder: 50 },
      { name: 'Capuchino', description: 'Espresso con leche vaporizada y espuma.', price: 45, category: 'Bebidas calientes', sortOrder: 60 },
      { name: 'Chocolate caliente', description: 'Chocolate cremoso, ideal para acompañar una crepa dulce.', price: 45, category: 'Bebidas calientes', sortOrder: 70 },
      { name: 'Frappé de café', description: 'Café helado y espumoso.', price: 55, category: 'Bebidas frías', sortOrder: 80 },
      { name: 'Malteada de vainilla', description: 'Malteada cremosa clásica.', price: 60, category: 'Bebidas frías', sortOrder: 90 },
    ],
  },
};

export function getBusinessCatalogTemplate(templateId: string): BusinessCatalogTemplate | null {
  return BUSINESS_CATALOG_TEMPLATES[templateId] || null;
}
