import { auth } from './firebase';
import type { BusinessRole } from './restaurantCore';
import { INVITE_LIST_MAX_PAGES, isValidInviteCursor } from '../../businessInvitePagination';

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

export async function createBusinessInvite(businessId: string, name: string, email: string, role: InviteRole) {
  const value: unknown = await request<unknown>('/api/business-invites', 'POST',
    { businessId, name, email, role }, true);
  if (!isRecord(value) || typeof value.token !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.token) ||
      !isMillis(value.expiresAt) || value.expiresAt <= Date.now()) invalidResponse();
  return { token: value.token as string, expiresAt: value.expiresAt as number };
}
export async function previewBusinessInvite(token: string) {
  const value: unknown = await request<unknown>('/api/business-invites/preview', 'POST', { token });
  return assertInvitePreview(value);
}
export async function acceptBusinessInvite(token: string) {
  const value: unknown = await request<unknown>('/api/business-invites/accept', 'POST', { token }, true);
  if (!isRecord(value) || typeof value.businessId !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value.businessId)) invalidResponse();
  return { businessId: value.businessId as string };
}

export interface PendingBusinessInvite {
  id: string; name: string; email: string; role: InviteRole;
  status: string; createdAt: number; expiresAt: number;
}

// El JSON de un endpoint no es una garantía de tipos: nunca entregar objetos
// malformados a React ni aceptar una confirmación sin identidad verificable.
const INVITE_ROLES: readonly string[] = ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE'];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isInviteRole = (value: unknown): value is InviteRole =>
  typeof value === 'string' && INVITE_ROLES.includes(value);
const isSafeText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isMillis = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const invalidResponse = (): never => {
  throw new Error('El servicio de invitaciones devolvió datos inválidos. Reintenta.');
};
function assertInvitePreview(value: unknown): InvitePreview {
  if (!isRecord(value) || !isSafeText(value.businessName, 200) ||
      !isInviteRole(value.role) || !isSafeText(value.emailHint, 254) ||
      !isMillis(value.expiresAt) || value.expiresAt <= Date.now()) invalidResponse();
  return value as unknown as InvitePreview;
}
function assertInviteRow(value: unknown): PendingBusinessInvite {
  if (!isRecord(value) || !isValidInviteCursor(value.id) ||
      !isSafeText(value.name, 200) || !isSafeText(value.email, 254) ||
      !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value.email) ||
      !isInviteRole(value.role) || value.status !== 'PENDING' ||
      !isMillis(value.createdAt) || !isMillis(value.expiresAt) ||
      value.expiresAt <= value.createdAt) invalidResponse();
  return value as unknown as PendingBusinessInvite;
}
export async function listBusinessInvites(businessId: string): Promise<PendingBusinessInvite[]> {
  if (!BUSINESS_INVITES_ENABLED) return [];
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión.');
  const requesterUid = user.uid;
  const token = await user.getIdToken();
  assertInviteSession(requesterUid);
  const collected: PendingBusinessInvite[] = [];
  const seenCursors = new Set<string>();
  const seenIds = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < INVITE_LIST_MAX_PAGES; page++) {
    assertInviteSession(requesterUid);
    const endpoint = '/api/business-invites?businessId=' + encodeURIComponent(businessId)
      + '&pagination=1' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const response = await fetch(endpoint, {
      cache: 'no-store', headers: { Authorization: 'Bearer ' + token },
    });
    assertInviteSession(requesterUid);
    const payload = await response.json().catch(() => ({})) as {
      invites?: PendingBusinessInvite[]; nextCursor?: string | null; error?: string;
    };
    assertInviteSession(requesterUid);
    if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar las invitaciones.');
    if (!Array.isArray(payload.invites) || payload.invites.length > 150 ||
        !Object.prototype.hasOwnProperty.call(payload, 'nextCursor') ||
        (payload.nextCursor !== null && !isValidInviteCursor(payload.nextCursor))) {
      throw new Error('El servicio de invitaciones devolvió una página inválida. Reintenta.');
    }
    for (const rawInvite of payload.invites) {
      const invite = assertInviteRow(rawInvite);
      if (seenIds.has(invite.id)) {
        throw new Error('El historial de invitaciones cambió durante la lectura. Reintenta.');
      }
      seenIds.add(invite.id);
      collected.push(invite);
    }
    if (payload.nextCursor === null) {
      assertInviteSession(requesterUid);
      return collected.sort((a, b) => b.createdAt - a.createdAt);
    }
    if (seenCursors.has(payload.nextCursor!)) {
      throw new Error('El historial de invitaciones cambió durante la lectura. Reintenta.');
    }
    seenCursors.add(payload.nextCursor!);
    cursor = payload.nextCursor!;
  }
  throw new Error('El historial de invitaciones supera el límite seguro de lectura. Solicita revisión antes de continuar.');
}
export async function revokeBusinessInvite(businessId: string, inviteId: string) {
  const value: unknown = await request<unknown>('/api/business-invites/revoke', 'POST', { businessId, inviteId }, true);
  if (!isRecord(value) || value.revoked !== true) invalidResponse();
  return { revoked: true };
}
