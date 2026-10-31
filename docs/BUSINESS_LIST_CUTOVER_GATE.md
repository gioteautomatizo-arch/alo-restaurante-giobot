# Paso 2 — puerta de corte del listado de membresías (solo simulación)

**Estado:** propuesta OFFLINE, sin autorización de despliegue. El directorio privado `GET /api/businesses/mine` y el flag del cliente permanecen desactivados. No cambiar reglas, cuentas, datos reales ni secretos basándose en esta puerta.

## Contrato y orden

`scripts/business-list-cutover-gate.mjs` exporta `evaluateBusinessListCutover`. Solo admite las etapas declarativas `legacy-direct` → `server-prepared` → `private-read`, **sin saltos**. Los pasos que satisfacen sus requisitos devuelven `REVIEW_REQUIRED`, nunca una orden de activación: `deploymentAuthorized` es siempre `false`. Los errores, transiciones desconocidas y retornos a `legacy-direct` quedan `BLOCKED`; una reversión desde `private-read` a `server-prepared` queda `rollback-blocked` porque podría reabrir lecturas directas.

La preparación exige evidencias **declaradas** sobre inventario histórico autorizado, auditoría de colisiones de membresías/índices, consumidores directos, clientes antiguos, Auth y revocación de tokens en el endpoint, aislamiento de Admin SDK, antiabuso/costos, respaldo/restauración y plan de rollback. El corte exige además servidor verificado, cliente sin fallback, fingerprint de reglas efectivas, contención de lectores directos antiguos, recorrido A/B, validación Android/iPad y reversión que preserve la lectura privada. Solo se reconoce el literal `'verified'` en propiedades propias del objeto; un booleano o `PENDIENTE` bloquea. **Cualquier evidencia puede ser falsificada por el llamador**, por lo que el resultado no certifica infraestructura ni un inventario real.

## Consumidores y rutas que deben auditarse antes de activar

- `BusinessPortal.tsx` usa `getBusinessesForUser` de `src/lib/businessAuthService.ts`. Por defecto, este último consulta `businessMemberships` directamente y luego raíces `businesses`. El flag `VITE_SECURE_BUSINESS_LIST` cambia el listado a un endpoint privado; si falla, **no** debe hacer fallback al listado directo.
- `BusinessWorkspace.tsx` usa `getBusinessForUser` y `getBusinessMembership` para acceso individual. El endpoint privado de tarjetas **no** sustituye estas lecturas, ni elimina la necesidad de reglas seguras.
- `src/lib/businessEmployeeService.ts` y `src/lib/businessCatalogService.ts` comprueban membresías para empleados/catálogo; `businessInviteApi.ts` usa Admin SDK y debe aplicar sus propias validaciones. También revisar `src/lib/businessPublicProfileService.ts` y `menuImportApi.ts`. No confundir lectura de una membresía concreta con el listado directo de todas las membresías de un UID.
- Clientes antiguos pueden seguir ejecutando `list` aunque la versión nueva use el endpoint. La lista anterior es un **inventario inicial de código**, no evidencia de que se hayan enumerado todas las versiones instaladas. La propuesta STAGED todavía puede entregar documentos históricos discordantes antes de filtrarlos localmente.

## Ensayo y evidencia

`node scripts/test-business-list-cutover-gate.mjs` prueba exclusivamente decisiones sintéticas y denegaciones, sin Firebase, red ni escritura. Quality CI ejecuta la prueba junto con TypeScript/build. El estado `REVIEW_REQUIRED` no equivale a `PASS` de seguridad ni a `READY_TO_PUBLISH`. Para revisar el inventario real se requiere autorización explícita y el preflight `docs/BUSINESS_MEMBERSHIP_INVENTORY_PREFLIGHT.md`, cuya salida también deja `safeToDeploy=false`.

**Reversión real pendiente:** conservar servidor autenticado y reglas de lectura privada; si falla el endpoint, mostrar error recuperable y detener el corte, no activar fallback directo. Cualquier rollback de flags o reglas exige una matriz de compatibilidad de clientes históricos, respaldo/restauración probado, revisión independiente y comprobación de reglas efectivas. La puerta no ejecuta ninguno de esos cambios.

