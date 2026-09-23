import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface BusinessCatalogItem {
  id: string;
  name: string;
  description: string;
  price: number | null;
  imageUrl?: string;
  category: string;
  available: boolean;
  popular?: boolean;
  sortOrder: number;
}

export interface BusinessCatalogDocument {
  businessId: string;
  sourceLabel: string;
  items: BusinessCatalogItem[];
  updatedAt: string;
  updatedBy: string;
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
  return `${slug || 'producto'}-${Date.now().toString(36)}`;
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

export async function saveBusinessCatalog(
  businessId: string,
  items: BusinessCatalogItem[],
  actorName: string
): Promise<BusinessCatalogDocument> {
  const payload: BusinessCatalogDocument = {
    businessId,
    sourceLabel: 'Catálogo del negocio',
    items: items.sort((a, b) => a.sortOrder - b.sortOrder),
    updatedAt: new Date().toISOString(),
    updatedBy: actorName,
  };
  await setDoc(catalogRef(businessId), payload, { merge: false });
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
