import { doc, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { RestaurantTenant } from './restaurantCore';

// Ausente y [] son estados distintos: un negocio puede desactivar TODOS los módulos.
function sameCapabilities(expected: unknown, current: unknown): boolean {
  if (expected === undefined || current === undefined) return expected === current;
  return Array.isArray(expected) && Array.isArray(current)
    && expected.length === current.length
    && expected.every((value, index) => value === current[index]);
}

/**
 * Guardado CAS de módulos. Dos pestañas no pueden restaurar capacidades antiguas.
 * La regla Firestore del servidor sigue autorizando únicamente OWNER/SUPER_ADMIN.
 * No se escribe branding, permisos ni ningún otro campo de la raíz.
 */
export async function saveBusinessCapabilities(
  observed: RestaurantTenant,
  nextCapabilities: string[]
): Promise<void> {
  const uid = auth.currentUser?.uid;
  const businessId = observed?.restaurantId;
  if (!uid || !businessId || !Array.isArray(nextCapabilities)
      || nextCapabilities.some(value => typeof value !== 'string' || !value.trim())
      || new Set(nextCapabilities).size !== nextCapabilities.length) {
    throw new Error('La sesión o lista de módulos no es válida. Vuelve a abrir el panel.');
  }
  const rootRef = doc(db, 'businesses', businessId);
  await runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== uid) {
      throw new Error('La sesión cambió antes de guardar los módulos.');
    }
    const snapshot = await transaction.get(rootRef);
    if (auth.currentUser?.uid !== uid) {
      throw new Error('La sesión cambió durante la lectura de módulos.');
    }
    const current = snapshot.exists() ? snapshot.data() : null;
    if (!current || current.restaurantId !== businessId
        || current.ownerUserId !== observed.ownerUserId
        || current.businessType !== observed.businessType
        || !sameCapabilities(observed.capabilities, current.capabilities)) {
      throw new Error('CONFLICTO_MODULOS: Los módulos cambiaron en otra sesión. Vuelve a abrir el negocio para actualizar.');
    }
    if (auth.currentUser?.uid !== uid) {
      throw new Error('La sesión cambió antes de escribir los módulos.');
    }
    transaction.update(rootRef, { capabilities: [...nextCapabilities] });
  });
}
