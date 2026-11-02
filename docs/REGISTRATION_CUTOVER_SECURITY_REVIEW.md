# Paso 2 — revisión independiente del corte de registro empresarial 2 → 3

**Estado: BLOQUEADO / SOLO PROPUESTA.** Fecha de revisión: 27 de octubre de 2026. Rama exclusiva: `feat/gioteautomatizo-multinegocio-core`. No autoriza despliegue, migración, cambios de reglas, operaciones con datos reales ni publicación.

## Alcance y evidencia observable

El cliente actual `src/lib/businessAuthService.ts` crea `businesses/{id}` y `businessMemberships/{id}_{uid}` en un lote de **dos documentos**. Las reglas `docs/firestore.launch-security.STAGED.rules` permiten crear la raíz sin exigir la membresía OWNER en el mismo lote y no contienen la reserva permanente `businessHandleReservations/{id}`. El contrato candidato de tres documentos y la puerta de congelación se construyen **solo en memoria** en `scripts/owner-atomic-proposal-rules.mjs`.

La matriz `scripts/test-business-registration-version-matrix.mjs` demuestra en Firebase emulado: staged acepta 2/rechaza 3; freeze-before rechaza ambos; candidate rechaza 2/acepta 3; freeze-after rechaza ambos y conserva operaciones existentes; volver directamente a staged permite de nuevo altas sin reserva. Las pruebas con dos negocios, personal y catálogo son emuladas. **No se verificaron las reglas realmente desplegadas ni una restauración real.**

`node scripts/business-registration-cutover-audit.mjs` es un diagnóstico **sin Firebase ni red**, que inspecciona fuentes locales y marca `BLOCKED` cuando detecta el cliente de dos documentos, ausencia de OWNER atómico/reserva en staged, rollback directo inseguro o evidencia de revisión ausente. La opción `--enforce` devuelve error cuando la revisión no está completa. Su salida `READY_FOR_INDEPENDENT_REVIEW` solo sería una invitación a revisar pruebas y aprobaciones, **nunca una autorización automática para desplegar**. La detección del código usa patrones conservadores: si el código cambia de forma no reconocida, se bloquea para revisión.

## Alcance reforzado de la auditoría estática (27 de octubre de 2026)

El diagnóstico ahora bloquea una **falsa señal de seguridad**: antes bastaba con encontrar `existsAfter` para OWNER/reserva y la declaración de `match` de reservas. Un fixture con OWNER no vinculado al UID o con reserva borrable podía llegar a `READY_FOR_INDEPENDENT_REVIEW`. Esto **no** representaba un permiso de despliegue, pero sí podía engañar al proceso de revisión.

La comprobación de fuentes ahora exige en la creación de la raíz empresarial: identidad del propietario y tenant, `existsAfter/getAfter` de membresía OWNER activa vinculada a UID y tenant, ausencia previa y `existsAfter/getAfter` de reserva permanente vinculada a ID y UID. En la regla de reserva exige vínculo recíproco con la raíz, creación autenticada, prohibición de actualización/borrado y lectura cerrada. También rechaza cláusulas alternativas `allow create/write` y operadores `||` dentro de las cláusulas críticas, porque las reglas de Firestore se combinan con OR. Las pruebas sintéticas mutan UID, rol, estado, reserva, reglas de borrado y concesiones superpuestas para confirmar `BLOCKED`.

**Límites:** es un detector de patrones conservador, **no** un parser formal de Firestore ni una prueba de todas las reglas que podrían solaparse en otras rutas o funciones. Un resultado `READY_FOR_INDEPENDENT_REVIEW` sigue requiriendo revisión humana, compilación/pruebas en emulador con las reglas exactas, comprobación de permisos del Admin SDK y autorización separada. La auditoría **no** comprueba reglas desplegadas ni acepta booleanos sintéticos como evidencia real. En las fuentes actuales el resultado sigue siendo `BLOCKED`, y `safeToDeploy` siempre es `false`.

## Puertas obligatorias antes de cualquier cambio de producción

