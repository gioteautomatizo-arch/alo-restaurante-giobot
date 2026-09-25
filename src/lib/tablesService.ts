import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, isUserAuthenticated, subscribeToAuth } from './firebase';
import { TableRecord, TableStatus, TableCourse } from '../types';
import { getActiveRestaurantId } from './restaurantContext';

export const RESTAURANT_ID = 'alo-restaurante';
const STORAGE_KEY_TABLES_BASE = 'alo_admin_tables_v1';

function getTablesStorageKey(): string {
  return `${STORAGE_KEY_TABLES_BASE}_${getActiveRestaurantId()}`;
}
export const TABLES_DATA_EVENT = 'alo_admin_tables_updated';

// Mesas iniciales predeterminadas configurables
export const DEFAULT_TABLES: TableRecord[] = [
  {
    tableId: 'table-1',
    tableNumber: 1,
    label: 'Mesa 1',
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'sistema',
    updatedByName: 'Sistema',
    restaurantId: getActiveRestaurantId(),
    capacity: 4,
    location: 'salon',
  },
  {
    tableId: 'table-2',
    tableNumber: 2,
    label: 'Mesa 2',
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'sistema',
    updatedByName: 'Sistema',
    restaurantId: getActiveRestaurantId(),
    capacity: 4,
    location: 'salon',
  },
  {
    tableId: 'table-4',
    tableNumber: 4,
    label: 'Mesa 4',
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'sistema',
    updatedByName: 'Sistema',
    restaurantId: getActiveRestaurantId(),
    capacity: 4,
    location: 'salon',
  },
  {
    tableId: 'table-5',
    tableNumber: 5,
    label: 'Mesa 5',
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'sistema',
    updatedByName: 'Sistema',
    restaurantId: getActiveRestaurantId(),
    capacity: 4,
    location: 'salon',
  },
  {
    tableId: 'table-6',
    tableNumber: 6,
    label: 'Mesa 6',
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'sistema',
    updatedByName: 'Sistema',
    restaurantId: getActiveRestaurantId(),
    capacity: 6,
    location: 'salon',
  },
  {
    tableId: 'table-7',
    tableNumber: 7,
    label: 'Mesa 7',
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'sistema',
    updatedByName: 'Sistema',
    restaurantId: getActiveRestaurantId(),
    capacity: 4,
    location: 'terraza',
  },
  {
    tableId: 'table-8',
    tableNumber: 8,
    label: 'Mesa 8',
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'sistema',
    updatedByName: 'Sistema',
    restaurantId: getActiveRestaurantId(),
    capacity: 4,
    location: 'barra',
  },
  {
    tableId: 'table-9',
    tableNumber: 9,
    label: 'Mesa 9',
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'sistema',
    updatedByName: 'Sistema',
    restaurantId: getActiveRestaurantId(),
    capacity: 4,
    location: 'salon',
  },
];

// Memoria local para acceso sincrónico ultrarrápido
let cachedTables: TableRecord[] = loadFromLocalStorage();
const listeners = new Set<(tables: TableRecord[]) => void>();
let firestoreUnsubscribe: (() => void) | null = null;
let authUnsubscribe: (() => void) | null = null;
let realtimeSyncConsumers = 0;

function loadFromLocalStorage(): TableRecord[] {
  try {
    const raw = localStorage.getItem(getTablesStorageKey());
    if (raw) {
      let parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Regla: Mesa 3 NO es operativa (físicamente es la Pantalla no operativa)
        parsed = parsed.filter((p: TableRecord) => p.tableId !== 'table-3' && p.tableNumber !== 3);

        // Asegurar que todas las mesas por defecto operativas (1, 2, 4, 5, 6, 7, 8, 9) existan
        const existingIds = new Set(parsed.map((p: TableRecord) => p.tableId));
        for (const defTable of DEFAULT_TABLES) {
          if (!existingIds.has(defTable.tableId)) {
            parsed.push(defTable);
          }
        }
        localStorage.setItem(STORAGE_KEY_TABLES, JSON.stringify(parsed));
        return parsed.sort((a, b) => a.tableNumber - b.tableNumber);
      }
    }
  } catch (e) {
    console.warn('Error al cargar mesas de localStorage:', e);
  }
  return [...DEFAULT_TABLES];
}

