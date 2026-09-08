import {
  StaffUser,
  UserRole,
  ShiftRecord,
  ExpenseRecord,
  ExpenseCategory,
  InventoryItem,
  ActivityLog,
  DailyMenuConfig,
  RestaurantInfo,
  CxcRecord,
  CxcStatus,
  SobreMovement,
  SobreMovementType,
  SobreSummary,
  SobreOutflowCategory,
  SobreInflowCategory,
  ServiceMode,
  EffectiveService,
} from '../types';
import {
  initFirestoreRealtimeSync,
  getMemoryCache,
  subscribeToCache,
  logActivityFirestore,
  openShiftFirestore,
  updateShiftFirestore,
  closeShiftFirestore,
  addExpenseFirestore,
  deleteExpenseFirestore,
  saveCxcFirestore,
  deleteCxcFirestore,
  saveInventoryItemFirestore,
  deleteInventoryItemFirestore,
  saveSobreMovementFirestore,
  saveDailyMenuFirestore,
  saveRestaurantInfoFirestore,
  saveStaffUserFirestore,
  inspectLocalStorageData,
  migrateLocalStorageToFirestore,
  getDeviceIdentifier,
} from './firestoreService';

// Claves de almacenamiento local (mantenidas para arranque instantáneo y fallback offline)
const STORAGE_KEYS = {
  STAFF_USERS: 'alo_admin_staff_users_v1',
  CURRENT_SESSION: 'alo_admin_current_session_v1',
  CURRENT_SHIFT: 'alo_admin_current_shift_v1',
  SHIFTS_HISTORY: 'alo_admin_shifts_history_v1',
  EXPENSES: 'alo_admin_expenses_v1',
  INVENTORY: 'alo_admin_inventory_v1',
  ACTIVITY_LOGS: 'alo_admin_activity_logs_v1',
  DAILY_MENU: 'alo_admin_daily_menu_v1',
  RESTAURANT_INFO: 'alo_admin_restaurant_info_v1',
  DEVICE_TYPE: 'alo_admin_device_preference_v1',
  CXC: 'alo_admin_cxc_v1',
  SOBRE_MOVEMENTS: 'alo_admin_sobre_movements_v1',
};

// Evento custom para reactividad entre componentes en el mismo browser
export const ADMIN_DATA_EVENT = 'alo_admin_data_updated';

export function notifyDataChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_DATA_EVENT));
  }
}

// -------------------------------------------------------------
// INICIALIZACIÓN DE SINCRONIZACIÓN EN TIEMPO REAL
// -------------------------------------------------------------
let syncStarted = false;
const lastMirroredCacheRefs = new Map<string, unknown>();
let lastMirroredInitialized = false;

function mirrorCacheValue(
  cacheKey: string,
  storageKey: string,
  value: unknown,
  shouldPersist: boolean
): boolean {
  if (lastMirroredCacheRefs.get(cacheKey) === value) {
    return false;
  }

  lastMirroredCacheRefs.set(cacheKey, value);

  if (shouldPersist) {
    const serialized = JSON.stringify(value);
    if (localStorage.getItem(storageKey) !== serialized) {
      localStorage.setItem(storageKey, serialized);
    }
  }

  return true;
}

export function startAdminSync() {
  if (typeof window === 'undefined' || syncStarted) return;
  syncStarted = true;

  initFirestoreRealtimeSync();

  // Escuchar cambios de Firestore y sincronizar únicamente la parte del espejo
  // local cuyo valor cambió. Así evitamos serializar/escribir todas las colecciones
  // administrativas por cada snapshot individual de Firestore.
  subscribeToCache((cache) => {
    try {
      let cacheChanged = false;

      cacheChanged = mirrorCacheValue(
        'staffUsers',
        STORAGE_KEYS.STAFF_USERS,
        cache.staffUsers,
        cache.staffUsers.length > 0
      ) || cacheChanged;

      const currentShiftChanged =
        lastMirroredCacheRefs.get('currentShift') !== cache.currentShift;
      cacheChanged = mirrorCacheValue(
        'currentShift',
        STORAGE_KEYS.CURRENT_SHIFT,
        cache.currentShift,
        !!cache.currentShift
      ) || cacheChanged;

      const initializedChanged = lastMirroredInitialized !== cache.isInitialized;
      lastMirroredInitialized = cache.isInitialized;
      cacheChanged = initializedChanged || cacheChanged;

      if (
        !cache.currentShift &&
        cache.isInitialized &&
        (currentShiftChanged || initializedChanged) &&
        localStorage.getItem(STORAGE_KEYS.CURRENT_SHIFT) !== null
      ) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_SHIFT);
      }

      cacheChanged = mirrorCacheValue(
        'shiftsHistory',
        STORAGE_KEYS.SHIFTS_HISTORY,
        cache.shiftsHistory,
        cache.shiftsHistory.length > 0
      ) || cacheChanged;

      cacheChanged = mirrorCacheValue(
        'expenses',
        STORAGE_KEYS.EXPENSES,
        cache.expenses,
        cache.expenses.length > 0
      ) || cacheChanged;

      cacheChanged = mirrorCacheValue(
        'cxcList',
        STORAGE_KEYS.CXC,
        cache.cxcList,
        cache.cxcList.length > 0
      ) || cacheChanged;

      cacheChanged = mirrorCacheValue(
        'inventory',
        STORAGE_KEYS.INVENTORY,
        cache.inventory,
        cache.inventory.length > 0
      ) || cacheChanged;

      cacheChanged = mirrorCacheValue(
        'sobreMovements',
        STORAGE_KEYS.SOBRE_MOVEMENTS,
        cache.sobreMovements,
        cache.sobreMovements.length > 0
      ) || cacheChanged;

      cacheChanged = mirrorCacheValue(
        'dailyMenu',
        STORAGE_KEYS.DAILY_MENU,
        cache.dailyMenu,
        !!cache.dailyMenu
      ) || cacheChanged;

      cacheChanged = mirrorCacheValue(
        'restaurantInfo',
        STORAGE_KEYS.RESTAURANT_INFO,
        cache.restaurantInfo,
        !!cache.restaurantInfo
      ) || cacheChanged;

      cacheChanged = mirrorCacheValue(
        'activityLogs',
        STORAGE_KEYS.ACTIVITY_LOGS,
        cache.activityLogs,
        cache.activityLogs.length > 0
      ) || cacheChanged;

      if (cacheChanged) {
        notifyDataChanged();
      }
    } catch (e) {
      console.warn('Error updating local mirror from Firestore:', e);
    }
  });
}

// Auto-iniciar la sincronización en el navegador
if (typeof window !== 'undefined') {
  startAdminSync();
}

// -------------------------------------------------------------
// USUARIOS INICIALES (Semilla con roles y PINs configurables)
// Jerarquía: DUEÑA > ADMINISTRADOR > ENCARGADO > EMPLEADO
// -------------------------------------------------------------
const INITIAL_STAFF: StaffUser[] = [
  {
    id: 'staff-gio',
    name: 'Gio',
    username: 'gio',
    role: 'ADMINISTRADOR',
    pin: '1234',
    active: true,
    phone: '55 7441 1437',
    avatarColor: '#14281d',
    createdAt: '2026-01-01',
  },
  {
    id: 'staff-alondra',
    name: 'Alondra',
    username: 'alondra',
    role: 'DUEÑA',
    pin: '2345',
    active: true,
    phone: '55 1234 5678',
    avatarColor: '#c4974f',
    createdAt: '2026-01-15',
  },
  {
    id: 'staff-carlos',
    name: 'Carlos',
    username: 'carlos',
    role: 'EMPLEADO',
    pin: '3456',
    active: true,
    phone: '55 9876 5432',
    avatarColor: '#2b5a3e',
    createdAt: '2026-02-01',
  },
];

