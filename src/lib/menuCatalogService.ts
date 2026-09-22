import { doc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { CategoryId, StaffUser } from '../types';
import { ORIGINAL_MENU_CATALOG } from '../data/originalMenuCatalog';

export const MENU_CATALOG_VERSION = 1;

/**
 * ID del negocio original (Restaurante Calientito).
 * Se conserva como valor por defecto para que nada se rompa mientras
 * conectamos negocios nuevos al modelo businesses/{businessId}/...
 */
export const RESTAURANT_ID = 'alo-restaurante';

/**
 * Ubicación ORIGINAL del catálogo de Calientito. No se toca ni se migra
 * en este paso: Calientito sigue leyendo y escribiendo exactamente aquí.
 */
const LEGACY_CATALOG_PATH = ['daily_menu', 'menu_catalog'] as const;
export const MENU_CATALOG_DOC_PATH = LEGACY_CATALOG_PATH;

const PACKAGE_ONLY_ITEM_IDS = new Set(['paquete-desayuno', 'paquete-hamburguesa']);

export interface ManagedMenuSize {
  name: string;
  price: number | null;
}

export interface ManagedMenuExtra {
  id: string;
  name: string;
  price: number;
}

export interface ManagedMenuItem {
  id: string;
  restaurantId: string;
  name: string;
  category: CategoryId;
  description: string;
  price: number | null;
  sourcePriceText?: string;
  sizes?: ManagedMenuSize[];
  options?: string[];
  extras?: ManagedMenuExtra[];
  includedItems?: string[];
  imageUrls: string[];
  primaryImageUrl?: string;
  sizeImageUrls?: Record<string, string>;
  popular: boolean;
  active: boolean;
  available: boolean;
  sortOrder: number;
  weekendOnly?: 'Sábados' | 'Domingos';
  source: 'menu-original' | 'manual';
  notes?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface MenuCatalogDocument {
  restaurantId: string;
  version: number;
  sourceLabel: string;
  items: ManagedMenuItem[];
  updatedAt: string;
  updatedBy: string;
}

/**
 * Ubicación del catálogo, según el negocio.
 * - Calientito (RESTAURANT_ID): sigue usando su documento original, intacto.
 * - Cualquier otro negocio: usa su propia carpeta businesses/{businessId}/...
 */
function catalogRef(businessId: string = RESTAURANT_ID) {
  if (businessId === RESTAURANT_ID) {
    return doc(db, LEGACY_CATALOG_PATH[0], LEGACY_CATALOG_PATH[1]);
  }
  return doc(db, 'businesses', businessId, 'catalog', 'menu_catalog');
}

type CatalogSubscriber = {
  callback: (catalog: MenuCatalogDocument | null) => void;
  onError?: (error: unknown) => void;
};

// NOTA: esta caché es compartida por documento (businessId). Hoy la app solo
// mira un negocio a la vez, así que es seguro. Si en el futuro una misma
// pantalla necesita ver el catálogo de dos negocios distintos al mismo
// tiempo, esto habrá que ajustarlo entonces.
const catalogSubscribersByBusiness = new Map<string, Set<CatalogSubscriber>>();
const catalogUnsubscribeByBusiness = new Map<string, () => void>();
const catalogCacheByBusiness = new Map<string, MenuCatalogDocument | null>();
const catalogHasSnapshotByBusiness = new Map<string, boolean>();

function cleanArray<T>(value: T[] | undefined): T[] | undefined {
  if (!value || value.length === 0) return undefined;
  return value;
}

function enrichPackageExtras(item: ManagedMenuItem, extras: ManagedMenuExtra[]): ManagedMenuExtra[] {
  if (PACKAGE_ONLY_ITEM_IDS.has(item.id)) return extras;

  const next = [...extras];
  const addIfMissing = (extra: ManagedMenuExtra) => {
    if (!next.some((candidate) => candidate.id === extra.id)) next.push(extra);
  };

  if (item.category === 'desayunos') {
    addIfMissing({
      id: 'paquete-desayuno',
      name: 'Hazlo paquete: jugo o fruta + café de olla o té',
      price: 20,
    });
  }

  if (item.category === 'hamburguesas') {
    addIfMissing({
      id: 'paquete-hamburguesa',
      name: 'Hazla paquete: papas a la francesa + refresco',
      price: 35,
    });
  }

  return next;
}

function sanitizeItem(item: ManagedMenuItem, businessId: string): ManagedMenuItem {
  const clean: ManagedMenuItem = {
    ...item,
    restaurantId: businessId,
    name: item.name.trim(),
    description: item.description.trim(),
    imageUrls: Array.from(new Set((item.imageUrls || []).map((url) => url.trim()).filter(Boolean))),
    popular: !!item.popular,
    active: item.active !== false,
    available: item.available !== false,
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : 0,
    updatedAt: item.updatedAt || new Date().toISOString(),
    updatedBy: item.updatedBy || 'Administración',
  };

  const sizes = cleanArray(item.sizes?.map((size) => ({
    name: size.name.trim(),
    price: size.price == null ? null : Number(size.price),
  })).filter((size) => size.name));
  const options = cleanArray(item.options?.map((value) => value.trim()).filter(Boolean));
  const normalizedExtras = (item.extras || []).map((extra) => ({
    id: extra.id.trim(),
    name: extra.name.trim(),
    price: Number(extra.price) || 0,
  })).filter((extra) => extra.id && extra.name);
  const extras = cleanArray(enrichPackageExtras(item, normalizedExtras));
  const includedItems = cleanArray(item.includedItems?.map((value) => value.trim()).filter(Boolean));

  if (sizes) clean.sizes = sizes;
  else delete clean.sizes;
  if (options) clean.options = options;
  else delete clean.options;
  if (extras) clean.extras = extras;
  else delete clean.extras;
  if (includedItems) clean.includedItems = includedItems;
  else delete clean.includedItems;

  const primary = item.primaryImageUrl?.trim();
  if (primary && clean.imageUrls.includes(primary)) clean.primaryImageUrl = primary;
  else if (clean.imageUrls.length > 0) clean.primaryImageUrl = clean.imageUrls[0];
  else delete clean.primaryImageUrl;

  const validSizeNames = new Set((sizes || []).map((size) => size.name));
  const cleanedSizeImageUrls = Object.fromEntries(
    Object.entries(item.sizeImageUrls || {})
      .map(([name, url]) => [name.trim(), String(url || '').trim()] as const)
      .filter(([name, url]) => validSizeNames.has(name) && !!url)
  );
  if (Object.keys(cleanedSizeImageUrls).length > 0) clean.sizeImageUrls = cleanedSizeImageUrls;
  else delete clean.sizeImageUrls;

  const sourcePriceText = item.sourcePriceText?.trim();
  if (sourcePriceText) clean.sourcePriceText = sourcePriceText;
  else delete clean.sourcePriceText;

  const notes = item.notes?.trim();
  if (notes) clean.notes = notes;
  else delete clean.notes;

  if (!item.weekendOnly) delete clean.weekendOnly;

  return clean;
}

function sanitizeCatalog(items: ManagedMenuItem[], userName: string, businessId: string): MenuCatalogDocument {
  return {
    restaurantId: businessId,
    version: MENU_CATALOG_VERSION,
    sourceLabel: businessId === RESTAURANT_ID ? 'Menú completo original de Restaurante Calientito' : 'Catálogo del negocio',
    items: items.map((item) => sanitizeItem(item, businessId)).sort((a, b) => a.sortOrder - b.sortOrder),
    updatedAt: new Date().toISOString(),
    updatedBy: userName,
  };
}

function normalizeCatalog(data: MenuCatalogDocument, businessId: string): MenuCatalogDocument {
  return {
    ...data,
    restaurantId: businessId,
    items: Array.isArray(data.items)
      ? data.items
          .map((item) => sanitizeItem(item, businessId))
          .filter((item) => !PACKAGE_ONLY_ITEM_IDS.has(item.id))
      : [],
  };
}

function notifyCatalogSubscribers(businessId: string, catalog: MenuCatalogDocument | null) {
  catalogCacheByBusiness.set(businessId, catalog);
  catalogHasSnapshotByBusiness.set(businessId, true);
  const subs = catalogSubscribersByBusiness.get(businessId);
  if (subs) [...subs].forEach((subscriber) => subscriber.callback(catalog));
}

function ensureCatalogListener(businessId: string) {
  if (catalogUnsubscribeByBusiness.has(businessId)) return;

  const unsubscribe = onSnapshot(
    catalogRef(businessId),
    (snapshot) => {
      if (!snapshot.exists()) {
        notifyCatalogSubscribers(businessId, null);
        return;
      }
      notifyCatalogSubscribers(businessId, normalizeCatalog(snapshot.data() as MenuCatalogDocument, businessId));
    },
    (error) => {
      console.error('Error leyendo catálogo de menú:', error);
      const subs = catalogSubscribersByBusiness.get(businessId);
      if (subs) [...subs].forEach((subscriber) => subscriber.onError?.(error));
      catalogUnsubscribeByBusiness.delete(businessId);
    }
  );
  catalogUnsubscribeByBusiness.set(businessId, unsubscribe);
}

export function createMenuItemId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `${slug || 'platillo'}-${Date.now().toString(36)}`;
}

/**
 * Suscripción compartida al catálogo.
 * App, portada y cualquier otro consumidor reutilizan un único onSnapshot,
 * evitando listeners duplicados de Firestore.
 *
 * businessId es opcional: si no se indica, usa Calientito (comportamiento
 * actual, sin cambios).
 */
export function subscribeToMenuCatalog(
  callback: (catalog: MenuCatalogDocument | null) => void,
  onError?: (error: unknown) => void,
  businessId: string = RESTAURANT_ID
): () => void {
  const subscriber: CatalogSubscriber = { callback, onError };
  if (!catalogSubscribersByBusiness.has(businessId)) {
    catalogSubscribersByBusiness.set(businessId, new Set());
  }
  catalogSubscribersByBusiness.get(businessId)!.add(subscriber);

  if (catalogHasSnapshotByBusiness.get(businessId)) {
    callback(catalogCacheByBusiness.get(businessId) ?? null);
  }
  ensureCatalogListener(businessId);

  return () => {
    const subs = catalogSubscribersByBusiness.get(businessId);
    subs?.delete(subscriber);
    if (subs && subs.size === 0) {
      const unsubscribe = catalogUnsubscribeByBusiness.get(businessId);
      if (unsubscribe) {
        unsubscribe();
        catalogUnsubscribeByBusiness.delete(businessId);
      }
      catalogCacheByBusiness.delete(businessId);
      catalogHasSnapshotByBusiness.delete(businessId);
    }
  };
}

export async function initializeMenuCatalogFromOriginal(
  user: StaffUser,
  businessId: string = RESTAURANT_ID
): Promise<MenuCatalogDocument> {
  const now = new Date().toISOString();
  const originalItems: ManagedMenuItem[] = ORIGINAL_MENU_CATALOG.map((item, index) => sanitizeItem({
    ...item,
    restaurantId: businessId,
    sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index,
    updatedAt: now,
    updatedBy: user.name,
  }, businessId));

  const payload = sanitizeCatalog(originalItems, user.name, businessId);

  await runTransaction(db, async (tx) => {
    const ref = catalogRef(businessId);
    const current = await tx.get(ref);
    if (current.exists()) {
      throw new Error('El catálogo ya fue inicializado. No se sobrescribió ningún dato.');
    }
    tx.set(ref, payload);
  });

  return payload;
}

export async function saveMenuCatalog(
  items: ManagedMenuItem[],
  user: StaffUser,
  businessId: string = RESTAURANT_ID
): Promise<MenuCatalogDocument> {
  const payload = sanitizeCatalog(items, user.name, businessId);
  await setDoc(catalogRef(businessId), payload, { merge: false });
  return payload;
}

export async function upsertManagedMenuItem(
  item: ManagedMenuItem,
  user: StaffUser,
  businessId: string = RESTAURANT_ID
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = catalogRef(businessId);
    const current = await tx.get(ref);
    if (!current.exists()) {
      throw new Error('Primero carga el menú original para inicializar el catálogo.');
    }

    const data = current.data() as MenuCatalogDocument;
    const items = Array.isArray(data.items) ? data.items.map((it) => sanitizeItem(it, businessId)) : [];
    const nextItem = sanitizeItem({
      ...item,
      restaurantId: businessId,
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    }, businessId);
    const index = items.findIndex((candidate) => candidate.id === nextItem.id);
    if (index >= 0) items[index] = nextItem;
    else items.push(nextItem);

    tx.set(ref, sanitizeCatalog(items, user.name, businessId));
  });
}

export async function deleteManagedMenuItem(
  itemId: string,
  user: StaffUser,
  businessId: string = RESTAURANT_ID
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = catalogRef(businessId);
    const current = await tx.get(ref);
    if (!current.exists()) return;

    const data = current.data() as MenuCatalogDocument;
    const items = (Array.isArray(data.items) ? data.items : [])
      .map((it) => sanitizeItem(it, businessId))
      .filter((item) => item.id !== itemId);

    tx.set(ref, sanitizeCatalog(items, user.name, businessId));
  });
}
