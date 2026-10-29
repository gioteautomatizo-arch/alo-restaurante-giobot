import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import { assertCatalogManager } from './businessCatalogService';

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
  /** Versión opaca para evitar sobrescrituras de otra pestaña. */
  revision: string;
}

const DRAFT_DOC_ID = 'menu_import_draft';
const LEGACY_NO_VERSION = '__legacy_no_version__';

function storedVersion(data: Record<string, unknown>): string {
  return (typeof data.revision === 'string' && data.revision)
    || (typeof data.updatedAt === 'string' && data.updatedAt)
    || LEGACY_NO_VERSION;
}

function conflict(): Error {
  return new Error('CONFLICTO_BORRADOR: Otra pestaña modificó tu borrador. Copia tus cambios antes de recargar para no perderlos.');
}

function draftRef(businessId: string) {
  if (!businessId || businessId.trim() !== businessId || businessId.includes('/')) {
    throw new Error('La identidad del negocio es inválida para el borrador.');
  }
  return doc(db, 'businesses', businessId, 'catalog', DRAFT_DOC_ID);
}

function assertDraftSession(uid: string): void {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('La sesión cambió durante la operación del borrador. Vuelve a iniciar sesión.');
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function getMenuImportDraft(businessId: string): Promise<MenuImportDraft | null> {
  const ref = draftRef(businessId);
  const uid = await assertCatalogManager(businessId);
  assertDraftSession(uid);
  const snap = await getDoc(ref);
  assertDraftSession(uid);
  if (!snap.exists()) return null;

  const data = snap.data() as Partial<MenuImportDraft>;
  if (data.businessId !== businessId || !Array.isArray(data.items)) {
    throw new Error('El borrador del negocio contiene datos inconsistentes. No se puede editar sin revisarlo.');
  }
  const rawItems = data.items;

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
    revision: storedVersion(data as Record<string, unknown>),
  };
}

export async function saveMenuImportDraft(
  businessId: string,
  input: { sourceImageUrl: string; items: MenuImportDraftItem[] },
  actorName: string,
  expectedRevision: string | null,
): Promise<MenuImportDraft> {
  const ref = draftRef(businessId);
  if (expectedRevision === undefined) throw new Error('Se requiere la versión del borrador para guardarlo.');
  const uid = await assertCatalogManager(businessId);
  assertDraftSession(uid);

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
    revision: new Date().toISOString() + '-' + Math.random().toString(36).slice(2),
  };

  await runTransaction(db, async transaction => {
    assertDraftSession(uid);
    const existing = await transaction.get(ref);
    assertDraftSession(uid);
    if (existing.exists() && existing.data().businessId !== businessId) {
      throw new Error('El borrador del negocio contiene datos inconsistentes. No se puede modificar sin revisarlo.');
    }
    const current = existing.exists() ? storedVersion(existing.data() as Record<string, unknown>) : null;
    if (current !== expectedRevision) throw conflict();
    transaction.set(ref, payload);
  });
  return payload;
}

export async function clearMenuImportDraft(businessId: string, expectedRevision: string | null): Promise<void> {
  const ref = draftRef(businessId);
  if (expectedRevision === undefined) throw new Error('Se requiere la versión del borrador para borrarlo.');
  const uid = await assertCatalogManager(businessId);
  assertDraftSession(uid);
  await runTransaction(db, async transaction => {
    assertDraftSession(uid);
    const existing = await transaction.get(ref);
    assertDraftSession(uid);
    if (existing.exists() && existing.data().businessId !== businessId) {
      throw new Error('El borrador del negocio contiene datos inconsistentes. No se puede modificar sin revisarlo.');
    }
    const current = existing.exists() ? storedVersion(existing.data() as Record<string, unknown>) : null;
    if (current !== expectedRevision) throw conflict();
    if (existing.exists()) transaction.delete(ref);
  });
}
