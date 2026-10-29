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


## Auditoría de minimización y consumidores (29 de octubre de 2026, sin activación)

- **Hallazgo corregido en el candidato:** la versión anterior de `GET /api/businesses/mine` devolvía la raíz completa de `businesses/{id}`. `BusinessPortal.tsx` solo necesita `restaurantId`, `branding.restaurantName`, `branding.publicSlug` y `branding.logoUrl` opcional. La raíz puede incluir `assistant.customInstructions` y campos internos no necesarios para el selector. La respuesta ahora construye una tarjeta con lista positiva de esos cuatro campos; el cliente opt-in rechaza claves adicionales y logos de tipo incorrecto. **No implica que se haya filtrado información real:** el endpoint continúa apagado.
- **Identidad de propietario:** si la membresía activa es `OWNER` y la raíz tiene `ownerUserId`, debe coincidir con el UID autenticado; si no, respuesta 409 sin datos parciales. Se permite ausencia de `ownerUserId` para raíces históricas, **no** se certifica por ello la legitimidad de un OWNER antiguo. Para roles distintos de OWNER no se exige coincidencia con el propietario; se valida su propia membresía.
- **Consumidores comprobados en código:** `BusinessPortal.tsx` es el consumidor de la lista `getBusinessesForUser`; `BusinessWorkspace.tsx` consulta por separado `getBusinessForUser` y `getBusinessMembership`. `businessAuthService.ts` sigue realizando lecturas directas de membresías por defecto y para acceso individual; `businessEmployeeService.ts`, `businessCatalogService.ts`, `businessPublicProfileService.ts`, `businessInviteApi.ts` y `menuImportApi.ts` también usan permisos/membresías para sus propias operaciones. **Este bloque no sustituye esos accesos** ni demuestra que los clientes antiguos no puedan listar fichas.
- **Pruebas nuevas:** el emulador de Auth/Firestore debe comprobar que una raíz con instrucciones privadas no las devuelva ni a OWNER ni a WAITER; OWNER/raíz discordantes devuelven 409, OWNER histórico sin campo sigue funcionando, logo inválido falla cerrado y logo válido se conserva. La prueba de cliente simulado rechaza payloads con campos privados, branding extra o logo inválido y conserva cambio de cuenta sin fallback a Firestore.
- **Compatibilidad y corte:** `getBusinessesForUser` expone ahora el tipo `BusinessDirectoryCard[]` (subconjunto de `RestaurantTenant`), y el Portal usa exclusivamente ese tipo. El modo antiguo puede seguir devolviendo raíces completas hasta el corte; no afirmar que el riesgo de lectura directa esté cerrado. Antes de habilitar flags: inventario histórico autorizado, revisión de reglas, compatibilidad de consumidores, pruebas visuales A/B, respaldo/restauración y plan de rollback. No activar flags ni desplegar reglas en esta fase.


## Revalidación de membresías durante una lectura (29 de octubre de 2026; candidato apagado)

- La consulta inicial por `userId`/actividad y la lectura de raíces no son una transacción. Un empleado podría perder su membresía o cambiar de rol mientras se prepara la lista. El candidato ahora conserva las claves y roles iniciales y, tras validar todas las raíces, vuelve a leer por ID las membresías exactas. Si alguna fue borrada, revocada, reasignada o cambió de rol, devuelve 409 **sin ninguna tarjeta**. No se hace fallback a Firestore directo.
- La prueba del endpoint usa un gancho **solo en el test** sobre `getAll` para modificar datos sintéticos en Firestore Emulator precisamente después de leer las raíces: revocación, cambio de rol y borrado, más recuperación de A/B y acceso legítimo de B. El código productivo no incorpora ganchos de test ni cambia flags.
- **Límite:** la segunda lectura reduce la ventana temporal, pero no garantiza revocación instantánea: puede ocurrir otro cambio después de la revalidación. Tampoco convierte varias lecturas en una transacción, certifica reglas remotas o evita el acceso directo de clientes antiguos. Añade hasta una lectura por membresía activa (máximo 100) por petición, por lo que la revisión de costos/antiabuso distribuido sigue obligatoria antes de habilitar. No activar el candidato sin inventario autorizado, revisión independiente y corte coordinado.
