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
  memberId: string;
  customerName: string;
  phone: string;
  address?: string;
  reference?: string;
  preferredPayment?: 'efectivo' | 'transferencia' | 'tarjeta';
  preferredOrderType?: OrderType;
  stamps: number; // 0 to 5
  totalOrders: number;
  rewardAvailable: boolean;
  createdAt: string;
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
