import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, isUserAuthenticated, subscribeToAuth } from './firebase';
import { TableServiceRequest, TableServiceRequestType } from '../types';
import { logActivityFirestore } from './firestoreService';

export const VALID_TABLE_NUMBERS = [1, 2, 4, 5, 6, 7, 8, 9] as const;
export type ValidTableNumber = (typeof VALID_TABLE_NUMBERS)[number];

export const TABLE_SERVICE_REQUEST_TYPES: {
  type: TableServiceRequestType;
  label: string;
  icon: string;
  shortDesc: string;
}[] = [
  {
    type: 'LLAMAR_MESERO',
    label: 'Llamar mesero',
    icon: '🙋',
    shortDesc: 'Un mesero se acercará a tu mesa',
  },
  {
    type: 'TORTILLAS',
    label: 'Tortillas',
    icon: '🌮',
    shortDesc: 'Tortillas calientes para tu comida',
  },
  {
    type: 'BEBIDAS',
    label: 'Bebidas',
    icon: '🥤',
    shortDesc: 'Pide otra bebida de nuestra carta',
  },
  {
    type: 'SEGUNDO_TIEMPO',
    label: 'Segundo tiempo',
    icon: '🍽',
    shortDesc: 'Listos para sopa, arroz o ensalada',
  },
  {
    type: 'TERCER_TIEMPO',
    label: 'Tercer tiempo',
    icon: '🍮',
    shortDesc: 'Listos para plato fuerte o postre',
  },
  {
    type: 'PEDIR_CUENTA',
    label: 'Pedir cuenta',
    icon: '💳',
    shortDesc: 'Solicitar la cuenta para pagar',
  },
];

export const RESTAURANT_ID = 'alo-restaurante';
export const TABLE_REQUESTS_EVENT = 'alo_table_requests_updated';
const LOCAL_REQUESTS_KEY = 'alo_table_service_requests_cache_v1';

/**
 * Genera el ID determinístico del documento en Firestore.
 * Ejemplo: table-7_TORTILLAS, table-4_PEDIR_CUENTA
 */
export function getTableRequestDocId(
  tableNumber: number,
  requestType: TableServiceRequestType
): string {
  return `table-${tableNumber}_${requestType}`;
}

/**
 * Valida si el número de mesa corresponde a una de las 8 mesas operativas reales.
 */
export function isValidTableNumber(num: number): num is ValidTableNumber {
  return VALID_TABLE_NUMBERS.includes(num as ValidTableNumber);
}

// Caché en memoria para acceso síncrono ultra-rápido en frontend
let inMemoryPendingRequests: TableServiceRequest[] = [];
const requestListeners = new Set<(requests: TableServiceRequest[]) => void>();

function notifyRequestListeners() {
  const current = [...inMemoryPendingRequests];
  requestListeners.forEach((cb) => {
    try {
      cb(current);
    } catch (err) {
      console.error('Error en listener de solicitudes de mesa:', err);
    }
  });
}

function loadLocalRequests(): TableServiceRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_REQUESTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalRequests(requests: TableServiceRequest[]) {
  try {
    inMemoryPendingRequests = requests;
    localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
    notifyRequestListeners();
  } catch {
    // Silently ignore storage errors
  }
}

// Sincronización multi-pestaña limpia vía evento nativo storage (solo dispara en otras pestañas)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_REQUESTS_KEY) {
      inMemoryPendingRequests = loadLocalRequests();
      notifyRequestListeners();
    }
  });
}

// Inicializar memoria desde local
inMemoryPendingRequests = loadLocalRequests();

/**
 * Obtiene las solicitudes activas en memoria para una mesa dada
 */
export function getPendingRequestsForTable(tableNumber: number): TableServiceRequest[] {
  return inMemoryPendingRequests.filter(
    (req) => req.tableNumber === tableNumber && req.status === 'PENDIENTE'
  );
}

/**
 * Verifica si existe una solicitud pendiente activa para esa mesa y tipo
 */
export function hasPendingRequest(
  tableNumber: number,
  requestType: TableServiceRequestType
): boolean {
  return inMemoryPendingRequests.some(
    (req) =>
      req.tableNumber === tableNumber &&
      req.requestType === requestType &&
      req.status === 'PENDIENTE'
  );
}

/**
 * CREACIÓN PÚBLICA: Invocada desde el dispositivo móvil del cliente al escanear el QR.
 * No requiere sesión. Cumple con las reglas estrictas de Firestore.
 */
