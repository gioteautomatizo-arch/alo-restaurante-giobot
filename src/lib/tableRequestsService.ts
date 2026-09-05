import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, isUserAuthenticated } from './firebase';
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
    shortDesc: 'Bebidas frías, calientes o recargas',
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
    window.dispatchEvent(new CustomEvent(TABLE_REQUESTS_EVENT, { detail: requests }));
  } catch {
    // Silently ignore storage errors
  }
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

  // 2. Verificar duplicado en cliente / memoria reciente
  const clientStorageKey = `alo_qr_req_${tableNumber}_${requestType}`;
  const lastSent = localStorage.getItem(clientStorageKey);
  const now = Date.now();
  const COOLDOWN_MS = 60 * 1000; // 60 segundos de protección contra toques repetidos

  if (lastSent) {
    const sentTime = parseInt(lastSent, 10);
    if (now - sentTime < COOLDOWN_MS) {
      return {
        success: true,
        alreadyPending: true,
        message: 'Ya avisamos al equipo ✓',
      };
    }
  }

  const docId = getTableRequestDocId(tableNumber, requestType);
  const newRequest: TableServiceRequest = {
    id: docId,
    tableNumber,
    requestType,
    status: 'PENDIENTE',
    restaurantId: RESTAURANT_ID,
    createdAt: new Date().toISOString(),
  };

  // Actualizar memoria local para feedback inmediato
  const existingIndex = inMemoryPendingRequests.findIndex((r) => r.id === docId);
  if (existingIndex >= 0) {
    inMemoryPendingRequests[existingIndex] = newRequest;
  } else {
    inMemoryPendingRequests.push(newRequest);
  }
  saveLocalRequests([...inMemoryPendingRequests]);
  localStorage.setItem(clientStorageKey, now.toString());

  // 3. Escribir en Firestore (público: sólo CREATE con campos exactos)
  try {
    const docRef = doc(db, 'table_service_requests', docId);
    // SOLO los 5 campos autorizados por las reglas de seguridad
    await setDoc(docRef, {
      tableNumber: newRequest.tableNumber,
      requestType: newRequest.requestType,
      status: 'PENDIENTE',
      restaurantId: RESTAURANT_ID,
      createdAt: newRequest.createdAt,
    });

    return {
      success: true,
      alreadyPending: false,
      message: 'Solicitud enviada ✓',
    };
  } catch (error) {
    console.warn('[tableRequestsService] Error al escribir en Firestore, guardado local:', error);
    // Aún si falla la red, el comensal recibe confirmación local
    return {
      success: true,
      alreadyPending: false,
      message: 'Solicitud enviada ✓',
    };
  }
}

/**
 * SUSCRIPCIÓN EN TIEMPO REAL: Invocada en el módulo administrativo de Mesas.
 * Escucha las solicitudes pendientes con onSnapshot en tiempo real.
 */
export function subscribeToPendingTableRequests(
  callback: (requests: TableServiceRequest[]) => void
): () => void {
  // Emitir estado inicial en memoria
  callback(inMemoryPendingRequests);

  // Suscriptor al evento local
  const handleLocalUpdate = (e: Event) => {
    const customEvent = e as CustomEvent<TableServiceRequest[]>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    }
  };
  window.addEventListener(TABLE_REQUESTS_EVENT, handleLocalUpdate);

  // Si el usuario está autenticado en Firebase Auth, escuchar Firestore en tiempo real
  let unsubscribeFirestore: (() => void) | null = null;

  try {
    const q = query(
      collection(db, 'table_service_requests'),
      where('status', '==', 'PENDIENTE')
    );

    unsubscribeFirestore = onSnapshot(
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
        saveLocalRequests(list);
        callback(list);
      },
      (error) => {
        // En caso de que aún no haya sesión o permisos
        console.warn('[tableRequestsService] onSnapshot error:', error);
        callback(inMemoryPendingRequests);
      }
    );
  } catch (err) {
    console.warn('[tableRequestsService] error initializing listener:', err);
  }

  return () => {
    window.removeEventListener(TABLE_REQUESTS_EVENT, handleLocalUpdate);
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
    }
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

  // 1. Quitar de la memoria local inmediatamente
  inMemoryPendingRequests = inMemoryPendingRequests.filter((r) => r.id !== docId);
  saveLocalRequests([...inMemoryPendingRequests]);

  // Limpiar cooldown del comensal para permitir solicitar de nuevo
  try {
    localStorage.removeItem(`alo_qr_req_${tableNumber}_${requestType}`);
  } catch {
    // ignore
  }

  // 2. Eliminar de Firestore
  try {
    const docRef = doc(db, 'table_service_requests', docId);
    await deleteDoc(docRef);

    // 3. Registrar auditoría si está disponible
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
  } catch (error) {
    console.warn('[tableRequestsService] Error eliminando solicitud en Firestore:', error);
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
