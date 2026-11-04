# Pedidos públicos con autoridad de servidor — candidato HTTP (NO ACTIVAR)

**Estado:** desarrollo preparatorio exclusivamente en rama multinegocio. No se cambiaron \`firestore.rules\`, reglas STAGED, Firebase remoto, datos reales ni \`BusinessPublicPage.tsx\`.

## Qué quedó preparado
- \`POST /api/public-orders\` en \`publicOrderApi.ts\`, registrado en \`server.ts\`, devuelve **404 por defecto**. Para levantarlo en un ensayo aislado hacen falta \`ENABLE_SECURE_PUBLIC_ORDER_API=true\`, una lista explícita \`PUBLIC_ORDER_ALLOWED_APP_IDS\` y tokens válidos de **Firebase App Check**, verificados por Firebase Admin.
- El cuerpo acepta solo tenant, intento idempotente, datos mínimos del cliente y productos/opciones por identificador. El cliente no puede fijar precios, descuentos, estado, importes ni folio. El servidor lee negocio publicado y catálogo en una **transacción** con Firebase Admin, calcula importes y crea pedido y resumen QR de mesa atómicamente.
- Las mesas admitidas coinciden con las reglas QR ya publicadas: **1 a 60**; un negocio con \`active === false\` no crea pedidos nuevos. Un reintento idéntico recupera el mismo pedido sin cobrar de nuevo.
- Los errores nunca devuelven datos privados, el resultado no revela el catálogo interno, y se envía \`Cache-Control: no-store\`. Existe un tope local de solicitudes como defensa provisional.

## Pruebas aisladas
\`scripts/test-public-order-http-boundary.mts\` usa Firestore Admin y Firestore Emulator con dos negocios sintéticos. App Check se **simula** para probar los caminos HTTP: ruta apagada, allowlist ausente, token ausente/inválido/ajeno, precios manipulados, intento repetido, conflicto, negocio no publicado, negocio desactivado y mesa 60/61. CI de seguridad ejecuta la prueba junto a las transacciones y reglas candidatas previas.

## Bloqueos de activación
1. **NO activar todavía.** App Check del navegador no está integrado ni se probó con tokens reales; la API HTTP no debe recibir tráfico de la beta pública.
2. El tope local es **insuficiente** en múltiples instancias; faltan límites distribuidos, presupuesto de costos y control de abuso revisados. App Check no sustituye esto.
3. El checkout actual escribe directamente en Firestore. Activar reglas que cierren ese acceso ahora lo rompería; abrir el nuevo endpoint sin cerrarlo conservaría el bypass de precios falsos. Requiere un **corte coordinado cliente/API/reglas**, compatibilidad de sesiones anteriores y rollback probado.
4. Aún faltan validación de stock y descuentos/envíos reales, auditoría de permisos, UX en Android/Xbox, conciliación de Caja y pruebas con cuentas reales.
5. Las tarjetas VIP antiguas siguen requiriendo su migración de privacidad antes de una beta abierta.

**Siguiente paso:** ensayo del cliente contra API privada y Firebase Emulator, luego revisión independiente del corte de reglas y plan de reversión. En la consola Firebase del negocio no se debe pegar este candidato.

## Adaptador opt-in de cliente — 3 de noviembre de 2026 (APAGADO)

- `src/lib/publicOrderClientApi.ts` construye solicitudes desde el carrito sin enviar precios, totales o descuentos. Solo lleva IDs de producto, cantidades, selecciones, nombre, notas (máx. 300), mesa 1–60 y comensales 1–10.
- `BusinessPublicPage.tsx` usa la nueva API solo con `VITE_SECURE_PUBLIC_ORDER_API=true`, indicador de compilación no activado. El camino heredado permanece igual por defecto. **Si la API falla no se hace fallback a Firestore directo**.
- El comprobante y WhatsApp utilizan los artículos y el total confirmados por el servidor, incluso si hubo cambio de catálogo entre el preflight y la transacción.
- El navegador requiere `VITE_FIREBASE_APPCHECK_SITE_KEY` válida para generar un token. El servidor necesita `ENABLE_SECURE_PUBLIC_ORDER_API=true`, `PUBLIC_ORDER_ALLOWED_APP_IDS` y Firebase Admin bien configurado. Ninguna de esas opciones fue activada.
- Pruebas: `scripts/test-public-order-client-draft.mts` (borrador puro), `scripts/test-public-checkout-ui-secure.mjs` (React/jsdom, API simulada y sin fallback), `scripts/test-public-order-http-boundary.mts` (App Check simulado + Firestore Emulator) y `scripts/test-public-order-authority-transaction.mts` (concurrencia e idempotencia).
- **No activar solo el frontend**. Existen versiones antiguas y otros clientes capaces de escribir directamente en `restaurant_orders`. La API por sí sola no cierra esa vía; cerrar reglas antes de migrar el checkout puede interrumpir las ventas.
- Antes de cualquier corte: App Check real, límites distribuidos de abuso, compatibilidad de clientes abiertos, revisión independiente de permisos y montos, respaldo/restauración y rollback probado. La privacidad VIP también sigue pendiente.
- **No usar para cobros reales ni beta pública todavía**. Sin cambios a `firestore.rules`, reglas STAGED, `firebase.json` ni Firebase remoto.
