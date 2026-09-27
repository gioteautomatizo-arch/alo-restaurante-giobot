export type BusinessCapability =
  | 'CATALOG' | 'PUBLIC_MENU' | 'MENU_IMPORT' | 'CART' | 'ORDERS' | 'ORDER_QUEUE'
  | 'POS' | 'INVENTORY' | 'RECIPES' | 'MODIFIERS' | 'TOPPINGS' | 'SHIFTS' | 'STAFF'
  | 'TABLES' | 'TABLE_ACCOUNTS' | 'PAYMENTS' | 'CUSTOMERS' | 'VIP' | 'PROMOTIONS'
  | 'DAILY_MENU' | 'EXPENSES' | 'RECEIPTS' | 'KITCHEN_STATIONS' | 'DELIVERY'
  | 'RESERVATIONS' | 'ASSISTANT_AI' | 'BUSINESS_SETTINGS';

export interface BusinessModule {
  id: string;
  title: string;
  description: string;
  capability: BusinessCapability;
  group: 'VENTAS' | 'OPERACION' | 'ADMINISTRACION' | 'CLIENTES' | 'IA';
  priority?: 'core' | 'advanced';
}

export interface BusinessTemplateConfig {
  id: string;
  name: string;
  description: string;
  catalogTemplateId?: string;
  capabilities: BusinessCapability[];
  modules: BusinessModule[];
}

const restaurantModules: BusinessModule[] = [
  { id: 'catalog', title: 'Catálogo', description: 'Productos, categorías, precios, fotos y disponibilidad.', capability: 'CATALOG', group: 'VENTAS' },
  { id: 'menu-import', title: 'Sube tu menú', description: 'Carga una foto o archivo para preparar una importación asistida por IA.', capability: 'MENU_IMPORT', group: 'IA' },
  { id: 'public-menu', title: 'Menú público', description: 'Vista digital para compartir por enlace o QR.', capability: 'PUBLIC_MENU', group: 'VENTAS' },
  { id: 'cart', title: 'Carrito', description: 'Compra y armado de pedidos del cliente.', capability: 'CART', group: 'VENTAS' },
  { id: 'orders', title: 'Pedidos', description: 'Recepción, seguimiento y estados de pedidos.', capability: 'ORDERS', group: 'VENTAS' },
  { id: 'queue', title: 'Cola de pedidos', description: 'Prioridades y flujo de preparación.', capability: 'ORDER_QUEUE', group: 'OPERACION' },
  { id: 'pos', title: 'POS / Caja', description: 'Ventas de mostrador y tickets.', capability: 'POS', group: 'VENTAS' },
  { id: 'inventory', title: 'Inventario', description: 'Existencias, movimientos y alertas.', capability: 'INVENTORY', group: 'OPERACION' },
  { id: 'recipes', title: 'Recetas / insumos', description: 'Costos y consumo de ingredientes.', capability: 'RECIPES', group: 'OPERACION', priority: 'advanced' },
  { id: 'modifiers', title: 'Modificadores', description: 'Tamaños, extras, opciones y personalizaciones.', capability: 'MODIFIERS', group: 'VENTAS' },
  { id: 'toppings', title: 'Toppings', description: 'Ingredientes y extras configurables.', capability: 'TOPPINGS', group: 'VENTAS' },
  { id: 'shifts', title: 'Turnos', description: 'Apertura, cierre y control de caja.', capability: 'SHIFTS', group: 'OPERACION' },
  { id: 'staff', title: 'Personal', description: 'Usuarios, roles y permisos.', capability: 'STAFF', group: 'ADMINISTRACION' },
  { id: 'tables', title: 'Mesas', description: 'Mapa, ocupación y sesiones.', capability: 'TABLES', group: 'OPERACION' },
  { id: 'accounts', title: 'Cuentas', description: 'Cuentas por mesa y consumo.', capability: 'TABLE_ACCOUNTS', group: 'VENTAS' },
  { id: 'payments', title: 'Pagos', description: 'Efectivo, tarjeta, transferencia y conciliación.', capability: 'PAYMENTS', group: 'VENTAS' },
  { id: 'customers', title: 'Clientes', description: 'Historial, datos y relaciones.', capability: 'CUSTOMERS', group: 'CLIENTES' },
  { id: 'vip', title: 'Clientes VIP', description: 'Beneficios y clientes frecuentes.', capability: 'VIP', group: 'CLIENTES', priority: 'advanced' },
  { id: 'promotions', title: 'Promociones', description: 'Descuentos, combos y campañas.', capability: 'PROMOTIONS', group: 'VENTAS', priority: 'advanced' },
  { id: 'daily-menu', title: 'Menú del día', description: 'Configuración rápida de platillos y combos.', capability: 'DAILY_MENU', group: 'VENTAS', priority: 'advanced' },
  { id: 'expenses', title: 'Gastos', description: 'Registro y control de egresos.', capability: 'EXPENSES', group: 'ADMINISTRACION' },
  { id: 'receipts', title: 'Recibos / reportes', description: 'Tickets, comprobantes e historial.', capability: 'RECEIPTS', group: 'ADMINISTRACION' },
  { id: 'kitchen', title: 'Cocina', description: 'Estaciones y preparación.', capability: 'KITCHEN_STATIONS', group: 'OPERACION' },
  { id: 'delivery', title: 'Delivery', description: 'Pedidos para entrega y seguimiento.', capability: 'DELIVERY', group: 'VENTAS', priority: 'advanced' },
  { id: 'reservations', title: 'Reservaciones', description: 'Agenda y reservas del negocio.', capability: 'RESERVATIONS', group: 'VENTAS', priority: 'advanced' },
  { id: 'assistant', title: 'Giobot', description: 'Asistente IA del negocio.', capability: 'ASSISTANT_AI', group: 'IA' },
  { id: 'settings', title: 'Configuración', description: 'Identidad, módulos, negocio y permisos.', capability: 'BUSINESS_SETTINGS', group: 'ADMINISTRACION' },
];

