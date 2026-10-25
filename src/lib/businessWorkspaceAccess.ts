/** Comprobaciones puras de identidad para impedir usar un espacio de otro tenant. */
export interface ResolvedWorkspaceFor {
  businessId: string;
  userId: string;
}

export function isWorkspaceAccessLoaded(
  businessId: string,
  authReady: boolean,
  userId: string | null,
  resolvedFor: ResolvedWorkspaceFor | null,
): boolean {
  return authReady
    && !!businessId.trim()
    && resolvedFor?.businessId === businessId
    && resolvedFor.userId === (userId ?? '');
}

/** La UI y sus efectos solo pueden trabajar con el tenant y usuario verificados. */
export function hasCurrentWorkspaceAccess(
  businessId: string,
  authReady: boolean,
  userId: string | null,
  resolvedFor: ResolvedWorkspaceFor | null,
  tenantBusinessId: string | null | undefined,
  role: string | null,
): boolean {
  return isWorkspaceAccessLoaded(businessId, authReady, userId, resolvedFor)
    && !!userId
    && !!role
    && tenantBusinessId === businessId;
}
