import type { BusinessRole } from './restaurantCore';
import type { UserRole } from '../types';

/**
 * Los perfiles VIP contienen datos personales y sellos canjeables.
 * La vista administrativa debe coincidir con las reglas Firestore STAGED:
 * solo responsables de negocio activos (validados en la membresía).
 * La verificación del cliente NO reemplaza las reglas del servidor.
 */
export function canAdministerBusinessVip(role: BusinessRole | null | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';
}

/** Mantiene etiquetas de auditoría legadas sin atribuir falsamente el rol DUEÑA. */
export function legacyVipStaffRole(role: BusinessRole): UserRole {
  switch (role) {
    case 'OWNER': return 'DUEÑA';
    case 'ADMIN': case 'SUPER_ADMIN': return 'ADMINISTRADOR';
    case 'MANAGER': return 'ENCARGADO';
    case 'CASHIER': return 'CAJA';
    case 'WAITER': return 'MESERO';
    case 'KITCHEN': return 'COCINA';
    default: return 'EMPLEADO';
  }
}
