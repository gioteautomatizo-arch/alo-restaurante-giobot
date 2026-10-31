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
