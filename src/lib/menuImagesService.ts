import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import { RESTAURANT_ID } from './menuCatalogService';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function safeExtension(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function sanitizePathPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

export function validateMenuImage(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return 'Usa una imagen JPG, PNG o WEBP.';
  if (file.size > MAX_IMAGE_BYTES) return 'Cada foto debe pesar máximo 8 MB.';
  return null;
}

export async function uploadMenuImage(itemId: string, file: File): Promise<string> {
  const validationError = validateMenuImage(file);
  if (validationError) throw new Error(validationError);

  const itemKey = sanitizePathPart(itemId);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const objectRef = ref(
    storage,
    `restaurants/${RESTAURANT_ID}/menu/${itemKey}/${unique}.${safeExtension(file)}`
  );

  await uploadBytes(objectRef, file, {
    contentType: file.type,
    customMetadata: {
      restaurantId: RESTAURANT_ID,
      menuItemId: itemId,
    },
  });

  return getDownloadURL(objectRef);
}

export async function deleteMenuImageByUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    const objectRef = ref(storage, url);
    await deleteObject(objectRef);
  } catch (error: any) {
    // Si ya no existe, permitimos que el catálogo quite la referencia igualmente.
    if (error?.code === 'storage/object-not-found') return;
    throw error;
  }
}