// -------------------------------------------------------------
// INVENTARIO INICIAL (Los 21 productos obligatorios de papel)
// -------------------------------------------------------------
const INITIAL_INVENTORY_ITEMS: Omit<InventoryItem, 'id' | 'lastUpdated'>[] = [
  { name: '8 oz', category: 'Desechables & Vasos', unit: 'pz', tipoControl: 'cantidad', initialQty: 50, entriesQty: 0, finalQty: 50, consumption: 0 },
  { name: '12 oz', category: 'Desechables & Vasos', unit: 'pz', tipoControl: 'cantidad', initialQty: 60, entriesQty: 0, finalQty: 60, consumption: 0 },
  { name: '16 oz', category: 'Desechables & Vasos', unit: 'pz', tipoControl: 'cantidad', initialQty: 40, entriesQty: 0, finalQty: 40, consumption: 0 },
  { name: 'Fríos 14 oz', category: 'Desechables & Vasos', unit: 'pz', tipoControl: 'cantidad', initialQty: 45, entriesQty: 0, finalQty: 45, consumption: 0 },
  { name: 'Vaso 1/2 L', category: 'Desechables & Vasos', unit: 'pz', tipoControl: 'cantidad', initialQty: 80, entriesQty: 0, finalQty: 80, consumption: 0 },
  { name: 'Vaso 1 L', category: 'Desechables & Vasos', unit: 'pz', tipoControl: 'cantidad', initialQty: 50, entriesQty: 0, finalQty: 50, consumption: 0 },
  { name: 'Chapata', category: 'Panadería', unit: 'pz', tipoControl: 'cantidad', initialQty: 18, entriesQty: 0, finalQty: 18, consumption: 0 },
  { name: 'Bolillo', category: 'Panadería', unit: 'pz', tipoControl: 'cantidad', initialQty: 30, entriesQty: 0, finalQty: 30, consumption: 0 },
  { name: 'Pan dulce', category: 'Panadería', unit: 'pz', tipoControl: 'cantidad', initialQty: 25, entriesQty: 0, finalQty: 25, consumption: 0 },
  { name: 'Muffin', category: 'Panadería', unit: 'pz', tipoControl: 'cantidad', initialQty: 12, entriesQty: 0, finalQty: 12, consumption: 0 },
  { name: 'Telera', category: 'Panadería', unit: 'pz', tipoControl: 'cantidad', initialQty: 20, entriesQty: 0, finalQty: 20, consumption: 0 },
  { name: 'Pan caja', category: 'Panadería', unit: 'paq', tipoControl: 'cantidad', initialQty: 4, entriesQty: 0, finalQty: 4, consumption: 0 },
  { name: 'Refrescos', category: 'Bebidas', unit: 'pz', tipoControl: 'cantidad', initialQty: 35, entriesQty: 0, finalQty: 35, consumption: 0 },
  { name: 'Agua 1/2 L', category: 'Bebidas', unit: 'pz', tipoControl: 'cantidad', initialQty: 24, entriesQty: 0, finalQty: 24, consumption: 0 },
  { name: 'Agua 1 L', category: 'Bebidas', unit: 'pz', tipoControl: 'cantidad', initialQty: 15, entriesQty: 0, finalQty: 15, consumption: 0 },
  { name: 'Agua 1.5 L', category: 'Bebidas', unit: 'pz', tipoControl: 'cantidad', initialQty: 10, entriesQty: 0, finalQty: 10, consumption: 0 },
  { name: 'Caja de cigarros', category: 'Abarrotes & Varios', unit: 'caja', tipoControl: 'cantidad', initialQty: 8, entriesQty: 0, finalQty: 8, consumption: 0 },
  { name: 'Cigarros sueltos', category: 'Abarrotes & Varios', unit: 'pz', tipoControl: 'cantidad', initialQty: 40, entriesQty: 0, finalQty: 40, consumption: 0 },
  { name: 'Pasteles', category: 'Panadería', unit: 'rebanada', tipoControl: 'cantidad', initialQty: 14, entriesQty: 0, finalQty: 14, consumption: 0 },
  { name: 'Comandas', category: 'Operación', unit: 'block', tipoControl: 'cantidad', initialQty: 5, entriesQty: 0, finalQty: 5, consumption: 0 },
  { name: 'Galletas', category: 'Abarrotes & Varios', unit: 'paq', tipoControl: 'cantidad', initialQty: 16, entriesQty: 0, finalQty: 16, consumption: 0 },
];

// -------------------------------------------------------------
// MENÚ DEL DÍA INICIAL
// -------------------------------------------------------------
const INITIAL_DAILY_MENU: DailyMenuConfig = {
  isAvailable: true,
  price: 90,
  entrada: 'Consomé de pollo con menudencias o verduras / Sopa de verduras / Crema o sopa aguada del día',
  platoFuerte: 'Pechuga a la plancha / Enchiladas verdes con queso gratinado / Milanesa de pollo',
  guarniciones: ['Arroz rojo', 'Pasta o espagueti'],
  aguaDelDia: 'Agua fresca de Jamaica o Frutas de temporada',
  postreDelDia: 'Postre casero del día (Flan o Arroz con leche)',
  opcionesAlternativas: ['Enchiladas Suizas (+$10)', 'Bistec encebollado (+$5)', 'Tacos dorados de pollo (3 pz)'],
  serviceMode: 'AUTO',
  updatedAt: new Date().toISOString(),
  updatedBy: 'Gio (Admin)',
};

// -------------------------------------------------------------
// HELPERS DE FECHA Y HORA (ZONA HORARIA LOCAL: America/Mexico_City)
// -------------------------------------------------------------
export const RESTAURANT_TIMEZONE = 'America/Mexico_City';

export function formatLocalDate(dateInput: Date | string | number = new Date()): string {
  try {
    let d: Date;
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [y, m, day] = dateInput.split('-').map(Number);
      return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    } else if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
      return dateInput;
    } else {
      d = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
    }
    if (isNaN(d.getTime())) return String(dateInput);

    const formatter = new Intl.DateTimeFormat('es-MX', {
      timeZone: RESTAURANT_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return formatter.format(d);
  } catch {
    return String(dateInput);
  }
}

export function formatLocalTime(dateInput: Date | string | number = new Date()): string {
  try {
    const d = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: RESTAURANT_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return formatter.format(d);
  } catch {
    return String(dateInput);
  }
}

export function getLocalDateFormatted(d = new Date()): string {
  return formatLocalDate(d);
}

export function getFormattedTime(d = new Date()): string {
  return formatLocalTime(d);
}

export function getFormattedDateShort(d = new Date()): string {
  return formatLocalDate(d);
}

export function getISODateToday(d = new Date()): string {
  return formatLocalDate(d);
}

export function getHTMLInputDateToday(d = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: RESTAURANT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export function getLocalShiftType(d = new Date()): 'AM' | 'PM' {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: RESTAURANT_TIMEZONE,
      hour: 'numeric',
      hour12: false,
    }).format(d);
    const hour = parseInt(hourStr, 10);
    return hour < 14 ? 'AM' : 'PM';
  } catch {
    return d.getHours() < 14 ? 'AM' : 'PM';
  }
}

/**
 * Obtiene la hora y minuto actuales calculados EXCLUSIVAMENTE usando la zona horaria: America/Mexico_City.
 */
export function getMexicoCityHourAndMinute(d: Date = new Date()): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: RESTAURANT_TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(d);
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const minStr = parts.find((p) => p.type === 'minute')?.value ?? '0';
    const rawHour = parseInt(hourStr, 10);
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = parseInt(minStr, 10);
    return { hour, minute };
  } catch {
    return { hour: d.getHours(), minute: d.getMinutes() };
  }
}

/**
 * AUTO debe calcular la hora usando EXCLUSIVAMENTE la zona horaria: America/Mexico_City
 * - Si la hora de Ciudad de México es antes de las 12:00: servicio efectivo = DESAYUNO
 * - Si son las 12:00 o después: servicio efectivo = COMIDA
 * Corte exacto a las 12:00 (12h 00m).
 */
export function getAutoEffectiveService(d: Date = new Date()): EffectiveService {
  const { hour } = getMexicoCityHourAndMinute(d);
  return hour < 12 ? 'DESAYUNO' : 'COMIDA';
}

/**
 * Obtiene el modo de selector de servicio guardado: AUTO | DESAYUNO | COMIDA.
 * Por defecto es 'AUTO'.
 */
export function getServiceMode(): ServiceMode {
  const menuConfig = getDailyMenuConfig();
  if (menuConfig.serviceMode === 'DESAYUNO' || menuConfig.serviceMode === 'COMIDA') {
    return menuConfig.serviceMode;
  }
  return 'AUTO';
}

/**
 * Obtiene el servicio efectivo ('DESAYUNO' | 'COMIDA'):
 * - DESAYUNO y COMIDA son overrides manuales y deben ignorar la hora.
 * - AUTO calcula la hora usando EXCLUSIVAMENTE la zona horaria America/Mexico_City:
 *   antes de las 12:00 -> DESAYUNO; 12:00 o después -> COMIDA.
 */
export function getEffectiveService(d: Date = new Date()): EffectiveService {
  const mode = getServiceMode();
  if (mode === 'DESAYUNO') return 'DESAYUNO';
  if (mode === 'COMIDA') return 'COMIDA';
  return getAutoEffectiveService(d);
}

/**
 * Actualiza el selector de servicio: AUTO | DESAYUNO | COMIDA.
 * Reutiliza la configuración existente de DailyMenuConfig (localStorage y Firestore).
 */
export async function setServiceMode(mode: ServiceMode, user?: StaffUser): Promise<DailyMenuConfig> {
  const current = getDailyMenuConfig();
  const session = getAuthSession();
  const actingUser: StaffUser = user || (session ? session.user : {
    id: 'admin_sys',
    name: 'Administración',
    username: 'admin',
    role: 'ADMINISTRADOR',
    active: true,
    createdAt: new Date().toISOString(),
  });

  const updated: DailyMenuConfig = {
    ...current,
    serviceMode: mode,
    updatedAt: new Date().toISOString(),
    updatedBy: actingUser.name,
  };

  try {
    await saveDailyMenuFirestore(updated, actingUser);
  } catch (err) {
    console.warn('No se pudo sincronizar modo de servicio con Firestore:', err);
  }

  localStorage.setItem(STORAGE_KEYS.DAILY_MENU, JSON.stringify(updated));
  notifyDataChanged();
  return updated;
}

// -------------------------------------------------------------
// SERVICIO DE GESTIÓN DE USUARIOS Y ROLES
// -------------------------------------------------------------
const PENDING_STAFF_SYNC_KEY = 'alo_admin_staff_pending_sync_v1';

