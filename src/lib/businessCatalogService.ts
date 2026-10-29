import { doc, getDoc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { auth } from './firebase';
import { db } from './firebase';
import { BusinessRole } from './restaurantCore';
import { cleanOptionGroups } from './catalogOptions';

export interface CatalogChoice {
  name: string;
  /** Lo que suma al precio base (0 si no cambia el precio). */
  price: number;
}

export interface CatalogOptionGroup {
  id: string;
  /** Ej.: "Guiso", "Extras", "¿Lo quieres en paquete?" */
  name: string;
  /** El cliente debe elegir al menos una opción. */
  required: boolean;
  /** Puede elegir varias (extras). Si es false, elige solo una. */
  multiple: boolean;
  choices: CatalogChoice[];
}

export interface BusinessCatalogItem {
  id: string;
  name: string;
  description: string;
  price: number | null;
  imageUrl?: string;
  category: string;
  available: boolean;
  popular?: boolean;
  optionGroups?: CatalogOptionGroup[];
  sortOrder: number;
}


type CatalogMembership = { restaurantId?: string; userId?: string; role?: BusinessRole; active?: boolean };
const catalogManagerRoles: BusinessRole[] = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];

function validCatalogManagerMembership(
  membership: CatalogMembership | null,
  businessId: string,
  uid: string
): membership is CatalogMembership & { role: BusinessRole } {
  return !!membership && membership.restaurantId === businessId && membership.userId === uid
    && membership.active === true && catalogManagerRoles.includes(membership.role as BusinessRole);
}

export async function assertCatalogManager(businessId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Debes iniciar sesión para administrar el catálogo.');
  if (!businessId.trim()) throw new Error('La identidad del negocio es inválida.');

  const membershipRef = doc(db, 'businessMemberships', `${businessId}_${user.uid}`);
  const membershipSnap = await getDoc(membershipRef);
  const membership = membershipSnap.exists() ? membershipSnap.data() as CatalogMembership : null;
  if (!validCatalogManagerMembership(membership, businessId, user.uid)) {
    throw new Error('No tienes permiso para administrar el catálogo de este negocio.');
  }
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error('La sesión cambió al comprobar permisos del catálogo. Vuelve a iniciar sesión.');
  }

  // La membresía no basta: comprobar la raíz y, para OWNER, el propietario
  // explícito. Los negocios históricos sin ownerUserId siguen siendo válidos.
  const rootSnap = await getDoc(doc(db, 'businesses', businessId));
  const root = rootSnap.exists() ? rootSnap.data() : null;
  if (!root || root.restaurantId !== businessId
      || (membership.role === 'OWNER' && root.ownerUserId !== undefined && root.ownerUserId !== user.uid)) {
    throw new Error('La identidad del negocio o propietario es inconsistente para el catálogo.');
  }
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error('La sesión cambió al comprobar permisos del catálogo. Vuelve a iniciar sesión.');
  }

  // Una revocación, cambio de rol o reasignación durante la lectura de la
  // raíz debe bloquear la escritura. Las reglas Firestore siguen siendo la
  // autoridad final; este preflight no es una transacción de permisos.
  const latestSnap = await getDoc(membershipRef);
  const latest = latestSnap.exists() ? latestSnap.data() as CatalogMembership : null;
  if (!validCatalogManagerMembership(latest, businessId, user.uid) || latest.role !== membership.role) {
    throw new Error('Los permisos del catálogo cambiaron. Vuelve a entrar y reintenta.');
  }
  if (auth.currentUser?.uid !== user.uid) {
    throw new Error('La sesión cambió al comprobar permisos del catálogo. Vuelve a iniciar sesión.');
  }
  return user.uid;
}

export interface BusinessCatalogDocument {
  businessId: string;
  sourceLabel: string;
  items: BusinessCatalogItem[];
  updatedAt: string;
  updatedBy: string;
  /** Identificador único de cada escritura para detectar ediciones concurrentes. */
  revision?: string;
}

function catalogRef(businessId: string) {
  return doc(db, 'businesses', businessId, 'catalog', 'menu_catalog');
}

