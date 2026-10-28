import { addDoc, collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, getCurrentAuthUser } from './firebase';

/**
 * Datos de los módulos administrativos de cada negocio.
 * Viven en businesses/{id}/{módulo}/{doc}; las reglas de Firestore cubren todos
 * los negocios con un solo bloque, así que un negocio nuevo no necesita ajustes.
 */
export type TenantModule = 'shifts' | 'expenses' | 'vault' | 'receivables' | 'payables' | 'auditLog';

export interface AuditEntry {
  id?: string;
  businessId: string;
  actorId: string;
  actorName: string;
  action: string; // p. ej. "shift.open", "expense.create"
  module: TenantModule | 'vip';
  targetId?: string;
  summary: string;
  at: string; // ISO
}

const colRef = (businessId: string, module: TenantModule) => collection(db, 'businesses', businessId, module);

function clean<T extends Record<string, unknown>>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

/** Orden descendente local tras filtrar el tenant; faltantes siempre al final. */
function sortModuleRows<T extends { id: string }>(rows: T[], field: string): T[] {
  const normalize = (value: unknown): string | number | null => {
    if (value == null) return null;
    if (typeof value === 'number' || typeof value === 'string') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object' && 'toMillis' in value
      && typeof value.toMillis === 'function') return value.toMillis();
    return String(value);
  };
  return [...rows].sort((left, right) => {
    const a = normalize((left as Record<string, unknown>)[field]);
    const b = normalize((right as Record<string, unknown>)[field]);
    if (a === null && b === null) return left.id.localeCompare(right.id);
    if (a === null) return 1;
    if (b === null) return -1;
    const order = typeof a === 'number' && typeof b === 'number'
      ? b - a : String(b).localeCompare(String(a));
    return order || left.id.localeCompare(right.id);
  });
}

export function subscribeToModule<T>(
  businessId: string,
  module: TenantModule,
  callback: (rows: Array<T & { id: string }>) => void,
  sortField = 'createdAt',
  onError?: (error: Error) => void,
): () => void {
  if (!businessId.trim()) {
    if (onError) onError(new Error('No se indicó el negocio del módulo.'));
    else callback([]);
    return () => {};
  }
  // Un filtro de identidad es obligatorio para que las reglas candidatas
  // puedan autorizar consultas; ordenar aquí evita requerir índices compuestos
  // no desplegados. Los registros históricos sin businessId no se muestran.
  const q = query(colRef(businessId, module), where('businessId', '==', businessId));
  return onSnapshot(
    q,
    (snap) => callback(sortModuleRows(snap.docs.map((d) => ({ ...(d.data() as T), id: d.id })), sortField)),
    (error) => {
      console.warn(`[tenantModules] ${module}:`, error);
      if (onError) onError(error);
      else callback([]); // Compatibilidad con vistas antiguas sin control de errores.
    },
  );
}

/** Registra en la bitácora quién hizo qué. Nunca interrumpe la acción principal. */
export async function writeAudit(
  businessId: string,
  entry: Omit<AuditEntry, 'businessId' | 'actorId' | 'actorName' | 'at'>,
): Promise<void> {
  const user = getCurrentAuthUser();
  if (!user) return;
  try {
    await addDoc(colRef(businessId, 'auditLog'), clean({
      ...entry,
      businessId,
      actorId: user.uid,
      actorName: user.displayName || user.email || 'Usuario',
      at: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn('[tenantModules] no se pudo escribir la bitácora:', error);
  }
}

/** Crea o reemplaza un documento del módulo y deja rastro en la bitácora. */
export async function saveModuleDoc(
  businessId: string,
  module: Exclude<TenantModule, 'auditLog'>,
  data: Record<string, unknown> & { id?: string },
  audit: { action: string; summary: string },
): Promise<string> {
  const now = new Date().toISOString();
  const id = data.id || doc(colRef(businessId, module)).id;
  const payload = clean({ ...data, id, businessId, createdAt: data.createdAt ?? now, updatedAt: now });
  await setDoc(doc(db, 'businesses', businessId, module, id), payload);
  void writeAudit(businessId, { action: audit.action, module, targetId: id, summary: audit.summary });
  return id;
}

export async function deleteModuleDoc(
  businessId: string,
  module: Exclude<TenantModule, 'auditLog' | 'shifts'>,
  id: string,
  audit: { action: string; summary: string },
): Promise<void> {
  await deleteDoc(doc(db, 'businesses', businessId, module, id));
  void writeAudit(businessId, { action: audit.action, module, targetId: id, summary: audit.summary });
}
