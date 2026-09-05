import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  enableNetwork,
  disableNetwork,
} from 'firebase/firestore';
import { db, auth, subscribeToAuth, isUserAuthenticated } from './firebase';
import {
  StaffUser,
  ShiftRecord,
  ExpenseRecord,
  CxcRecord,
  InventoryItem,
  SobreMovement,
  DailyMenuConfig,
  RestaurantInfo,
  ActivityLog,
  UserRole,
} from '../types';

export const RESTAURANT_ID = 'alo-restaurante';

// -------------------------------------------------------------
// IDENTIFICADOR DE DISPOSITIVO PARA AUDITORÍA
// -------------------------------------------------------------
const DEVICE_STORAGE_KEY = 'alo_admin_device_id_v2';
const DEVICE_NAME_KEY = 'alo_admin_device_name_v2';

export function getDeviceIdentifier(): { id: string; name: string } {
  try {
    let id = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      localStorage.setItem(DEVICE_STORAGE_KEY, id);
    }
    
    let name = localStorage.getItem(DEVICE_NAME_KEY);
    if (!name) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isIPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIPad) name = 'iPad Caja';
      else if (isMobile) name = 'Dispositivo Móvil';
      else name = 'Terminal Web';
      localStorage.setItem(DEVICE_NAME_KEY, name);
    }
    return { id, name };
  } catch {
    return { id: 'device_fallback', name: 'Terminal' };
  }
}

export function setCustomDeviceName(name: string): void {
  try {
    localStorage.setItem(DEVICE_NAME_KEY, name.trim());
  } catch (e) {
    console.error('Error saving device name', e);
  }
}

