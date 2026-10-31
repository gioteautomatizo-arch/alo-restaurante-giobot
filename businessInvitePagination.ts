/** Cursor sin datos privados: IDs de documentos de invitación, nunca tokens. */
export const INVITE_LIST_PAGE_SIZE = 150;
export const INVITE_LIST_MAX_PAGES = 50;

export function isValidInviteCursor(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function nextInviteCursor(documentIds: readonly string[]): string | null {
  if (documentIds.length < INVITE_LIST_PAGE_SIZE) return null;
  if (documentIds.length !== INVITE_LIST_PAGE_SIZE) throw new Error('Página de invitaciones demasiado grande.');
  const last = documentIds[documentIds.length - 1];
  if (!isValidInviteCursor(last)) throw new Error('Cursor de invitaciones no válido.');
  return last;
}
