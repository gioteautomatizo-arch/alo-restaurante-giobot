import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
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
  module: TenantModule;
  targetId?: string;
  summary: string;
  at: string; // ISO
}

const colRef = (businessId: string, module: TenantModule) => collection(db, 'businesses', businessId, module);

function clean<T extends Record<string, unknown>>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

export function subscribeToModule<T>(
  businessId: string,
  module: TenantModule,
  callback: (rows: Array<T & { id: string }>) => void,
  sortField = 'createdAt',
): () => void {
  if (!businessId.trim()) {
    callback([]);
    return () => {};
  }
  const q = query(colRef(businessId, module), orderBy(sortField, 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }))),
    (error) => {
      console.warn(`[tenantModules] ${module}:`, error);
      callback([]);
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
