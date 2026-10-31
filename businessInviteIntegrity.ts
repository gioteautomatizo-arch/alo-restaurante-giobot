/**
 * Validación pura de invitaciones del MVP multinegocio.
 * Los documentos de business_invites se escriben con timestamps numéricos (ms).
 * Una fecha ausente, textual, no finita o extendida no debe convertir el token
 * en una invitación sin caducidad. No consulta Firebase ni cambia datos.
 */
export const INVITE_EXPIRES_IN_MS = 72 * 60 * 60 * 1000;

export function hasValidInviterId(value: unknown): value is string {
  return typeof value === 'string' && /^[^/]{1,128}$/.test(value);
}

export function isPendingInviteWithinWindow(
  invite: Record<string, unknown> | undefined,
  now: number,
): boolean {
  if (!invite || invite.status !== 'PENDING') return false;
  const { createdAt, expiresAt } = invite;
  return typeof createdAt === 'number' && Number.isSafeInteger(createdAt) && createdAt > 0
    && typeof expiresAt === 'number' && Number.isSafeInteger(expiresAt)
    && expiresAt > now && expiresAt > createdAt
    && expiresAt - createdAt <= INVITE_EXPIRES_IN_MS;
}
