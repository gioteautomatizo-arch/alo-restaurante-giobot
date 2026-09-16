export type AssistantPlan = 'GIOBOT_BASE' | 'GIOBOT_PREMIUM' | 'CUSTOM_AVATAR';

export type AssistantPersonality =
  | 'AMABLE'
  | 'PROFESIONAL'
  | 'DIVERTIDO'
  | 'SERIO'
  | 'PERSONALIZADO';

export interface RestaurantBranding {
  restaurantName: string;
  publicSlug: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

export interface RestaurantAssistantProfile {
  name: string;
  avatarUrl?: string;
  plan: AssistantPlan;
  personality: AssistantPersonality;
  enabled: boolean;
  customInstructions?: string;
}

export interface RestaurantFeatureFlags {
  publicMenu: boolean;
  qrTables: boolean;
  pos: boolean;
  kitchenStations: boolean;
  inventory: boolean;
  vip: boolean;
  promotions: boolean;
  customerAssistant: boolean;
  adminAssistant: boolean;
  delivery: boolean;
  reservations: boolean;
}

export interface RestaurantTenant {
  restaurantId: string;
  branding: RestaurantBranding;
  assistant: RestaurantAssistantProfile;
  features: RestaurantFeatureFlags;
}

export interface RestaurantMembership {
  restaurantId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'EMPLOYEE';
  active: boolean;
}

export const DEFAULT_GIOBOT_ASSISTANT: RestaurantAssistantProfile = {
  name: 'Giobot',
  plan: 'GIOBOT_BASE',
  personality: 'AMABLE',
  enabled: true,
};

export const DEFAULT_RESTAURANT_FEATURES: RestaurantFeatureFlags = {
  publicMenu: true,
  qrTables: true,
  pos: true,
  kitchenStations: true,
  inventory: true,
  vip: true,
  promotions: true,
  customerAssistant: true,
  adminAssistant: true,
  delivery: true,
  reservations: false,
};

/**
 * Tenant de compatibilidad para Restaurante Calientito.
 * Mantiene intacto el comportamiento actual mientras migramos el resto de servicios
 * del antiguo RESTAURANT_ID fijo hacia restaurantId dinámico.
 */
export const CALIENTITO_TENANT: RestaurantTenant = {
  restaurantId: 'alo-restaurante',
  branding: {
    restaurantName: 'Restaurante Calientito',
    publicSlug: 'calientito',
  },
  assistant: {
    name: 'Tita',
    plan: 'CUSTOM_AVATAR',
    personality: 'AMABLE',
    enabled: true,
  },
  features: {
    ...DEFAULT_RESTAURANT_FEATURES,
    reservations: false,
  },
};

export function normalizeRestaurantSlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function createRestaurantTenant(input: {
  restaurantId: string;
  restaurantName: string;
  publicSlug?: string;
  logoUrl?: string;
  primaryColor?: string;
  assistant?: Partial<RestaurantAssistantProfile>;
  features?: Partial<RestaurantFeatureFlags>;
}): RestaurantTenant {
  const slug = normalizeRestaurantSlug(input.publicSlug || input.restaurantName);

  return {
    restaurantId: input.restaurantId.trim(),
    branding: {
      restaurantName: input.restaurantName.trim(),
      publicSlug: slug,
      logoUrl: input.logoUrl,
      primaryColor: input.primaryColor,
    },
    assistant: {
      ...DEFAULT_GIOBOT_ASSISTANT,
      ...(input.assistant || {}),
    },
    features: {
      ...DEFAULT_RESTAURANT_FEATURES,
      ...(input.features || {}),
    },
  };
}

export function isPremiumAssistant(profile: RestaurantAssistantProfile): boolean {
  return profile.plan === 'GIOBOT_PREMIUM';
}

export function canUseCustomAvatar(profile: RestaurantAssistantProfile): boolean {
  return profile.plan === 'GIOBOT_PREMIUM' || profile.plan === 'CUSTOM_AVATAR';
}
