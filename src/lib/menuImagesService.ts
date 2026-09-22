const CLOUDINARY_CLOUD_NAME = 'n7ny3y9l';
const CLOUDINARY_UPLOAD_PRESET = 'calientito_menu';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1280;
const WEBP_QUALITY = 0.8;
const UPLOAD_TIMEOUT_MS = 30000;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

/**
 * Reduce las fotos en el navegador antes de enviarlas a la nube.
 * El archivo original nunca se guarda dentro de la app ni en Firestore.
 */
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

function optimizedDeliveryUrl(secureUrl: string): string {
  if (!secureUrl.includes('/image/upload/')) return secureUrl;
  return secureUrl.replace(
    '/image/upload/',
    '/image/upload/f_auto,q_auto:good,c_limit,w_1280/'
  );
}

async function uploadToCloudinary(file: File): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null) as any;

    if (!response.ok) {
      const cloudinaryMessage = payload?.error?.message;
      throw new Error(cloudinaryMessage || `Cloudinary rechazó la foto (${response.status}).`);
    }

    if (!payload?.secure_url || typeof payload.secure_url !== 'string') {
      throw new Error('Cloudinary no devolvió una URL válida para la foto.');
    }

    return optimizedDeliveryUrl(payload.secure_url);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('La subida tardó demasiado. Revisa tu conexión e intenta otra vez.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function uploadMenuImage(itemId: string, file: File): Promise<string> {
  // itemId se conserva en la firma pública para no romper el gestor actual.
  // Cloudinary organiza físicamente las fotos mediante el asset folder del preset.
  void itemId;

  const optimizedFile = await optimizeMenuImage(file);
  return uploadToCloudinary(optimizedFile);
}

/**
 * En Cloudinary unsigned no exponemos API Secret en el navegador.
 * Por seguridad, al eliminar una foto desde el gestor quitamos su URL del catálogo.
 * El borrado físico permanente puede añadirse después mediante una función backend firmada.
 */
export async function deleteMenuImageByUrl(url: string): Promise<void> {
  if (!url) return;
  return;
}

/**
 * Sube el logo de un negocio a Cloudinary, reutilizando la misma
 * optimización y subida que ya se usa para las fotos del menú.
 */
export async function uploadBusinessLogo(businessId: string, file: File): Promise<string> {
  const optimizedFile = await optimizeMenuImage(file);
  return uploadToCloudinary(optimizedFile);
}
