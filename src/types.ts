export type CategoryId = 
  | 'all'
  | 'bebidas'
  | 'licuados-agua-fruta-jugos'
  | 'panaderia'
  | 'molletes-sincronizadas-tortas'
  | 'desayunos'
  | 'chapatas-sandwiches'
  | 'hamburguesas'
  | 'comida-corrida'
  | 'antojitos'
  | 'especialidades'
  | 'ensaladas'
  | 'fin-de-semana';

export interface SizeOption {
  name: string;
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
  price: number;
  sizes?: SizeOption[];
  options?: string[];
  extras?: ExtraOption[];
  image?: string;
  popular?: boolean;
  isComboAvailable?: boolean;
  comboPrice?: number;
  weekendOnly?: 'Sábados' | 'Domingos';
}

export interface CartItem {
  cartId: string;
  item: MenuItem;
  quantity: number;
  selectedSize?: SizeOption;
  selectedOption?: string;
  selectedExtras?: ExtraOption[];
  specialInstructions?: string;
  unitPrice: number;
  totalPrice: number;
  customSalad?: SaladCustomization;
  customComidaCorrida?: ComidaCorridaCustomization;
  personId?: string;
  personIndex?: number;
  personLabel?: string;
}

export interface SaladCustomization {
  proteina: string;
  fruta: string;
  topping: string;
  aderezo: string;
}

export interface ComidaCorridaCustomization {
  primerTiempo: string;
  segundoTiempo: string;
  tercerTiempo: string;
  extraAgrega?: string;
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
  id?: string;
  restaurantId?: string;
  memberId: string;
  customerName: string;
  phone: string;
  pinHash?: string;
  address?: string;
  reference?: string;
  preferredPayment?: 'efectivo' | 'transferencia' | 'tarjeta';
  preferredOrderType?: OrderType;
  stamps: number;
  totalOrders: number;
  rewardAvailable: boolean;
  pendingStampsToValidate?: number;
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
  cashAmount?: number;
  bringOwnContainer: boolean;
  notes?: string;
}

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
  pin?: string;
  email?: string;
  firebaseUid?: string;
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
  unit: string;
  tipoControl?: InventoryControlType;
  initialQty: number;
  entriesQty: number;
  finalQty: number;
  consumption: number;
  folioInicial?: number | null;
  folioFinal?: number | null;
  notes?: string;
  lastUpdated: string;
  updatedBy?: string;
}

export interface ShiftRecord {
  id: string;
  createdAt?: string;
  date: string;
  shiftType: 'AM' | 'PM';
  openedAt: string;
  openedAtTimestamp?: string;
  openedByUserId?: string;
  openedByName?: string;
  closedAt?: string;
  closedAtTimestamp?: string;
  closedByUserId?: string;
  closedByName?: string;
  closedByReason?: string;
  responsibleUser: string;
  responsibleUserId: string;
  status: 'abierto' | 'cerrado';
  initialCashFund: number;
  salesCash: number;
  salesCard: number;
  salesPlatforms: number;
  totalSales: number;
  cashExpenses: number;
  expectedCash: number;
  countedCashAtClose?: number;
  cashDifference?: number;
  notes?: string;
  inventorySnapshot?: InventoryItem[];
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  dateFormatted: string;
  timeFormatted: string;
  userName: string;
  userId: string;
  userRole: UserRole;
  action: string;
  category: 'gasto' | 'inventario' | 'turno' | 'menu' | 'sesion' | 'usuario' | 'sistema' | 'cxc' | 'sobre';
  details?: string;
  previousValue?: string;
  newValue?: string;
}

export type ServiceMode = 'AUTO' | 'DESAYUNO' | 'COMIDA';
export type EffectiveService = 'DESAYUNO' | 'COMIDA';
export type ComidaCorridaAvailabilityStatus =
  | 'DISPONIBLE'
  | 'ULTIMAS_PORCIONES'
  | 'AGOTADA'
  | 'NO_DISPONIBLE';

export interface DailyMenuConfig {
  isAvailable: boolean;
  availabilityStatus?: ComidaCorridaAvailabilityStatus;
  availabilityStatusDate?: string;
  availableWeekdays?: number[];
  quickAlternatives?: string[];
  price: number;
  entrada: string;
  platoFuerte: string;
  guarniciones: string[];
  aguaDelDia: string;
  postreDelDia: string;
  opcionesAlternativas: string[];
  serviceMode?: ServiceMode;
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
  person: string;
  amount: number;
  concept: string;
  date: string;
  status: CxcStatus;
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
  amount: number;
  concept: string;
  category?: string;
  personOrVendor?: string;
  notes?: string;
  date: string;
  time: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  resultingBalance: number;
  theoreticalBalanceAtCount?: number;
  physicalCountedAmount?: number;
  countDifference?: number;
  isDifferencePending?: boolean;
  reconciledAt?: string;
  reconciledBy?: string;
  isCancelled?: boolean;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledById?: string;
  cancelReason?: string;
}

