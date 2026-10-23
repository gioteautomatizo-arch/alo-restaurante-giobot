# Beta: comprobaciones del menú público y separación entre negocios
**Revisión:** 23 de octubre de 2026
**Estado:** pruebas de código en GitHub; pruebas visuales y permisos reales pendientes.

## Cambios presentes en rama feat/gioteautomatizo-multinegocio-core
- La vista pública se remonta cuando cambia el `businessId`, reiniciando carrito, datos del cliente, formulario de pedido y listeners.
- Una falla del listener del catálogo ahora es `error`, no equivalente a un catálogo vacío.
- El cliente puede reintentar la lectura del menú.
- Mientras el catálogo no esté listo, se bloquea el botón de envío y la función de envío devuelve sin escribir.
- El catálogo omite precios base negativos, infinitos o NaN. Se permiten precios de $0.
- El carrito detecta si un producto fue eliminado, agotado, renombrado, cambió de precio, cambió el precio de un extra o apareció una opción obligatoria. Desactiva el envío y permite quitar solo esas partidas para volver a elegirlas sin perder las demás.
- La prueba pura `scripts/test-business-public-catalog.mts` está en GitHub Actions; no usa Firebase.

## Prueba manual sin cobros reales
1. Abrir la página pública de un negocio **de demo**, agregar un producto y llenar una nota, sin enviar.
2. Navegar al directorio y abrir **otro** negocio de demo; comprobar que el carrito y la nota anteriores desaparecieron.
3. Volver al primer negocio y confirmar que el carrito del segundo tampoco aparece.
4. Cortar temporalmente internet en el navegador de prueba, recargar la página y verificar el aviso de error del menú en lugar de 'Este negocio todavía no publica su menú'. Restablecer conexión y usar Reintentar.
5. Con la lectura fallida, verificar que no se pueda enviar un pedido desde el carrito.
6. En un entorno aislado, probar dos catálogos con productos de igual nombre y distinto ID o precio; verificar que no se mezclen.
7. En un negocio DEMO, preparar carrito con extras, cambiar desde otro dispositivo el precio y disponibilidad del producto y verificar que aparezca aviso con botón para quitar solo la partida desactualizada (sin enviar pedidos reales).

## Pendiente antes de recibir pedidos de terceros
- Validar permisos publicados: lectura de perfiles/catálogos públicos y escritura anónima restringida a pedidos nuevos del tenant correcto, nunca pagos.
- Comprobar idempotencia/duplicados en doble pulsación, redes inestables y reintentos.
- Verificar confirmación de pedidos en Android/iPad y recuperación tras recarga.
- Aunque el carrito compara con el último catálogo recibido, la lectura puede proceder de caché y no sustituye una validación autoritativa del lado del servidor. Sigue pendiente verificar precio y disponibilidad con reglas/backend al confirmar el pedido.
- Confirmar que no haya pedidos parciales o doble registro cuando se abre WhatsApp.
- Probar QR por mesa, QR externo, y enlace directo por negocio.
- No modificar reglas productivas ni datos reales sin autorización y respaldo.