/**
 * Sanitiza cualquier payload antes de enviarlo a Firestore:
 * - Elimina propiedades con valor undefined
 * - Elimina propiedades con valor NaN
 * - Procesa recursivamente objetos anidados
 * - Garantiza que el SDK de Firestore nunca reciba datos incompatibles
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(data: T): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) {
      continue;
    }
    if (typeof val === 'number' && Number.isNaN(val)) {
      continue;
    }
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      clean[key] = sanitizeFirestorePayload(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

// -------------------------------------------------------------
// ESTADO DE SINCRONIZACIÓN Y RED
// -------------------------------------------------------------
export type SyncStatus = 'unauthenticated' | 'authenticating' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: Date | null;
  errorMessage?: string;
  isOnline: boolean;
  activeListenersCount: number;
}

let currentSyncState: SyncState = {
  status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'unauthenticated',
  lastSyncedAt: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  activeListenersCount: 0,
};

const syncListeners = new Set<(state: SyncState) => void>();

export function getSyncState(): SyncState {
  return { ...currentSyncState };
}

export function subscribeToSyncState(callback: (state: SyncState) => void): () => void {
  syncListeners.add(callback);
  callback(currentSyncState);
  return () => {
    syncListeners.delete(callback);
  };
}

function updateSyncState(updates: Partial<SyncState>) {
  currentSyncState = { ...currentSyncState, ...updates };
  syncListeners.forEach((cb) => {
    try {
      cb(currentSyncState);
    } catch (e) {
      console.error('Error notifying sync listener:', e);
    }
  });
}

// Escuchar eventos online / offline del navegador
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    updateSyncState({ isOnline: true, status: 'syncing' });
    enableNetwork(db).catch(() => {});
  });
  window.addEventListener('offline', () => {
    updateSyncState({ isOnline: false, status: 'offline' });
  });
}

// -------------------------------------------------------------
// CACHÉ REACTIVO EN MEMORIA (MEMORIA VIVA SINCRONIZADA CON FIRESTORE)
// -------------------------------------------------------------
export interface AppDatabaseCache {
  staffUsers: StaffUser[];
  currentShift: ShiftRecord | null;
  shiftsHistory: ShiftRecord[];
  expenses: ExpenseRecord[];
  cxcList: CxcRecord[];
  inventory: InventoryItem[];
  sobreMovements: SobreMovement[];
  dailyMenu: DailyMenuConfig | null;
  restaurantInfo: RestaurantInfo | null;
  activityLogs: ActivityLog[];
  isInitialized: boolean;
}

const memoryCache: AppDatabaseCache = {
  staffUsers: [],
  currentShift: null,
  shiftsHistory: [],
  expenses: [],
  cxcList: [],
  inventory: [],
  sobreMovements: [],
  dailyMenu: null,
  restaurantInfo: null,
  activityLogs: [],
  isInitialized: false,
};

type CacheSubscriber = (cache: AppDatabaseCache) => void;
const cacheSubscribers = new Set<CacheSubscriber>();

export function subscribeToCache(callback: CacheSubscriber): () => void {
  cacheSubscribers.add(callback);
  if (memoryCache.isInitialized) {
    callback(memoryCache);
  }
  return () => {
    cacheSubscribers.delete(callback);
  };
}

function notifyCacheChange() {
  cacheSubscribers.forEach((cb) => {
    try {
      cb(memoryCache);
    } catch (e) {
      console.error('Error notifying cache subscriber', e);
    }
  });
}

export function getMemoryCache(): AppDatabaseCache {
  return memoryCache;
}

// -------------------------------------------------------------
// COLECCIONES EN FIRESTORE
// -------------------------------------------------------------
const collections = {
  staff: collection(db, 'staff_users'),
  shifts: collection(db, 'shifts'),
  expenses: collection(db, 'expenses'),
  cxc: collection(db, 'cxc_records'),
  inventory: collection(db, 'inventory_items'),
  sobre: collection(db, 'sobre_movements'),
  dailyMenu: collection(db, 'daily_menu'),
  logs: collection(db, 'activity_logs'),
};

// -------------------------------------------------------------
// INICIALIZACIÓN DE LISTENERS EN TIEMPO REAL
// -------------------------------------------------------------
let listenersInitialized = false;
let authStateUnsubscribe: (() => void) | null = null;
let adminUnsubscribes: (() => void)[] = [];
const activeListenerSet = new Set<string>();

export function initFirestoreRealtimeSync(): () => void {
  if (listenersInitialized) {
    return () => {};
  }
  listenersInitialized = true;
  updateSyncState({
    status: isUserAuthenticated() ? 'syncing' : 'unauthenticated',
    activeListenersCount: 0,
    errorMessage: undefined,
  });

  const handleListenerSuccess = (key: string) => {
    activeListenerSet.add(key);
    const count = activeListenerSet.size;
    // Solo mostramos "synced" si existe usuario autenticado y todos los listeners están conectados
    if (isUserAuthenticated() && count >= 8) {
      memoryCache.isInitialized = true;
      updateSyncState({
        status: 'synced',
        lastSyncedAt: new Date(),
        activeListenersCount: count,
        errorMessage: undefined,
      });
    } else if (isUserAuthenticated()) {
      updateSyncState({
        status: 'syncing',
        activeListenersCount: count,
        errorMessage: undefined,
      });
    } else {
      updateSyncState({
        status: 'unauthenticated',
        activeListenersCount: count,
        errorMessage: undefined,
      });
    }
    notifyCacheChange();
  };

  const handleListenerError = (key: string, error: any) => {
    console.error(`Error en listener de ${key}:`, error);
    activeListenerSet.delete(key);
    if (isUserAuthenticated()) {
      updateSyncState({
        status: 'error',
        activeListenersCount: activeListenerSet.size,
        errorMessage: `Error en ${key}: ${error?.message || error?.code || 'Permisos o conexión fallida en Firestore'}`,
      });
    }
  };

  // 1. Daily Menu Listener (Público para comensales y comanda)
  const menuDocRef = doc(collections.dailyMenu, 'current');
  const menuUnsub = onSnapshot(
    menuDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        memoryCache.dailyMenu = snapshot.data() as DailyMenuConfig;
      }
      handleListenerSuccess('menu_dia');
    },
    (error) => handleListenerError('menu_dia', error)
  );

  // 2. Restaurant Info Listener (Público para comensales y Tita)
  const restInfoDocRef = doc(collections.dailyMenu, 'restaurant_info');
  const restInfoUnsub = onSnapshot(
    restInfoDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as RestaurantInfo;
        memoryCache.restaurantInfo = data;
        try {
          localStorage.setItem('alo_admin_restaurant_info_v1', JSON.stringify(data));
        } catch {}
      }
      handleListenerSuccess('restaurant_info');
    },
    (error) => handleListenerError('restaurant_info', error)
  );

  const startAdminListeners = () => {
    // Limpiar suscripciones previas si existían
    adminUnsubscribes.forEach((unsub) => {
      try {
        unsub();
      } catch {}
    });
    adminUnsubscribes = [];

    // 1. Personal / Staff Users Listener
    const staffQuery = query(collections.staff, where('restaurantId', '==', RESTAURANT_ID));
    adminUnsubscribes.push(
      onSnapshot(
        staffQuery,
        (snapshot) => {
          const users: StaffUser[] = [];
          snapshot.forEach((d) => {
            users.push(d.data() as StaffUser);
          });
          if (users.length > 0) {
            memoryCache.staffUsers = users.sort((a, b) => a.name.localeCompare(b.name));
          }
          handleListenerSuccess('personal');
        },
        (error) => handleListenerError('personal', error)
      )
    );

    // 2. Shifts Listener (Turnos activos e historial)
    const shiftsQuery = query(collections.shifts, where('restaurantId', '==', RESTAURANT_ID));
    adminUnsubscribes.push(
      onSnapshot(
        shiftsQuery,
        (snapshot) => {
          let active: ShiftRecord | null = null;
          const history: ShiftRecord[] = [];

          snapshot.forEach((d) => {
            const shift = d.data() as ShiftRecord;
            if (shift.status === 'abierto') {
              active = shift;
            } else {
              history.push(shift);
            }
          });

          // Ordenar historial del más reciente al más antiguo
          history.sort((a, b) => {
            const timeA = new Date(a.closedAtTimestamp || a.createdAt || a.date).getTime();
            const timeB = new Date(b.closedAtTimestamp || b.createdAt || b.date).getTime();
            return timeB - timeA;
          });

          memoryCache.currentShift = active;
          memoryCache.shiftsHistory = history;
          handleListenerSuccess('turnos');
        },
        (error) => handleListenerError('turnos', error)
      )
    );

    // 3. Expenses Listener (Gastos)
    const expensesQuery = query(collections.expenses, where('restaurantId', '==', RESTAURANT_ID));
    adminUnsubscribes.push(
      onSnapshot(
        expensesQuery,
        (snapshot) => {
          const expenses: ExpenseRecord[] = [];
          snapshot.forEach((d) => {
            expenses.push(d.data() as ExpenseRecord);
          });
          expenses.sort((a, b) => {
            const timeA = new Date(`${a.date} ${a.time || '00:00'}`).getTime();
            const timeB = new Date(`${b.date} ${b.time || '00:00'}`).getTime();
            return timeB - timeA;
          });
          memoryCache.expenses = expenses;
          handleListenerSuccess('gastos');
        },
        (error) => handleListenerError('gastos', error)
      )
    );

    // 4. CXC Listener (Cuentas por cobrar)
    const cxcQuery = query(collections.cxc, where('restaurantId', '==', RESTAURANT_ID));
    adminUnsubscribes.push(
      onSnapshot(
        cxcQuery,
        (snapshot) => {
          const records: CxcRecord[] = [];
          snapshot.forEach((d) => {
            const item = d.data() as CxcRecord;
            if (
              !item.person?.toLowerCase().includes('test person automated') &&
              !(item.amount === 150 && item.person?.toLowerCase().includes('test person'))
            ) {
              records.push(item);
            }
          });
          records.sort((a, b) => {
            const timeA = new Date(a.createdAt || a.date).getTime();
            const timeB = new Date(b.createdAt || b.date).getTime();
            return timeB - timeA;
          });
          memoryCache.cxcList = records;
          handleListenerSuccess('cxc');
        },
        (error) => handleListenerError('cxc', error)
      )
    );

    // 5. Inventory Listener (Inventario)
    const inventoryQuery = query(collections.inventory, where('restaurantId', '==', RESTAURANT_ID));
    adminUnsubscribes.push(
      onSnapshot(
        inventoryQuery,
        (snapshot) => {
          const items: InventoryItem[] = [];
          snapshot.forEach((d) => {
            items.push(d.data() as InventoryItem);
          });
          if (items.length > 0) {
            memoryCache.inventory = items;
          }
          handleListenerSuccess('inventario');
        },
        (error) => handleListenerError('inventario', error)
      )
    );

    // 6. Sobre Movements Listener (Resguardo en sobre)
    const sobreQuery = query(collections.sobre, where('restaurantId', '==', RESTAURANT_ID));
    adminUnsubscribes.push(
      onSnapshot(
        sobreQuery,
        (snapshot) => {
          const movements: SobreMovement[] = [];
          snapshot.forEach((d) => {
            movements.push(d.data() as SobreMovement);
          });
          movements.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.date).getTime();
            const timeB = new Date(b.timestamp || b.date).getTime();
            return timeB - timeA;
          });
          memoryCache.sobreMovements = movements;
          handleListenerSuccess('sobre');
        },
        (error) => handleListenerError('sobre', error)
      )
    );

    // 7. Activity Logs Listener (Bitácora)
    const logsQuery = query(
      collections.logs,
      where('restaurantId', '==', RESTAURANT_ID),
      limit(250)
    );
    adminUnsubscribes.push(
      onSnapshot(
        logsQuery,
        (snapshot) => {
          const logs: ActivityLog[] = [];
          snapshot.forEach((d) => {
            logs.push(d.data() as ActivityLog);
          });
          logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          memoryCache.activityLogs = logs;
          handleListenerSuccess('bitacora');
        },
        (error) => handleListenerError('bitacora', error)
      )
    );
  };

  const stopAdminListeners = () => {
    adminUnsubscribes.forEach((unsub) => {
      try {
        unsub();
      } catch {}
    });
    adminUnsubscribes = [];
    ['personal', 'turnos', 'gastos', 'cxc', 'inventario', 'sobre', 'bitacora'].forEach((k) =>
      activeListenerSet.delete(k)
    );
  };

  // Suscribirse al estado de Firebase Authentication
  authStateUnsubscribe = subscribeToAuth((user) => {
    if (user) {
      updateSyncState({ status: 'syncing', errorMessage: undefined });
      startAdminListeners();
    } else {
      stopAdminListeners();
      updateSyncState({
        status: 'unauthenticated',
        errorMessage: undefined,
      });
    }
  });

  return () => {
    if (authStateUnsubscribe) {
      authStateUnsubscribe();
      authStateUnsubscribe = null;
    }
    menuUnsub();
    restInfoUnsub();
    stopAdminListeners();
    listenersInitialized = false;
  };
}

// -------------------------------------------------------------
// OPERACIONES DIRECTAS EN FIRESTORE CON AUDITORÍA
// -------------------------------------------------------------

/**
 * Registra una acción en la Bitácora centralizada de Firestore
 */
