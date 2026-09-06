export type CategoryId = 
  | 'all'
  | 'desayunos'
  | 'bebidas'
  | 'frios-frappes'
  | 'jugos-licuados'
  | 'panaderia'
  | 'tortas-molletes'
  | 'chapatas-sandwiches'
  | 'hamburguesas'
  | 'comida-corrida'
  | 'antojitos'
  | 'especialidades'
  | 'ensaladas'
  | 'fin-de-semana';

export interface SizeOption {
  name: string; // e.g., 'Chico', 'Mediano', 'Grande'
  price: number;
}

export interface ExtraOption {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  price: number; // Base price or starting price
  sizes?: SizeOption[];
  options?: string[]; // Choice options, e.g. ['Jamón', 'Tocino', 'Chorizo']
  extras?: ExtraOption[];
  image?: string;
  popular?: boolean;
  isComboAvailable?: boolean;
  comboPrice?: number;
  weekendOnly?: 'Sábados' | 'Domingos';
}

export interface CartItem {
  cartId: string; // Unique instance ID in cart
  item: MenuItem;
  quantity: number;
  selectedSize?: SizeOption;
  selectedOption?: string;
  selectedExtras?: ExtraOption[];
  specialInstructions?: string;
  unitPrice: number;
  totalPrice: number;
  // Specific customizers
  customSalad?: SaladCustomization;
  customComidaCorrida?: ComidaCorridaCustomization;
}

export interface SaladCustomization {
  proteina: string;
  fruta: string;
  topping: string;
  aderezo: string;
}

export interface ComidaCorridaCustomization {
  primerTiempo: string; // 'Consumé del día' | 'Sopa del día'
  segundoTiempo: string; // 'Arroz' | 'Pasta'
  tercerTiempo: string; // 'Guisado del día', 'Enchiladas verdes/rojas', 'Milanesa res/pollo', 'Bistec/Pechuga asada (+$5)', 'Tacos dorados', 'Enchiladas suizas (+$10)'
  extraAgrega?: string; // 'Sin extra', 'Huevo (+$10)', 'Plátano (+$10)'
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'giobot';
  text: string;
  timestamp: string;
  suggestedAction?: {
    label: string;
    actionType: 'add_to_cart' | 'open_builder' | 'filter_category';
    payload?: any;
  };
}

export interface VipProfile {
  id?: string; // Document ID en Firestore (hash SHA-256 de teléfono normalizado + PIN)
  restaurantId?: string; // 'alo-restaurante'
  memberId: string;
  customerName: string;
  phone: string; // 10 dígitos normalizados
  pinHash?: string; // Hash seguro del PIN (nunca en texto plano)
  address?: string;
  reference?: string;
  preferredPayment?: 'efectivo' | 'transferencia' | 'tarjeta';
  preferredOrderType?: OrderType;
  stamps: number; // 0 to N
  totalOrders: number;
  rewardAvailable: boolean;
  pendingStampsToValidate?: number; // Sellos locales migrados pendientes de validación administrativa
  syncedWithCloud?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type OrderType = 'dine_in' | 'pickup' | 'delivery';

export interface OrderDetails {
  customerName: string;
  orderType: OrderType;
  address?: string;
  addressReference?: string;
  phone?: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta';
  cashAmount?: number; // Para cuánto cambio necesita
  bringOwnContainer: boolean; // 10% discount toggle!
  notes?: string;
}

// -------------------------------------------------------------
// SISTEMA ADMINISTRATIVO - ¡ALÓ! RESTAURANTE
// -------------------------------------------------------------

export type UserRole =
  | 'DUEÑA'
  | 'ADMINISTRADOR'
  | 'ENCARGADO'
  | 'CAJA'
  | 'MESERO'
  | 'COCINA'
  | 'EMPLEADO';

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  pin?: string; // PIN local legado (4-6 dígitos). V3 prefiere correo + contraseña Firebase.
  email?: string; // Correo de acceso individual
  firebaseUid?: string; // UID de Firebase Auth cuando la cuenta ya fue migrada
  active: boolean;
  phone?: string;
  avatarColor?: string;
  createdAt: string;
}

