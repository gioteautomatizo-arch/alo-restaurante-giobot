import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { sanitizeFirestorePayload } from './firestoreService';
import { StaffUser } from '../types';

const RESTAURANT_ID = 'alo-restaurante' as const;
export const TABLE_PAYMENT_INTENTS_COLLECTION = 'table_payment_intents';

export type TablePaymentIntentStatus = 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO';

export interface TablePaymentIntent {
  id?: string;
  restaurantId: typeof RESTAURANT_ID;
  tableNumber: number;
  tableSessionId: string;
  accountId?: string;
  accountLabel?: string;
  method: 'TRANSFERENCIA';
  amount: number;
  receiptDataUrl: string;
  status: TablePaymentIntentStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedById?: string;
  reviewedByName?: string;
  rejectionReason?: string;
}

const VALID_TABLES = new Set([1, 2, 4, 5, 6, 7, 8, 9]);
const MAX_RECEIPT_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_DATA_URL_LENGTH = 480_000;

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

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * El comprobante se reduce antes de guardarlo. Así evitamos archivos enormes,
 * no exponemos un bucket público y el documento queda protegido por reglas de Firestore.
 */
export async function prepareTransferReceipt(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Sube una imagen JPG, PNG o WEBP del comprobante.');
  }
  if (file.size > MAX_RECEIPT_SOURCE_BYTES) {
    throw new Error('El comprobante original debe pesar máximo 8 MB.');
  }

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('No se pudo leer la imagen del comprobante.');

  let maxDimension = 1000;
  let quality = 0.72;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar el comprobante.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvasToDataUrl(canvas, quality);
    if (dataUrl.length <= MAX_RECEIPT_DATA_URL_LENGTH) return dataUrl;

    maxDimension = Math.round(maxDimension * 0.82);
    quality = Math.max(0.48, quality - 0.07);
  }

  throw new Error('La imagen sigue siendo demasiado grande. Intenta tomar una foto más ligera del comprobante.');
}

export async function createTransferPaymentIntent(input: {
  tableNumber: number;
  tableSessionId: string;
  accountId?: string;
  accountLabel?: string;
  amount: number;
  receiptDataUrl: string;
}): Promise<TablePaymentIntent> {
  if (!VALID_TABLES.has(input.tableNumber)) throw new Error('Mesa no válida.');
  if (!input.tableSessionId) throw new Error('No encontramos la sesión activa de la mesa.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('El total de la cuenta no es válido.');
  if (!input.receiptDataUrl.startsWith('data:image/')) throw new Error('Comprobante no válido.');
  if (input.receiptDataUrl.length > MAX_RECEIPT_DATA_URL_LENGTH) throw new Error('El comprobante es demasiado grande.');

  const payload: Omit<TablePaymentIntent, 'id'> = {
    restaurantId: RESTAURANT_ID,
    tableNumber: input.tableNumber,
    tableSessionId: input.tableSessionId,
    accountId: input.accountId,
    accountLabel: input.accountLabel,
    method: 'TRANSFERENCIA',
    amount: Number(input.amount),
    receiptDataUrl: input.receiptDataUrl,
    status: 'PENDIENTE',
    createdAt: new Date().toISOString(),
  };

  const ref = await addDoc(
    collection(db, TABLE_PAYMENT_INTENTS_COLLECTION),
    sanitizeFirestorePayload(payload)
  );
  return { ...payload, id: ref.id };
}

export function subscribeToPendingTransferIntents(
  callback: (intents: TablePaymentIntent[]) => void
): () => void {
  const q = query(
    collection(db, TABLE_PAYMENT_INTENTS_COLLECTION),
    where('restaurantId', '==', RESTAURANT_ID),
    where('status', '==', 'PENDIENTE')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const intents: TablePaymentIntent[] = [];
      snapshot.forEach((snap) => {
        intents.push({ id: snap.id, ...(snap.data() as Omit<TablePaymentIntent, 'id'>) });
      });
      intents.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      callback(intents);
    },
    (error) => {
      console.warn('[tablePaymentIntentsService] listener error:', error);
      callback([]);
    }
  );
}

export async function reviewTransferIntent(
  intentId: string,
  status: 'CONFIRMADO' | 'RECHAZADO',
  user: Pick<StaffUser, 'id' | 'name'>,
  rejectionReason?: string
): Promise<void> {
  if (!intentId) return;
  await updateDoc(
    doc(db, TABLE_PAYMENT_INTENTS_COLLECTION, intentId),
    sanitizeFirestorePayload({
      status,
      reviewedAt: new Date().toISOString(),
      reviewedById: user.id,
      reviewedByName: user.name,
      rejectionReason: status === 'RECHAZADO' ? String(rejectionReason || '').trim() : undefined,
    })
  );
}