export async function logActivityFirestore(log: {
  userName: string;
  userId: string;
  userRole: UserRole;
  action: string;
  category: ActivityLog['category'];
  details?: string;
  previousValue?: string;
  newValue?: string;
  timestamp?: string;
}): Promise<ActivityLog> {
  const now = new Date();
  const timestamp = log.timestamp || now.toISOString();
  const dateObj = new Date(timestamp);
  const device = getDeviceIdentifier();

  const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const logItem: ActivityLog = {
    id,
    timestamp,
    dateFormatted: new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dateObj),
    timeFormatted: new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(dateObj),
    userName: log.userName,
    userId: log.userId,
    userRole: log.userRole,
    action: log.action,
    category: log.category,
    details: log.details ? `${log.details} [${device.name}]` : `[${device.name}]`,
    previousValue: log.previousValue,
    newValue: log.newValue,
  };

  const payload = sanitizeFirestorePayload({
    ...logItem,
    restaurantId: RESTAURANT_ID,
    deviceId: device.id,
    deviceName: device.name,
    createdAt: timestamp,
  });

  try {
    const docRef = doc(collections.logs, id);
    await setDoc(docRef, payload);
  } catch (err) {
    console.error('Error logging activity to Firestore:', err);
  }

  return logItem;
}

// -------------------------------------------------------------
// CONTROL DE TURNOS (VALIDACIÓN DE TURNO ÚNICO ACTIVO)
// -------------------------------------------------------------