| Puerta | Evidencia requerida | Estado |
|---|---|---|
| Identificar versión exacta | SHA de cliente, reglas, backend y contrato de lote; comprobar que no hay clientes antiguos activos incompatibles | **PENDIENTE** |
| Inventario histórico | Enumeración certificada de raíces, OWNER, membresías, perfiles públicos, catálogos y reservas; revisar rutas duplicadas y referencias cruzadas | **PENDIENTE** |
| Reserva permanente | Revisión manual de propietarios, colisiones y IDs huérfanos; plan de backfill idempotente, auditable y sin reasignación automática | **PENDIENTE** |
| Respaldo y restauración | Respaldo privado autorizado y **restauración probada** en proyecto aislado, con datos representativos y retención definida | **PENDIENTE** |
| Seguridad independiente | Revisión de `existsAfter/getAfter`, presupuesto de accesos documentales, Auth, roles, invitaciones, pedidos públicos y Admin SDK; aprobación explícita | **PENDIENTE** |
| Compatibilidad de clientes | Ensayar corte/rollback con versiones exactas de cliente y reglas; no permitir altas de dos documentos bajo reglas de tres | **PENDIENTE** |
| Recorrido manual | Dos negocios ficticios: alta, catálogo, publicación, invitación, revocación, cambio de cuenta, pedido y recuperación; Android e iPad | **PENDIENTE** |
| Baja y perfiles residuales | Protocolo administrativo de despublicación y retiro atómicos, auditoría de perfiles huérfanos y conservación de reservas | **PENDIENTE** |

No incluir PII, tokens, credenciales, exports reales ni listas de propietarios en el repositorio. El manifiesto de aprobación, si se usa, debe guardar solo referencias no sensibles a evidencias privadas controladas y SHA exactos. Los booleanos sintéticos de los tests no acreditan una aprobación humana.

## Orden candidato de operación, NO ejecutable sin autorización

1. Recuperar acceso administrativo legítimo y confirmar proyecto/base exactos, permisos, costes y responsables. Preparar respaldo y restauración de ensayo.
2. Congelar **solo nuevas altas** mediante reglas revisadas; verificar que negocios existentes conservan catálogo, empleados, publicación y pedidos. Si falla, detener; no improvisar reglas abiertas.
3. Certificar inventario histórico y backfill de reservas con aprobación de propietarios; ejecutar primero ensayo con dos tenants y casos huérfanos, duplicados y referencias cruzadas. **No ejecutar backfill automático por el preflight.**
4. Revisar y desplegar, únicamente tras autorización separada, un cliente y reglas compatibles con lote atómico de tres documentos. Controlar clientes antiguos, reintentos Auth y errores de red.
5. Confirmar integridad de reservas, OWNER, aislamiento, pedidos y directorio en el entorno aprobado. Registrar la versión exacta y monitorear.
6. Solo entonces decidir reapertura de altas y posterior beta cerrada. La aprobación de reglas **no** sustituye los pasos 3 (pedidos) y 4 (Caja) del checklist maestro.

## Reversión segura candidata, NO ejecutada

Si el corte falla, **mantener las altas congeladas** y restaurar únicamente versiones de frontend/backend compatibles con la puerta cerrada. No volver directamente a staged: el ensayo muestra que reabre altas sin reserva permanente. Conservar las reservas, membresías y pedidos ya escritos; no restaurar indiscriminadamente toda la base. Investigar el error, documentar incidentes y repetir la revisión antes de reabrir. Las reglas de cliente **no** limitan el Admin SDK: la baja privilegiada exige despublicación y auditoría separadas.

## Comprobaciones locales y límites

- `node scripts/test-business-registration-cutover-audit.mjs`: escenarios sintéticos del diagnóstico y `--enforce`; integrado en Quality checks. Una ejecución verde confirma que el **bloqueo se detecta**, no que el corte sea seguro.
- `node scripts/business-registration-cutover-audit.mjs`: inspección de las fuentes actuales, imprime `BLOCKED` y `PENDIENTE` cuando corresponde.
- `node scripts/business-registration-cutover-audit.mjs --enforce`: salida no cero mientras falten puertas. No conectar a Firebase.
- `scripts/test-business-registration-version-matrix.mjs`: requiere emulador y se ejecuta en Security CI; verifica contratos por fase, pero no el despliegue ni la migración real.

**Criterio para continuar:** revisión humana independiente y pruebas manuales con dos negocios ficticios, sin tocar datos reales. Hasta entonces, paso 2 **ABIERTO**. Paso 3 pedido/recuperación y paso 4 Caja histórica/MIXTO **PENDIENTES**; los logs que imprimen `PENDIENTE` no prueban conciliación.


## Reserva verificable al recuperar un alta 3-doc (2 de noviembre de 2026)

