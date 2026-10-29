# Candidato de lectura segura de negocios — PASO 2 (NO ACTIVADO)

**Objetivo:** evitar que el navegador reciba una ficha histórica mal asociada desde un `list` de `businessMemberships` antes de que el cliente pueda rechazarla. El candidato no es una reparación de reglas, un inventario real ni una autorización de beta.

## Estado y contrato

- `businessDirectoryApi.ts` registra `GET /api/businesses/mine`, **404 por defecto**. Solo responde cuando el servidor recibe `ENABLE_SECURE_BUSINESS_LIST=true`.
- Verifica el Firebase ID token y su revocación. No acepta UID del cliente como parámetro. Consulta por `userId == token.uid` y `active == true` con Admin SDK, que **ignora reglas**. Antes de devolver datos valida cada ID de membresía (`businessId_uid`), tenant, UID, actividad y rol conocido. Rechaza la respuesta completa con 409 si una ficha está corrupta, hay más de 100 activas o falta una raíz/identidad del negocio. Nunca entrega documentos de membresía. La respuesta privada tiene `Cache-Control: no-store` y `Vary: Authorization`.
- `getBusinessesForUser` conserva el camino actual por defecto. Solo con `VITE_SECURE_BUSINESS_LIST=true` llama al endpoint, obtiene el token del UID activo y vuelve a comprobar la sesión tras cada operación asíncrona. Ante 401, 404, 409, 503 o respuesta inválida **no vuelve a la consulta directa**.
- Los flags **NO están activados** en configuración versionada ni desplegada. Ningún cambio de reglas STAGED o producción, Firebase, datos reales, secretos o cobros.

## Pruebas aisladas y límites

- `scripts/test-business-directory-api.mjs` usa Auth y Firestore Emulator con dos negocios, cuentas A/B y una cuenta ajena. Comprueba ruta apagada, autenticación, aislamiento, membresía válida en dos negocios, datos mal asociados, rol inválido, raíces ausentes/discordantes, revocación y límite de 100 sin listas parciales.
- `scripts/test-business-directory-client.mjs` usa esbuild/jsdom con Auth y API simulados. Comprueba bearer por cuenta, respuesta inválida, 404 sin fallback y cambio de UID con respuesta tardía.
- La prueba del servidor usa Admin SDK y por tanto **no verifica las reglas de lectura del navegador**. Tampoco valida visualmente Android/iPad ni el comportamiento de clientes antiguos.
- Si el token es válido y una membresía falsificada está completamente coherente en ID/UID/tenant/rol, esta ruta por sí sola **no demuestra** su legitimidad histórica. Se requiere inventario y revisión de origen/propiedad de registros.
- Falta protección antiabuso distribuida y revisión de presupuesto de lecturas/costos. El límite de 100 es fail-closed, no paginación productiva.

## Plan de corte (no ejecutado)

1. Revisar con autorización el inventario histórico de membresías y raíces, detectar claves discordantes y planear corrección reversible con respaldo y restauración probados. No modificar datos reales automáticamente.
2. Auditar **todos** los consumidores de `businessMemberships` (incluidos clientes ya instalados) y sus reglas. El listado directo continúa disponible en STAGED y en clientes antiguos; activar este endpoint **no cierra** la exposición de `list`.
3. Revisar permisos y seguridad del Admin SDK, abuso, costos y la compatibilidad del JSON del negocio; probar con cuentas ficticias en entorno aislado y validar Android/iPad.
4. En un corte coordinado y aprobado, habilitar primero el servidor, luego el cliente y **solo después** revisar/restringir las reglas directas, sin dejar versiones antiguas sin salida. Confirmar rollback de flags y reglas antes de proceder.
5. Mantener el paso 2 abierto hasta que el cliente realmente no pueda recibir fichas corruptas por ningún camino. La creación huérfana sin OWNER atómico en STAGED continúa **PENDIENTE**.

**Otros bloqueos:** paso 3 conserva `PENDIENTE CRÍTICO` de precios falsificados en escrituras públicas STAGED y falta integración segura de checkout; paso 4 Caja/MIXTO conserva diagnósticos `PENDIENTE` aunque CI termine en verde. Pasos 5/6 no autorizados.
