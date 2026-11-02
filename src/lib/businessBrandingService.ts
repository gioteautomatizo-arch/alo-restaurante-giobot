import { doc, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { RestaurantBranding, RestaurantTenant } from './restaurantCore';

// Branding contiene campos escalares. Comparar TODAS las claves observadas,
// incluidos VIP y campos desconocidos del legado: un formulario viejo no debe
// borrar ajustes hechos desde otra pestaña. Ausente y undefined son equivalentes.
function sameBranding(
  expected: RestaurantBranding,
  current: unknown
): boolean {
  if (!current || typeof current !== 'object' || Array.isArray(current)) return false;
  const before = expected as unknown as Record<string, unknown>;
  const after = current as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].every(key => {
    const a = before[key];
    const b = after[key];
    return (a === undefined && b === undefined)
      || (a !== null && b !== null && typeof a !== 'object' && typeof b !== 'object' && Object.is(a, b));
  });
}

/**
 * Guardado CAS de identidad privada. La lectura y actualización de la raíz
 * ocurren en la MISMA transacción: Firestore reintenta si otra pestaña cambia
 * el documento. Las reglas del servidor siguen decidiendo el permiso OWNER.
 * Nunca se escriben otros campos de la raíz ni se sobrescribe un VIP reciente.
 */
export async function saveBusinessBranding(
  observed: RestaurantTenant,
  nextBranding: RestaurantBranding
): Promise<void> {
  const uid = auth.currentUser?.uid;
  const businessId = observed?.restaurantId;
  if (!uid || !businessId || !observed.branding
      || typeof observed.branding.publicSlug !== 'string'
      || observed.branding.publicSlug !== nextBranding.publicSlug) {
    throw new Error('La sesión o identidad del negocio no es válida. Vuelve a abrir el panel.');
  }

  const rootRef = doc(db, 'businesses', businessId);
  await runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== uid) {
      throw new Error('La sesión cambió antes de guardar la identidad.');
    }
    const rootSnap = await transaction.get(rootRef);
    if (auth.currentUser?.uid !== uid) {
      throw new Error('La sesión cambió durante la lectura de identidad.');
    }
    const current = rootSnap.exists() ? rootSnap.data() : null;
    if (!current || current.restaurantId !== businessId
        || current.ownerUserId !== observed.ownerUserId
        || current.businessType !== observed.businessType
        || !sameBranding(observed.branding, current.branding)) {
      throw new Error('CONFLICTO_IDENTIDAD: El negocio cambió en otra sesión. Regresa al panel y vuelve a abrir la identidad antes de guardar.');
    }
    if (auth.currentUser?.uid !== uid) {
      throw new Error('La sesión cambió antes de escribir la identidad.');
    }
    transaction.update(rootRef, { branding: nextBranding });
  });
}