function readPendingStaffUsers(): StaffUser[] {
  try {
    const raw = localStorage.getItem(PENDING_STAFF_SYNC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

function mergeStaffLists(base: StaffUser[], overlay: StaffUser[]): StaffUser[] {
  const map = new Map<string, StaffUser>();
  base.forEach((u) => map.set(u.id, u));
  overlay.forEach((u) => map.set(u.id, u));
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getStaffUsers(): StaffUser[] {
  const pending = readPendingStaffUsers();
  const cache = getMemoryCache();
  if (cache.staffUsers && cache.staffUsers.length > 0) {
    return mergeStaffLists(cache.staffUsers, pending);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STAFF_USERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.STAFF_USERS, JSON.stringify(INITIAL_STAFF));
      // Auto-sembrar a Firestore en background
      INITIAL_STAFF.forEach((u) => saveStaffUserFirestore(u).catch(() => {}));
      return mergeStaffLists(INITIAL_STAFF, pending);
    }
    const users: StaffUser[] = JSON.parse(raw);
    return mergeStaffLists(users, pending);
  } catch {
    return mergeStaffLists(INITIAL_STAFF, pending);
  }
}

export async function saveStaffUsers(users: StaffUser[]): Promise<void> {
  // V3.7: primero persistimos localmente y marcamos la lista como pendiente.
  // Así un snapshot viejo de Firestore no puede hacer desaparecer al colaborador
  // recién creado mientras la nube termina de confirmar el cambio.
  const normalized = [...users].sort((a, b) => a.name.localeCompare(b.name));
  const cache = getMemoryCache();
  cache.staffUsers = normalized;
  localStorage.setItem(STORAGE_KEYS.STAFF_USERS, JSON.stringify(normalized));
  localStorage.setItem(
    PENDING_STAFF_SYNC_KEY,
    JSON.stringify({ savedAt: Date.now(), users: normalized })
  );
  notifyDataChanged();

  // La confirmación en nube sigue siendo obligatoria para que el usuario
  // aparezca en otros dispositivos. El marcador pendiente se elimina desde
  // el listener de Firestore cuando el snapshot ya contiene la misma lista.
  await Promise.all(normalized.map((u) => saveStaffUserFirestore(u)));
}

// -------------------------------------------------------------
// SESIÓN DE USUARIO
// -------------------------------------------------------------
export interface AuthSession {
  user: StaffUser;
  token: string;
  loginAt: string;
  rememberDevice: boolean;
}

export function getAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loginStaff(
  userQuery: string,
  enteredPin: string,
  rememberDevice: boolean = false
): { success: boolean; user?: StaffUser; error?: string } {
  const users = getStaffUsers();
  const query = userQuery.trim().toLowerCase();

  const user = users.find(
    (u) =>
      u.active &&
      (u.username.toLowerCase() === query ||
        u.name.toLowerCase() === query ||
        u.id.toLowerCase() === query)
  );

  if (!user) {
    return { success: false, error: 'Usuario no encontrado o inactivo.' };
  }

  if (user.pin !== enteredPin.trim()) {
    return { success: false, error: 'PIN de acceso incorrecto.' };
  }

  const session: AuthSession = {
    user,
    token: `alo_token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    loginAt: new Date().toISOString(),
    rememberDevice,
  };

  localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(session));

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: `Inicio de sesión (${user.role.toLowerCase()})`,
    category: 'sesion',
    details: `Dispositivo: ${rememberDevice ? 'iPad / Caja Fija' : 'Móvil / Temporal'}`,
  });

  return { success: true, user };
}

export function logoutStaff(): void {
  const current = getAuthSession();
  if (current) {
    addActivityLog({
      userName: current.user.name,
      userId: current.user.id,
      userRole: current.user.role,
      action: 'Cierre de sesión',
      category: 'sesion',
    });
  }
  localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
}

// -------------------------------------------------------------
// CONTROL DE TURNO
// -------------------------------------------------------------
export function getShiftDisplayDate(shift: ShiftRecord): string {
  if (shift.createdAt) {
    return formatLocalDate(shift.createdAt);
  }
  return formatLocalDate(shift.date);
}

export function getShiftDisplayTime(shift: ShiftRecord): string {
  if (shift.createdAt) {
    return formatLocalTime(shift.createdAt);
  }
  return shift.openedAt;
}

export function getCurrentShift(): ShiftRecord | null {
  const cache = getMemoryCache();
  if (cache.isInitialized) {
    return cache.currentShift;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_SHIFT);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function openNewShift(
  responsibleUser: StaffUser,
  initialCashFund: number = 500,
  shiftType: 'AM' | 'PM' = getLocalShiftType()
): Promise<ShiftRecord> {
  const existingShift = getCurrentShift();
  if (existingShift && existingShift.status === 'abierto') {
    throw new Error(
      `Ya existe un turno abierto (${existingShift.shiftType}) a cargo de ${existingShift.openedByName || existingShift.responsibleUser}. Debe cerrarse antes de iniciar uno nuevo.`
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const shiftId = `shift_${now.getTime()}_${shiftType}`;
  const currentInventory = getInventory();

  const newShift: ShiftRecord = {
    id: shiftId,
    createdAt: nowIso,
    date: formatLocalDate(now),
    shiftType,
    openedAt: formatLocalTime(now),
    openedAtTimestamp: nowIso,
    openedByUserId: responsibleUser.id,
    openedByName: responsibleUser.name,
    responsibleUser: responsibleUser.name,
    responsibleUserId: responsibleUser.id,
    status: 'abierto',
    initialCashFund,
    salesCash: 0,
    salesCard: 0,
    salesPlatforms: 0,
    totalSales: 0,
    cashExpenses: 0,
    expectedCash: initialCashFund,
    inventorySnapshot: currentInventory,
    notes: '',
  };

  // Sincronizar en Firestore primero
  await openShiftFirestore(newShift, responsibleUser);

  // Guardar en espejo local
  localStorage.setItem(STORAGE_KEYS.CURRENT_SHIFT, JSON.stringify(newShift));
  notifyDataChanged();

  return newShift;
}

export function canCorrectInitialFund(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR';
}

export async function correctShiftInitialFund(
  user: StaffUser,
  newInitialCashFund: number,
  reason: string
): Promise<ShiftRecord> {
  if (user.role !== 'DUEÑA' && user.role !== 'ADMINISTRADOR') {
    throw new Error('Solo DUEÑA o ADMINISTRADOR tienen permisos para corregir el fondo inicial.');
  }

  const current = getCurrentShift();
  if (!current) {
    throw new Error('No hay un turno abierto para corregir el fondo.');
  }

  if (newInitialCashFund < 0 || isNaN(newInitialCashFund)) {
    throw new Error('El nuevo fondo inicial debe ser un monto válido mayor o igual a $0.');
  }

  const cleanReason = reason?.trim();
  if (!cleanReason) {
    throw new Error('El motivo de corrección es obligatorio.');
  }

  const oldFund = current.initialCashFund;
  const now = new Date();
  const nowIso = now.toISOString();
  const newExpectedCash = current.salesCash - current.cashExpenses + newInitialCashFund;

  const updated: ShiftRecord = {
    ...current,
    initialCashFund: newInitialCashFund,
    expectedCash: newExpectedCash,
  };

  await updateShiftFirestore(current.id, {
    initialCashFund: newInitialCashFund,
    expectedCash: newExpectedCash,
  }, user);

  localStorage.setItem(STORAGE_KEYS.CURRENT_SHIFT, JSON.stringify(updated));
  notifyDataChanged();

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: `${user.name} corrigió Fondo Inicial de $${oldFund.toLocaleString('es-MX')} a $${newInitialCashFund.toLocaleString('es-MX')}. Motivo: ${cleanReason}`,
    category: 'turno',
    previousValue: `Fondo: $${oldFund}`,
    newValue: `Fondo: $${newInitialCashFund} | Motivo: ${cleanReason}`,
    timestamp: nowIso,
  });

  return updated;
}

export async function updateShiftSales(
  salesCash: number,
  salesCard: number,
  salesPlatforms: number,
  notes?: string,
  user?: StaffUser
): Promise<ShiftRecord | null> {
  const current = getCurrentShift();
  if (!current) return null;

  const now = new Date();
  const nowIso = now.toISOString();

  const totalSales = salesCash + salesCard + salesPlatforms;
  const expectedCash = salesCash - current.cashExpenses + current.initialCashFund;

  const updated: ShiftRecord = {
    ...current,
    salesCash,
    salesCard,
    salesPlatforms,
    totalSales,
    expectedCash,
    notes: notes !== undefined ? notes : current.notes,
  };

  await updateShiftFirestore(current.id, {
    salesCash,
    salesCard,
    salesPlatforms,
    totalSales,
    expectedCash,
    notes: updated.notes,
  }, user);

  localStorage.setItem(STORAGE_KEYS.CURRENT_SHIFT, JSON.stringify(updated));
  notifyDataChanged();

  if (user) {
    addActivityLog({
      userName: user.name,
      userId: user.id,
      userRole: user.role,
      action: `Actualizó ventas: Efectivo $${salesCash}, Tarjeta $${salesCard}, Apps $${salesPlatforms} (Total $${totalSales})`,
      category: 'turno',
      timestamp: nowIso,
    });
  }

  return updated;
}

export async function closeShift(
  countedCashAtClose: number,
  notes: string = '',
  closingUser: StaffUser,
  closeReason?: string
): Promise<{ shift: ShiftRecord; history: ShiftRecord[] }> {
  const current = getCurrentShift();
  if (!current) throw new Error('No hay un turno abierto para cerrar.');

  const now = new Date();
  const nowIso = now.toISOString();
  const cashDifference = countedCashAtClose - current.expectedCash;

  const originalResponsibleName = current.openedByName || current.responsibleUser;
  const originalResponsibleId = current.openedByUserId || current.responsibleUserId;

  const closedShift: ShiftRecord = {
    ...current,
    status: 'cerrado',
    responsibleUser: originalResponsibleName,
    responsibleUserId: originalResponsibleId,
    openedByName: originalResponsibleName,
    openedByUserId: originalResponsibleId,
    closedAt: formatLocalTime(now),
    closedAtTimestamp: nowIso,
    closedByUserId: closingUser.id,
    closedByName: closingUser.name,
    closedByReason: closeReason?.trim() || undefined,
    countedCashAtClose,
    cashDifference,
    notes,
    inventorySnapshot: getInventory(),
  };

  await closeShiftFirestore(closedShift, closingUser, closeReason);

  const history = getShiftsHistory();
  const newHistory = [closedShift, ...history];
  localStorage.setItem(STORAGE_KEYS.SHIFTS_HISTORY, JSON.stringify(newHistory));
  localStorage.removeItem(STORAGE_KEYS.CURRENT_SHIFT);
  notifyDataChanged();

  return { shift: closedShift, history: newHistory };
}

export function getShiftsHistory(): ShiftRecord[] {
  const cache = getMemoryCache();
  if (cache.shiftsHistory && cache.shiftsHistory.length > 0) {
    return cache.shiftsHistory;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHIFTS_HISTORY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// GESTIÓN DE GASTOS
// -------------------------------------------------------------
export function getExpenses(shiftId?: string): ExpenseRecord[] {
  const cache = getMemoryCache();
  let list: ExpenseRecord[] = [];
  if (cache.expenses && cache.expenses.length > 0) {
    list = cache.expenses;
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      if (raw) list = JSON.parse(raw);
    } catch {
      list = [];
    }
  }

  if (shiftId) {
    return list.filter((e) => e.shiftId === shiftId);
  }
  return list;
}

export async function addExpense(
  data: {
    concept: string;
    category: ExpenseCategory;
    amount: number;
    paidWith: 'efectivo_caja' | 'otro';
    note?: string;
  },
  user: StaffUser
): Promise<ExpenseRecord> {
  const currentShift = getCurrentShift();
  const now = new Date();
  const nowIso = now.toISOString();
  const shiftId = currentShift ? currentShift.id : `shift_${now.getTime()}_general`;

  const newExpense: ExpenseRecord = {
    id: `exp_${now.getTime()}_${Math.random().toString(36).substring(2, 6)}`,
    shiftId,
    concept: data.concept.trim(),
    category: data.category,
    amount: Number(data.amount),
    registeredBy: user.name,
    registeredById: user.id,
    date: formatLocalDate(now),
    time: formatLocalTime(now),
    note: data.note?.trim(),
    paidWith: data.paidWith,
  };

  await addExpenseFirestore(newExpense, user);

  const allExpenses = getExpenses();
  const updated = [newExpense, ...allExpenses];
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(updated));

  // Si se pagó con efectivo de caja, recalcular gastos del turno actual
  if (currentShift && data.paidWith === 'efectivo_caja') {
    const newCashExpenses = currentShift.cashExpenses + Number(data.amount);
    const newExpectedCash = currentShift.salesCash - newCashExpenses + currentShift.initialCashFund;
    const updatedShift: ShiftRecord = {
      ...currentShift,
      cashExpenses: newCashExpenses,
      expectedCash: newExpectedCash,
    };
    localStorage.setItem(STORAGE_KEYS.CURRENT_SHIFT, JSON.stringify(updatedShift));
    updateShiftFirestore(currentShift.id, {
      cashExpenses: newCashExpenses,
      expectedCash: newExpectedCash,
    }, user).catch(console.error);
  }

  notifyDataChanged();

  return newExpense;
}

export async function deleteExpense(expenseId: string, user: StaffUser): Promise<boolean> {
  if (user.role === 'EMPLEADO') {
    throw new Error('Los empleados no tienen permiso para eliminar gastos.');
  }

  const allExpenses = getExpenses();
  const target = allExpenses.find((e) => e.id === expenseId);
  if (!target) return false;

  await deleteExpenseFirestore(target, user);

  const filtered = allExpenses.filter((e) => e.id !== expenseId);
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(filtered));

  const currentShift = getCurrentShift();
  if (currentShift && target.shiftId === currentShift.id && target.paidWith === 'efectivo_caja') {
    const newCashExpenses = Math.max(0, currentShift.cashExpenses - target.amount);
    const newExpectedCash = currentShift.salesCash - newCashExpenses + currentShift.initialCashFund;
    const updatedShift: ShiftRecord = {
      ...currentShift,
      cashExpenses: newCashExpenses,
      expectedCash: newExpectedCash,
    };
    localStorage.setItem(STORAGE_KEYS.CURRENT_SHIFT, JSON.stringify(updatedShift));
    updateShiftFirestore(currentShift.id, {
      cashExpenses: newCashExpenses,
      expectedCash: newExpectedCash,
    }, user).catch(console.error);
  }

  notifyDataChanged();

  return true;
}

// -------------------------------------------------------------
// GESTIÓN DE INVENTARIO
// -------------------------------------------------------------
export function getInventory(): InventoryItem[] {
  const cache = getMemoryCache();
  if (cache.inventory && cache.inventory.length > 0) {
    return cache.inventory;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INVENTORY);
    if (!raw) {
      const seeded: InventoryItem[] = INITIAL_INVENTORY_ITEMS.map((item, idx) => ({
        ...item,
        id: `inv_${idx + 1}_${item.name.toLowerCase().replace(/\s+/g, '_')}`,
        lastUpdated: new Date().toISOString(),
      }));
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(seeded));
      seeded.forEach((i) => saveInventoryItemFirestore(i).catch(() => {}));
      return seeded;
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveInventoryItem(
  id: string,
  updates: Partial<Pick<InventoryItem, 'initialQty' | 'entriesQty' | 'finalQty' | 'name' | 'unit' | 'category' | 'tipoControl' | 'folioInicial' | 'folioFinal' | 'notes'>>,
  user: StaffUser
): Promise<InventoryItem | null> {
  const currentInventory = getInventory();
  const itemIndex = currentInventory.findIndex((i) => i.id === id);
  if (itemIndex === -1) return null;

  const currentItem = currentInventory[itemIndex];
  const tipoControl = updates.tipoControl !== undefined ? updates.tipoControl : (currentItem.tipoControl || 'cantidad');

  const initialQty = Number.isFinite(Number(updates.initialQty))
    ? Number(updates.initialQty)
    : (Number.isFinite(Number(currentItem.initialQty)) ? Number(currentItem.initialQty) : 0);
  const entriesQty = Number.isFinite(Number(updates.entriesQty))
    ? Number(updates.entriesQty)
    : (Number.isFinite(Number(currentItem.entriesQty)) ? Number(currentItem.entriesQty) : 0);
  const finalQty = Number.isFinite(Number(updates.finalQty))
    ? Number(updates.finalQty)
    : (Number.isFinite(Number(currentItem.finalQty)) ? Number(currentItem.finalQty) : 0);

  let folioInicial: number | null = null;
  let folioFinal: number | null = null;

  if (tipoControl === 'folio') {
    const rawInit = updates.folioInicial !== undefined ? updates.folioInicial : currentItem.folioInicial;
    const rawFinal = updates.folioFinal !== undefined ? updates.folioFinal : currentItem.folioFinal;
    folioInicial = rawInit !== null && rawInit !== undefined && Number.isFinite(Number(rawInit))
      ? Math.floor(Number(rawInit))
      : null;
    folioFinal = rawFinal !== null && rawFinal !== undefined && Number.isFinite(Number(rawFinal))
      ? Math.floor(Number(rawFinal))
      : null;
  } else {
    // Si cambia o es cantidad, reseteamos folios a null
    folioInicial = null;
    folioFinal = null;
  }

  let consumption = 0;
  if (tipoControl === 'folio') {
    if (
      folioInicial !== null &&
      folioFinal !== null &&
      folioInicial !== undefined &&
      folioFinal !== undefined &&
      !isNaN(Number(folioInicial)) &&
      !isNaN(Number(folioFinal))
    ) {
      const start = Number(folioInicial);
      const end = Number(folioFinal);
      if (end >= start) {
        const rangeUnits = end - start + 1;
        consumption = rangeUnits + (entriesQty > 0 ? entriesQty : 0);
      } else {
        consumption = 0;
      }
    } else {
      consumption = 0;
    }
  } else {
    consumption = initialQty + entriesQty - finalQty;
  }
  if (!Number.isFinite(consumption)) {
    consumption = 0;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Preservar notas sin dejar undefined
  let safeNotes: string | undefined = undefined;
  if (updates.notes !== undefined) {
    const trimmed = updates.notes?.trim();
    if (trimmed) safeNotes = trimmed;
  } else if (currentItem.notes) {
    safeNotes = currentItem.notes;
  }

  const updatedItem: InventoryItem = {
    ...currentItem,
    name: updates.name?.trim() || currentItem.name,
    category: updates.category || currentItem.category,
    unit: updates.unit || (tipoControl === 'folio' ? 'folios' : currentItem.unit || 'pz'),
    tipoControl,
    initialQty,
    entriesQty,
    finalQty,
    folioInicial,
    folioFinal,
    consumption,
    lastUpdated: nowIso,
    updatedBy: user.name,
  };

  if (safeNotes) {
    updatedItem.notes = safeNotes;
  } else {
    delete updatedItem.notes;
  }

  await saveInventoryItemFirestore(updatedItem, user);

  currentInventory[itemIndex] = updatedItem;
  localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(currentInventory));
  notifyDataChanged();

  const prevText = currentItem.tipoControl === 'folio'
    ? `Folios: [${currentItem.folioInicial ?? '—'}–${currentItem.folioFinal ?? '—'}], Ent: ${currentItem.entriesQty}`
    : `Ini: ${currentItem.initialQty}, Ent: ${currentItem.entriesQty}, Fin: ${currentItem.finalQty}`;

  const newText = tipoControl === 'folio'
    ? `Folios: [${folioInicial ?? '—'}–${folioFinal ?? '—'}], Ent: ${entriesQty} (Resultado: ${consumption} u.)`
    : `Ini: ${initialQty}, Ent: ${entriesQty}, Fin: ${finalQty} (Consumo: ${consumption})`;

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: `${user.name} modificó inventario de ${updatedItem.name} (${tipoControl === 'folio' ? 'Folios' : 'Piezas'})`,
    category: 'inventario',
    previousValue: prevText,
    newValue: newText,
    timestamp: nowIso,
  });

  return updatedItem;
}

export async function addInventoryProduct(
  data: {
    name: string;
    category: InventoryItem['category'];
    unit: string;
    tipoControl?: 'cantidad' | 'folio';
    initialQty?: number;
    folioInicial?: number | null;
    folioFinal?: number | null;
    notes?: string;
  },
  user: StaffUser
): Promise<InventoryItem> {
  if (user.role === 'EMPLEADO') {
    throw new Error('Solo Administradores y Encargados pueden dar de alta nuevos productos en inventario.');
  }

  const current = getInventory();
  const tipoControl = data.tipoControl || 'cantidad';
  const initialQty = Number(data.initialQty || 0);
  const folioInicial = data.folioInicial !== undefined ? data.folioInicial : null;
  const folioFinal = data.folioFinal !== undefined ? data.folioFinal : null;

  let consumption = 0;
  if (tipoControl === 'folio') {
    if (
      folioInicial !== null &&
      folioFinal !== null &&
      folioInicial !== undefined &&
      folioFinal !== undefined &&
      !isNaN(Number(folioInicial)) &&
      !isNaN(Number(folioFinal))
    ) {
      const s = Number(folioInicial);
      const e = Number(folioFinal);
      if (e >= s) {
        consumption = e - s + 1;
      }
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const newItem: InventoryItem = {
    id: `inv_${now.getTime()}_${data.name.toLowerCase().replace(/\s+/g, '_')}`,
    name: data.name.trim(),
    category: data.category,
    unit: data.unit || (tipoControl === 'folio' ? 'folios' : 'pz'),
    tipoControl,
    initialQty,
    entriesQty: 0,
    finalQty: tipoControl === 'cantidad' ? initialQty : 0,
    folioInicial: tipoControl === 'folio' ? folioInicial : null,
    folioFinal: tipoControl === 'folio' ? folioFinal : null,
    consumption,
    lastUpdated: nowIso,
    updatedBy: user.name,
  };

  if (data.notes?.trim()) {
    newItem.notes = data.notes.trim();
  }

  await saveInventoryItemFirestore(newItem, user);

  const updated = [...current, newItem];
  localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(updated));
  notifyDataChanged();

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: `${user.name} dio de alta producto en inventario: ${newItem.name} (${tipoControl === 'folio' ? 'Folios' : 'Piezas'})`,
    category: 'inventario',
    newValue: `${newItem.name} (${newItem.unit})`,
    timestamp: nowIso,
  });

  return newItem;
}

export async function deleteInventoryProduct(id: string, user: StaffUser): Promise<boolean> {
  if (user.role === 'EMPLEADO') {
    throw new Error('Los empleados no pueden eliminar productos del inventario.');
  }

  const current = getInventory();
  const target = current.find((i) => i.id === id);
  if (!target) return false;

  await deleteInventoryItemFirestore(target, user);

  const filtered = current.filter((i) => i.id !== id);
  localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(filtered));
  notifyDataChanged();

  return true;
}

// -------------------------------------------------------------
// BITÁCORA DE ACTIVIDAD
// -------------------------------------------------------------
export function getActivityLogs(): ActivityLog[] {
  const cache = getMemoryCache();
  if (cache.activityLogs && cache.activityLogs.length > 0) {
    return cache.activityLogs;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOGS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addActivityLog(data: {
  userName: string;
  userId: string;
  userRole: UserRole;
  action: string;
  category: ActivityLog['category'];
  details?: string;
  previousValue?: string;
  newValue?: string;
  timestamp?: string;
}): ActivityLog {
  const now = new Date();
  const timestamp = data.timestamp || now.toISOString();
  const dateObj = new Date(timestamp);

  const logItem: ActivityLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp,
    dateFormatted: formatLocalDate(dateObj),
    timeFormatted: formatLocalTime(dateObj),
    userName: data.userName,
    userId: data.userId,
    userRole: data.userRole,
    action: data.action,
    category: data.category,
    details: data.details,
    previousValue: data.previousValue,
    newValue: data.newValue,
  };

  const logs = getActivityLogs();
  const updatedLogs = [logItem, ...logs].slice(0, 200);
  localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOGS, JSON.stringify(updatedLogs));
  notifyDataChanged();

  logActivityFirestore(data).catch(console.error);

  return logItem;
}

// -------------------------------------------------------------
// MENÚ DEL DÍA (FUENTE ÚNICA DE VERDAD)
// -------------------------------------------------------------
export function getDailyMenuConfig(): DailyMenuConfig {
  const cache = getMemoryCache();
  if (cache.dailyMenu) {
    return {
      ...INITIAL_DAILY_MENU,
      ...cache.dailyMenu,
      serviceMode: cache.dailyMenu.serviceMode || 'AUTO',
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DAILY_MENU);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.DAILY_MENU, JSON.stringify(INITIAL_DAILY_MENU));
      return INITIAL_DAILY_MENU;
    }
    const parsed = JSON.parse(raw);
    return {
      ...INITIAL_DAILY_MENU,
      ...parsed,
      serviceMode: parsed.serviceMode || 'AUTO',
    };
  } catch {
    return INITIAL_DAILY_MENU;
  }
}

export async function saveDailyMenuConfig(config: DailyMenuConfig, user: StaffUser): Promise<DailyMenuConfig> {
  if (user.role === 'EMPLEADO') {
    throw new Error('Solo Encargados o Administradores pueden publicar cambios al menú del día.');
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const updatedConfig: DailyMenuConfig = {
    ...config,
    updatedAt: nowIso,
    updatedBy: user.name,
  };

  await saveDailyMenuFirestore(updatedConfig, user);

  localStorage.setItem(STORAGE_KEYS.DAILY_MENU, JSON.stringify(updatedConfig));
  notifyDataChanged();

  return updatedConfig;
}

// -------------------------------------------------------------
// INFORMACIÓN GENERAL DEL RESTAURANTE (FUENTE ÚNICA DE VERDAD)
// -------------------------------------------------------------
export const INITIAL_RESTAURANT_INFO: RestaurantInfo = {
  restaurantId: 'alo-restaurante',
  address: 'Calle la Fama 12, 14260 Tlalpan CDMX, México',
  whatsapp: '55 7441 1437',
  whatsappRaw: '5574411437',
  openingHours: 'Abiertos de 9:00 am a 5:30 pm',
  ecoDiscountPercent: 10,
  ecoDiscountDescription: '10% de descuento si el cliente trae sus propios recipientes o termo.',
  deliveryFee: 25,
  vipStampsRequired: 5,
  vipRewardDescription: 'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.',
  servicePolicies: 'Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta.',
  activePromotions: '10% de descuento por traer recipientes propios.',
  updatedAt: '2026-09-03T00:00:00.000Z',
  updatedBy: 'Sistema',
};

export function getRestaurantInfo(): RestaurantInfo {
  const cache = getMemoryCache();
  if (cache.restaurantInfo) {
    return {
      ...INITIAL_RESTAURANT_INFO,
      ...cache.restaurantInfo,
      ecoDiscountPercent: typeof cache.restaurantInfo.ecoDiscountPercent === 'number' ? cache.restaurantInfo.ecoDiscountPercent : INITIAL_RESTAURANT_INFO.ecoDiscountPercent,
      deliveryFee: typeof cache.restaurantInfo.deliveryFee === 'number' ? cache.restaurantInfo.deliveryFee : INITIAL_RESTAURANT_INFO.deliveryFee,
      vipStampsRequired: typeof cache.restaurantInfo.vipStampsRequired === 'number' ? cache.restaurantInfo.vipStampsRequired : INITIAL_RESTAURANT_INFO.vipStampsRequired,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RESTAURANT_INFO);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.RESTAURANT_INFO, JSON.stringify(INITIAL_RESTAURANT_INFO));
      return INITIAL_RESTAURANT_INFO;
    }
    const parsed = JSON.parse(raw);
    return {
      restaurantId: parsed.restaurantId || INITIAL_RESTAURANT_INFO.restaurantId,
      address: parsed.address || INITIAL_RESTAURANT_INFO.address,
      whatsapp: parsed.whatsapp || INITIAL_RESTAURANT_INFO.whatsapp,
      whatsappRaw: parsed.whatsappRaw || INITIAL_RESTAURANT_INFO.whatsappRaw,
      openingHours: parsed.openingHours || INITIAL_RESTAURANT_INFO.openingHours,
      ecoDiscountPercent: typeof parsed.ecoDiscountPercent === 'number' ? parsed.ecoDiscountPercent : INITIAL_RESTAURANT_INFO.ecoDiscountPercent,
      ecoDiscountDescription: parsed.ecoDiscountDescription || INITIAL_RESTAURANT_INFO.ecoDiscountDescription,
      deliveryFee: typeof parsed.deliveryFee === 'number' ? parsed.deliveryFee : INITIAL_RESTAURANT_INFO.deliveryFee,
      vipStampsRequired: typeof parsed.vipStampsRequired === 'number' ? parsed.vipStampsRequired : INITIAL_RESTAURANT_INFO.vipStampsRequired,
      vipRewardDescription: parsed.vipRewardDescription || INITIAL_RESTAURANT_INFO.vipRewardDescription,
      servicePolicies: parsed.servicePolicies || INITIAL_RESTAURANT_INFO.servicePolicies,
      activePromotions: parsed.activePromotions || INITIAL_RESTAURANT_INFO.activePromotions,
      updatedAt: parsed.updatedAt || INITIAL_RESTAURANT_INFO.updatedAt,
      updatedBy: parsed.updatedBy || INITIAL_RESTAURANT_INFO.updatedBy,
    };
  } catch {
    return INITIAL_RESTAURANT_INFO;
  }
}

export async function saveRestaurantInfo(
  info: Partial<RestaurantInfo>,
  user?: StaffUser
): Promise<RestaurantInfo> {
  const current = getRestaurantInfo();
  const whatsapp = (info.whatsapp !== undefined ? info.whatsapp : current.whatsapp).trim();
  const whatsappRaw = info.whatsappRaw || whatsapp.replace(/\D/g, '') || current.whatsappRaw || '5574411437';

  const updated: RestaurantInfo = {
    ...current,
    ...info,
    address: (info.address !== undefined ? info.address : current.address).trim(),
    whatsapp,
    whatsappRaw,
    openingHours: (info.openingHours !== undefined ? info.openingHours : current.openingHours).trim(),
    ecoDiscountPercent: typeof info.ecoDiscountPercent === 'number' ? info.ecoDiscountPercent : current.ecoDiscountPercent ?? 10,
    ecoDiscountDescription: (info.ecoDiscountDescription !== undefined ? info.ecoDiscountDescription : (current.ecoDiscountDescription || INITIAL_RESTAURANT_INFO.ecoDiscountDescription!)).trim(),
    deliveryFee: typeof info.deliveryFee === 'number' ? info.deliveryFee : current.deliveryFee ?? 25,
    vipStampsRequired: typeof info.vipStampsRequired === 'number' ? info.vipStampsRequired : current.vipStampsRequired ?? 5,
    vipRewardDescription: (info.vipRewardDescription !== undefined ? info.vipRewardDescription : (current.vipRewardDescription || INITIAL_RESTAURANT_INFO.vipRewardDescription!)).trim(),
    servicePolicies: (info.servicePolicies !== undefined ? info.servicePolicies : (current.servicePolicies || INITIAL_RESTAURANT_INFO.servicePolicies!)).trim(),
    activePromotions: (info.activePromotions !== undefined ? info.activePromotions : (current.activePromotions || INITIAL_RESTAURANT_INFO.activePromotions!)).trim(),
    restaurantId: 'alo-restaurante',
    updatedAt: new Date().toISOString(),
    updatedBy: user?.name || 'Administración Aló',
  };

  await saveRestaurantInfoFirestore(updated, user);
  try {
    localStorage.setItem(STORAGE_KEYS.RESTAURANT_INFO, JSON.stringify(updated));
  } catch {}
  notifyDataChanged();
  return updated;
}

// -------------------------------------------------------------
// PERMISOS Y CONTROL DE ACCESO
// -------------------------------------------------------------
export function canAccessFinancials(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR' || role === 'ENCARGADO';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR';
}

export function canCloseShift(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR' || role === 'ENCARGADO';
}

export function canEditDailyMenu(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR' || role === 'ENCARGADO';
}

export function canDeleteRecords(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR';
}

// -------------------------------------------------------------
// GESTIÓN DE CXC (CUENTAS POR COBRAR)
// -------------------------------------------------------------
const INITIAL_CXC: CxcRecord[] = [];

export function getCxcList(): CxcRecord[] {
  const cache = getMemoryCache();
  if (cache.isInitialized) {
    return cache.cxcList;
  }
  if (cache.cxcList && cache.cxcList.length > 0) {
    return cache.cxcList;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CXC);
    if (!raw) {
      return INITIAL_CXC;
    }
    const parsed: CxcRecord[] = JSON.parse(raw);
    const cleaned = parsed.filter(
      (c) =>
        c.id !== 'cxc_1_sample' &&
        c.id !== 'cxc_2_sample' &&
        !c.person.includes('Roberto Morales') &&
        !c.person.includes('Carmen Soto') &&
        !c.person.toLowerCase().includes('test person automated') &&
        !(c.amount === 150 && c.person.toLowerCase().includes('test person'))
    );
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEYS.CXC, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return INITIAL_CXC;
  }
}

export function addCxc(
  data: {
    person: string;
    amount: number;
    concept: string;
    date?: string;
    notes?: string;
  },
  user?: StaffUser
): CxcRecord {
  const all = getCxcList();
  const now = new Date();
  const nowIso = now.toISOString();

  const newCxc: CxcRecord = {
    id: `cxc_${now.getTime()}_${Math.random().toString(36).substring(2, 6)}`,
    person: data.person.trim(),
    amount: Math.max(0, Number(data.amount) || 0),
    concept: data.concept.trim(),
    date: data.date ? formatLocalDate(data.date) : formatLocalDate(now),
    status: 'Pendiente',
    registeredBy: user?.name || 'Administración',
    createdAt: nowIso,
  };

  if (user?.id) {
    newCxc.registeredById = user.id;
  }
  if (data.notes && data.notes.trim()) {
    newCxc.notes = data.notes.trim();
  }

  const updated = [newCxc, ...all];
  localStorage.setItem(STORAGE_KEYS.CXC, JSON.stringify(updated));
  notifyDataChanged();

  saveCxcFirestore(newCxc, user, true).catch(console.error);

  if (user) {
    addActivityLog({
      userName: user.name,
      userId: user.id,
      userRole: user.role,
      action: `Registró CXC de $${newCxc.amount}: ${newCxc.person}`,
      category: 'cxc',
      details: `Concepto: ${newCxc.concept}${newCxc.notes ? ` | Nota: ${newCxc.notes}` : ''}`,
      newValue: `$${newCxc.amount} - ${newCxc.person}`,
      timestamp: nowIso,
    });
  }

  return newCxc;
}

export function markCxcAsPaid(id: string, user?: StaffUser): CxcRecord | null {
  const all = getCxcList();
  const index = all.findIndex((c) => c.id === id);
  if (index === -1) return null;

  const current = all[index];
  if (current.status === 'Anulado') {
    throw new Error('No se puede marcar como pagada una cuenta anulada.');
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const updatedItem: CxcRecord = {
    ...current,
    status: 'Pagado',
    paidAt: nowIso,
  };

  all[index] = updatedItem;
  localStorage.setItem(STORAGE_KEYS.CXC, JSON.stringify(all));
  notifyDataChanged();

  saveCxcFirestore(updatedItem, user).catch(console.error);

  if (user) {
    addActivityLog({
      userName: user.name,
      userId: user.id,
      userRole: user.role,
      action: `Marcó CXC como pagada: ${current.person} ($${current.amount})`,
      category: 'cxc',
      previousValue: `Pendiente: $${current.amount}`,
      newValue: `Pagado: $${current.amount}`,
      timestamp: nowIso,
    });
  }

  return updatedItem;
}

export async function toggleCxcStatus(id: string, user?: StaffUser): Promise<CxcRecord | null> {
  const all = getCxcList();
  const index = all.findIndex((c) => c.id === id);
  if (index === -1) return null;

  const current = all[index];
  if (current.status === 'Anulado') {
    throw new Error('No se puede cambiar el estado de una cuenta anulada.');
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const nextStatus: CxcStatus = current.status === 'Pendiente' ? 'Pagado' : 'Pendiente';
  const updatedItem: CxcRecord = {
    ...current,
    status: nextStatus,
  };
  if (nextStatus === 'Pagado') {
    updatedItem.paidAt = nowIso;
  } else {
    delete updatedItem.paidAt;
  }

  await saveCxcFirestore(updatedItem, user);

  all[index] = updatedItem;
  localStorage.setItem(STORAGE_KEYS.CXC, JSON.stringify(all));
  notifyDataChanged();

  if (user) {
    addActivityLog({
      userName: user.name,
      userId: user.id,
      userRole: user.role,
      action: `Cambió estado de CXC a ${nextStatus}: ${current.person} ($${current.amount})`,
      category: 'cxc',
      previousValue: `${current.status}: $${current.amount}`,
      newValue: `${nextStatus}: $${current.amount}`,
      timestamp: nowIso,
    });
  }

  return updatedItem;
}

export async function cancelCxc(
  id: string,
  reason: string,
  user: StaffUser
): Promise<CxcRecord> {
  if (user.role !== 'DUEÑA' && user.role !== 'ADMINISTRADOR') {
    throw new Error('Solo DUEÑA o ADMINISTRADOR tienen permisos para anular CXC.');
  }

  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('Debes proporcionar un motivo de anulación.');
  }

  const all = getCxcList();
  const index = all.findIndex((c) => c.id === id);
  if (index === -1) {
    throw new Error('Cuenta por cobrar no encontrada.');
  }

  const current = all[index];
  const now = new Date();
  const nowIso = now.toISOString();

  const updatedItem: CxcRecord = {
    ...current,
    status: 'Anulado',
    cancelledAt: nowIso,
    cancelledBy: user.name,
    cancelledById: user.id,
    cancellationReason: cleanReason,
  };

  await saveCxcFirestore(updatedItem, user);

  all[index] = updatedItem;
  localStorage.setItem(STORAGE_KEYS.CXC, JSON.stringify(all));
  notifyDataChanged();

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: `Anuló CXC de ${current.person} por $${current.amount}`,
    category: 'cxc',
    details: `Motivo de anulación: "${cleanReason}" | Concepto: ${current.concept} | Registrado orig: ${current.registeredBy || 'Desconocido'}`,
    previousValue: `${current.status}: $${current.amount}`,
    newValue: `Anulado por ${user.name} - Motivo: ${cleanReason}`,
    timestamp: nowIso,
  });

  return updatedItem;
}

export async function deleteCxc(id: string, user?: StaffUser): Promise<boolean> {
  if (user && user.role === 'EMPLEADO') {
    throw new Error('Los empleados no tienen permiso para eliminar registros de CXC.');
  }

  const all = getCxcList();
  const target = all.find((c) => c.id === id);
  if (!target) return false;

  await deleteCxcFirestore(target, user);

  const filtered = all.filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEYS.CXC, JSON.stringify(filtered));
  notifyDataChanged();

  return true;
}

// -------------------------------------------------------------
// GESTIÓN DE SOBRE / RESGUARDO
// -------------------------------------------------------------
export function getSobreMovements(): SobreMovement[] {
  const cache = getMemoryCache();
  if (cache.sobreMovements && cache.sobreMovements.length > 0) {
    return cache.sobreMovements;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SOBRE_MOVEMENTS);
    if (!raw) return [];
    const parsed: SobreMovement[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getLatestActiveTransition(movements: SobreMovement[]): SobreMovement | undefined {
  const activeTransitions = movements
    .filter((m) => !m.isCancelled && m.type === 'TRANSICION')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return activeTransitions[0];
}

export function calculateSobreTheoreticalBalance(movements: SobreMovement[]): number {
  const latestTransition = getLatestActiveTransition(movements);

  if (latestTransition) {
    const transitionTime = new Date(latestTransition.timestamp).getTime();
    let balance = latestTransition.amount;

    for (const m of movements) {
      if (m.isCancelled) continue;
      const mTime = new Date(m.timestamp).getTime();
      if (mTime > transitionTime) {
        if (m.type === 'ENTRADA') balance += m.amount;
        else if (m.type === 'GASTO') balance -= m.amount;
        else if (m.type === 'AJUSTE') balance += m.amount;
      }
    }
    return balance;
  }

  return movements.reduce((acc, m) => {
    if (m.isCancelled) return acc;
    if (m.type === 'SALDO_INICIAL') return acc + m.amount;
    if (m.type === 'ENTRADA') return acc + m.amount;
    if (m.type === 'GASTO') return acc - m.amount;
    if (m.type === 'AJUSTE') return acc + m.amount;
    return acc;
  }, 0);
}

export function getSobreSummary(): SobreSummary {
  const all = getSobreMovements();
  const active = all.filter((m) => !m.isCancelled);
  const latestTransition = getLatestActiveTransition(all);

  let initialBalance = 0;
  let totalInflows = 0;
  let totalOutflows = 0;
  let totalAdjustments = 0;

  if (latestTransition) {
    const transitionTime = new Date(latestTransition.timestamp).getTime();
    for (const m of active) {
      const mTime = new Date(m.timestamp).getTime();
      if (mTime > transitionTime) {
        if (m.type === 'ENTRADA') totalInflows += m.amount;
        else if (m.type === 'GASTO') totalOutflows += m.amount;
        else if (m.type === 'AJUSTE') totalAdjustments += m.amount;
      }
    }
  } else {
    for (const m of active) {
      if (m.type === 'SALDO_INICIAL') initialBalance += m.amount;
      else if (m.type === 'ENTRADA') totalInflows += m.amount;
      else if (m.type === 'GASTO') totalOutflows += m.amount;
      else if (m.type === 'AJUSTE') totalAdjustments += m.amount;
    }
  }

  const currentTheoreticalBalance = calculateSobreTheoreticalBalance(all);
  const transitionTime = latestTransition ? new Date(latestTransition.timestamp).getTime() : 0;
  const counts = active
    .filter((m) => m.type === 'CONTEO' && new Date(m.timestamp).getTime() >= transitionTime)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const latestCount = counts.length > 0 ? counts[0] : undefined;

  let lastPhysicalCountSummary = undefined;
  let pendingDifference = 0;
  let hasPendingDifference = false;

  if (latestCount && latestCount.physicalCountedAmount !== undefined) {
    const diff = latestCount.countDifference ?? (latestCount.physicalCountedAmount - (latestCount.theoreticalBalanceAtCount ?? 0));

    lastPhysicalCountSummary = {
      date: latestCount.date,
      time: latestCount.time,
      physicalAmount: latestCount.physicalCountedAmount,
      theoreticalAmount: latestCount.theoreticalBalanceAtCount ?? 0,
      difference: diff,
      userName: latestCount.userName,
    };

    const countTimestamp = new Date(latestCount.timestamp).getTime();
    const adjustmentsAfterCount = active.filter(
      (m) => m.type === 'AJUSTE' && new Date(m.timestamp).getTime() >= countTimestamp
    );

    const adjustedAmountAfterCount = adjustmentsAfterCount.reduce((sum, a) => sum + a.amount, 0);
    const netPendingDiff = diff - adjustedAmountAfterCount;

    if (Math.abs(netPendingDiff) > 0.001) {
      pendingDifference = netPendingDiff;
      hasPendingDifference = true;
    }
  }

  return {
    currentTheoreticalBalance,
    totalInflows,
    totalOutflows,
    totalAdjustments,
    initialBalance,
    transitionBalance: latestTransition?.amount,
    transitionDate: latestTransition?.date,
    transitionTime: latestTransition?.time,
    transitionReason: latestTransition?.notes,
    transitionUser: latestTransition?.userName,
    hasActiveTransition: !!latestTransition,
    lastPhysicalCount: lastPhysicalCountSummary,
    pendingDifference,
    hasPendingDifference,
  };
}

export async function addSobreMovement(
  params: {
    type: 'SALDO_INICIAL' | 'ENTRADA' | 'GASTO';
    amount: number;
    concept: string;
    category?: string;
    personOrVendor?: string;
    notes?: string;
  },
  user: StaffUser
): Promise<SobreMovement> {
  if (user.role === 'EMPLEADO') {
    throw new Error('Los empleados no tienen permiso para registrar movimientos en el Sobre.');
  }

  const numAmount = Number(params.amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('El monto debe ser un número mayor a cero.');
  }

  const cleanConcept = params.concept.trim();
  if (!cleanConcept) {
    throw new Error('El concepto es obligatorio.');
  }

  const all = getSobreMovements();
  const now = new Date();
  const nowIso = now.toISOString();

  const currentTheoretical = calculateSobreTheoreticalBalance(all);
  let newTheoretical = currentTheoretical;
  if (params.type === 'SALDO_INICIAL' || params.type === 'ENTRADA') {
    newTheoretical += numAmount;
  } else if (params.type === 'GASTO') {
    newTheoretical -= numAmount;
  }

  const newMovement: SobreMovement = {
    id: `sobre-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: params.type,
    amount: numAmount,
    concept: cleanConcept,
    category: params.category?.trim() || undefined,
    personOrVendor: params.personOrVendor?.trim() || undefined,
    notes: params.notes?.trim() || undefined,
    date: formatLocalDate(now),
    time: formatLocalTime(now),
    timestamp: nowIso,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    resultingBalance: newTheoretical,
  };

  await saveSobreMovementFirestore(newMovement, user);

  const updatedList = [newMovement, ...all];
  localStorage.setItem(STORAGE_KEYS.SOBRE_MOVEMENTS, JSON.stringify(updatedList));
  notifyDataChanged();

  let logAction = '';
  if (params.type === 'GASTO') {
    logAction = `${user.name} registró gasto de Sobre de $${numAmount.toLocaleString('es-MX')} — ${params.category || cleanConcept}${params.personOrVendor ? ` (${params.personOrVendor})` : ''}`;
  } else if (params.type === 'ENTRADA') {
    logAction = `${user.name} registró entrada al Sobre de $${numAmount.toLocaleString('es-MX')} — ${cleanConcept}${params.category ? ` (${params.category})` : ''}`;
  } else {
    logAction = `${user.name} estableció saldo inicial del Sobre: $${numAmount.toLocaleString('es-MX')}`;
  }

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: logAction,
    category: 'sobre',
    details: `${cleanConcept}${params.personOrVendor ? ` | Persona/Prov: ${params.personOrVendor}` : ''}${params.notes ? ` | Nota: ${params.notes}` : ''}`,
    previousValue: `Saldo anterior: $${currentTheoretical.toLocaleString('es-MX')}`,
    newValue: `Saldo posterior: $${newTheoretical.toLocaleString('es-MX')}`,
    timestamp: nowIso,
  });

  return newMovement;
}

