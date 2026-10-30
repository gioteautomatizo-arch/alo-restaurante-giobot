import { doc, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth } from './firebase';
import { db } from './firebase';
import { BusinessRole } from './restaurantCore';
import { assertUniqueOptionGroupIdentity, assertValidOptionChoicesBeforeCleaning, cleanOptionGroups } from './catalogOptions';

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
      const catalog = snapshot.data() as Partial<BusinessCatalogDocument>;
      // Un documento bajo la ruta A no puede convertirse en el menú de B por
      // contener un businessId ajeno. No tratar registros corruptos como menú vacío.
      if (catalog.businessId !== businessId || !Array.isArray(catalog.items)) {
        const error = new Error('El catálogo tiene una identidad o lista de productos inconsistente. Revisa el negocio antes de editar.');
        console.error('Catálogo inconsistente:', error);
        onError?.(error);
        return;
      }
      callback(catalog as BusinessCatalogDocument);
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
        assertValidOptionChoicesBeforeCleaning(item.optionGroups);
        const optionGroups = cleanOptionGroups(item.optionGroups);
        assertUniqueOptionGroupIdentity(optionGroups);
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
 * El guardado de catálogo COMPLETO requiere la versión observada.
 * null representa un catálogo inexistente; undefined no es una versión.
 * No admitir el fallback histórico sin CAS: puede sobrescribir cambios de otra
 * pestaña. Los consumidores antiguos deben recargar y enviar revision/updatedAt.
 */
export async function saveBusinessCatalog(
  businessId: string,
  items: BusinessCatalogItem[],
  actorName: string,
  expectedRevision?: string | null
): Promise<BusinessCatalogDocument> {
  // Mantener el argumento opcional en TypeScript durante la transición para
  // fallar con un error recuperable en clientes antiguos, nunca escribir a ciegas.
  if (expectedRevision === undefined) {
    throw new Error('CONFLICTO_CATALOGO: Este editor necesita actualizarse para guardar con revisión. Recarga el catálogo.');
  }
  const managerUid = await assertCatalogManager(businessId);
  const payload = buildCatalogPayload(businessId, items, actorName);
  if (auth.currentUser?.uid !== managerUid) {
    throw new Error('La sesión cambió antes de guardar el catálogo. No se envió ningún cambio.');
  }
  const ref = catalogRef(businessId);
  return runTransaction(db, async (transaction) => {
    if (auth.currentUser?.uid !== managerUid) {
      throw new Error('La sesión cambió antes de guardar el catálogo.');
    }
    const current = await transaction.get(ref);
    if (current.exists() && (current.data().businessId !== businessId || !Array.isArray(current.data().items))) {
      throw new Error('El catálogo contiene datos inconsistentes del negocio. No se guardó ningún cambio.');
    }
    // Un catálogo existente sin metadatos de revisión NO equivale a un
    // documento ausente. Un editor histórico puede enviar null en ambos
    // casos; permitirlo aquí borraría productos antiguos silenciosamente.
    // Solo aceptar cadenas no vacías como revisiones observables.
    const data = current.exists() ? current.data() : null;
    const currentRevision = data
      ? (typeof data.revision === 'string' && data.revision.trim()
          ? data.revision
          : typeof data.updatedAt === 'string' && data.updatedAt.trim()
            ? data.updatedAt
            : null)
      : null;
    if (current.exists() && currentRevision === null) {
      throw new Error('CONFLICTO_CATALOGO: Este catálogo histórico no tiene revisión verificable. No se sobrescribió; requiere revisión antes de editar.');
    }
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

/**
 * La lista heredada puede estar obsoleta, pero sí identifica la versión del
 * producto que el operador vio. Comparamos solo ese producto: otros cambios
 * simultáneos no bloquean la operación. Ordenamos las claves para no confundir
 * el orden de serialización de Firestore con una edición.
 */
function itemFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) => {
    if (part && typeof part === 'object' && !Array.isArray(part)) {
      const record = part as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
    }
    return part;
  }) ?? '';
}

function assertLegacyItemUnchanged(
  current: BusinessCatalogItem[],
  baseline: BusinessCatalogItem[],
  itemId: string
): void {
  if (!Array.isArray(baseline) || !itemId) {
    throw new Error('CONFLICTO_CATALOGO: No se pudo verificar el producto anterior. Recarga el catálogo.');
  }
  const previous = baseline.filter((product) => product?.id === itemId);
  const latest = current.filter((product) => product?.id === itemId);
  if (previous.length > 1 || latest.length > 1
      || previous.length !== latest.length
      || (previous.length === 1 && itemFingerprint(previous[0]) !== itemFingerprint(latest[0]))) {
    throw new Error('CONFLICTO_CATALOGO: Este producto cambió en otra sesión. Recarga antes de editar o borrar.');
  }
}

/**
 * Compatibilidad para consumidores antiguos que envían currentItems.
 * Nunca reemplazar todo el catálogo con ese snapshot: aplicar solo la mutación
 * del producto sobre la versión actual, pero rechazar cambios al MISMO producto
 * si ya no coincide con la versión que vio el operador.
 */
async function mutateBusinessCatalogItem(
  businessId: string,
  actorName: string,
  baseline: BusinessCatalogItem[],
  itemId: string,
  mutation: (items: BusinessCatalogItem[]) => BusinessCatalogItem[]
): Promise<BusinessCatalogDocument> {
  const managerUid = await assertCatalogManager(businessId);
  const ref = catalogRef(businessId);
  return runTransaction(db, async (transaction) => {
    if (auth.currentUser?.uid !== managerUid) {
      throw new Error('La sesión cambió antes de modificar el producto del catálogo.');
    }
    const current = await transaction.get(ref);
    if (current.exists() && (current.data().businessId !== businessId || !Array.isArray(current.data().items))) {
      throw new Error('El catálogo contiene datos inconsistentes del negocio. No se guardó ningún cambio.');
    }
    if (auth.currentUser?.uid !== managerUid) {
      throw new Error('La sesión cambió durante la modificación del producto.');
    }
    const items = current.exists() ? current.data().items as BusinessCatalogItem[] : [];
    assertLegacyItemUnchanged(items, baseline, itemId);
    const payload = buildCatalogPayload(businessId, mutation(items), actorName);
    transaction.set(ref, payload);
    return payload;
  });
}

export async function upsertBusinessCatalogItem(
  businessId: string,
  currentItems: BusinessCatalogItem[],
  item: BusinessCatalogItem,
  actorName: string
): Promise<BusinessCatalogDocument> {
  return mutateBusinessCatalogItem(businessId, actorName, currentItems, item.id, (items) => {
    const updated = [...items];
    const index = updated.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) updated[index] = item;
    else updated.push(item);
    return updated;
  });
}

export async function deleteBusinessCatalogItem(
  businessId: string,
  currentItems: BusinessCatalogItem[],
  itemId: string,
  actorName: string
): Promise<BusinessCatalogDocument> {
  return mutateBusinessCatalogItem(businessId, actorName, currentItems, itemId, (items) => {
    // No crear un catálogo vacío ni alterar una versión nueva cuando el
    // producto solicitado ya no existe. Pedir recarga al consumidor antiguo.
    if (!items.some((item) => item.id === itemId)) {
      throw new Error('CONFLICTO_CATALOGO: El producto ya no existe. Recarga antes de borrar.');
    }
    return items.filter((item) => item.id !== itemId);
  });
}
