import { auth } from './firebase';
import type { BusinessRole } from './restaurantCore';

export const BUSINESS_INVITES_ENABLED = import.meta.env.VITE_BUSINESS_INVITES === 'true';
export type InviteRole = Extract<BusinessRole, 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'EMPLOYEE'>;
export interface InvitePreview { businessName: string; role: InviteRole; emailHint: string; expiresAt: number; }

async function request<T>(endpoint: string, method: 'POST', body: Record<string, unknown>, authenticated = false): Promise<T> {
  if (!BUSINESS_INVITES_ENABLED) throw new Error('Las invitaciones todavía no están activadas.');
  const user = auth.currentUser;
  if (authenticated && !user) throw new Error('Inicia sesión para continuar.');
  const bearer = authenticated ? await user!.getIdToken() : null;
  const response = await fetch(endpoint, {
    method, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({})) as T & { error?: string };
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