El marcador `registrationContractVersion: 3` NO acredita por sí solo una reserva permanente: una raíz histórica o escritura privilegiada podría contenerlo sin `businessHandleReservations/{id}`. El candidato **inactivo** comprueba por servidor raíz, OWNER y reserva antes de considerar recuperado un commit fallido. La variante de reglas `buildThreeDocumentRecoveryMarkerProposalRules` permite únicamente `get` de la reserva al OWNER activo de una raíz con marcador 3 y UID/tenant concordantes; `list`, terceros y mutaciones permanecen denegados. Esta **ampliación sensible de lectura existe solo en memoria de emulador**, no en reglas staged ni producción.

El ensayo A/B incorpora marcador histórico falso sin reserva, reserva de otro UID, acceso cruzado, reintento y ACK perdido. Falta revisión independiente de privacidad y presupuesto de accesos, compatibilidad de clientes, inventario histórico y validación Android/iPad; un resultado CI verde NO autoriza el corte ni demuestra reglas desplegadas. No habilitar el cliente 3-doc, no desplegar reglas y no operar sobre datos reales.


## Auditoría de escritores de raíz y compatibilidad de clientes (2 de noviembre de 2026)

**Alcance:** inspección de rutas de producción conocidas; no es un inventario exhaustivo de binarios instalados ni de escritores privilegiados externos. Se revisaron fuentes versionadas de alta, empleados, branding, módulos, catálogo y perfil público; no se conectó a Firebase. Esta auditoría no cambia el estado **BLOQUEADO** del corte.

| Ruta inspeccionada | Escritura observada | Implicación para freeze / 2→3 |
|---|---|---|
| `src/lib/businessAuthService.ts` | `registerBusiness`: `writeBatch` con raíz `businesses/{id}` y OWNER `businessMemberships/{id}_{uid}`, sin reserva. | **Bloqueante:** el cliente de 2 documentos no puede convivir con reglas candidatas de 3 documentos; una versión anterior instalada puede seguir intentando altas. |
| `src/lib/businessRegistrationThreeDocumentCandidate.ts` | Lote raíz + OWNER + `businessHandleReservations/{id}`, con marcador 3 y recuperación desde servidor. | Candidato **inactivo**: no activar sin freeze previo, revisión de reglas, reservas históricas y compatibilidad. |
| `src/lib/businessBrandingService.ts` | `runTransaction`, lectura de raíz y `transaction.update(rootRef, {branding})` con comparación de identidad/branding observado. | Actualiza una raíz existente; probar que freeze conserva actualizaciones legítimas y que clientes antiguos sin CAS no sobrescriben branding. |
| `src/lib/businessCapabilitiesService.ts` | `runTransaction`, lectura de raíz y `transaction.update(rootRef, {capabilities})`, incluyendo `[]`. | Actualiza una raíz existente; no es una nueva alta, pero la compatibilidad de clientes antiguos continúa sin certificar. |
| `src/lib/businessEmployeeService.ts` | Alta/retirada: `runTransaction` actualiza `employeeUserIds` en raíz y membresía de empleado. | **Requiere prueba de freeze:** permitir gestión de personal existente sin reabrir creación de raíz. Sigue pendiente colisión de membresía histórica sin índice, reconocida en el servicio. |
| `src/lib/businessCatalogService.ts` / `src/lib/tenantModules.ts` | Escriben subdocumentos `businesses/{id}/catalog` y `businesses/{id}/{module}/{doc}`, no la raíz. | Congelar `create` de raíz no debe bloquear por accidente catálogo, gastos ni módulos existentes; verificar con emulador usando la versión exacta de reglas. |
| `src/lib/businessPublicProfileService.ts` | Sincroniza `publicBusinessProfiles/{id}` tras verificar identidad/estado de raíz. | No sustituye el control de altas ni la reserva; verificar que despublicar/recuperar perfil no permita crear o reasignar IDs. |