export async function recordSobrePhysicalCount(
  physicalCountedAmount: number,
  notes: string = '',
  user: StaffUser
): Promise<{ movement: SobreMovement; difference: number; theoreticalBalance: number }> {
  if (user.role === 'EMPLEADO') {
    throw new Error('Los empleados no tienen permiso para realizar conteos en el Sobre.');
  }

  const numPhysical = Number(physicalCountedAmount);
  if (isNaN(numPhysical) || numPhysical < 0) {
    throw new Error('El monto de efectivo físico debe ser un número válido.');
  }

  const all = getSobreMovements();
  const theoreticalBalance = calculateSobreTheoreticalBalance(all);
  const difference = numPhysical - theoreticalBalance;
  const now = new Date();
  const nowIso = now.toISOString();

  const newMovement: SobreMovement = {
    id: `sobre-conteo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'CONTEO',
    amount: numPhysical,
    concept: 'Conteo físico del Sobre',
    notes: notes.trim() || undefined,
    date: formatLocalDate(now),
    time: formatLocalTime(now),
    timestamp: nowIso,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    resultingBalance: theoreticalBalance,
    theoreticalBalanceAtCount: theoreticalBalance,
    physicalCountedAmount: numPhysical,
    countDifference: difference,
    isDifferencePending: Math.abs(difference) > 0.001,
  };

  await saveSobreMovementFirestore(newMovement, user);

  const updatedList = [newMovement, ...all];
  localStorage.setItem(STORAGE_KEYS.SOBRE_MOVEMENTS, JSON.stringify(updatedList));
  notifyDataChanged();

  const diffSign = difference >= 0 ? '+' : '';
  const logAction = `${user.name} realizó conteo físico del Sobre: $${numPhysical.toLocaleString('es-MX')}. Diferencia: ${diffSign}$${difference.toLocaleString('es-MX')}`;

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: logAction,
    category: 'sobre',
    details: `Teórico: $${theoreticalBalance.toLocaleString('es-MX')} | Físico: $${numPhysical.toLocaleString('es-MX')}${notes ? ` | Nota: ${notes}` : ''}`,
    previousValue: `Saldo Teórico: $${theoreticalBalance.toLocaleString('es-MX')}`,
    newValue: `Físico: $${numPhysical.toLocaleString('es-MX')} (Dif: ${diffSign}$${difference.toLocaleString('es-MX')})`,
    timestamp: nowIso,
  });

  return {
    movement: newMovement,
    difference,
    theoreticalBalance,
  };
}

export async function reconcileSobreDifference(
  adjustmentAmount: number,
  reason: string,
  user: StaffUser
): Promise<SobreMovement> {
  if (user.role !== 'DUEÑA' && user.role !== 'ADMINISTRADOR') {
    throw new Error('Solo DUEÑA o ADMINISTRADOR tienen permisos para conciliar diferencias del Sobre.');
  }

  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('El motivo de conciliación es obligatorio.');
  }

  const numAdjustment = Number(adjustmentAmount);
  if (isNaN(numAdjustment) || numAdjustment === 0) {
    throw new Error('El monto de ajuste no puede ser cero.');
  }

  const all = getSobreMovements();
  const currentTheoretical = calculateSobreTheoreticalBalance(all);
  const newTheoretical = currentTheoretical + numAdjustment;
  const now = new Date();
  const nowIso = now.toISOString();

  const newMovement: SobreMovement = {
    id: `sobre-ajuste-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'AJUSTE',
    amount: numAdjustment,
    concept: 'Ajuste de conciliación',
    notes: cleanReason,
    date: formatLocalDate(now),
    time: formatLocalTime(now),
    timestamp: nowIso,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    resultingBalance: newTheoretical,
  };

  await saveSobreMovementFirestore(newMovement, user);

  const updatedList = [newMovement, ...all];
  localStorage.setItem(STORAGE_KEYS.SOBRE_MOVEMENTS, JSON.stringify(updatedList));
  notifyDataChanged();

  const sign = numAdjustment >= 0 ? '+' : '';
  const logAction = `${user.name} concilió diferencia de ${sign}$${numAdjustment.toLocaleString('es-MX')} en el Sobre. Motivo: ${cleanReason}`;

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: logAction,
    category: 'sobre',
    details: `Motivo: "${cleanReason}" | Ajuste aplicado: ${sign}$${numAdjustment.toLocaleString('es-MX')}`,
    previousValue: `Teórico antes: $${currentTheoretical.toLocaleString('es-MX')}`,
    newValue: `Teórico después: $${newTheoretical.toLocaleString('es-MX')}`,
    timestamp: nowIso,
  });

  return newMovement;
}