**Bloqueos restantes:** paso 2 sigue abierto por reglas OWNER/raíz, membresías históricas sin índice, creación exclusiva aún no integrada, cuentas Auth huérfanas, inventario autorizado y validación visual/manual A/B. Paso 3 mantiene precio/stock e idempotencia persistente pendientes. Paso 4 Caja/MIXTO mantiene diagnósticos `PENDIENTE` aunque CI termine en verde.


## Matriz de consumidores versionados y compatibilidad 2→3 (31 de octubre de 2026)

El guard `scripts/test-business-membership-consumers.mjs` inspecciona archivos fuente de la rama (raíz y `src/`, excluidos scripts/docs y dependencias). Falla si aparece un archivo nuevo con el literal `businessMemberships` o cambia el número de referencias de uno ya revisado. También exige que el Portal invoque `getBusinessesForUser`, que el selector elija el endpoint opt-in antes de su consulta directa y revalide con servidor, que el endpoint permanezca apagado por defecto y verifique revocación, y que el roster use lecturas individuales. Se prueba expresamente que un consumidor desconocido y una referencia añadida provocan error.

| Consumidor | Acceso actual | Contrato/corte |
| --- | --- | --- |
| `BusinessPortal.tsx` → `businessAuthService.ts` | `list` Web SDK por UID, por defecto; luego raíces y revalidación | La alternativa `/api/businesses/mine` es opt-in y sin fallback; el `list` directo de clientes viejos sigue abierto en reglas STAGED. |
| `businessDirectoryApi.ts` | Admin SDK con token y revocación; devuelve tarjetas mínimas | Endpoint inactivo, no certifica inventario ni reglas. |
| `BusinessWorkspace.tsx` → `businessAuthService.ts` | `get` individual de membresía/raíz | No se sustituye por el endpoint de tarjetas; conservar compatibilidad con OWNER históricos hasta revisión. |
| `businessEmployeeService.ts` | `get` individual e índice `employeeUserIds` | El create-only del Admin SDK es solo propuesta; colisiones no indexadas siguen pendientes. |
| `businessCatalogService.ts`, `businessPublicProfileService.ts` | `get` individual de permisos | No eliminar estas lecturas al cerrar el listado; revisar reglas de tenant. |
| `businessInviteApi.ts`, `menuImportApi.ts` | Admin SDK/REST con membresía concreta | Revisión independiente de autorización y errores; no son reemplazados por el listado privado. |
| `businessRegistrationThreeDocumentCandidate.ts` | Alta candidata de 3 documentos con reserva permanente | **Inactiva**; la versión actual registra 2 documentos. La matriz de reglas/emulador existente `test-business-registration-version-matrix.mjs` verifica compatibilidad por fases; no autoriza activar 3 documentos. |

**Límites del guard:** es una alarma de cambios en archivos fuente, no un análisis semántico completo: puede omitir colecciones construidas dinámicamente, clientes antiguos distribuidos, consumidores de otros repositorios y cambios que conserven exactamente el número de referencias. No certifica autorización de Admin SDK, reglas desplegadas, datos históricos ni costos. Los tests `test-business-directory-client.mjs` (jsdom) y `test-business-directory-api.mjs` (Auth/Firestore Emulator) siguen siendo necesarios. Para un corte real: inventario autorizado, matriz de clientes instalados, revisión independiente de reglas/roles y rollback que nunca reabra `list` directo; pruebas A/B y visual Android/iPad. **Paso 2 continúa ABIERTO.**


## Paridad funcional con Auth/Firestore Emulator (31 de octubre de 2026)

El recorrido ya existente `scripts/test-business-registration-emulator.mts` ahora registra el endpoint privado en **Express local** y lo activa solo dentro del test, después de comprobar que por defecto responde 404 y que sin token responde 401. Con las mismas identidades y documentos ficticios del recorrido de onboarding/catálogo/publicación/invitaciones, compara las tarjetas de `getBusinessesForUser` (Web SDK legado) con `GET /api/businesses/mine` (Admin SDK con token del Auth Emulator):