export type ExpenseCategory = 
  | 'Cafetería'
  | 'Cocina'
  | 'Taller / mantenimiento'
  | 'Limpieza'
  | 'Proveedores'
  | 'Otros';

export interface ExpenseRecord {
  id: string;
  shiftId: string;
  concept: string;
  category: ExpenseCategory;
  amount: number;
  registeredBy: string;
  registeredById: string;
  date: string;
  time: string;
  note?: string;
  paidWith: 'efectivo_caja' | 'otro';
}

export type InventoryControlType = 'cantidad' | 'folio';

export interface InventoryItem {
  id: string;
  name: string;
  category: 'Desechables & Vasos' | 'Panadería' | 'Bebidas' | 'Abarrotes & Varios' | 'Operación';
  unit: string; // 'pz', 'paq', 'kg', etc.
  tipoControl?: InventoryControlType; // 'cantidad' (por piezas) | 'folio' (por rango)
  initialQty: number;
  entriesQty: number;
  finalQty: number;
  consumption: number; // For cantidad: initialQty + entriesQty - finalQty. For folio: (folioFinal - folioInicial + 1) + entriesQty
  // Campos específicos de control por Folio / Rango
  folioInicial?: number | null;
  folioFinal?: number | null;
  notes?: string;
  lastUpdated: string;
  updatedBy?: string;
}

export interface ShiftRecord {
  id: string;
  createdAt?: string; // ISO string como origen temporal único
  date: string; // '28/08/2026'
  shiftType: 'AM' | 'PM';
  openedAt: string; // '7:55 AM'
  openedAtTimestamp?: string; // ISO string de apertura
  openedByUserId?: string; // ID permanente de quien abrió el turno
  openedByName?: string; // Nombre permanente de quien abrió el turno
  closedAt?: string; // '05:30 PM'
  closedAtTimestamp?: string; // ISO string de cierre
  closedByUserId?: string; // ID de quien cerró el turno si fue un tercero
  closedByName?: string; // Nombre de quien cerró el turno
  closedByReason?: string; // Motivo de cierre (obligatorio si cierra otra persona)
  responsibleUser: string; // Responsable original del turno (nunca se cambia retroactivamente)
  responsibleUserId: string;
  status: 'abierto' | 'cerrado';
  // Caja y Cuadre
  initialCashFund: number; // Fondo inicial de caja
  salesCash: number; // Venta en efectivo
  salesCard: number; // Venta con tarjeta
  salesPlatforms: number; // Venta en plataformas (Uber, Didi, etc)
  totalSales: number; // Calculado automático
  cashExpenses: number; // Gastos pagados con efectivo de caja
  expectedCash: number; // Venta efectivo - Gastos efectivo + Fondo inicial
  countedCashAtClose?: number; // Efectivo contado al cierre
  cashDifference?: number; // contado - esperado
  notes?: string;
  inventorySnapshot?: InventoryItem[];
}

export interface ActivityLog {
  id: string;
  timestamp: string; // ISO string
  dateFormatted: string; // '26 Ago'
  timeFormatted: string; // '5:42 PM'
  userName: string;
  userId: string;
  userRole: UserRole;
  action: string; // 'Registró gasto de $240: Mayonesa'
  category: 'gasto' | 'inventario' | 'turno' | 'menu' | 'sesion' | 'usuario' | 'sistema' | 'cxc' | 'sobre';
  details?: string;
  previousValue?: string;
  newValue?: string;
}

export interface DailyMenuConfig {
  isAvailable: boolean;
  price: number;
  entrada: string;
  platoFuerte: string;
  guarniciones: string[];
  aguaDelDia: string;
  postreDelDia: string;
  opcionesAlternativas: string[];
  updatedAt: string;
  updatedBy: string;
}