const baseCapabilities = restaurantModules.map((module) => module.capability);

export const BUSINESS_TEMPLATE_CONFIGS: Record<string, BusinessTemplateConfig> = {
  restaurant: { id: 'restaurant', name: 'Restaurante', description: 'Operación completa de restaurante.', capabilities: baseCapabilities, modules: restaurantModules },
  pizzeria: { id: 'pizzeria', name: 'Pizzería', description: 'Pedidos, tamaños, extras, delivery y cocina.', capabilities: ['CATALOG','PUBLIC_MENU','MENU_IMPORT','CART','ORDERS','ORDER_QUEUE','POS','INVENTORY','RECIPES','MODIFIERS','SHIFTS','STAFF','PAYMENTS','CUSTOMERS','PROMOTIONS','RECEIPTS','KITCHEN_STATIONS','DELIVERY','ASSISTANT_AI','BUSINESS_SETTINGS'], modules: restaurantModules.filter((m) => ['CATALOG','PUBLIC_MENU','MENU_IMPORT','CART','ORDERS','ORDER_QUEUE','POS','INVENTORY','RECIPES','MODIFIERS','SHIFTS','STAFF','PAYMENTS','CUSTOMERS','PROMOTIONS','RECEIPTS','KITCHEN_STATIONS','DELIVERY','ASSISTANT_AI','BUSINESS_SETTINGS'].includes(m.capability)) },
  creperia: { id: 'creperia', name: 'Crepería / Cafetería', description: 'Ecosistema operativo de Dulce Crepa adaptable a cualquier crepería.', catalogTemplateId: 'creperia', capabilities: baseCapabilities, modules: restaurantModules },
  perfumes: { id: 'perfumes', name: 'Perfumes y decants', description: 'Catálogo, inventario, clientes, POS y asesor IA.', capabilities: ['CATALOG','PUBLIC_MENU','MENU_IMPORT','CART','ORDERS','POS','INVENTORY','STAFF','PAYMENTS','CUSTOMERS','PROMOTIONS','RECEIPTS','ASSISTANT_AI','BUSINESS_SETTINGS'], modules: restaurantModules.filter((m) => ['CATALOG','PUBLIC_MENU','MENU_IMPORT','CART','ORDERS','POS','INVENTORY','STAFF','PAYMENTS','CUSTOMERS','PROMOTIONS','RECEIPTS','ASSISTANT_AI','BUSINESS_SETTINGS'].includes(m.capability)) },
  design: { id: 'design', name: 'Diseño gráfico', description: 'Clientes, cotizaciones, proyectos, anticipos e IA.', capabilities: ['CATALOG','ORDERS','POS','PAYMENTS','CUSTOMERS','EXPENSES','RECEIPTS','ASSISTANT_AI','BUSINESS_SETTINGS'], modules: restaurantModules.filter((m) => ['CATALOG','ORDERS','POS','PAYMENTS','CUSTOMERS','EXPENSES','RECEIPTS','ASSISTANT_AI','BUSINESS_SETTINGS'].includes(m.capability)) },
  other: { id: 'other', name: 'Otro negocio', description: 'Business Core con módulos activables.', capabilities: ['CATALOG','ORDERS','POS','PAYMENTS','CUSTOMERS','ASSISTANT_AI','BUSINESS_SETTINGS'], modules: restaurantModules.filter((m) => ['CATALOG','ORDERS','POS','PAYMENTS','CUSTOMERS','ASSISTANT_AI','BUSINESS_SETTINGS'].includes(m.capability)) },
};

export function getBusinessTemplateConfig(templateId: string): BusinessTemplateConfig {
  return BUSINESS_TEMPLATE_CONFIGS[templateId] || BUSINESS_TEMPLATE_CONFIGS.other;
}