export async function createPublicServiceRequest(
  tableNumber: number,
  requestType: TableServiceRequestType
): Promise<{ success: boolean; alreadyPending?: boolean; message?: string }> {
  // 1. Validar que la mesa sea operativa (Mesas 1, 2, 4, 5, 6, 7, 8, 9)
  if (!isValidTableNumber(tableNumber)) {
    return {
      success: false,
      message: `La mesa ${tableNumber} no es una mesa operativa válida.`,
    };
  }

  // 2. Verificar en Firestore si ya existe una solicitud activa de ese tipo.
  // El documento usa un ID determinístico, así que una sola solicitud puede estar
  // pendiente por mesa/tipo al mismo tiempo. Firestore es la fuente de verdad.
  const docId = getTableRequestDocId(tableNumber, requestType);
  const docRef = doc(db, 'table_service_requests', docId);

  try {
    const existing = await getDoc(docRef);
    if (existing.exists() && existing.data()?.status === 'PENDIENTE') {
      return {
        success: true,
        alreadyPending: true,
        message: 'Ya avisamos al equipo ✓',
      };
    }
  } catch (error) {
    // Si la lectura falla por red, intentamos crear la solicitud de todos modos.
    console.warn('[tableRequestsService] No se pudo verificar solicitud existente:', error);
  }
  const newRequest: TableServiceRequest = {
    id: docId,
    tableNumber,
    requestType,
    status: 'PENDIENTE',
    restaurantId: RESTAURANT_ID,
    createdAt: new Date().toISOString(),
  };

  // 3. Escribir en Firestore. Firestore es la única fuente de verdad.
  // No marcamos la solicitud como pendiente localmente hasta que la escritura
  // haya sido confirmada; así evitamos estados fantasma de "Avisado".
  try {
    await setDoc(docRef, {
      tableNumber: newRequest.tableNumber,
      requestType: newRequest.requestType,
      status: 'PENDIENTE',
      restaurantId: RESTAURANT_ID,
      createdAt: newRequest.createdAt,
    });

    // Mantener la caché sólo como espejo de una escritura confirmada.
    const existingIndex = inMemoryPendingRequests.findIndex((r) => r.id === docId);
    if (existingIndex >= 0) {
      inMemoryPendingRequests[existingIndex] = newRequest;
    } else {
      inMemoryPendingRequests.push(newRequest);
    }
    saveLocalRequests([...inMemoryPendingRequests]);

    return {
      success: true,
      alreadyPending: false,
      message: 'Solicitud enviada ✓',
    };
  } catch (error) {
    console.warn('[tableRequestsService] Error al escribir en Firestore:', error);

    // Eliminar cualquier resto local de intentos anteriores.
    inMemoryPendingRequests = inMemoryPendingRequests.filter((r) => r.id !== docId);
    saveLocalRequests([...inMemoryPendingRequests]);

    return {
      success: false,
      alreadyPending: false,
      message: 'No pudimos enviar la solicitud. Intenta de nuevo.',
    };
  }
}

/**
 * SUSCRIPCIÓN PÚBLICA EN TIEMPO REAL: vista del comensal de una mesa específica.
 * Escucha Firestore directamente para que el estado "Avisado" desaparezca en
 * cuanto el personal elimine/marque como atendida la solicitud desde Panel Caja.
 */
export function subscribeToTableRequestsForTable(
  tableNumber: number,
  callback: (requests: TableServiceRequest[]) => void
): () => void {
  if (!isValidTableNumber(tableNumber)) {
    callback([]);
    return () => {};
  }

  try {
    // Un solo filtro evita índices compuestos innecesarios. El resto se valida
    // en cliente porque las reglas actuales permiten lectura pública de esta colección.
    const q = query(
      collection(db, 'table_service_requests'),
      where('tableNumber', '==', tableNumber)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: TableServiceRequest[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (
            data.status === 'PENDIENTE' &&
            data.restaurantId === RESTAURANT_ID
          ) {
            list.push({
              id: docSnap.id,
              tableNumber: data.tableNumber,
              requestType: data.requestType,
              status: 'PENDIENTE',
              restaurantId: RESTAURANT_ID,
              createdAt: data.createdAt,
            });
          }
        });

        // Sincronizar también la caché local con el estado real de esta mesa.
        const otherTables = inMemoryPendingRequests.filter(
          (request) => request.tableNumber !== tableNumber
        );
        inMemoryPendingRequests = [...otherTables, ...list];
        saveLocalRequests([...inMemoryPendingRequests]);

        callback(list);
      },
      (error) => {
        console.warn('[tableRequestsService] listener público de mesa falló:', error);
        // Nunca reconstruir "Avisado" desde localStorage/cache. Si Firestore no
        // puede leerse, es preferible mostrar el botón libre a mostrar un pendiente
        // fantasma que Caja no tiene.
        callback([]);
      }
    );
  } catch (error) {
    console.warn('[tableRequestsService] no se pudo iniciar listener público:', error);
    callback([]);
    return () => {};
  }
}

let activeFirestoreRequestsUnsubscribe: (() => void) | null = null;