export interface RestaurantInfo {
  restaurantId: string;
  address: string;
  whatsapp: string;
  whatsappRaw: string;
  openingHours: string;
  ecoDiscountPercent?: number;
  ecoDiscountDescription?: string;
  deliveryFee?: number;
  vipStampsRequired?: number;
  vipRewardDescription?: string;
  servicePolicies?: string;
  activePromotions?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type CxcStatus = 'Pendiente' | 'Pagado' | 'Anulado';

export interface CxcRecord {
  id: string;
  person: string; // Persona
  amount: number; // Monto
  concept: string; // Concepto
  date: string; // Fecha (e.g. '2026-08-28')
  status: CxcStatus; // 'Pendiente' | 'Pagado' | 'Anulado'
  registeredBy?: string;
  registeredById?: string;
  paidAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledById?: string;
  cancellationReason?: string;
  notes?: string;
  createdAt: string;
}

// -------------------------------------------------------------
// MÓDULO: SOBRE / RESGUARDO (Dinero físico en resguardo de Dueña)
// -------------------------------------------------------------

export type SobreMovementType = 'SALDO_INICIAL' | 'ENTRADA' | 'GASTO' | 'CONTEO' | 'AJUSTE' | 'TRANSICION';

export type SobreOutflowCategory =
  | 'Retiro dueña'
  | 'Adelanto'
  | 'Proveedores'
  | 'Personal'
  | 'Mantenimiento'
  | 'Compra extraordinaria'
  | 'Otros';

export type SobreInflowCategory =
  | 'Aportación dueña'
  | 'Resguardo / Fondo'
  | 'Reembolso / Devolución'
  | 'Otros';

export interface SobreMovement {
  id: string;
  type: SobreMovementType;
  amount: number; // Para GASTO/ENTRADA/SALDO_INICIAL: valor positivo. Para AJUSTE: monto a sumar/restar. Para CONTEO/TRANSICION: conteo físico.
  concept: string;
  category?: string; // Categoría de gasto o entrada o transición
  personOrVendor?: string; // Persona o proveedor opcional
  notes?: string;
  date: string; // '28/08/2026'
  time: string; // '07:05 PM'
  timestamp: string; // ISO string
  userId: string;
  userName: string;
  userRole: UserRole;
  resultingBalance: number; // Saldo teórico resultante después del movimiento
  // Específico para Conteos Físicos y Transición
  theoreticalBalanceAtCount?: number;
  physicalCountedAmount?: number;
  countDifference?: number; // physical - theoretical
  isDifferencePending?: boolean; // si hubo diferencia y aún no se concilia
  reconciledAt?: string;
  reconciledBy?: string;
  // Específico para Anulaciones (No borrado definitivo)
  isCancelled?: boolean;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledById?: string;
  cancelReason?: string;
}

export interface SobreSummary {
  currentTheoreticalBalance: number; // Saldo actual del Sobre
  totalInflows: number; // Entradas acumuladas
  totalOutflows: number; // Salidas acumuladas
  totalAdjustments: number; // Ajustes de conciliación acumulados
  initialBalance: number; // Saldo inicial si existe
  transitionBalance?: number; // Saldo base de transición si existe
  transitionDate?: string;
  transitionTime?: string;
  transitionReason?: string;
  transitionUser?: string;
  hasActiveTransition?: boolean;
  lastPhysicalCount?: {
    date: string;
    time: string;
    physicalAmount: number;
    theoreticalAmount: number;
    difference: number;
    userName: string;
  };
  pendingDifference: number; // Diferencia pendiente si el último conteo o estado tiene desfase sin conciliar
  hasPendingDifference: boolean;
}

// -------------------------------------------------------------
// CONTROL OPERATIVO DE MESAS
// -------------------------------------------------------------
export type TableStatus = 'LIBRE' | 'OCUPADA' | 'CUENTA' | 'LIMPIEZA';
export type TableCourse = '1ER_TIEMPO' | '2DO_TIEMPO' | '3ER_TIEMPO' | 'FINALIZADO';

export interface TableRecord {
  tableId: string; // e.g. 'table-1'
  tableNumber: number; // e.g. 1
  label?: string; // e.g. 'Mesa 1'
  status: TableStatus;
  guestCount: number;
  waiterId: string;
  waiterName: string;
  currentCourse?: TableCourse;
  needsTortillas: boolean;
  needsDrinks: boolean;
  needsSecondCourse: boolean;
  needsThirdCourse: boolean;
  needsBill: boolean;
  notes?: string;
  openedAt?: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName?: string;
  restaurantId: 'alo-restaurante';
  capacity?: number;
  location?: 'salon' | 'terraza' | 'barra';
}

// -------------------------------------------------------------
// SOLICITUDES DE ATENCIÓN A MESA POR QR (PÚBLICAS)
// -------------------------------------------------------------
export type TableServiceRequestType =
  | 'LLAMAR_MESERO'
  | 'TORTILLAS'
  | 'BEBIDAS'
  | 'SEGUNDO_TIEMPO'
  | 'TERCER_TIEMPO'
  | 'PEDIR_CUENTA';

export interface TableServiceRequest {
  id?: string;
  tableNumber: number; // 1, 2, 4, 5, 6, 7, 8, 9
  requestType: TableServiceRequestType;
  status: 'PENDIENTE';
  restaurantId: 'alo-restaurante';
  createdAt: string;
}



// -------------------------------------------------------------
// V3 - COMANDAS / PEDIDOS EN TIEMPO REAL
// -------------------------------------------------------------
export type RestaurantOrderStatus =
  | 'NUEVO'
  | 'PREPARANDO'
  | 'LISTO'
  | 'ENTREGADO'
  | 'CANCELADO';

export interface RestaurantOrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  selectedSize?: string;
  selectedOption?: string;
  extras?: string[];
  specialInstructions?: string;
  customizationSummary?: string;
}

