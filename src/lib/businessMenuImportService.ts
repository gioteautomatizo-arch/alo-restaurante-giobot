import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * Borrador de "Sube tu menú".
 *
 * Guarda la foto original y la lista de productos que el dueño va capturando,
 * para que no se pierda al salir de la pantalla. El borrador vive junto al
 * catálogo del negocio (businesses/{id}/catalog/menu_import_draft) para usar las
 * mismas reglas de seguridad: solo miembros activos del negocio pueden escribir.
 * No se publica nada al menú del cliente hasta que el dueño pulsa "Publicar".
 */

export interface MenuImportDraftItem {
  id: string;
  name: string;
  category: string;
  /** Texto tal como lo escribe el dueño ("65", "65.50"). Se convierte al publicar. */
  price: string;
  description: string;
}

export interface MenuImportDraft {
  businessId: string;
  sourceImageUrl: string;
  items: MenuImportDraftItem[];
  updatedAt: string;
  updatedBy: string;
}

const DRAFT_DOC_ID = 'menu_import_draft';

function draftRef(businessId: string) {
  return doc(db, 'businesses', businessId, 'catalog', DRAFT_DOC_ID);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function getMenuImportDraft(businessId: string): Promise<MenuImportDraft | null> {
  const snap = await getDoc(draftRef(businessId));
  if (!snap.exists()) return null;

  const data = snap.data() as Partial<MenuImportDraft>;
  const rawItems = Array.isArray(data.items) ? data.items : [];

  return {
    businessId,
    sourceImageUrl: text(data.sourceImageUrl),
    items: rawItems.map((item, index) => ({
      id: text(item?.id) || `draft-${index + 1}`,
      name: text(item?.name),
      category: text(item?.category),
      price: text(item?.price),
      description: text(item?.description),
    })),
    updatedAt: text(data.updatedAt),
    updatedBy: text(data.updatedBy),
  };
}

export async function saveMenuImportDraft(
  businessId: string,
  input: { sourceImageUrl: string; items: MenuImportDraftItem[] },
  actorName: string,
): Promise<MenuImportDraft> {
  if (!auth.currentUser) throw new Error('Debes iniciar sesión para guardar el borrador.');

  const payload: MenuImportDraft = {
    businessId,
    sourceImageUrl: input.sourceImageUrl || '',
    items: input.items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      description: item.description,
    })),
    updatedAt: new Date().toISOString(),
    updatedBy: actorName,
  };

  await setDoc(draftRef(businessId), payload);
  return payload;
}

export async function clearMenuImportDraft(businessId: string): Promise<void> {
  await deleteDoc(draftRef(businessId));
}
