import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from './firebase';
import { RESTAURANT_ID } from './menuCatalogService';

const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1280;
const WEBP_QUALITY = 0.8;
const UPLOAD_TIMEOUT_MS = 30000;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return 'Cada foto original debe pesar máximo 12 MB.';
  return null;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  try {
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('No se pudo optimizar la imagen.')),
      type,
      quality
    );
  });
}

export async function optimizeMenuImage(file: File): Promise<File> {
  const validationError = validateMenuImage(file);
  if (validationError) throw new Error(validationError);

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('No se pudieron leer las dimensiones de la imagen.');
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('No se pudo preparar la imagen para subirla.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  let blob: Blob;
  try {
    blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
  } catch {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
  }

  if (blob.size >= file.size && scale === 1 && file.type !== 'image/png') {
    return file;
  }

  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto-menu';
  return new File([blob], `${baseName}.${extension}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

function uploadWithTimeout(
  objectRef: ReturnType<typeof ref>,
  file: File,
  metadata: Parameters<typeof uploadBytesResumable>[2]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(objectRef, file, metadata);
    const timeout = window.setTimeout(() => {
      try { task.cancel(); } catch {}
      reject(new Error('La subida tardó demasiado. Revisa Firebase Storage, permisos o conexión e intenta otra vez.'));
    }, UPLOAD_TIMEOUT_MS);

    task.on(
      'state_changed',
      () => {},
      (error: any) => {
        window.clearTimeout(timeout);
        if (error?.code === 'storage/canceled') {
          reject(new Error('La subida fue cancelada porque excedió el tiempo máximo.'));
          return;
        }
        if (error?.code === 'storage/unauthorized') {
          reject(new Error('Firebase Storage rechazó la subida. Revisa las reglas de Storage para usuarios administradores.'));
          return;
        }
        if (error?.code === 'storage/bucket-not-found') {
          reject(new Error('No se encontró el bucket de Firebase Storage. Hay que habilitar Storage en el proyecto Firebase.'));
          return;
        }
        reject(error);
      },
      () => {
        window.clearTimeout(timeout);
        resolve();
      }
    );
  });
}

export async function uploadMenuImage(itemId: string, file: File): Promise<string> {
  const optimizedFile = await optimizeMenuImage(file);

  const itemKey = sanitizePathPart(itemId);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const extension = optimizedFile.type === 'image/webp' ? 'webp' : optimizedFile.type === 'image/png' ? 'png' : 'jpg';
  const objectRef = ref(
    storage,
    `restaurants/${RESTAURANT_ID}/menu/${itemKey}/${unique}.${extension}`
  );

  await uploadWithTimeout(objectRef, optimizedFile, {
    contentType: optimizedFile.type,
    cacheControl: 'public,max-age=31536000,immutable',
    customMetadata: {
      restaurantId: RESTAURANT_ID,
      menuItemId: itemId,
      optimized: 'true',
      sourceBytes: String(file.size),
      uploadedBytes: String(optimizedFile.size),
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
    if (error?.code === 'storage/object-not-found') return;
    throw error;
  }
}