export type RestaurantOrderBillingStatus = 'PENDIENTE' | 'PAGADO';

export type RestaurantOrderSource = 'CLIENTE_QR' | 'MESERO' | 'CAJA';

export interface RestaurantOrder {
  id?: string;
  code: string;
  restaurantId: 'alo-restaurante';
  orderType: OrderType;
  tableNumber?: number;
  tableSessionId?: string;
  accountId?: string;
  accountLabel?: string;
  orderSource?: RestaurantOrderSource;
  capturedById?: string;
  capturedByName?: string;
  customerName: string;
  phone?: string;
  address?: string;
  addressReference?: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta';
  bringOwnContainer: boolean;
  notes?: string;
  items: RestaurantOrderItem[];
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  status: RestaurantOrderStatus;
  billingStatus?: RestaurantOrderBillingStatus;
  paidAt?: string;
  paymentId?: string;
  createdAt: string;
  updatedAt: string;
  claimedById?: string;
  claimedByName?: string;
  readyAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

// -------------------------------------------------------------
// V4.1 - SESIÓN DE MESA / CUENTAS OPCIONALES
// -------------------------------------------------------------
export type TableAccountMode = 'GENERAL' | 'SEPARADAS';
export type TableSessionStatus = 'ACTIVA' | 'CUENTA' | 'CERRADA';
export type TableSessionOpenedBy = 'QR' | 'MESERO';

export interface TableSessionAccount {
  id: string;
  label: string;
  customerName?: string;
  createdAt: string;
}

export interface TableSession {
  id?: string;
  restaurantId: 'alo-restaurante';
  tableNumber: number;
  guestCount: number;
  accountMode: TableAccountMode;
  accounts: TableSessionAccount[];
  status: TableSessionStatus;
  openedBy: TableSessionOpenedBy;
  openedAt: string;
  updatedAt: string;
  updatedById?: string;
  updatedByName?: string;
}

// -------------------------------------------------------------
// V4 - CUENTAS POR MESA / CAJA / COBROS
// -------------------------------------------------------------
export type TablePaymentMethod =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA'
  | 'MERCADO_PAGO';

export interface TablePayment {
  id?: string;
  code: string;
  restaurantId: 'alo-restaurante';
  tableNumber: number;
  tableSessionId?: string;
  accountId?: string;
  accountLabel?: string;
  orderIds: string[];
  subtotal: number;
  discountAmount: number;
  tipAmount: number;
  total: number;
  paymentMethod: TablePaymentMethod;
  cashReceived?: number;
  changeDue: number;
  status: 'PAGADO' | 'ANULADO';
  createdAt: string;
  chargedById: string;
  chargedByName: string;
}

