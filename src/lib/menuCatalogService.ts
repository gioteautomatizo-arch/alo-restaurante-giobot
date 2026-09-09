import { doc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { CategoryId, StaffUser } from '../types';
import { ORIGINAL_MENU_CATALOG } from '../data/originalMenuCatalog';

export const MENU_CATALOG_DOC_PATH = ['daily_menu', 'menu_catalog'] as const;
export const MENU_CATALOG_VERSION = 1;
export const RESTAURANT_ID = 'alo-restaurante';

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
  restaurantId: typeof RESTAURANT_ID;
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
  restaurantId: typeof RESTAURANT_ID;
  version: number;
  sourceLabel: string;
  items: ManagedMenuItem[];
  updatedAt: string;
  updatedBy: string;
}

const catalogRef = () => doc(db, MENU_CATALOG_DOC_PATH[0], MENU_CATALOG_DOC_PATH[1]);

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

function sanitizeItem(item: ManagedMenuItem): ManagedMenuItem {
  const clean: ManagedMenuItem = {
    ...item,
    restaurantId: RESTAURANT_ID,
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

  const sourcePriceText = item.sourcePriceText?.trim();
  if (sourcePriceText) clean.sourcePriceText = sourcePriceText;
  else delete clean.sourcePriceText;

  const notes = item.notes?.trim();
  if (notes) clean.notes = notes;
  else delete clean.notes;

  if (!item.weekendOnly) delete clean.weekendOnly;

  return clean;
}

function hasRealCloudinaryPhoto(item: ManagedMenuItem): boolean {
  return [item.primaryImageUrl, ...(item.imageUrls || [])]
    .some((url) => !!url && url.startsWith('https://res.cloudinary.com/'));
}

function sortItemsForPresentation(items: ManagedMenuItem[]): ManagedMenuItem[] {
  return [...items].sort((a, b) => {
    if (a.popular !== b.popular) return a.popular ? -1 : 1;

    const aHasRealPhoto = hasRealCloudinaryPhoto(a);
    const bHasRealPhoto = hasRealCloudinaryPhoto(b);
    if (aHasRealPhoto !== bHasRealPhoto) return aHasRealPhoto ? -1 : 1;

    return a.sortOrder - b.sortOrder;
  });
}

function sanitizeCatalog(items: ManagedMenuItem[], userName: string): MenuCatalogDocument {
  return {
    restaurantId: RESTAURANT_ID,
    version: MENU_CATALOG_VERSION,
    sourceLabel: 'Menú completo original de Restaurante Calientito',
    items: items.map(sanitizeItem).sort((a, b) => a.sortOrder - b.sortOrder),
    updatedAt: new Date().toISOString(),
    updatedBy: userName,
  };
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

export function subscribeToMenuCatalog(
  callback: (catalog: MenuCatalogDocument | null) => void,
  onError?: (error: unknown) => void
): () => void {
  return onSnapshot(
    catalogRef(),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      const data = snapshot.data() as MenuCatalogDocument;
      const sanitizedItems = Array.isArray(data.items)
        ? data.items
            .map(sanitizeItem)
            .filter((item) => !PACKAGE_ONLY_ITEM_IDS.has(item.id))
        : [];

      callback({
        ...data,
        restaurantId: RESTAURANT_ID,
        items: sortItemsForPresentation(sanitizedItems),
      });
    },
    (error) => {
      console.error('Error leyendo catálogo de menú:', error);
      if (onError) onError(error);
    }
  );
}

export async function initializeMenuCatalogFromOriginal(user: StaffUser): Promise<MenuCatalogDocument> {
  const now = new Date().toISOString();
  const originalItems: ManagedMenuItem[] = ORIGINAL_MENU_CATALOG.map((item, index) => sanitizeItem({
    ...item,
    restaurantId: RESTAURANT_ID,
    sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index,
    updatedAt: now,
    updatedBy: user.name,
  }));

  const payload = sanitizeCatalog(originalItems, user.name);

  await runTransaction(db, async (tx) => {
    const ref = catalogRef();
    const current = await tx.get(ref);
    if (current.exists()) {
      throw new Error('El catálogo ya fue inicializado. No se sobrescribió ningún dato.');
    }
    tx.set(ref, payload);
  });

  return payload;
}

export async function saveMenuCatalog(items: ManagedMenuItem[], user: StaffUser): Promise<MenuCatalogDocument> {
  const payload = sanitizeCatalog(items, user.name);
  await setDoc(catalogRef(), payload, { merge: false });
  return payload;
}

export async function upsertManagedMenuItem(
  item: ManagedMenuItem,
  user: StaffUser
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = catalogRef();
    const current = await tx.get(ref);
    if (!current.exists()) {
      throw new Error('Primero carga el menú original para inicializar el catálogo.');
    }

    const data = current.data() as MenuCatalogDocument;
    const items = Array.isArray(data.items) ? data.items.map(sanitizeItem) : [];
    const nextItem = sanitizeItem({
      ...item,
      restaurantId: RESTAURANT_ID,
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    });
    const index = items.findIndex((candidate) => candidate.id === nextItem.id);
    if (index >= 0) items[index] = nextItem;
    else items.push(nextItem);

    tx.set(ref, sanitizeCatalog(items, user.name));
  });
}

export async function deleteManagedMenuItem(itemId: string, user: StaffUser): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = catalogRef();
    const current = await tx.get(ref);
    if (!current.exists()) return;

    const data = current.data() as MenuCatalogDocument;
    const items = (Array.isArray(data.items) ? data.items : [])
      .map(sanitizeItem)
      .filter((item) => item.id !== itemId);

    tx.set(ref, sanitizeCatalog(items, user.name));
  });
}