function saveToLocalStorage(tables: TableRecord[]) {
  try {
    // Filtrar siempre Mesa 3 (Pantalla no operativa) para asegurar solo 8 mesas operativas
    const sanitized = tables.filter((t) => t.tableId !== 'table-3' && t.tableNumber !== 3);
    const sorted = sanitized.sort((a, b) => a.tableNumber - b.tableNumber);
    cachedTables = sorted;
    localStorage.setItem(getTablesStorageKey(), JSON.stringify(sorted));
    notifyListeners();
  } catch (e) {
    console.warn('Error al guardar mesas en localStorage:', e);
  }
}

function notifyListeners() {
  const current = [...cachedTables];
  listeners.forEach((cb) => {
    try {
      cb(current);
    } catch (err) {
      console.error('Error en listener de mesas:', err);
    }
  });
}

// Sincronización multi-pestaña limpia vía evento nativo storage (solo dispara en otras pestañas)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY_TABLES) {
      cachedTables = loadFromLocalStorage();
      notifyListeners();
    }
  });
}

function stopFirestoreTablesListener(): void {
  if (firestoreUnsubscribe) {
    firestoreUnsubscribe();
    firestoreUnsubscribe = null;
  }
}

function startFirestoreTablesListener(): void {
  if (realtimeSyncConsumers === 0 || !isUserAuthenticated() || firestoreUnsubscribe) {
    return;
  }

  try {
    const q = query(
      collection(db, 'tables'),
      where('restaurantId', '==', getActiveRestaurantId())
    );

    firestoreUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          // Si la colección está vacía en Firestore, sembramos las mesas iniciales
          seedDefaultTablesToFirestore();
          return;
        }

        const remoteTables: TableRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Partial<TableRecord>;
          // Regla: Mesa 3 no es operativa (corresponde a la Pantalla no operativa)
          if (docSnap.id === 'table-3' || data?.tableId === 'table-3' || data?.tableNumber === 3) {
            return;
          }
          if (data && data.tableId) {
            remoteTables.push({
              tableId: data.tableId,
              tableNumber: Number(data.tableNumber || 1),
              label: data.label || `Mesa ${data.tableNumber || 1}`,
              status: (data.status as TableStatus) || 'LIBRE',
              guestCount: Number(data.guestCount || 0),
              waiterId: data.waiterId || '',
              waiterName: data.waiterName || '',
              currentCourse: data.currentCourse as TableCourse | undefined,
              needsTortillas: Boolean(data.needsTortillas),
              needsDrinks: Boolean(data.needsDrinks),
              needsSecondCourse: Boolean(data.needsSecondCourse),
              needsThirdCourse: Boolean(data.needsThirdCourse),
              needsBill: Boolean(data.needsBill),
              notes: data.notes || '',
              openedAt: data.openedAt || undefined,
              updatedAt: data.updatedAt || new Date().toISOString(),
              updatedBy: data.updatedBy || 'remoto',
              updatedByName: data.updatedByName || '',
              restaurantId: getActiveRestaurantId(),
              capacity: data.capacity || 4,
              location: data.location || 'salon',
            });
          }
        });

        if (remoteTables.length > 0) {
          // Asegurar que table-9 exista en Firestore si falta
          const hasTable9 = remoteTables.some((t) => t.tableId === 'table-9' || t.tableNumber === 9);
          if (!hasTable9) {
            const table9Record: TableRecord = {
              tableId: 'table-9',
              tableNumber: 9,
              label: 'Mesa 9',
              status: 'LIBRE',
              guestCount: 0,
              waiterId: '',
              waiterName: '',
              needsTortillas: false,
              needsDrinks: false,
              needsSecondCourse: false,
              needsThirdCourse: false,
              needsBill: false,
              updatedAt: new Date().toISOString(),
              updatedBy: 'sistema',
              updatedByName: 'Sistema',
              restaurantId: getActiveRestaurantId(),
              capacity: 4,
              location: 'salon',
            };
            remoteTables.push(table9Record);

            if (isUserAuthenticated()) {
              const docRef = doc(db, 'tables', 'table-9');
              setDoc(docRef, table9Record, { merge: true }).catch((err) => {
                console.warn('Aviso: no se pudo guardar table-9 en Firestore:', err);
              });
            }
          }
          saveToLocalStorage(remoteTables);
        }
      },
      (error) => {
        console.warn('Listener Firestore de mesas en espera o error de permisos:', error.message);
        firestoreUnsubscribe = null;
      }
    );
  } catch (err) {
    console.warn('No fue posible iniciar onSnapshot de mesas:', err);
  }
}

