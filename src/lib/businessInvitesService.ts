import { auth } from './firebase';
import type { BusinessRole } from './restaurantCore';

export const BUSINESS_INVITES_ENABLED = import.meta.env.VITE_BUSINESS_INVITES === 'true';
export type InviteRole = Extract<BusinessRole, 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'EMPLOYEE'>;
export interface InvitePreview { businessName: string; role: InviteRole; emailHint: string; expiresAt: number; }

// El token y la respuesta pueden llegar después de cambiar de cuenta.
// Nunca entregar al nuevo UID enlaces, listados o confirmaciones del anterior.
function assertInviteSession(uid: string): void {
  if (!uid || auth.currentUser?.uid !== uid) {
    throw new Error('La sesión cambió durante las invitaciones. Comprueba el estado del negocio antes de reintentar.');
  }
}

async function request<T>(endpoint: string, method: 'POST', body: Record<string, unknown>, authenticated = false): Promise<T> {
  if (!BUSINESS_INVITES_ENABLED) throw new Error('Las invitaciones todavía no están activadas.');
  const user = authenticated ? auth.currentUser : null;
  if (authenticated && !user) throw new Error('Inicia sesión para continuar.');
  const requesterUid = user?.uid;
  const bearer = authenticated ? await user!.getIdToken() : null;
  if (authenticated) assertInviteSession(requesterUid!);
  const response = await fetch(endpoint, {
    method, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
    body: JSON.stringify(body),
  });
  if (authenticated) assertInviteSession(requesterUid!);
  const json = await response.json().catch(() => ({})) as T & { error?: string };
  if (authenticated) assertInviteSession(requesterUid!);
  if (!response.ok) throw new Error(json.error || 'No pudimos completar la invitación.');
  return json;
}

export function createBusinessInvite(businessId: string, name: string, email: string, role: InviteRole) {
  return request<{ token: string; expiresAt: number }>('/api/business-invites', 'POST',
    { businessId, name, email, role }, true);
}
export function previewBusinessInvite(token: string) {
  return request<InvitePreview>('/api/business-invites/preview', 'POST', { token });
}
export function acceptBusinessInvite(token: string) {
  return request<{ businessId: string }>('/api/business-invites/accept', 'POST', { token }, true);
}

export interface PendingBusinessInvite {
  id: string; name: string; email: string; role: InviteRole;
  status: string; createdAt: number; expiresAt: number;
}
export async function listBusinessInvites(businessId: string): Promise<PendingBusinessInvite[]> {
  if (!BUSINESS_INVITES_ENABLED) return [];
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión.');
  const requesterUid = user.uid;
  const token = await user.getIdToken();
  assertInviteSession(requesterUid);
  const response = await fetch('/api/business-invites?businessId=' + encodeURIComponent(businessId), {
    cache: 'no-store', headers: { Authorization: 'Bearer ' + token },
  });
  assertInviteSession(requesterUid);
  const payload = await response.json().catch(() => ({})) as { invites?: PendingBusinessInvite[]; error?: string };
  assertInviteSession(requesterUid);
  if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar las invitaciones.');
  if (!Array.isArray(payload.invites)) {
    throw new Error('El servicio de invitaciones devolvió una lista inválida. Reintenta.');
  }
  return payload.invites;
}
export function revokeBusinessInvite(businessId: string, inviteId: string) {
  return request<{ revoked: boolean }>('/api/business-invites/revoke', 'POST', { businessId, inviteId }, true);
}
