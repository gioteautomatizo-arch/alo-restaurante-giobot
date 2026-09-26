export type BusinessCapability =
  | 'CATALOG'
  | 'PUBLIC_MENU'
  | 'CART'
  | 'ORDERS'
  | 'ORDER_QUEUE'
  | 'POS'
  | 'INVENTORY'
  | 'SHIFTS'
  | 'STAFF'
  | 'TABLES'
  | 'TABLE_ACCOUNTS'
  | 'PAYMENTS'
  | 'CUSTOMERS'
  | 'VIP'
  | 'PROMOTIONS'
  | 'DAILY_MENU'
  | 'EXPENSES'
  | 'RECEIPTS'
  | 'KITCHEN_STATIONS'
  | 'ASSISTANT_AI';

export interface BusinessTemplateConfig {
  id: string;
  name: string;
  description: string;
  catalogTemplateId?: string;
  capabilities: BusinessCapability[];
}

export const BUSINESS_TEMPLATE_CONFIGS: Record<string, BusinessTemplateConfig> = {
  restaurant: {
    id: 'restaurant',
    name: 'Restaurante',
    description: 'Operación completa de restaurante con mesas, cocina, ventas e inventario.',
    capabilities: [
      'CATALOG', 'PUBLIC_MENU', 'CART', 'ORDERS', 'ORDER_QUEUE', 'POS',
      'INVENTORY', 'SHIFTS', 'STAFF', 'TABLES', 'TABLE_ACCOUNTS', 'PAYMENTS',
      'CUSTOMERS', 'VIP', 'PROMOTIONS', 'DAILY_MENU', 'EXPENSES', 'RECEIPTS',
      'KITCHEN_STATIONS', 'ASSISTANT_AI',
    ],
  },
  pizzeria: {
    id: 'pizzeria',
    name: 'Pizzería',
    description: 'Pedidos, tamaños, extras, delivery y cocina.',
    capabilities: [
      'CATALOG', 'PUBLIC_MENU', 'CART', 'ORDERS', 'ORDER_QUEUE', 'POS',
      'INVENTORY', 'SHIFTS', 'STAFF', 'PAYMENTS', 'CUSTOMERS', 'PROMOTIONS',
      'RECEIPTS', 'KITCHEN_STATIONS', 'ASSISTANT_AI',
    ],
  },
  creperia: {
    id: 'creperia',
    name: 'Crepería / Cafetería',
    description: 'El ecosistema operativo de Dulce Crepa adaptado a cualquier crepería.',
    catalogTemplateId: 'creperia',
    capabilities: [
      'CATALOG', 'PUBLIC_MENU', 'CART', 'ORDERS', 'ORDER_QUEUE', 'POS',
      'INVENTORY', 'SHIFTS', 'STAFF', 'TABLES', 'TABLE_ACCOUNTS', 'PAYMENTS',
      'CUSTOMERS', 'VIP', 'PROMOTIONS', 'DAILY_MENU', 'EXPENSES', 'RECEIPTS',
      'KITCHEN_STATIONS', 'ASSISTANT_AI',
    ],
  },
  perfumes: {
    id: 'perfumes',
    name: 'Perfumes y decants',
    description: 'Catálogo, inventario, clientes, POS y asesor IA.',
    capabilities: ['CATALOG', 'PUBLIC_MENU', 'CART', 'ORDERS', 'POS', 'INVENTORY', 'STAFF', 'PAYMENTS', 'CUSTOMERS', 'PROMOTIONS', 'RECEIPTS', 'ASSISTANT_AI'],
  },
  design: {
    id: 'design',
    name: 'Diseño gráfico',
    description: 'Clientes, cotizaciones, proyectos, anticipos e IA.',
    capabilities: ['CATALOG', 'ORDERS', 'POS', 'PAYMENTS', 'CUSTOMERS', 'EXPENSES', 'RECEIPTS', 'ASSISTANT_AI'],
  },
  other: {
    id: 'other',
    name: 'Otro negocio',
    description: 'Business Core con módulos activables.',
    capabilities: ['CATALOG', 'ORDERS', 'POS', 'PAYMENTS', 'CUSTOMERS', 'ASSISTANT_AI'],
  },
};

export function getBusinessTemplateConfig(templateId: string): BusinessTemplateConfig {
  return BUSINESS_TEMPLATE_CONFIGS[templateId] || BUSINESS_TEMPLATE_CONFIGS.other;
}