**Evidencia CI disponible:** [Quality #41482514867](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41482514867) y [Staged Firestore Security #41482514820](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41482514820) aprobaron en `cf541931`, con TypeScript/build y recorridos A/B en emulador. El log de Quality conserva `PENDIENTE` de inventario real, reglas desplegadas y Caja histórica/MIXTO. **Ninguno prueba que clientes antiguos hayan dejado de operar ni que las reglas efectivas sean las staged.**

**Condiciones de salida de esta revisión, todas pendientes:** identificar escritor(es) Admin SDK externos y versiones instaladas; capturar inventario histórico real autorizado sin PII en el repo; ensayo freeze con altas 2-doc y 3-doc **denegadas** y actualización de empleados/branding/catálogo **permitida** para negocios existentes; respaldo/restauración probado; revisión independiente de presupuesto `getAfter`, reglas y compatibilidad; recorrido manual Android/iPad A/B. Si cualquiera falta, mantener altas congeladas durante cualquier transición futura y **no** habilitar el candidato. Reversión directa a staged no es segura.

**Siguiente acción segura:** ampliar las pruebas de regresión de compatibilidad freeze para las escrituras de raíz de empleados/branding/módulos existentes, usando exclusivamente Auth+Firestore Emulator; no desplegar reglas ni modificar datos reales. Paso 2 **ABIERTO**; paso 3 pedido/precios/idempotencia **PENDIENTE**; paso 4 Caja **NO conciliada**; pasos 5–6 bloqueados.


## Revisión de privacidad del auditor de reservas (2 de noviembre de 2026)

La auditoría estática del corte comprobaba `allow read: if false` pero no examinaba concesiones adicionales `allow get` y `allow list` en `businessHandleReservations/{businessId}`. Como Firestore combina permisos por OR, un fixture de revisión con `allow read: if false; allow get: if true;` podía obtener `READY_FOR_INDEPENDENT_REVIEW` aunque expusiera reservas. **No se encontró ni se afirmó ese permiso en reglas desplegadas**: era un falso positivo posible del diagnóstico local, no una filtración demostrada.

La corrección del auditor exige que todas las concesiones `read/get/list` de la sección sean `false` y que exista una cláusula explícita de lectura cerrada. Las mutaciones sintéticas incluyen `get`, `list`, segundo `read`, permiso combinado y `read: false || true`; deben producir `BLOCKED` y `DIRECT_ROLLBACK_TO_STAGED_UNSAFE`. El fixture completo con permisos cerrados continúa `READY_FOR_INDEPENDENT_REVIEW` **solo como invitación a revisión humana**, nunca a despliegue (`safeToDeploy=false`). Las fuentes staged actuales siguen `BLOCKED`.

**Límite de esta puerta:** el detector solo analiza la sección local de reglas; no certifica `match` solapados, funciones globales, acceso Admin SDK, reglas realmente desplegadas ni revisión de privacidad del `get` restringido propuesto para recuperación 3-doc. Una lectura restringida legítima necesitaría un contrato de auditoría y revisión independientes, no relajar silenciosamente esta puerta. Mantener congelación, compatibilidad, inventario/backfill, backup/restore y recorrido A/B como requisitos pendientes.


## Solapamientos de rutas y permisos OR (2 de noviembre de 2026)

**Solo preflight y prueba sintética; NO se modificaron reglas.** Firestore combina con OR los permisos de todos los `match` que coinciden. Inspeccionar `match /businesses/{businessId}` y `match /businessHandleReservations/{businessId}` por separado no basta: un `match /{document=**}`, `match /{collection}/{id}` o alias `/{reservationId}` puede conceder `create/get/list` aunque el bloque auditado esté correctamente protegido.

`scripts/business-registration-cutover-audit.mjs` ahora bloquea `STAGED_OVERLAPPING_GRANTS_NOT_PROVEN` y `DIRECT_ROLLBACK_TO_STAGED_UNSAFE` si encuentra un permiso solapado distinto de `false`, o si no puede reconocer la estructura de un `match`. La prueba sintética `scripts/test-business-registration-cutover-audit.mjs` cubre wildcard recursivo, ruta genérica, alias de variables, subruta recursiva, y un solapamiento explícitamente cerrado. El fixture seguro continúa siendo únicamente `READY_FOR_INDEPENDENT_REVIEW` y `safeToDeploy=false`.

`scripts/test-registration-overlapping-rules.mjs`, integrado en `security-firestore.yml`, usa Firebase Emulator: primero prueba que el candidato niega alta sin OWNER y lectura cruzada de reserva; luego carga **solo en el emulador** un `match` deliberadamente permisivo para comprobar que OR permite el bypass. Un `PASS` de esta prueba acredita el diagnóstico, **no** que sea seguro desplegar reglas ni que la propuesta esté aprobada.

**Límites:** el detector no es un parser completo de Firestore; los permisos Admin SDK y rutas/funciones de autorización privilegiada exigen revisión independiente. No inspecciona reglas realmente desplegadas, clientes instalados, datos reales ni respaldos. No reabrir altas ni publicar por un resultado verde. **Paso 2 ABIERTO** por OWNER/reserva staged sin atomicidad, compatibilidad, revisión y recorrido manual A/B Android/iPad. **Paso 4 Caja NO conciliada:** históricos, MIXTO y mesa siguen `PENDIENTE`.