export async function cancelSobreMovement(
  movementId: string,
  reason: string,
  user: StaffUser
): Promise<SobreMovement> {
  if (user.role !== 'DUEÑA' && user.role !== 'ADMINISTRADOR') {
    throw new Error('Solo DUEÑA o ADMINISTRADOR tienen permisos para anular movimientos del Sobre.');
  }

  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('El motivo de anulación es obligatorio.');
  }

  const all = getSobreMovements();
  const index = all.findIndex((m) => m.id === movementId);
  if (index === -1) {
    throw new Error('Movimiento no encontrado.');
  }

  const target = all[index];
  if (target.isCancelled) {
    throw new Error('Este movimiento ya ha sido anulado.');
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const updatedMovement: SobreMovement = {
    ...target,
    isCancelled: true,
    cancelledAt: nowIso,
    cancelledBy: user.name,
    cancelledById: user.id,
    cancelReason: cleanReason,
  };

  await saveSobreMovementFirestore(updatedMovement, user);

  all[index] = updatedMovement;
  localStorage.setItem(STORAGE_KEYS.SOBRE_MOVEMENTS, JSON.stringify(all));
  notifyDataChanged();

  const newBalance = calculateSobreTheoreticalBalance(all);

  const logAction = `${user.name} anuló movimiento de Sobre (${target.type} $${target.amount.toLocaleString('es-MX')}): ${target.concept}. Motivo: ${cleanReason}`;

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: logAction,
    category: 'sobre',
    details: `Motivo de anulación: "${cleanReason}" | Movimiento original de ${target.userName} (${target.date} ${target.time})`,
    previousValue: `Movimiento activo: ${target.type} $${target.amount}`,
    newValue: `Anulado por ${user.name} | Nuevo saldo: $${newBalance.toLocaleString('es-MX')}`,
    timestamp: nowIso,
  });

  return updatedMovement;
}