export interface SobreSummary {
  currentTheoreticalBalance: number;
  totalInflows: number;
  totalOutflows: number;
  totalAdjustments: number;
  initialBalance: number;
  transitionBalance?: number;
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
  pendingDifference: number;
  hasPendingDifference: boolean;
}

export type TableStatus = 'LIBRE' | 'OCUPADA' | 'CUENTA' | 'LIMPIEZA';
export type TableCourse = '1ER_TIEMPO' | '2DO_TIEMPO' | '3ER_TIEMPO' | 'FINALIZADO';

export interface TableRecord {
  tableId: string;
  tableNumber: number;
  label?: string;
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

export type TableServiceRequestType =
  | 'LLAMAR_MESERO'
  | 'TORTILLAS'
  | 'BEBIDAS'
  | 'SEGUNDO_TIEMPO'
  | 'TERCER_TIEMPO'
  | 'PEDIR_CUENTA';

export interface TableServiceRequest {
  id?: string;
  tableNumber: number;
  requestType: TableServiceRequestType;
  status: 'PENDIENTE';
  restaurantId: 'alo-restaurante';
  createdAt: string;
}

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
  personId?: string;
  personIndex?: number;
  personLabel?: string;
}

export type RestaurantOrderBillingStatus = 'PENDIENTE' | 'PAGADO';
export type RestaurantOrderSource = 'CLIENTE_QR' | 'MESERO' | 'CAJA';
export type RestaurantOrderOrigin = 'MESA_QR' | 'QR_EXTERNO' | 'DIRECTO';

export interface PublicTableOrder {
  id?: string;
  orderId?: string;
  code: string;
  restaurantId: 'alo-restaurante';
  tableNumber: number;
  tableSessionId?: string;
  accountId?: string;
  accountLabel?: string;
  orderSource?: RestaurantOrderSource;
  orderOrigin?: RestaurantOrderOrigin;
  qrSource?: string;
  items: RestaurantOrderItem[];
  total: number;
  status: RestaurantOrderStatus;
  billingStatus?: RestaurantOrderBillingStatus;
  createdAt: string;
  updatedAt: string;
}


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
  orderOrigin?: RestaurantOrderOrigin;
  qrSource?: string;
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

export type TableAccountMode = 'GENERAL' | 'SEPARADAS';
export type TableSessionStatus = 'ACTIVA' | 'CUENTA' | 'CERRADA';
export type TableSessionOpenedBy = 'QR' | 'MESERO';

export interface TableSessionAccount {
  id: string;
  label: string;
  customerName?: string;
  createdAt: string;
}

export interface TableSessionPerson {
  id: string;
  index: number;
  label: string;
  accountId: string;
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
  waiterId?: string;
  waiterName?: string;
}

export type TablePaymentMethod =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA'
  | 'MERCADO_PAGO';

export interface TablePaymentBreakdownItem {
  method: TablePaymentMethod;
  amount: number;
}

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
  paymentMethod: TablePaymentMethod | 'MIXTO';
  paymentBreakdown?: TablePaymentBreakdownItem[];
  cashReceived?: number;
  changeDue: number;
  status: 'PAGADO' | 'ANULADO';
  createdAt: string;
  chargedById: string;
  chargedByName: string;
}

export interface SaleReceiptOrderSnapshot {
  orderId?: string;
  code: string;
  orderSource?: RestaurantOrderSource;
  capturedByName?: string;
  createdAt: string;
  items: RestaurantOrderItem[];
  total: number;
}

export interface SaleReceiptPaymentSnapshot {
  paymentId?: string;
  code: string;
  total: number;
  discountAmount: number;
  tipAmount: number;
  paymentMethod: TablePaymentMethod | 'MIXTO';
  paymentBreakdown?: TablePaymentBreakdownItem[];
  createdAt: string;
  chargedByName: string;
}

export interface SaleReceipt {
  id?: string;
  code: string;
  restaurantId: 'alo-restaurante';
  tableNumber: number;
  tableSessionId?: string;
  guestCount: number;
  waiterId?: string;
  waiterName?: string;
  openedAt: string;
  closedAt: string;
  closedById: string;
  closedByName: string;
  orderIds: string[];
  paymentIds: string[];
  orders: SaleReceiptOrderSnapshot[];
  payments: SaleReceiptPaymentSnapshot[];
  subtotal: number;
  discountAmount: number;
  tipAmount: number;
  totalPaid: number;
  status: 'PAGADO';
}
