/** El directorio conserva su enlace explícito; el QR general abre registro. */
export function shouldShowPublicDirectory(routeHash: string, _hasLegacyTableQr: boolean): boolean {
  return routeHash === '#explorar';
}

export function shouldShowRegistration(routeHash: string, hasLegacyTableQr: boolean): boolean {
  return (routeHash === '' || routeHash === '#') && !hasLegacyTableQr;
}