export function createCatalogItemId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `${slug || 'producto'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Garantiza que cada producto tenga un id único (dos productos con el mismo id rompen editar, borrar y el carrito). */
export function ensureUniqueIds<T extends { id: string; name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((item) => {
    let id = item.id;
    while (!id || seen.has(id)) id = createCatalogItemId(item.name || 'producto');
    seen.add(id);
    return id === item.id ? item : { ...item, id };
  });
}

export function subscribeToBusinessCatalog(
  businessId: string,
  callback: (catalog: BusinessCatalogDocument | null) => void,
  onError?: (error: unknown) => void
): () => void {
  return onSnapshot(
    catalogRef(businessId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback(snapshot.data() as BusinessCatalogDocument);
    },
    (error) => {
      console.error('Error leyendo catálogo del negocio:', error);
      onError?.(error);
    }
  );
}

function buildCatalogPayload(
  businessId: string,
  items: BusinessCatalogItem[],
  actorName: string
): BusinessCatalogDocument {
  return {
    businessId,
    sourceLabel: 'Catálogo del negocio',
    items: ensureUniqueIds(items)
      .map((item) => {
        const optionGroups = cleanOptionGroups(item.optionGroups);
        const { optionGroups: _discard, ...rest } = item;
        // Firestore no acepta valores undefined: se omiten los campos vacíos.
        return JSON.parse(JSON.stringify(optionGroups.length ? { ...rest, optionGroups } : rest)) as BusinessCatalogItem;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder),
    updatedAt: new Date().toISOString(),
    updatedBy: actorName,
    revision: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
}

/**
 * Siembra la plantilla únicamente si no existe un catálogo. La lectura y la
 * creación ocurren en una transacción: dos pestañas/reintentos concurrentes
 * no pueden sobrescribir una edición ni volver a sembrar sobre el ganador.
 * Devuelve true solo si este intento creó el documento.
 */
export async function seedBusinessCatalogIfMissing(
  businessId: string,
  items: BusinessCatalogItem[],
  actorName: string
): Promise<boolean> {
  const managerUid = await assertCatalogManager(businessId);
  const payload = buildCatalogPayload(businessId, items, actorName);
  return runTransaction(db, async (transaction) => {
    if (auth.currentUser?.uid !== managerUid) {
      throw new Error('La sesión cambió antes de sembrar el catálogo.');
    }
    const ref = catalogRef(businessId);
    const existing = await transaction.get(ref);
    if (auth.currentUser?.uid !== managerUid) {
      throw new Error('La sesión cambió durante la siembra del catálogo.');
    }
    if (existing.exists()) return false;
    transaction.set(ref, payload);
    return true;
  });
}

/**
 * expectedRevision indefinido conserva el guardado histórico de otros módulos.
 * El editor siempre envía su versión (null si el catálogo aún no existe):
 * una transacción impide sobrescribir una edición realizada por otra pestaña.
 */
export async function saveBusinessCatalog(
  businessId: string,
  items: BusinessCatalogItem[],
  actorName: string,
  expectedRevision?: string | null
): Promise<BusinessCatalogDocument> {
  const managerUid = await assertCatalogManager(businessId);
  const payload = buildCatalogPayload(businessId, items, actorName);
  if (auth.currentUser?.uid !== managerUid) {
    throw new Error('La sesión cambió antes de guardar el catálogo. No se envió ningún cambio.');
  }
  const ref = catalogRef(businessId);
  if (expectedRevision !== undefined) {
    return runTransaction(db, async (transaction) => {
      if (auth.currentUser?.uid !== managerUid) {
        throw new Error('La sesión cambió antes de guardar el catálogo.');
      }
      const current = await transaction.get(ref);
      const currentRevision = current.exists()
        ? (current.data().revision || current.data().updatedAt || null)
        : null;
      if (currentRevision !== expectedRevision) {
        throw new Error('CONFLICTO_CATALOGO: Otra persona modificó el catálogo. Recarga antes de sobrescribir.');
      }
      if (auth.currentUser?.uid !== managerUid) {
        throw new Error('La sesión cambió durante el guardado del catálogo.');
      }
      transaction.set(ref, payload);
      return payload;
    });
  }
  // Compatibilidad: importadores y rutas históricas no pasan versión.
  await setDoc(ref, payload, { merge: false });
  return payload;
}

export async function upsertBusinessCatalogItem(
  businessId: string,
  currentItems: BusinessCatalogItem[],
  item: BusinessCatalogItem,
  actorName: string
): Promise<BusinessCatalogDocument> {
  const items = [...currentItems];
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
  return saveBusinessCatalog(businessId, items, actorName);
}

export async function deleteBusinessCatalogItem(
  businessId: string,
  currentItems: BusinessCatalogItem[],
  itemId: string,
  actorName: string
): Promise<BusinessCatalogDocument> {
  const items = currentItems.filter((item) => item.id !== itemId);
  return saveBusinessCatalog(businessId, items, actorName);
}