function ensureFirestoreRequestsSync() {
  if (activeFirestoreRequestsUnsubscribe || !isUserAuthenticated()) {
    return;
  }
  try {
    const q = query(
      collection(db, 'table_service_requests'),
      where('status', '==', 'PENDIENTE')
    );

    activeFirestoreRequestsUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: TableServiceRequest[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            tableNumber: data.tableNumber,
            requestType: data.requestType,
            status: data.status,
            restaurantId: data.restaurantId,
            createdAt: data.createdAt,
          });
        });

        inMemoryPendingRequests = list;
        try {
          localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(list));
        } catch {
          // ignore
        }
        notifyRequestListeners();
      },
      (error) => {
        console.warn('[tableRequestsService] onSnapshot error:', error);
      }
    );
  } catch (err) {
    console.warn('[tableRequestsService] error initializing listener:', err);
  }
}

function stopFirestoreRequestsSyncIfNoListeners() {
  if (requestListeners.size === 0 && activeFirestoreRequestsUnsubscribe) {
    activeFirestoreRequestsUnsubscribe();
    activeFirestoreRequestsUnsubscribe = null;
  }
}

if (typeof window !== 'undefined') {
  subscribeToAuth((user) => {
    if (user && requestListeners.size > 0) {
      ensureFirestoreRequestsSync();
    } else if (!user && activeFirestoreRequestsUnsubscribe) {
      activeFirestoreRequestsUnsubscribe();
      activeFirestoreRequestsUnsubscribe = null;
    }
  });
}

/**
 * SUSCRIPCIÓN EN TIEMPO REAL: Invocada en el módulo administrativo de Mesas.
 * Escucha las solicitudes pendientes con onSnapshot en tiempo real con notificación unificada.
 */
export function subscribeToPendingTableRequests(
  callback: (requests: TableServiceRequest[]) => void
): () => void {
  requestListeners.add(callback);
  callback([...inMemoryPendingRequests]);

  ensureFirestoreRequestsSync();

  return () => {
    requestListeners.delete(callback);
    stopFirestoreRequestsSyncIfNoListeners();
  };
}

/**
 * RESOLUCIÓN: Personal autenticado marca la solicitud como ATENDIDA / LISTA.
 * Elimina el documento activo determinístico de Firestore para permitir futuras solicitudes.
 */
export async function markTableRequestAttended(
  tableNumber: number,
  requestType: TableServiceRequestType,
  user?: { id: string; name: string }
): Promise<void> {
  const docId = getTableRequestDocId(tableNumber, requestType);

  // Resolver una solicitud es una operación administrativa. El PIN del panel
  // identifica al colaborador dentro de la app, pero Firestore exige además una
  // sesión Firebase Auth activa para permitir DELETE. Si no existe, no debemos
  // fingir que la solicitud se resolvió sólo en memoria local.
  if (!isUserAuthenticated()) {
    throw new Error(
      'Inicia sesión con Google en el Panel Caja para marcar solicitudes QR como atendidas.'
    );
  }

  // Firestore es la fuente de verdad: primero confirmamos el borrado remoto.
  // Sólo después limpiamos la caché local. Así evitamos que el panel muestre
  // “Atendido” mientras el comensal sigue viendo “Avisado” en otro dispositivo.
  try {
    const docRef = doc(db, 'table_service_requests', docId);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('[tableRequestsService] Error eliminando solicitud en Firestore:', error);
    throw new Error(
      'No se pudo sincronizar la solicitud con Firestore. Revisa la sesión de Google y la conexión.'
    );
  }

  inMemoryPendingRequests = inMemoryPendingRequests.filter((r) => r.id !== docId);
  saveLocalRequests([...inMemoryPendingRequests]);

  // Limpiar restos de versiones anteriores que usaban localStorage por botón.
  try {
    localStorage.removeItem(`alo_qr_req_${tableNumber}_${requestType}`);
  } catch {
    // ignore
  }

  // Registrar auditoría sin bloquear la resolución si la bitácora falla.
  if (user) {
    await logActivityFirestore({
      userId: user.id,
      userName: user.name,
      userRole: 'EMPLEADO',
      action: 'Mesa: Solicitud QR Atendida',
      category: 'sistema',
      details: `Mesa ${tableNumber}: Solicitud ${requestType} marcada como atendida/resuelta.`,
    }).catch(() => {});
  }
}

/**
 * Resuelve todas las solicitudes pendientes de una mesa (por ejemplo al desocupar la mesa)
 */
export async function clearAllPendingRequestsForTable(
  tableNumber: number,
  user?: { id: string; name: string }
): Promise<void> {
  const toClear = inMemoryPendingRequests.filter(
    (req) => req.tableNumber === tableNumber && req.status === 'PENDIENTE'
  );

  for (const req of toClear) {
    await markTableRequestAttended(tableNumber, req.requestType, user);
  }
}
