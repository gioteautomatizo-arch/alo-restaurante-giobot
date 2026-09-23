import type { BusinessCatalogItem } from '../lib/businessCatalogService';

type TemplateItem = Omit<BusinessCatalogItem, 'id' | 'available'>;

export interface BusinessCatalogTemplate {
  id: string;
  label: string;
  items: TemplateItem[];
}

export const BUSINESS_CATALOG_TEMPLATES: Record<string, BusinessCatalogTemplate> = {
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