- OWNER de A y OWNER de B: tarjetas equivalentes, sin datos del otro negocio ni configuración privada de la raíz.
- Empleado KITCHEN invitado a A: tarjetas equivalentes mientras la membresía está activa; tras revocación, ambos listados quedan vacíos.
- OWNER histórico de A sin `ownerUserId`: el lector legado **sí** entrega A, pero el endpoint privado devuelve **409 sin lista parcial**. Después de restaurar el propietario ficticio, vuelve a haber paridad. Esta diferencia es un **bloqueo de compatibilidad real para el corte**, no un error que se deba silenciar con fallback directo.

**Evidencia de código/pruebas:** commit [`0de019a4`](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/commit/0de019a4d2285f4bcf4b67016fc521e7bfec20f2). [Quality #41192936712](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41192936712) **success** (TypeScript, build y regresiones). [Staged Security #41192936704](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41192936704) **success**: el log imprime `PASS (paridad de lectura)` tanto con reglas STAGED como con la propuesta OWNER aislada. El mismo log imprime `PENDIENTE: corte 2→3 requiere inventario histórico autorizado y compatibilidad real de clientes antiguos`. La propuesta OWNER solo se carga en memoria del emulador.

**No es un corte activado:** el test invoca la API directamente, no ejecuta un cliente antiguo instalado ni prueba el flag Vite de una versión publicada. No se revisaron reglas desplegadas, inventario histórico autorizado, costos de producción, respaldo real ni Android/iPad. No se modificaron reglas ni datos reales. La API y la ruta privada del cliente siguen opt-in, sin fallback. **Paso 2 ABIERTO**; la conciliación de Caja sigue **PENDIENTE**.


## Matriz histórica con dos membresías para un mismo UID (31 de octubre de 2026)

El ensayo integrado `scripts/test-business-registration-emulator.mts` incorpora en `4400844d` una matriz adicional **solo con Auth/Firestore Emulator y Express local**: el propietario A tiene simultáneamente una membresía `WAITER` activa en B, creada sintéticamente por Admin SDK junto con el índice de empleados B. Compara ambas tarjetas entre Web SDK legado y API privada, sin cambiar flags permanentes ni reglas.

La matriz exige las siguientes propiedades, **pendientes de confirmar con el CI del commit**:

1. Con dos membresías válidas, ambos lectores entregan A y B sin mezclar raíces privadas.
2. Si A carece de `ownerUserId`, el legado todavía puede mostrar A+B, pero la API privada debe devolver `409` **sin** `businesses`, nunca una lista parcial que silencie A y conserve B.
3. Si el `ownerUserId` de A apunta al UID de B, ambos lectores deben rechazar la propiedad discordante; el endpoint no devuelve tarjetas parciales.
4. Si se revoca temporalmente el OWNER A, solo permanece B por su membresía independiente; al restaurar OWNER A y retirar la membresía ficticia B, vuelve el aislamiento inicial.

Este ensayo verifica **comportamiento esperado del código bajo prueba**, no el estado de datos históricos reales ni las reglas desplegadas. Los fixtures se escriben únicamente en emuladores y se restauran; no hay migración ni backfill. Un resultado exitoso en CI no resuelve el corte: se necesita inventario autorizado, revisión independiente de OWNER/raíz y clientes antiguos, pruebas de reglas efectivas, backup/rollback y validación visual/manual Android/iPad. No activar el endpoint ni cerrar el paso 2 por esta matriz. Caja y pagos mixtos siguen `PENDIENTE`.


## Revalidación de raíces de empleados durante el listado (31 de octubre de 2026)

La API privada ahora relee **todas** las raíces de negocios antes de responder, también cuando el usuario tiene rol de empleado en B y OWNER en A. Compara existencia, `restaurantId`, `ownerUserId` observado y los campos públicos `branding.restaurantName`, `branding.publicSlug` y `branding.logoUrl` con el primer snapshot; para OWNER exige además propiedad vigente. Si cualquier raíz cambia, devuelve **409 sin tarjetas parciales** para permitir reintentar. Antes solo se revalidaban raíces OWNER al final.

La prueba `scripts/test-business-directory-api.mjs`, ya incluida en Staged Security, ahora introduce en Firestore Emulator cambios de raíz B **entre** la primera lectura y la revalidación (borrado, cambio de tenant, cambio de propietario, nombre o slug) y exige rechazo 409 y recuperación posterior. Usa Auth/Firestore Emulator y Express local; no habilita el endpoint fuera del test ni toca reglas.

**Evidencia de código:** `8ab23793` (API) y `a05ac4f5` (prueba). **CI y compilación del nuevo SHA: aún no confirmados**: el conector no enumera ejecuciones push por commit y el contenedor no tiene acceso DNS a GitHub. No presentar este cambio como aprobado hasta obtener Quality y Staged Security sobre el SHA de pruebas. Esta segunda lectura **no es transaccional**, añade lecturas y no elimina la ventana de cambios posteriores, ni reemplaza revisión independiente, reglas efectivas o compatibilidad histórica. El paso 2 continúa abierto.


## Coherencia propietario/rol de raíces en el candidato privado (31 de octubre de 2026)

En `businessDirectoryApi.ts`, tanto la primera lectura como la revalidación final de **todas** las raíces exigen `ownerUserId` como cadena no vacía. Si el UID consultante coincide con `ownerUserId`, su membresía en ese negocio debe tener rol `OWNER`; si su rol no es `OWNER`, la raíz no puede identificarlo como propietario. Un OWNER sigue obligado a coincidir con la raíz. Cualquier discrepancia devuelve **409 sin tarjetas parciales**, incluso cuando el UID es OWNER de A y empleado de B.

La matriz de `scripts/test-business-directory-api.mjs` añade escenarios A/B sintéticos con propietario B ausente, numérico, en blanco o igual al UID del empleado WAITER, y comprueba restauración y aislamiento. **No comprueba** que el propietario de B tenga una membresía OWNER activa cuando el solicitante es un tercero: esa validación requiere una revisión separada de autorización y costos. La API sigue desactivada por defecto. Esta puerta más estricta puede rechazar negocios históricos legítimos; **no activar sin inventario histórico autorizado, revisión independiente y compatibilidad de clientes antiguos**. No se modifican reglas ni datos reales.


## Paso 2 — membresía OWNER del propietario de un tenant ajeno (31 de octubre de 2026)

El candidato privado `businessDirectoryApi.ts` continúa **desactivado por defecto**. Cuando el solicitante es empleado de B y propietario de A, no basta con que la raíz de B contenga `ownerUserId`: el servidor comprueba también, mediante Admin SDK, el documento exacto `businessMemberships/{B}_{ownerUserId}` con `restaurantId=B`, `userId=ownerUserId`, `role=OWNER` y `active=true`. La ausencia, revocación, rol incorrecto, identidad de tenant/UID discordante o un UID de propietario incompatible con la ruta rechazan **toda** la respuesta con HTTP 409 sin tarjetas parciales. Para el propietario que consulta su propio negocio, la membresía OWNER ya se revalida como parte de su lista.

**Costo acotado:** una lectura adicional por tenant donde el solicitante no es OWNER, máximo 100 por solicitud bajo `MAX_MEMBERSHIPS`, además de las lecturas ya existentes; no se realizan consultas globales de propietarios. **Límite de concurrencia:** la lectura final no es transaccional; un cambio posterior todavía necesita reglas efectivas y un corte coordinado. El guard estricto puede rechazar negocios históricos cuyo OWNER carezca de membresía normalizada: requiere inventario autorizado, revisión independiente de permisos/costos, respaldo y compatibilidad de clientes antiguos antes de habilitarlo.

`scripts/test-business-directory-api.mjs` ensaya con Auth/Firestore Emulator A/B la membresía OWNER B ausente, revocada, degradada, de otro tenant, de otro UID y revocada durante la consulta; también exige recuperación y ausencia de tarjetas parciales. **No se activó el endpoint, no se desplegaron reglas ni se tocaron datos reales.** Los resultados de CI se registran por SHA en `docs/BETA_ORDERED_CHECKLIST.md`; no asumir aprobación si los workflows aún no concluyen.