/**
 * Inicia/reutiliza la suscripción en tiempo real con Firestore para la colección 'tables'.
 * Cada consumidor obtiene su propio release; el onSnapshot real se mantiene mientras
 * exista al menos un consumidor activo.
 */
export function initTablesRealtimeSync(): () => void {
  realtimeSyncConsumers += 1;

  if (!authUnsubscribe) {
    authUnsubscribe = subscribeToAuth((user) => {
      if (user) {
        startFirestoreTablesListener();
      } else {
        stopFirestoreTablesListener();
      }
    });
  }

  startFirestoreTablesListener();

  let released = false;
  return () => {
    if (released) return;
    released = true;

    realtimeSyncConsumers = Math.max(0, realtimeSyncConsumers - 1);
    if (realtimeSyncConsumers > 0) return;

    stopFirestoreTablesListener();
    if (authUnsubscribe) {
      authUnsubscribe();
      authUnsubscribe = null;
    }
  };
}

/**
 * Siembra las mesas base en Firestore si la colección está vacía
 */
async function seedDefaultTablesToFirestore() {
  if (!isUserAuthenticated()) return;
  try {
    for (const t of cachedTables.length > 0 ? cachedTables : DEFAULT_TABLES) {
      const docRef = doc(db, 'tables', t.tableId);
      await setDoc(docRef, { ...t, restaurantId: getActiveRestaurantId() }, { merge: true });
    }
  } catch (e) {
    console.warn('Aviso: Siembra automática de mesas en Firestore pospuesta:', e);
  }
}

/**
 * Suscripción reactiva para componentes de React
 */
