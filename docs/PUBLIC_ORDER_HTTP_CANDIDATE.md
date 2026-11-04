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
