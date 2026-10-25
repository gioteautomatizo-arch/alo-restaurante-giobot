/**
 * Gioteautomatizo es una plataforma multinegocio: su URL principal abre el
 * directorio de negocios publicados, sin exigir una cuenta al visitante.
 *
 * Los enlaces históricos de mesas Calientito que usaban /?table=N,
 * /?qr=... o /?staffOrder=1 deben seguir entrando al flujo de restaurante.
 * Las rutas explícitas #negocio/... y #admin conservan su navegación.
 */
export function shouldShowPublicDirectory(routeHash: string, hasLegacyTableQr: boolean): boolean {
  return routeHash === '#explorar'
    || routeHash === '#'
    || (routeHash === '' && !hasLegacyTableQr);
}
