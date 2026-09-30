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
  'ghost-kitchen': { id: 'ghost-kitchen', label: 'Ghost Kitchen', items: [
    { name: 'Platillo estrella', description: 'Producto principal de tu cocina para venta por pedido.', price: 100, category: 'Especialidades', sortOrder: 10, popular: true },
    { name: 'Combo para compartir', description: 'Combinación pensada para pedidos y entrega a domicilio.', price: 160, category: 'Combos', sortOrder: 20 },
    { name: 'Acompañamiento', description: 'Guarnición o complemento para tu pedido.', price: 45, category: 'Acompañamientos', sortOrder: 30 },
    { name: 'Bebida', description: 'Bebida fría para acompañar tu pedido.', price: 30, category: 'Bebidas', sortOrder: 40 },
  ] },
  pizzeria: { id: 'pizzeria', label: 'Pizzería', items: [
    { name: 'Pizza clásica', description: 'Pizza con salsa de tomate y queso.', price: 120, category: 'Pizzas', sortOrder: 10, popular: true },
    { name: 'Pizza especial', description: 'Pizza de la casa con ingredientes seleccionados.', price: 150, category: 'Pizzas', sortOrder: 20 },
    { name: 'Refresco', description: 'Bebida fría.', price: 30, category: 'Bebidas', sortOrder: 30 },
  ] },
  perfumes: { id: 'perfumes', label: 'Perfumes y decants', items: [
    { name: 'Decant 5 ml', description: 'Decant de 5 ml del perfume seleccionado.', price: 120, category: 'Decants', sortOrder: 10, popular: true },
    { name: 'Perfume de diseñador', description: 'Fragancia original de diseñador.', price: 1200, category: 'Perfumes', sortOrder: 20 },
    { name: 'Perfume árabe', description: 'Fragancia árabe seleccionada.', price: 900, category: 'Perfumes árabes', sortOrder: 30 },
  ] },
  design: { id: 'design', label: 'Diseño gráfico', items: [
    { name: 'Diseño para redes', description: 'Diseño gráfico para publicación digital.', price: 250, category: 'Diseño', sortOrder: 10, popular: true },
    { name: 'Logo básico', description: 'Diseño de logotipo para negocio.', price: 800, category: 'Identidad', sortOrder: 20 },
  ] },
  other: { id: 'other', label: 'Otro negocio', items: [] },
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