export function subscribeToTables(callback: (tables: TableRecord[]) => void): () => void {
  listeners.add(callback);
  callback([...cachedTables]);

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Obtener lista síncrona actual de mesas
 */
export function getTables(): TableRecord[] {
  if (cachedTables.length === 0) {
    cachedTables = loadFromLocalStorage();
  }
  return cachedTables.filter((t) => t.tableId !== 'table-3' && t.tableNumber !== 3);
}

/**
 * Guardar o sincronizar una mesa tanto en local como en Firestore
 */
async function syncTableToFirestoreAndLocal(table: TableRecord) {
  // 1. Actualización local inmediata (optimistic UI)
  const index = cachedTables.findIndex((t) => t.tableId === table.tableId);
  let updatedList: TableRecord[];
  if (index >= 0) {
    updatedList = [...cachedTables];
    updatedList[index] = table;
  } else {
    updatedList = [...cachedTables, table];
  }
  saveToLocalStorage(updatedList);

  // 2. Sincronización en tiempo real con Firestore
  if (isUserAuthenticated()) {
    try {
      const docRef = doc(db, 'tables', table.tableId);
      // Limpiar campos undefined antes de mandar a Firestore
      const cleanData: Record<string, any> = JSON.parse(JSON.stringify({ ...table, restaurantId: getActiveRestaurantId() }));
      // Si la mesa se libera, garantizar que se limpien explícitamente en Firestore
      if (table.status === 'LIBRE') {
        cleanData.openedAt = null;
        cleanData.currentCourse = null;
        cleanData.waiterId = '';
        cleanData.waiterName = '';
        cleanData.notes = '';
        cleanData.guestCount = 0;
      }
      await setDoc(docRef, cleanData, { merge: true });
    } catch (err: any) {
      console.error('Error al sincronizar mesa con Firestore:', err);
      // Notificamos localmente aunque Firestore falle para no detener la operación física del mesero
    }
  }
}

/**
 * Ocupar una mesa con comensales, mesero y nota
 */
export async function occupyTable(
  tableId: string,
  params: {
    guestCount: number;
    waiterId: string;
    waiterName: string;
    notes?: string;
  },
  user?: { id: string; name: string }
): Promise<void> {
  const current = cachedTables.find((t) => t.tableId === tableId);
  if (!current) throw new Error(`Mesa no encontrada: ${tableId}`);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const updated: TableRecord = {
    ...current,
    status: 'OCUPADA',
    guestCount: Math.max(1, params.guestCount),
    waiterId: params.waiterId,
    waiterName: params.waiterName,
    notes: params.notes || '',
    openedAt: timeStr,
    currentCourse: '1ER_TIEMPO',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: now.toISOString(),
    updatedBy: user?.id || 'staff',
    updatedByName: user?.name || params.waiterName || 'Personal',
    restaurantId: getActiveRestaurantId(),
  };

  await syncTableToFirestoreAndLocal(updated);
}

/**
 * Ocupar una mesa al iniciar sesión desde el QR del comensal
 */
export async function occupyTableFromPublicQR(
  tableNumber: number,
  guestCount: number
): Promise<void> {
  const tableId = `table-${tableNumber}`;
  const current = cachedTables.find((t) => t.tableId === tableId || t.tableNumber === tableNumber);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const safeGuestCount = Math.max(1, Math.min(20, Math.round(guestCount || 1)));

  const updated: TableRecord = {
    ...(current || {
      tableId,
      tableNumber,
      label: `Mesa ${tableNumber}`,
      capacity: 4,
      location: 'salon',
      waiterId: '',
      waiterName: '',
      needsTortillas: false,
      needsDrinks: false,
      needsSecondCourse: false,
      needsThirdCourse: false,
      needsBill: false,
    }),
    status: 'OCUPADA',
    guestCount: safeGuestCount,
    openedAt: timeStr,
    currentCourse: '1ER_TIEMPO',
    updatedAt: now.toISOString(),
    updatedBy: 'qr_cliente',
    updatedByName: 'Cliente QR',
    restaurantId: getActiveRestaurantId(),
  };

  // 1. Actualizar caché local
  const index = cachedTables.findIndex((t) => t.tableId === tableId || t.tableNumber === tableNumber);
  let updatedList: TableRecord[];
  if (index >= 0) {
    updatedList = [...cachedTables];
    updatedList[index] = updated;
  } else {
    updatedList = [...cachedTables, updated];
  }
  saveToLocalStorage(updatedList);

  // 2. Sincronización en tiempo real con Firestore
  try {
    const docRef = doc(db, 'tables', tableId);
    const cleanData = JSON.parse(JSON.stringify(updated));
    await setDoc(docRef, cleanData, { merge: true });
  } catch (err) {
    console.warn('[tablesService] error al marcar mesa ocupada desde QR en Firestore:', err);
  }
}

/**
 * Asignar o cambiar el mesero responsable de una mesa
 */
export async function assignWaiterToTable(
  tableId: string,
  waiter: { id: string; name: string },
  user?: { id: string; name: string }
): Promise<void> {
  const current = cachedTables.find((t) => t.tableId === tableId);
  if (!current) throw new Error(`Mesa no encontrada: ${tableId}`);

  const now = new Date();
  const timeStr = current.openedAt || now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const updated: TableRecord = {
    ...current,
    waiterId: waiter.id,
    waiterName: waiter.name,
    status: current.status === 'LIBRE' ? 'OCUPADA' : current.status,
    openedAt: timeStr,
    updatedAt: now.toISOString(),
    updatedBy: user?.id || waiter.id,
    updatedByName: user?.name || waiter.name,
    restaurantId: getActiveRestaurantId(),
  };

  await syncTableToFirestoreAndLocal(updated);
}

/**
 * Liberar una mesa (limpia comensales, pendientes, tiempos y la regresa a LIBRE)
 */
export async function freeTable(
  tableId: string,
  user?: { id: string; name: string }
): Promise<void> {
  const current = cachedTables.find((t) => t.tableId === tableId);
  if (!current) throw new Error(`Mesa no encontrada: ${tableId}`);

  const now = new Date();

  const updated: TableRecord = {
    ...current,
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    notes: '',
    openedAt: undefined,
    currentCourse: undefined,
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: now.toISOString(),
    updatedBy: user?.id || 'staff',
    updatedByName: user?.name || 'Personal',
    restaurantId: getActiveRestaurantId(),
  };

  await syncTableToFirestoreAndLocal(updated);
}

/**
 * Cambiar el estado general de la mesa (LIBRE, OCUPADA, CUENTA, LIMPIEZA)
 */
export async function setTableStatus(
  tableId: string,
  status: TableStatus,
  user?: { id: string; name: string }
): Promise<void> {
  if (status === 'LIBRE') {
    await freeTable(tableId, user);
    return;
  }

  const current = cachedTables.find((t) => t.tableId === tableId);
  if (!current) throw new Error(`Mesa no encontrada: ${tableId}`);

  const now = new Date();
  const updated: TableRecord = {
    ...current,
    status,
    // Si pasa a cuenta, activar automáticamente aviso de cuenta
    needsBill: status === 'CUENTA' ? true : current.needsBill,
    // Si pasa a limpieza, quitar pendientes de alimentos
    needsTortillas: status === 'LIMPIEZA' ? false : current.needsTortillas,
    needsDrinks: status === 'LIMPIEZA' ? false : current.needsDrinks,
    needsSecondCourse: status === 'LIMPIEZA' ? false : current.needsSecondCourse,
    needsThirdCourse: status === 'LIMPIEZA' ? false : current.needsThirdCourse,
    updatedAt: now.toISOString(),
    updatedBy: user?.id || 'staff',
    updatedByName: user?.name || 'Personal',
    restaurantId: getActiveRestaurantId(),
  };

  await syncTableToFirestoreAndLocal(updated);
}

/**
 * Actualizar tiempo de servicio (1ER_TIEMPO, 2DO_TIEMPO, 3ER_TIEMPO, FINALIZADO)
 */
export async function setTableCourse(
  tableId: string,
  course: TableCourse,
  user?: { id: string; name: string }
): Promise<void> {
  const current = cachedTables.find((t) => t.tableId === tableId);
  if (!current) throw new Error(`Mesa no encontrada: ${tableId}`);

  const now = new Date();
  const updated: TableRecord = {
    ...current,
    currentCourse: course,
    // Si avanza a 2do tiempo, resolver automáticamente pendiente de 2do tiempo
    needsSecondCourse: course === '2DO_TIEMPO' ? false : current.needsSecondCourse,
    // Si avanza a 3er tiempo, resolver automáticamente pendiente de 3er tiempo
    needsThirdCourse: course === '3ER_TIEMPO' ? false : current.needsThirdCourse,
    updatedAt: now.toISOString(),
    updatedBy: user?.id || 'staff',
    updatedByName: user?.name || 'Personal',
    restaurantId: getActiveRestaurantId(),
  };

  await syncTableToFirestoreAndLocal(updated);
}

/**
 * Alternar un pendiente rápido (Tortillas, Bebidas, Segundo tiempo, Tercer tiempo, Cuenta)
 */
export async function toggleTablePending(
  tableId: string,
  key: 'needsTortillas' | 'needsDrinks' | 'needsSecondCourse' | 'needsThirdCourse' | 'needsBill',
  value: boolean,
  user?: { id: string; name: string }
): Promise<void> {
  const current = cachedTables.find((t) => t.tableId === tableId);
  if (!current) throw new Error(`Mesa no encontrada: ${tableId}`);

  const now = new Date();
  const updated: TableRecord = {
    ...current,
    [key]: value,
    updatedAt: now.toISOString(),
    updatedBy: user?.id || 'staff',
    updatedByName: user?.name || 'Personal',
    restaurantId: getActiveRestaurantId(),
  };

  await syncTableToFirestoreAndLocal(updated);
}

/**
 * Modificar notas operativas de la mesa
 */
export async function updateTableNotes(
  tableId: string,
  notes: string,
  user?: { id: string; name: string }
): Promise<void> {
  const current = cachedTables.find((t) => t.tableId === tableId);
  if (!current) throw new Error(`Mesa no encontrada: ${tableId}`);

  const now = new Date();
  const updated: TableRecord = {
    ...current,
    notes,
    updatedAt: now.toISOString(),
    updatedBy: user?.id || 'staff',
    updatedByName: user?.name || 'Personal',
    restaurantId: getActiveRestaurantId(),
  };

  await syncTableToFirestoreAndLocal(updated);
}

/**
 * Actualizar la cantidad de comensales reales de la mesa
 */
export async function updateTableGuestCount(
  tableId: string,
  guestCount: number,
  user?: { id: string; name: string }
): Promise<void> {
  const current = cachedTables.find((t) => t.tableId === tableId);
  if (!current) throw new Error(`Mesa no encontrada: ${tableId}`);

  const now = new Date();
  const updated: TableRecord = {
    ...current,
    guestCount: Math.max(1, guestCount),
    updatedAt: now.toISOString(),
    updatedBy: user?.id || 'staff',
    updatedByName: user?.name || 'Personal',
    restaurantId: getActiveRestaurantId(),
  };

  await syncTableToFirestoreAndLocal(updated);
}

/**
 * Agregar una nueva mesa a la distribución (restringido a administración)
 */
export async function addTable(
  tableNumber: number,
  label?: string,
  capacity = 4,
  location: 'salon' | 'terraza' | 'barra' = 'salon',
  user?: { id: string; name: string }
): Promise<TableRecord> {
  if (tableNumber === 3) {
    throw new Error('El espacio 3 corresponde al área no operativa de Pantalla y no puede registrarse como mesa.');
  }

  const tableId = `table-${tableNumber}`;
  const existing = cachedTables.find((t) => t.tableId === tableId || t.tableNumber === tableNumber);
  if (existing) {
    throw new Error(`La mesa número ${tableNumber} ya existe.`);
  }

  const now = new Date();
  const newTable: TableRecord = {
    tableId,
    tableNumber,
    label: label || `Mesa ${tableNumber}`,
    status: 'LIBRE',
    guestCount: 0,
    waiterId: '',
    waiterName: '',
    needsTortillas: false,
    needsDrinks: false,
    needsSecondCourse: false,
    needsThirdCourse: false,
    needsBill: false,
    updatedAt: now.toISOString(),
    updatedBy: user?.id || 'staff',
    updatedByName: user?.name || 'Personal',
    restaurantId: getActiveRestaurantId(),
    capacity,
    location,
  };

  await syncTableToFirestoreAndLocal(newTable);
  return newTable;
}

/**
 * Eliminar una mesa (solo si está libre)
 */
export async function deleteTable(
  tableId: string,
  user?: { id: string; name: string }
): Promise<void> {
  const current = cachedTables.find((t) => t.tableId === tableId);
  if (!current) throw new Error(`Mesa no encontrada: ${tableId}`);
  if (current.status !== 'LIBRE') {
    throw new Error('Solo se pueden eliminar mesas que se encuentren en estado LIBRE.');
  }

  const updatedList = cachedTables.filter((t) => t.tableId !== tableId);
  saveToLocalStorage(updatedList);

  if (isUserAuthenticated()) {
    try {
      await deleteDoc(doc(db, 'tables', tableId));
    } catch (e) {
      console.warn('Error al eliminar mesa en Firestore:', e);
    }
  }
}