export async function setSobreTransitionBalance(
  physicalCountedAmount: number,
  reason: string,
  user: StaffUser
): Promise<SobreMovement> {
  if (user.role !== 'DUEÑA' && user.role !== 'ADMINISTRADOR') {
    throw new Error('Solo DUEÑA o ADMINISTRADOR tienen permisos para establecer el saldo de transición del Sobre.');
  }

  const numPhysical = Number(physicalCountedAmount);
  if (isNaN(numPhysical) || numPhysical < 0) {
    throw new Error('Por favor ingresa un monto válido de efectivo físico contado.');
  }

  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('El motivo de la transición es obligatorio.');
  }

  const all = getSobreMovements();
  const previousBalance = calculateSobreTheoreticalBalance(all);
  const now = new Date();
  const nowIso = now.toISOString();

  const newMovement: SobreMovement = {
    id: `sobre-transicion-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'TRANSICION',
    amount: numPhysical,
    concept: 'Saldo de transición (Inicio oficial del control digital)',
    category: 'Saldo de transición',
    notes: cleanReason,
    date: formatLocalDate(now),
    time: formatLocalTime(now),
    timestamp: nowIso,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    resultingBalance: numPhysical,
    physicalCountedAmount: numPhysical,
  };

  await saveSobreMovementFirestore(newMovement, user);

  const updatedList = [newMovement, ...all];
  localStorage.setItem(STORAGE_KEYS.SOBRE_MOVEMENTS, JSON.stringify(updatedList));
  notifyDataChanged();

  const logAction = `${user.name} estableció saldo de transición del Sobre en $${numPhysical.toLocaleString('es-MX', { minimumFractionDigits: 2 })} para iniciar el control digital.`;

  addActivityLog({
    userName: user.name,
    userId: user.id,
    userRole: user.role,
    action: logAction,
    category: 'sobre',
    details: `Motivo: "${cleanReason}" | Efectivo físico contado: $${numPhysical.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    previousValue: `Saldo previo: $${previousBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    newValue: `Nuevo saldo base: $${numPhysical.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    timestamp: nowIso,
  });

  return newMovement;
}

// -------------------------------------------------------------
// PERMISOS DE SOBRE / RESGUARDO
// -------------------------------------------------------------
export function canViewSobreBalance(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR' || role === 'ENCARGADO';
}

export function canRegisterSobreMovement(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR' || role === 'ENCARGADO';
}

export function canReconcileSobre(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR';
}

export function canVoidSobreMovement(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR';
}

export function canSetSobreTransition(role: UserRole): boolean {
  return role === 'DUEÑA' || role === 'ADMINISTRADOR';
}

// Re-exportar utilidades de migración
export { inspectLocalStorageData, migrateLocalStorageToFirestore };