export async function openShiftFirestore(
  newShift: ShiftRecord,
  responsibleUser: StaffUser
): Promise<ShiftRecord> {
  const device = getDeviceIdentifier();

  try {
    updateSyncState({ status: 'syncing' });
    // Validar contra Firestore que no exista ya un turno con status == 'abierto'
    const activeQuery = query(
      collections.shifts,
      where('restaurantId', '==', RESTAURANT_ID),
      where('status', '==', 'abierto')
    );
    const activeSnap = await getDocs(activeQuery);

    if (!activeSnap.empty) {
      const existing = activeSnap.docs[0].data() as ShiftRecord;
      throw new Error(
        `Ya existe un turno abierto en la caja: Turno ${existing.shiftType} abierto por ${existing.openedByName || existing.responsibleUser} a las ${existing.openedAt}. No se pueden tener dos turnos abiertos simultáneamente.`
      );
    }

    const payload = sanitizeFirestorePayload({
      ...newShift,
      restaurantId: RESTAURANT_ID,
      deviceId: device.id,
      deviceName: device.name,
      createdByUserId: responsibleUser.id,
      createdByName: responsibleUser.name,
      role: responsibleUser.role,
      updatedAt: new Date().toISOString(),
    });

    const docRef = doc(collections.shifts, newShift.id);
    await setDoc(docRef, payload);

    await logActivityFirestore({
      userName: responsibleUser.name,
      userId: responsibleUser.id,
      userRole: responsibleUser.role,
      action: `Apertura de turno ${newShift.shiftType} con fondo de $${newShift.initialCashFund.toLocaleString('es-MX')}`,
      category: 'turno',
      newValue: `Fondo: $${newShift.initialCashFund}`,
      timestamp: newShift.createdAt,
    });

    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
    return newShift;
  } catch (err: any) {
    console.error('Error opening shift in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    if (err.message && err.message.includes('Ya existe un turno abierto')) {
      throw err;
    }
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

export async function updateShiftFirestore(
  shiftId: string,
  updates: Partial<ShiftRecord>,
  user?: StaffUser
): Promise<void> {
  const device = getDeviceIdentifier();
  try {
    updateSyncState({ status: 'syncing' });
    const docRef = doc(collections.shifts, shiftId);
    const updatePayload = sanitizeFirestorePayload({
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user?.id,
      updatedByName: user?.name,
      lastDeviceId: device.id,
    });
    await updateDoc(docRef, updatePayload);
    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
  } catch (err) {
    console.error('Error updating shift in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

export async function closeShiftFirestore(
  closedShift: ShiftRecord,
  closingUser: StaffUser,
  closeReason?: string
): Promise<ShiftRecord> {
  const device = getDeviceIdentifier();
  try {
    updateSyncState({ status: 'syncing' });
    const docRef = doc(collections.shifts, closedShift.id);

    const payload = sanitizeFirestorePayload({
      ...closedShift,
      restaurantId: RESTAURANT_ID,
      status: 'cerrado',
      updatedAt: new Date().toISOString(),
      closedByUserId: closingUser.id,
      closedByName: closingUser.name,
      closedByReason: closeReason || null,
      closingDeviceId: device.id,
      closingDeviceName: device.name,
    });
    await setDoc(docRef, payload);

    const originalResponsibleName = closedShift.openedByName || closedShift.responsibleUser;
    const isDifferentCloser = closingUser.id !== closedShift.responsibleUserId;
    const cashDifference = closedShift.cashDifference || 0;

    const actionText = isDifferentCloser
      ? `${closingUser.name} cerró el turno abierto por ${originalResponsibleName}.${closeReason ? ` Motivo: ${closeReason}` : ''} | Venta Total: $${closedShift.totalSales.toLocaleString('es-MX')} | Dif Caja: ${cashDifference >= 0 ? '+' : ''}$${cashDifference.toLocaleString('es-MX')}`
      : `Turno cerrado por ${closingUser.name}. Venta Total: $${closedShift.totalSales.toLocaleString('es-MX')} | Dif Caja: ${cashDifference >= 0 ? '+' : ''}$${cashDifference.toLocaleString('es-MX')}`;

    await logActivityFirestore({
      userName: closingUser.name,
      userId: closingUser.id,
      userRole: closingUser.role,
      action: actionText,
      category: 'turno',
      newValue: `Contado: $${closedShift.countedCashAtClose} | Esperado: $${closedShift.expectedCash}${closeReason ? ` | Motivo: ${closeReason}` : ''}`,
      timestamp: closedShift.closedAtTimestamp,
    });

    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
    return closedShift;
  } catch (err) {
    console.error('Error closing shift in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

// -------------------------------------------------------------
// GASTOS (EXPENSES)
// -------------------------------------------------------------
export async function addExpenseFirestore(
  expense: ExpenseRecord,
  user: StaffUser
): Promise<ExpenseRecord> {
  const device = getDeviceIdentifier();
  try {
    updateSyncState({ status: 'syncing' });
    const payload = sanitizeFirestorePayload({
      ...expense,
      restaurantId: RESTAURANT_ID,
      deviceId: device.id,
      deviceName: device.name,
      createdByUserId: user.id,
      createdByName: user.name,
      role: user.role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const docRef = doc(collections.expenses, expense.id);
    await setDoc(docRef, payload);

    await logActivityFirestore({
      userName: user.name,
      userId: user.id,
      userRole: user.role,
      action: `${user.name} registró gasto de $${expense.amount}: ${expense.concept} (${expense.category})`,
      category: 'gasto',
      newValue: `$${expense.amount} - ${expense.concept}`,
    });

    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
    return expense;
  } catch (err) {
    console.error('Error adding expense to Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

export async function deleteExpenseFirestore(
  expense: ExpenseRecord,
  user: StaffUser
): Promise<void> {
  try {
    updateSyncState({ status: 'syncing' });
    const docRef = doc(collections.expenses, expense.id);
    await deleteDoc(docRef);

    await logActivityFirestore({
      userName: user.name,
      userId: user.id,
      userRole: user.role,
      action: `${user.name} eliminó gasto: ${expense.concept} ($${expense.amount})`,
      category: 'gasto',
      previousValue: `$${expense.amount} - ${expense.concept}`,
    });
    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
  } catch (err) {
    console.error('Error deleting expense in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

// -------------------------------------------------------------
// CUENTAS POR COBRAR (CXC)
// -------------------------------------------------------------
export async function saveCxcFirestore(
  cxc: CxcRecord,
  user?: StaffUser,
  isNew: boolean = false
): Promise<CxcRecord> {
  const device = getDeviceIdentifier();
  try {
    updateSyncState({ status: 'syncing' });
    
    // Crear un payload limpio eliminando exclusivamente valores undefined
    const rawPayload: Record<string, any> = {
      id: cxc.id,
      restaurantId: RESTAURANT_ID,
      person: cxc.person,
      amount: cxc.amount,
      concept: cxc.concept,
      date: cxc.date,
      status: cxc.status,
      registeredBy: cxc.registeredBy,
      createdAt: cxc.createdAt,
      deviceId: device.id,
      deviceName: device.name,
      updatedAt: new Date().toISOString(),
    };

    if (cxc.registeredById !== undefined) {
      rawPayload.registeredById = cxc.registeredById;
    }
    if (cxc.notes !== undefined && cxc.notes !== '') {
      rawPayload.notes = cxc.notes;
    }
    if (cxc.paidAt !== undefined) {
      rawPayload.paidAt = cxc.paidAt;
    }
    if (cxc.cancelledAt !== undefined) {
      rawPayload.cancelledAt = cxc.cancelledAt;
    }
    if (cxc.cancelledBy !== undefined) {
      rawPayload.cancelledBy = cxc.cancelledBy;
    }
    if (cxc.cancelledById !== undefined) {
      rawPayload.cancelledById = cxc.cancelledById;
    }
    if (cxc.cancellationReason !== undefined) {
      rawPayload.cancellationReason = cxc.cancellationReason;
    }

    // Filtrar cualquier propiedad undefined residual de forma estricta
    const cleanPayload: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawPayload)) {
      if (value !== undefined) {
        cleanPayload[key] = value;
      }
    }

    const docRef = doc(collections.cxc, cxc.id);
    await setDoc(docRef, cleanPayload);

    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
    return cxc;
  } catch (err) {
    console.error('Error saving CXC in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'El movimiento no pudo guardarse en la nube. Intenta nuevamente.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

export async function deleteCxcFirestore(cxc: CxcRecord, user?: StaffUser): Promise<void> {
  try {
    updateSyncState({ status: 'syncing' });
    const docRef = doc(collections.cxc, cxc.id);
    await deleteDoc(docRef);

    if (user) {
      await logActivityFirestore({
        userName: user.name,
        userId: user.id,
        userRole: user.role,
        action: `${user.name} eliminó CXC de ${cxc.person} ($${cxc.amount})`,
        category: 'cxc',
        previousValue: `$${cxc.amount} - ${cxc.person}`,
      });
    }
    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
  } catch (err) {
    console.error('Error deleting CXC in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

// -------------------------------------------------------------
// INVENTARIO
// -------------------------------------------------------------
export async function saveInventoryItemFirestore(
  item: InventoryItem,
  user?: StaffUser
): Promise<void> {
  const device = getDeviceIdentifier();
  try {
    updateSyncState({ status: 'syncing' });

    const tipoControl = item.tipoControl === 'folio' ? 'folio' : 'cantidad';
    const initialQty = Number.isFinite(Number(item.initialQty)) ? Number(item.initialQty) : 0;
    const entriesQty = Number.isFinite(Number(item.entriesQty)) ? Number(item.entriesQty) : 0;
    const finalQty = Number.isFinite(Number(item.finalQty)) ? Number(item.finalQty) : 0;
    const consumption = Number.isFinite(Number(item.consumption)) ? Number(item.consumption) : 0;

    const rawPayload: Record<string, any> = {
      id: item.id,
      restaurantId: RESTAURANT_ID,
      name: item.name,
      category: item.category || 'Operación',
      unit: item.unit || (tipoControl === 'folio' ? 'folios' : 'pz'),
      tipoControl,
      initialQty,
      entriesQty,
      finalQty,
      consumption,
      lastUpdated: item.lastUpdated || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceId: device.id,
      deviceName: device.name,
    };

    if (user?.name) {
      rawPayload.updatedBy = user.name;
    } else if (item.updatedBy) {
      rawPayload.updatedBy = item.updatedBy;
    }

    if (item.notes && item.notes.trim().length > 0) {
      rawPayload.notes = item.notes.trim();
    }

    if (tipoControl === 'folio') {
      if (item.folioInicial !== null && item.folioInicial !== undefined && Number.isFinite(Number(item.folioInicial))) {
        rawPayload.folioInicial = Math.floor(Number(item.folioInicial));
      } else {
        rawPayload.folioInicial = null;
      }
      if (item.folioFinal !== null && item.folioFinal !== undefined && Number.isFinite(Number(item.folioFinal))) {
        rawPayload.folioFinal = Math.floor(Number(item.folioFinal));
      } else {
        rawPayload.folioFinal = null;
      }
    } else {
      rawPayload.folioInicial = null;
      rawPayload.folioFinal = null;
    }

    const cleanPayload = sanitizeFirestorePayload(rawPayload);

    const docRef = doc(collections.inventory, item.id);
    await setDoc(docRef, cleanPayload);
    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
  } catch (err: any) {
    console.error('Error saving inventory item in Firestore:', err);
    updateSyncState({
      status: 'error',
      errorMessage: err?.message || 'Error al guardar el cambio. Reintentar',
    });
    throw new Error('Error al guardar el cambio. Reintentar');
  }
}

export async function deleteInventoryItemFirestore(
  item: InventoryItem,
  user: StaffUser
): Promise<void> {
  try {
    updateSyncState({ status: 'syncing' });
    const docRef = doc(collections.inventory, item.id);
    await deleteDoc(docRef);

    await logActivityFirestore({
      userName: user.name,
      userId: user.id,
      userRole: user.role,
      action: `${user.name} eliminó producto del inventario: ${item.name}`,
      category: 'inventario',
      previousValue: item.name,
    });
    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
  } catch (err) {
    console.error('Error deleting inventory item in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

// -------------------------------------------------------------
// SOBRE / RESGUARDO
// -------------------------------------------------------------
export async function saveSobreMovementFirestore(
  movement: SobreMovement,
  user: StaffUser
): Promise<SobreMovement> {
  const device = getDeviceIdentifier();
  try {
    updateSyncState({ status: 'syncing' });
    const payload = sanitizeFirestorePayload({
      ...movement,
      restaurantId: RESTAURANT_ID,
      deviceId: device.id,
      deviceName: device.name,
      createdByUserId: user.id,
      createdByName: user.name,
      role: user.role,
      createdAt: movement.timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const docRef = doc(collections.sobre, movement.id);
    await setDoc(docRef, payload);

    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
    return movement;
  } catch (err) {
    console.error('Error saving sobre movement in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

// -------------------------------------------------------------
// MENÚ DEL DÍA
// -------------------------------------------------------------
export async function saveDailyMenuFirestore(
  menu: DailyMenuConfig,
  user: StaffUser
): Promise<void> {
  const device = getDeviceIdentifier();
  try {
    updateSyncState({ status: 'syncing' });
    const payload = sanitizeFirestorePayload({
      ...menu,
      id: 'current',
      restaurantId: RESTAURANT_ID,
      deviceId: device.id,
      deviceName: device.name,
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
      updatedByUserId: user.id,
    });
    const docRef = doc(collections.dailyMenu, 'current');
    await setDoc(docRef, payload);

    await logActivityFirestore({
      userName: user.name,
      userId: user.id,
      userRole: user.role,
      action: `${user.name} publicó actualización del Menú del Día ($${menu.price})`,
      category: 'menu',
      newValue: `Guisado: ${menu.platoFuerte.slice(0, 45)}... | Agua: ${menu.aguaDelDia}`,
    });
    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
  } catch (err) {
    console.error('Error saving daily menu in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

// -------------------------------------------------------------
// INFORMACIÓN DEL RESTAURANTE (HORARIOS, DIRECCIÓN, WHATSAPP)
// -------------------------------------------------------------
export async function saveRestaurantInfoFirestore(
  info: RestaurantInfo,
  user?: StaffUser
): Promise<void> {
  try {
    updateSyncState({ status: 'syncing' });
    const rawDigits = info.whatsapp ? info.whatsapp.replace(/\D/g, '') : '5574411437';
    const payload = sanitizeFirestorePayload({
      restaurantId: RESTAURANT_ID,
      address: (info.address || 'Calle la Fama 12, 14260 Tlalpan CDMX, México').trim(),
      whatsapp: (info.whatsapp || '55 7441 1437').trim(),
      whatsappRaw: (info.whatsappRaw || rawDigits || '5574411437').trim(),
      openingHours: (info.openingHours || 'Abiertos de 9:00 am a 5:30 pm').trim(),
      ecoDiscountPercent: typeof info.ecoDiscountPercent === 'number' ? info.ecoDiscountPercent : 10,
      ecoDiscountDescription: (info.ecoDiscountDescription || '10% de descuento si el cliente trae sus propios recipientes o termo.').trim(),
      deliveryFee: typeof info.deliveryFee === 'number' ? info.deliveryFee : 25,
      vipStampsRequired: typeof info.vipStampsRequired === 'number' ? info.vipStampsRequired : 5,
      vipRewardDescription: (info.vipRewardDescription || 'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.').trim(),
      servicePolicies: (info.servicePolicies || 'Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta.').trim(),
      activePromotions: (info.activePromotions || '10% de descuento por traer recipientes propios.').trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: user?.name || info.updatedBy || 'Sistema Aló',
    }) as RestaurantInfo;
    const docRef = doc(collections.dailyMenu, 'restaurant_info');
    await setDoc(docRef, payload);
    memoryCache.restaurantInfo = payload;
    try {
      localStorage.setItem('alo_admin_restaurant_info_v1', JSON.stringify(payload));
    } catch {}
    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
  } catch (err) {
    console.error('Error saving restaurant_info in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: (err as any)?.message || 'Error al guardar restaurant_info en Firestore' });
    throw err;
  }
}

// -------------------------------------------------------------
// USUARIOS Y PERSONAL (STAFF)
// -------------------------------------------------------------
export async function saveStaffUserFirestore(staff: StaffUser): Promise<void> {
  try {
    updateSyncState({ status: 'syncing' });
    const payload = sanitizeFirestorePayload({
      ...staff,
      restaurantId: RESTAURANT_ID,
      updatedAt: new Date().toISOString(),
    });
    const docRef = doc(collections.staff, staff.id);
    await setDoc(docRef, payload);
    updateSyncState({ status: 'synced', lastSyncedAt: new Date(), errorMessage: undefined });
  } catch (err) {
    console.error('Error saving staff user in Firestore:', err);
    updateSyncState({ status: 'error', errorMessage: 'No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.' });
    throw new Error('No se pudo sincronizar. El movimiento NO ha sido confirmado en la nube.');
  }
}

// -------------------------------------------------------------
// HERRAMIENTA DE MIGRACIÓN DE DATOS LOCALES A FIRESTORE
// Exclusivo para DUEÑA / ADMINISTRADOR (NO SE EJECUTA AUTOMÁTICAMENTE)
// -------------------------------------------------------------
export interface LocalDataStats {
  staffCount: number;
  hasActiveShift: boolean;
  shiftsHistoryCount: number;
  expensesCount: number;
  cxcCount: number;
  inventoryCount: number;
  sobreMovementsCount: number;
  logsCount: number;
  hasDailyMenu: boolean;
}

export function inspectLocalStorageData(): LocalDataStats {
  try {
    const rawStaff = localStorage.getItem('alo_admin_staff_users_v1');
    const rawShift = localStorage.getItem('alo_admin_current_shift_v1');
    const rawHistory = localStorage.getItem('alo_admin_shifts_history_v1');
    const rawExpenses = localStorage.getItem('alo_admin_expenses_v1');
    const rawCxc = localStorage.getItem('alo_admin_cxc_v1');
    const rawInv = localStorage.getItem('alo_admin_inventory_v1');
    const rawSobre = localStorage.getItem('alo_admin_sobre_movements_v1');
    const rawLogs = localStorage.getItem('alo_admin_activity_logs_v1');
    const rawMenu = localStorage.getItem('alo_admin_daily_menu_v1');

    return {
      staffCount: rawStaff ? JSON.parse(rawStaff).length : 0,
      hasActiveShift: !!rawShift,
      shiftsHistoryCount: rawHistory ? JSON.parse(rawHistory).length : 0,
      expensesCount: rawExpenses ? JSON.parse(rawExpenses).length : 0,
      cxcCount: rawCxc ? JSON.parse(rawCxc).length : 0,
      inventoryCount: rawInv ? JSON.parse(rawInv).length : 0,
      sobreMovementsCount: rawSobre ? JSON.parse(rawSobre).length : 0,
      logsCount: rawLogs ? JSON.parse(rawLogs).length : 0,
      hasDailyMenu: !!rawMenu,
    };
  } catch {
    return {
      staffCount: 0,
      hasActiveShift: false,
      shiftsHistoryCount: 0,
      expensesCount: 0,
      cxcCount: 0,
      inventoryCount: 0,
      sobreMovementsCount: 0,
      logsCount: 0,
      hasDailyMenu: false,
    };
  }
}

export async function migrateLocalStorageToFirestore(
  user: StaffUser,
  options: {
    migrateStaff?: boolean;
    migrateShift?: boolean;
    migrateExpenses?: boolean;
    migrateCxc?: boolean;
    migrateInventory?: boolean;
    migrateSobre?: boolean;
    migrateMenu?: boolean;
    migrateLogs?: boolean;
  }
): Promise<{ success: boolean; migratedCounts: Record<string, number>; message: string }> {
  if (user.role !== 'DUEÑA' && user.role !== 'ADMINISTRADOR') {
    throw new Error('Solo DUEÑA o ADMINISTRADOR pueden ejecutar la migración de datos locales.');
  }

  updateSyncState({ status: 'syncing' });
  const counts: Record<string, number> = {};

  try {
    // 1. Staff
    if (options.migrateStaff) {
      const raw = localStorage.getItem('alo_admin_staff_users_v1');
      if (raw) {
        const staffList: StaffUser[] = JSON.parse(raw);
        for (const s of staffList) {
          await saveStaffUserFirestore(s);
        }
        counts.staff = staffList.length;
      }
    }

    // 2. Inventario
    if (options.migrateInventory) {
      const raw = localStorage.getItem('alo_admin_inventory_v1');
      if (raw) {
        const invList: InventoryItem[] = JSON.parse(raw);
        for (const item of invList) {
          await saveInventoryItemFirestore(item);
        }
        counts.inventory = invList.length;
      }
    }

    // 3. Menú del Día
    if (options.migrateMenu) {
      const raw = localStorage.getItem('alo_admin_daily_menu_v1');
      if (raw) {
        const menu: DailyMenuConfig = JSON.parse(raw);
        await saveDailyMenuFirestore(menu, user);
        counts.menu = 1;
      }
    }

    // 4. CXC
    if (options.migrateCxc) {
      const raw = localStorage.getItem('alo_admin_cxc_v1');
      if (raw) {
        const cxcList: CxcRecord[] = JSON.parse(raw);
        for (const c of cxcList) {
          await saveCxcFirestore(c, user, true);
        }
        counts.cxc = cxcList.length;
      }
    }

    // 5. Gastos
    if (options.migrateExpenses) {
      const raw = localStorage.getItem('alo_admin_expenses_v1');
      if (raw) {
        const expList: ExpenseRecord[] = JSON.parse(raw);
        for (const e of expList) {
          const docRef = doc(collections.expenses, e.id);
          await setDoc(docRef, sanitizeFirestorePayload({ ...e, restaurantId: RESTAURANT_ID, updatedAt: new Date().toISOString() }));
        }
        counts.expenses = expList.length;
      }
    }

    // 6. Sobre
    if (options.migrateSobre) {
      const raw = localStorage.getItem('alo_admin_sobre_movements_v1');
      if (raw) {
        const sobreList: SobreMovement[] = JSON.parse(raw);
        for (const m of sobreList) {
          const docRef = doc(collections.sobre, m.id);
          await setDoc(docRef, sanitizeFirestorePayload({ ...m, restaurantId: RESTAURANT_ID, updatedAt: new Date().toISOString() }));
        }
        counts.sobre = sobreList.length;
      }
    }

    // 7. Turnos
    if (options.migrateShift) {
      const rawCurrent = localStorage.getItem('alo_admin_current_shift_v1');
      if (rawCurrent) {
        const currentShift: ShiftRecord = JSON.parse(rawCurrent);
        const docRef = doc(collections.shifts, currentShift.id);
        await setDoc(docRef, sanitizeFirestorePayload({ ...currentShift, restaurantId: RESTAURANT_ID, updatedAt: new Date().toISOString() }));
        counts.activeShift = 1;
      }

      const rawHist = localStorage.getItem('alo_admin_shifts_history_v1');
      if (rawHist) {
        const histList: ShiftRecord[] = JSON.parse(rawHist);
        for (const h of histList) {
          const docRef = doc(collections.shifts, h.id);
          await setDoc(docRef, sanitizeFirestorePayload({ ...h, restaurantId: RESTAURANT_ID, updatedAt: new Date().toISOString() }));
        }
        counts.shiftsHistory = histList.length;
      }
    }

    // Registrar en Bitácora de Auditoría
    await logActivityFirestore({
      userName: user.name,
      userId: user.id,
      userRole: user.role,
      action: `${user.name} ejecutó migración manual de datos locales a Firestore`,
      category: 'sistema',
      details: JSON.stringify(counts),
      newValue: 'Datos locales sincronizados a la nube',
    });

    updateSyncState({ status: 'synced', lastSyncedAt: new Date() });

    return {
      success: true,
      migratedCounts: counts,
      message: 'Migración a Firestore completada exitosamente.',
    };
  } catch (error: any) {
    updateSyncState({ status: 'error', errorMessage: error.message });
    throw error;
  }
}
