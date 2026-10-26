# Ruta ordenada a la beta — 25 de octubre de 2026

Trabajar exclusivamente en `feat/gioteautomatizo-multinegocio-core`. Esta lista coordina los siguientes bloques; no sustituye los procedimientos de seguridad ni marca como publicado lo que solo existe en código. No reabrir tareas confirmadas salvo regresión.

## Estado comprobado en esta revisión

- Base final integrada: `445925f` (incluye aislamiento de Resumen y protección POS ante lecturas obsoletas; incorporada sin sobrescribir el trabajo programado).
- URL principal: resuelta por el usuario; las pruebas de rutas pasan. No requiere reconstrucción.
- `BusinessWorkspace.tsx`: conserva Membresías; no tiene pestaña Clientes duplicada.
- TypeScript y compilación de producción pasan localmente. El paquete principal genera advertencia de tamaño (~2.1 MB sin comprimir); optimización pendiente, no prueba de fallo funcional.
- Los doce scripts `test-*.mts` pasan. Incluyen catálogo, rutas, origen QR, notificaciones, reportes, Resumen, turnos, aislamiento, recuperación de ventas y recibos. Algunos verifican funciones puras y otros estructura del código, no navegación real.
- `test-platform-branding.mjs`, `test-vip-migration-preflight.mjs`, `verify-vip-staged.mjs` y `verify-launch-rules.mjs` pasan sus comprobaciones locales.
- GitHub Actions del commit anterior `71ccbe35`: Quality checks (40211955393) y Staged Firestore security tests (40211955489) aprobados. Son resultados de esa versión, no de la modificación de este documento.
- Las pruebas de conciliación imprimen PENDIENTE en casos conocidos aun cuando el proceso termina con éxito. No interpretar una ejecución verde como conciliación completa.

## Mejoras de esta revisión

En `BusinessPublicPage.tsx`:
- Bloqueo síncrono para impedir dos envíos antes del siguiente render de React.
- No permite agregar, quitar, vaciar o editar datos del carrito mientras se registra el pedido.
- Error de carga del negocio con Reintentar y enlace de regreso al directorio.
- Mensaje de error de envío explica que no se confirmó el registro y pide consultar antes de reenviar; no afirma que el pedido no exista.

`node scripts/test-public-checkout-ui.mjs` usa el componente React real en jsdom con perfil, catálogo y servicio de pedidos simulados. Comprueba reintento de perfil, doble pulsación en el mismo evento, campos bloqueados, fallo conservando carrito, reintento, confirmación y reinicio al cambiar de negocio. La prueba falla si se retira el bloqueo síncrono. Está incorporada a Quality checks.

**Límite:** esto no implementa idempotencia persistente entre recargas, pestañas o reintentos de red, no valida precios en servidor y no prueba WhatsApp ni Firebase real. Tampoco es una prueba visual. La descarga del navegador Chromium falló; revisión visual Android/iPad sigue pendiente.

## Orden de trabajo y criterio para cerrar cada paso

1. **Entrada y navegación.** Base automática comprobada; terminar revisión visual en Android/iPad de directorio, enlace directo, negocio inexistente, acceso y registro. Cerrar cuando todos tengan salida clara y no presenten pantalla en blanco. No rehacer la URL ni eliminar Membresías.
2. **Alta y permisos de dos negocios ficticios.** Verificar alta → configuración → catálogo → publicación, con propietario, empleado y cuenta ajena. Probar errores/reintentos y cambios de sesión. Cerrar cuando A no pueda leer ni modificar datos privados de B y los roles estén comprobados. Las reglas staged aprobadas no demuestran qué reglas están desplegadas.
3. **Pedido completo y recuperación.** Elegir productos y extras → enviar una sola vez → recibir en Pedidos → cambiar estado → confirmar al cliente. Probar catálogo cambiado/agotado, fallo de red, recarga, doble pulsación, dos pestañas, QR de mesa/enlace y salida a WhatsApp. Pendientes principales: validación autoritativa de precio/disponibilidad y deduplicación persistente. Cerrar con pedidos de prueba reconciliados, sin pérdidas ni duplicados.
4. **Cobro, turnos y reportes.** Resolver los casos documentados de pagos históricos sin fecha, MIXTO sin desglose, desglose parcial/excesivo, métodos desconocidos e importes anómalos. Exigir que Caja, Resumen y Reportes coincidan o expliquen y bloqueen el dato no conciliable; nunca inventar fechas ni reclasificar pagos reales automáticamente. Referencia: `MULTIBUSINESS_SHIFT_CASH_SAFETY.md`.
5. **Preparación de publicación.** Revisar compatibilidad VIP y permisos realmente desplegados, respaldo/restauración, configuración de backend y plan de reversión. Ejecutar el recorrido con dos negocios en entorno aislado y con la versión candidata exacta. Referencias: `PILOT_BACKUP_ROLLBACK.md`, `VIP_MIGRATION_CHECKLIST.md`. Sin publicar ni cambiar reglas/datos reales en este trabajo.
6. **Beta cerrada acompañada.** Tras cerrar los bloqueos y aprobar la publicación, invitar pocos negocios; registrar incidentes reproducibles y corregirlos antes de ampliar. Red social, nuevas funciones grandes y mejoras cosméticas se posponen.

## Bloqueos que no deben perderse

- `firestore.rules` versionado todavía contiene lectura pública por ID en `vip_profiles`; verificar y resolver compatibilidad con la propuesta segura antes de ampliar acceso. No se inspeccionaron ni modificaron las reglas desplegadas.
- No hay respaldo/restauración real comprobados en esta revisión.
- Persistencia de pedido/idempotencia y validación de precios en servidor siguen pendientes.
- Caja tiene discrepancias reproducibles con datos sintéticos; no confundir los tests diagnósticos con una reparación.
- Falta recorrido integral visual y funcional contra un entorno aislado, en Android y iPad.

## Siguiente bloque recomendado

Paso 2: comprobar el alta completa y aislamiento de dos negocios ficticios en entorno aislado, antes de sumar funciones. Después paso 3 y paso 4. Las comprobaciones básicas pueden hacerse durante esos bloques, pero no declarar beta lista hasta cerrar las puertas de seguridad del paso 5.

Formato del reporte: paso actual → cambio concreto → prueba y evidencia → pendiente real → siguiente paso. Sin porcentajes inventados ni fechas de entrega sin fundamento.

## Verificación de estado para la siguiente ejecución (25 de octubre de 2026)

- Rama examinada: `feat/gioteautomatizo-multinegocio-core`; HEAD inicial `22a442cb44b2266b3bc184f10b72d10c94611d24`. No hay indicio de commits posteriores en la consulta de la rama.
- GitHub Actions del HEAD: [Quality checks #40222434371](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40222434371) y [Staged Firestore security tests #40222434383](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40222434383), ambas **success**. Prueban el código y reglas staged en CI; no certifican las reglas desplegadas ni una beta funcional con cuentas reales.
- **Paso 1:** automatización aprobada; revisión visual Android/iPad pendiente. URL y limpieza Clientes/Membresías no se reabren.
- **Paso 2 (siguiente bloque de mayor prioridad):** alta y aislamiento de dos negocios ficticios. Comprobar la cobertura de pruebas de propietario, empleado y cuenta ajena con emuladores; reforzar los huecos verificables sin tocar Firebase real ni desplegar reglas. No marcar el paso cerrado sin recorrido completo de interfaz y permisos.
- **Paso 4:** los diagnósticos que imprimen `PENDIENTE` continúan abiertos aunque CI sea verde.

## Paso 2 — alta y aislamiento en reglas staged (25 de octubre de 2026)

- Revisión del código: la regla staged de creación de `businesses/{id}` permite reservar un identificador sin crear la membresía OWNER en el mismo lote, aunque el cliente utiliza `writeBatch`. **PENDIENTE de revisión de seguridad.** No se corrigió: `verify-launch-rules.mjs` protege expresamente `/businesses/{businessId}` frente a cambios en la propuesta staged.
- Se amplió `scripts/test-owner-registration.mjs` para diagnosticar el alta huérfana y probar dos tenants con catálogos, publicación visible/oculta, acceso a turnos privados, roles cruzados y revocación. Datos ficticios en emulador.
- **Reglas intactas:** se revirtió el intento de cambio staged tras fallar el guard de CI; no se modificó `firestore.rules`, no se desplegaron reglas ni se accedió a datos reales. La corrección de la reserva huérfana requiere una propuesta de seguridad separada y aprobación.
- **Evidencia de regresión:** el commit `f79fbd2` pasó Quality checks, pero falló el guard staged (no las pruebas de emulador). Se respetó el guard y se revirtió el cambio de reglas. Confirmar el nuevo CI antes de considerar aprobada la matriz ampliada.
- **Paso 2 permanece abierto:** faltan pruebas de alta/configuración/publicación en interfaz, invitación, cambio de sesión y validación visual Android/iPad con dos cuentas en entorno aislado. Próximo: corregir regresiones de CI, luego completar recorrido UI antes del paso 3.

### Evidencia CI del paso 2 (commit `5e9a3126`)

- [Quality checks #40227069644](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40227069644): **success**, incluidas TypeScript, compilación y regresiones existentes.
- [Staged Firestore security tests #40227069603](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40227069603): **success**. El paso `Test atomic owner registration and employee access` imprimió `PASS: alta atómica, dos negocios ficticios, publicación, catálogo, turnos privados y revocación en emulador.`
- **PENDIENTE de seguridad confirmado en el log:** `staged permite crear businesses/{id} sin membresía OWNER atómica`. La prueba diagnóstica termina correctamente para no alterar las reglas protegidas; NO significa que el defecto esté resuelto.
- El primer intento `f79fbd2` falló en `Verify staged-only guard` porque modificaba una regla ajena a la propuesta de migración. Se revirtió íntegramente ese cambio de reglas en `5e9a3126`; no debilitar el guard para ocultar el problema.
- **Estado del paso 2: parcial, NO cerrado.** Cobertura de reglas staged con dos negocios ficticios aprobada; pendiente revisión de seguridad de alta huérfana, recorrido UI de alta/configuración/publicación/invitaciones/cambio de cuenta y pruebas en entorno aislado de extremo a extremo.
- **Siguiente paso:** mantener paso 2, abordar primero propuesta revisable para cerrar la reserva huérfana sin desplegar reglas; continuar con pruebas de interfaz/cuentas de prueba. No iniciar paso 3 como si el aislamiento ya estuviera certificado.

## Paso 2 — selector de negocios y cambio de cuenta (25 de octubre de 2026)

- En `BusinessPortal.tsx` se detectó un riesgo independiente de las reglas: consultas de negocios y Super Admin sin cancelación al cambiar de UID. Una respuesta tardía de la cuenta A podía reemplazar tarjetas o permisos visibles de la cuenta B.
- Se añadió cancelación por efecto y una puerta de render por UID tanto para tarjetas como para el botón Super Admin; la puerta protege también el primer render antes de la limpieza del efecto. Las lecturas fallidas ahora muestran error con opción de reintento, en lugar de fingir una cuenta vacía.
- `scripts/test-business-portal-isolation-ui.mjs` monta el componente React real en jsdom, simula dos usuarios y respuestas fuera de orden, cierre de sesión, fallo de permisos y reintento; no usa Firebase ni datos reales. Se incorporó a Quality checks.
- **Estado de esta modificación:** requiere CI del commit y recorrido visual/manual; no equivale a pruebas con dos cuentas reales ni soluciona la reserva de identificadores sin OWNER en reglas staged.
- **Paso 2 permanece ABIERTO.** Siguiente: revisión de seguridad separada para alta huérfana y recorrido de alta → catálogo → publicación → invitación/cambio de sesión en entorno aislado. Mantener Caja (paso 4) como PENDIENTE.

### Verificación del bloque Portal (25 de octubre de 2026)

- Primer commit [`f4f0dbee`](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/commit/f4f0dbee0674d31b79a1ed7ffd33f32eb75245be): Quality checks falló por un cierre JSX faltante en la advertencia de lectura; corregido inmediatamente en [`ddf27674`](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/commit/ddf276749b3335923c6ee0d54f191c1313cf51e2).
- [Quality checks #40231575812](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40231575812): **success** sobre `ddf27674`, incluyendo TypeScript, compilación y prueba real del Portal en jsdom con dos UID ficticios, respuestas obsoletas, fallo/reintento y Super Admin aislado.
- [Staged Firestore security tests #40231575811](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40231575811): **success** sobre `ddf27674`. No cambia reglas ni resuelve el diagnóstico **PENDIENTE** de alta huérfana.
- **Paso 2 sigue parcial.** La prueba UI está simulada; falta recorrido con cuentas de prueba y verificación visual. No avanzar a paso 3 como cerrado, ni declarar Caja conciliada por el CI verde.


## Paso 2 — recuperación de membresías e invitaciones por tenant (25 de octubre de 2026)

- **Estado: avance automatizado aprobado, paso 2 NO cerrado.** Se revisó primero HEAD `9181fb26`, commits recientes y GitHub Actions: Quality checks #40231772644 y Staged Firestore security tests #40231772588 aprobados. No se reabrió la URL, el envío público ni la limpieza Clientes/Membresías.
- **Lectura de negocios:** `getBusinessesForUser` ya no devuelve una lista parcial si falla la lectura de uno de los negocios asociados a membresías activas. Verifica que el documento exista y que `restaurantId` coincida, evita IDs duplicados y propaga un error recuperable al Portal. No cambia permisos ni datos. Prueba `scripts/test-business-account-list.mjs` con Firestore simulado: error de una lectura entre dos tenants, reintento, membresía huérfana, ID discordante y duplicados.
- **Aceptación de invitaciones:** `BusinessInviteAccept` remonta su estado por token para no presentar información de la invitación anterior, descarta respuestas tardías, muestra carga/error con Reintentar, comprueba que la sesión siga siendo la misma después de refrescar Auth y evita doble aceptación por pulsaciones consecutivas en la misma vista. Una respuesta de aceptación de una invitación anterior ya no redirige al tenant equivocado. Prueba `scripts/test-business-invite-accept-ui.mjs` con React real en jsdom y Auth/API simulados. **Límite:** una petición de aceptación ya enviada al backend no puede deshacerse al cambiar de ruta; el servidor conserva sus controles transaccionales.
- **CI del commit `d9ad19dd`:** [Quality checks #40236573704](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40236573704) **success**, con TypeScript, compilación, las dos pruebas nuevas y las regresiones previas; [Staged Firestore security tests #40236573705](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40236573705) **success**, incluidos emuladores de aislamiento e invitaciones. Un primer CI #40236423603 falló solo por comparar arrays de distintos realms de jsdom en el test nuevo; corregido en `d9ad19dd` y repetido con éxito.
- **Bloqueo de seguridad que continúa PENDIENTE:** la creación de `businesses/{id}` sin OWNER atómico sigue permitida por las reglas staged. Propuesta para revisión separada (NO aplicada): exigir en la regla de creación que exista tras el lote `businessMemberships/{id}_{request.auth.uid}`, con `role == 'OWNER'`, `active == true` y `restaurantId == id`; probar primero en un archivo aislado con casos positivos/negativos y verificar límites de acceso de Firestore. El guard `verify-launch-rules.mjs` prohíbe modificar esta sección de la propuesta staged sin revisión específica. No se cambiaron ni desplegaron reglas.
- **Validación manual pendiente:** alta → configuración → catálogo → publicación → invitación → aceptación → revocación, con dos cuentas y dos negocios ficticios en entorno aislado; pruebas visuales Android/iPad. Las pruebas simuladas y de emulador no certifican reglas desplegadas.
- **Siguiente bloque (todavía paso 2):** revisión separada y verificable del alta huérfana, seguida del recorrido de dos cuentas ficticias. Solo después, paso 3 (pedido y recuperación). Paso 4 Caja: diagnósticos `PENDIENTE` siguen abiertos aunque los scripts salgan con código 0.

## Paso 2 — propuesta aislada de OWNER atómico (25 de octubre de 2026)

- **Evidencia de código:** `scripts/test-owner-atomic-proposal.mjs` deriva en memoria una variante de `docs/firestore.launch-security.STAGED.rules` y exige, mediante `existsAfter/getAfter`, una membresía OWNER activa, con UID y tenant coincidentes, en el mismo lote de alta. No modifica el archivo staged ni `firestore.rules`, ni despliega reglas.
- **Pruebas añadidas al workflow de seguridad:** reserva de identificador sin OWNER denegada; alta legítima de dos propietarios en batches; membresía previa sin negocio denegada; rol incorrecto, estado inactivo, UID o tenant discordante y suplantación denegados; lecturas cruzadas entre negocios denegadas. Solo emulador con identidades y datos sintéticos.
- **Estado de verificación:** sobre el commit `a8aa47dc`, [Quality checks #40241109241](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40241109241) **success** (TypeScript, compilación y regresiones) y [Staged Firestore security tests #40241109183](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40241109183) **success**, incluido `Test isolated atomic OWNER rule proposal`. El primer intento `f7eec8d3` falló por intentar leer la reserva huérfana sin membresía en el propio test; se corrigió para inspeccionar la ausencia solo con contexto administrador del emulador. La regla staged original NO cambió.
- **Bloqueo de seguridad abierto:** la regla staged original todavía admite el alta huérfana. La propuesta experimental **NO** constituye una corrección aplicada, ni permiso para desplegar. Requiere revisión humana y plan de compatibilidad, especialmente por el límite de accesos documentales de Firestore.
- **Paso 2 NO cerrado:** sigue pendiente el recorrido de alta, configuración, catálogo, publicación, invitación, aceptación, revocación y cambio de cuenta en entorno aislado, más validación visual Android/iPad.
- **Siguiente paso:** confirmar CI de la propuesta y revisión de seguridad separada; después completar recorrido integral de dos negocios ficticios. Paso 3 (pedidos) y paso 4 (Caja con diagnósticos `PENDIENTE`) permanecen abiertos.

## Paso 2 — control de sesión durante el alta (pruebas automáticas aprobadas, 25 de octubre de 2026)

- Punto de partida verificado: HEAD `5134bb50`; [Quality checks #40241324334](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40241324334) **success** y [Staged Firestore security tests #40241324321](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40241324321) **success**. El experimento OWNER atómico solo existe en emulador; el defecto staged sigue **PENDIENTE**.
- Siguiente revisión del paso 2: proteger el alta en cliente ante cambios de cuenta entre autenticación, lote atómico y siembra de catálogo; añadir pruebas sintéticas de UID y reintentos, sin tocar reglas ni datos reales. Este apartado es un **plan en curso**, no una implementación aprobada.
- Para cerrar el paso siguen faltando recorrido real en entorno aislado con dos cuentas ficticias y revisión visual Android/iPad. No avanzar al paso 3 ni considerar Caja conciliada.

### Resultado del bloque de sesión OWNER (commit `49c6a0b4`)

- `src/lib/businessAuthService.ts`: verifica que el UID de Firebase siga siendo el del OWNER antes de enviar el batch. Si cambia después de confirmar el batch, conserva el resultado del alta y omite la siembra del catálogo para no escribir con la sesión equivocada; informa en consola. No modifica reglas ni registros reales.
- `scripts/test-business-registration-session.mjs`: Auth y Firestore completamente simulados. Verifica tenant y OWNER en un lote, cambio de UID antes de escribir (sin escrituras), cambio tras el commit (sin catálogo cruzado), correo ya autenticado y reautenticación. Integrado en Quality checks.
- [Quality checks #40245218648](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40245218648): **success**, incluidas validación TypeScript, compilación de producción y nueva prueba de sesión.
- [Staged Firestore security tests #40245218642](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40245218642): **success**; emuladores y guard staged aprobados. No se desplegaron reglas.
- **Límites:** no hay recorrido real de alta con dos cuentas ficticias en entorno aislado ni revisión visual Android/iPad. La regla staged original aún permite reserva huérfana sin OWNER; propuesta aislada NO aplicada. El paso 2 permanece **ABIERTO**. Diagnósticos de Caja con `PENDIENTE` continúan sin conciliar.
- **Continuación:** probar registro, configuración, catálogo, publicación, invitación, aceptación y revocación entre dos cuentas ficticias en entorno aislado. Revisar propuesta de seguridad OWNER por separado y sin despliegue; después paso 3.

## Paso 2 — editor de catálogo y publicación ante cambios de sesión (25 de octubre de 2026)

- **Bloque abordado:** al fallar el listener de catálogo, `BusinessCatalogEditor` antes mostraba una lista vacía editable y permitía guardar; podía sobrescribir el menú existente sin haberlo leído. Ahora el editor falla cerrado con `role="alert"` y **Reintentar catálogo**, cancela suscripciones previas y no muestra ni guarda datos del tenant anterior al cambiar de negocio.
- **Servicios:** `saveBusinessCatalog` y `setBusinessPublication` verifican que el UID siga siendo el mismo después de leer permisos asíncronamente y antes de escribir. No cambian roles ni reglas Firebase; el backend continúa siendo la autoridad de permisos.
- **Pruebas nuevas:** `scripts/test-business-catalog-publication-session.mjs` usa servicios reales con Auth/Firestore simulados para dos tenants, rol no autorizado, cambio de UID y despublicación; `scripts/test-business-catalog-editor-read-ui.mjs` monta React en jsdom y simula fallo, reintento, callback tardío y cambio de tenant. Ambas se añadieron a Quality checks.
- **Estado de verificación:** cambios incorporados hasta `d699e727`; CI solicitado, **NO declarar aprobado hasta verificar el resultado**. No hubo compilación local por falta de acceso a dependencias del repositorio en este entorno.
- **Paso 2 sigue ABIERTO:** falta recorrido real aislado de alta/configuración/publicación/invitaciones con dos cuentas, revisión de OWNER atómico (la propuesta solo vive en emulador) y validación visual Android/iPad. Caja con `PENDIENTE` sigue sin conciliar.
- **Siguiente:** comprobar CI y corregir cualquier regresión; después continuar el paso 2 con pruebas integrales de cuentas ficticias, sin desplegar reglas ni datos reales.

### Verificación del bloque catálogo/publicación (commit `f5596f35`)

- [Quality checks #40250568330](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40250568330): **success**. TypeScript, compilación de producción, test de servicios catálogo/publicación con UID simulado y test React/jsdom del editor, más regresiones existentes.
- [Staged Firestore security tests #40250568351](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40250568351): **success**. Emuladores y guard staged, sin cambiar reglas ni datos reales.
- El primer intento [Quality checks #40250386576](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40250386576) **falló por un error del test**: buscaba el nombre del producto en `textContent`, aunque React lo muestra en `input.value`. Se corrigió en `f5596f35` y CI pasó. No se ocultó ni se dio por aprobado el intento fallido.
- **Evidencia limitada:** tests de servicios con Auth/Firestore simulados y React/jsdom, no un recorrido visual en Android/iPad ni cuentas de prueba reales. El defecto staged de OWNER huérfano sigue **PENDIENTE**; conciliación histórica y pagos mixtos de Caja siguen **PENDIENTE**.
- **Paso 2 ABIERTO. Siguiente bloque:** alta → catálogo → publicación → invitación/aceptación/revocación con dos cuentas ficticias en entorno aislado, y revisión separada de la propuesta de reglas OWNER sin despliegue. Paso 3 después de cerrar aislamiento.

## Paso 2 — integración y comprobación local de permisos (25 de octubre de 2026)

- Base integrada: `c1afa15b`. Se conservaron las correcciones automáticas de portal, registro y catálogo; no se reaplicó la implementación local duplicada del portal.
- Nuevas comprobaciones en `test-owner-registration.mjs`: intentar reutilizar un ID ocupado no cambia al propietario ni deja una membresía parcial; un batch con OWNER inválido no deja negocio ni membresía; un empleado revocado no puede reactivarse a sí mismo.
- `firebase.launch-security-emulator.json` se movió desde `scripts/` a la raíz y CI usa la nueva ruta. Corrige la resolución de `docs/firestore.launch-security.STAGED.rules`: antes el arranque buscaba `scripts/docs/` y usaba reglas permisivas hasta que cada prueba cargaba explícitamente sus reglas. Ahora el emulador encuentra el archivo al iniciar. Sin modificar `firebase.json` ni reglas.
- Verificación local aprobada: TypeScript, build de producción, pruebas de servicio de registro/sesión, portal React/jsdom, servicio de catálogo/publicación y lectura del editor React/jsdom. Advertencia de tamaño del bundle persiste.
- Firestore Emulator local: `test-owner-registration.mjs`, `test-launch-security.mjs` y `test-owner-atomic-proposal.mjs` aprobados con identidades sintéticas. Configuración de arranque corregida sin aviso de reglas ausentes. La tercera prueba deriva reglas solo en memoria: no se aplicó su propuesta al archivo staged.
- Límites: no certifica las reglas desplegadas, Firebase Auth real, recorrido visual Android/iPad ni aprobación de beta. Paso 2 sigue abierto; siguiente bloque: recorrido integral de alta/configuración/catálogo/publicación/invitaciones con Auth de pruebas y revisión de OWNER atómico. No repetir las correcciones ya incorporadas.

Reproducción local:

```sh
npx firebase emulators:exec --only firestore --project demo-gioteautomatizo-owner-test --config firebase.launch-security-emulator.json "node scripts/test-owner-registration.mjs && node scripts/test-launch-security.mjs && node scripts/test-owner-atomic-proposal.mjs"
```

## Prioridad de Gio — QR de mesas de Giomero (25 de octubre de 2026)

**Reporte:** en celular el QR no abre; en Xbox abre catálogo sin pedir personas.

- Confirmado en código: el QR multinegocio solo enviaba `tableNumber`; la página pública no tenía entrada de mesa. El sistema operativo de Calientito usa identificadores heredados `table-N` y una lista fija de mesas; no se conectó Giomero a esas sesiones.
- Primera parte implementada para todos los negocios de la página pública: mesa → elección explícita de 1–10 personas → menú. El carrito y la selección se reinician al cambiar de negocio o mesa. Un número de mesa inválido muestra un error en lugar de continuar como pedido genérico.
- Mesa/personas llegan con el pedido (`orderOrigin=MESA_QR`, `tableNumber` y notas) y con el mensaje de WhatsApp. No se añadieron campos que requieran modificar reglas. Se conserva la clasificación de cobro existente hasta integrar sesiones operativas por tenant.
- Nuevos QR de mesa usan `/#negocio/{id}?table=N`, que carga la raíz de la app y resuelve el negocio en el cliente, sin exigir rutas anidadas al hosting. Se siguen leyendo enlaces anteriores `/giomero?table=N` y los QR de Calientito conservan su flujo.
- La cantidad de mesas del generador se reinicia al cambiar de negocio y descarta valores locales no finitos.
- Verificación: TypeScript y build aprobados; jsdom con componente real comprueba selección obligatoria, envío de mesa/personas, cambio de mesa/negocio e identificador inválido. `test-business-table-qr.mts` decodifica QR con un lector independiente (jsQR) y compara URL exacta para tres negocios y cinco mesas. Rutas, canal de pedido y catálogo pasan regresiones. Las pruebas no representan un escaneo con la cámara del usuario ni revisión visual móvil.
- Firestore Emulator: `test-launch-security.mjs` aprobado, incluido pedido público de mesa 3 con 4 personas bajo reglas STAGED. No se desplegaron reglas.
- Pendiente para diagnosticar el celular: obtener el enlace exacto de «Copiar enlace» del QR afectado; verificar dominio publicado frente a dirección temporal y la versión desplegada. No afirmar que cambiar la URL arregló ese caso sin probarlo.
- **No es todavía una sesión de mesa como Calientito:** selección local al abrir el enlace, sin ocupar mesa, compartir comensales entre dispositivos, asignar mesero, llevar cuenta común o liberar mesa. Ese flujo necesita datos y permisos separados por negocio, pruebas de concurrencia y revisión antes de despliegue. No reutilizar `table-N` del sistema heredado.
- Cambios en rama, no publicados. Tras publicar la versión probada, descargar QR nuevos si se quiere el formato portable; los antiguos siguen soportados si su dominio y ruta sirven la app.


## Paso 2 — aislamiento de Empleados e Invitaciones (25 de octubre de 2026)

- Bloque de código: BusinessEmployeesView se remonta por negocio y rol para descartar empleados, invitaciones, enlaces y formularios del tenant anterior. Las lecturas de ambos listados se identifican por petición y se invalidan al desmontar; un error bloquea ediciones y permite reintentar sin mostrar falsamente una lista vacía. Se incorpora un bloqueo síncrono de mutaciones y se comprueba el rol del empleado objetivo antes de editar.
- Prueba añadida a Quality checks: scripts/test-business-employees-isolation-ui.mjs monta React en jsdom con dos negocios ficticios y servicios simulados. Cubre respuestas tardías, errores independientes, reintentos, bloqueo de escritura, doble envío y desaparición del enlace de invitación al cambiar de negocio.
- Verificación del commit 871c9d96: [Quality checks #40260048969](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40260048969) **success** (TypeScript, build, nueva prueba React/jsdom y regresiones); [Staged Firestore security tests #40260048968](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40260048968) **success** (guard staged y emuladores). La aprobación no corrige el diagnóstico PENDIENTE de OWNER huérfano ni valida reglas desplegadas.
- Límites: no prueba Firebase Auth real ni reglas desplegadas. Una operación ya enviada al servidor no puede revertirse desde React. La reserva huérfana de negocio sin OWNER en reglas staged sigue PENDIENTE. La conciliación de Caja y pagos mixtos sigue PENDIENTE.
- Paso 2 ABIERTO: falta recorrido integral de alta, catálogo, publicación, invitación, aceptación y revocación con dos cuentas ficticias en entorno aislado, y validación visual Android/iPad. Siguiente: verificar CI, corregir regresiones y continuar pruebas de permisos; no cerrar paso 2 ni avanzar a paso 3 como completado.


## Paso 2 — aislamiento del API de invitaciones en servidor (25 de octubre de 2026)

- **Bloque:** el backend usa Firebase Admin (que omite reglas de cliente). Se valida `restaurantId`, `userId` y `active` de la membresía contra negocio y UID autenticado, además del identificador del negocio, en creación, listado, revocación y aceptación de invitaciones. La creación vuelve a comprobar los permisos dentro de la misma transacción que emite el token, evitando una autorización obsoleta entre lectura y escritura.
- **Prueba de integración extendida:** `scripts/test-business-invites.mjs` ejecuta API Express real con Auth/Firestore emulados, dos propietarios y negocios ficticios, intentos de lectura/creación/revocación cruzados, membresías inconsistentes, revocación temporal del responsable y recuperación, aceptación y un solo uso del token. No utiliza cuentas ni datos reales.
- **Verificación confirmada en commit `8209cd89`:** [Quality checks #40264713946](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40264713946) **success** (TypeScript, compilación y regresiones) y [Staged Firestore security tests #40264713895](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40264713895) **success**, incluida la integración real de API Express con emuladores Auth/Firestore y los nuevos casos de dos negocios. Esto no valida UI visual ni reglas desplegadas.
- **Paso 2 ABIERTO:** sigue sin aplicarse la propuesta OWNER atómico a reglas staged; alta/configuración/publicación/invitaciones con dos cuentas en navegador aislado y Android/iPad pendientes. Caja y pagos mixtos siguen **PENDIENTE**.
- **Siguiente:** verificar CI; después recorrido integral del paso 2 con cuentas de prueba y revisión separada de reglas OWNER. No repetir URL ni limpieza de navegación.


## Paso 2 — integración real de alta y permisos en emuladores (25 de octubre de 2026)

- **Objetivo:** añadir un recorrido de integración con SDK de Firebase Auth/Firestore cliente y API Express de invitaciones, todo contra emuladores y dos cuentas/negocios ficticios. Cubre alta → OWNER → catálogo inicial → publicación/despublicación → denegación de lecturas/escrituras cruzadas → invitación → aceptación → revocación.
- **Archivos:** `scripts/test-business-registration-emulator.mts` y workflow `security-firestore.yml`. No se cambian reglas, backend de producción, secretos ni datos reales.
- **Evidencia inicial:** prueba y ejecución de CI añadidas; **PENDIENTE confirmar resultados de GitHub Actions del commit de este bloque**. No atribuir aprobación hasta obtener conclusión success. El recorrido usa SDK y emuladores reales, pero no navegador ni Android/iPad.
- **Bloqueo sin resolver:** staged aún admite reservar un negocio sin OWNER en el mismo lote. La propuesta OWNER atómico continúa aislada, sin despliegue ni autorización. Paso 2 **ABIERTO** hasta revisión de reglas y validación visual/manual. Caja histórica/MIXTO continúa **PENDIENTE**.
- **Siguiente:** comprobar y corregir CI de la integración, registrar resultados; luego validar UI con dos cuentas aisladas. Después paso 3 (pedido completo) y paso 4 (Caja).


### Corrección de aislamiento de emuladores (25 de octubre de 2026)

- La primera ejecución de la integración detectó un **fallo de configuración**: Firebase CLI buscaba `scripts/docs/firestore.launch-security.STAGED.rules` y, al no encontrarlo, arrancaba Firestore **permitiendo todas las lecturas/escrituras**. La prueba de aislamiento lo detectó al aceptar indebidamente una lectura cruzada. Esto afecta la validez de pruebas que dependían de las reglas de arranque de ese emulador; no demuestra por sí solo que las reglas reales permitan ese acceso.
- Se corrigieron las rutas relativas en `scripts/firebase.invites-emulator.json` y `scripts/firebase.security-emulator.json` a `../docs/...`, sin tocar reglas. Se añadió un preflight obligatorio `scripts/verify-emulator-rule-paths.mjs` antes de ejecutar pruebas de seguridad para fallar si las reglas faltan.
- El primer CI de integración `74586a69` falló también en TypeScript por dos errores de tipado de la nueva prueba; corregidos en `a9fe38a7`. **PENDIENTE verificar CI del arreglo de rutas y la integración real.** No declarar paso 2 cerrado hasta comprobar resultados, reglas y recorrido visual.


### Ajuste de rutas de proyecto Firebase CLI (25 de octubre de 2026)

- CI de `7c870f55` detectó que la CLI de Firebase rechaza reglas `../docs/...` cuando el archivo de configuración está dentro de `scripts/` (`outside of project directory`). La ruta existe, pero esa configuración **no puede arrancar** con reglas seguras.
- Se sustituyeron los dos archivos de configuración de `scripts/` por equivalentes en la raíz: `firebase.invites-emulator.json` y `firebase.security-emulator.json`. Ambos apuntan a `docs/...` dentro de la raíz del proyecto. Se actualizaron todas las invocaciones del workflow y el preflight comprueba además que las reglas no estén fuera de la raíz.
- **PENDIENTE verificar el nuevo CI** y corregir posibles fallos de la integración de dos cuentas. Las ejecuciones fallidas anteriores no prueban aislamiento ni autorización correcta.


### Verificación final del bloque de integración Auth/Firestore (commit `33afc85f`)

- [Quality checks #40270096838](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40270096838): **success**. TypeScript, build de producción y regresiones existentes.
- [Staged Firestore security tests #40270096710](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/40270096710): **success**. Se cargaron las reglas staged desde archivos de raíz; preflight pasó para las tres configuraciones y el nuevo test de integración imprimió: `PASS: alta real de dos cuentas y tenants, catálogos, publicación, aislamiento, invitación, aceptación y revocación en emuladores.`
- La integración usa **Firebase Auth cliente y Firestore cliente reales conectados a emuladores**, API Express real con Firebase Admin emulado, dos propietarios ficticios y un empleado ficticio. Comprueba altas con membresía OWNER, catálogo sembrado, publicación/despublicación, denegaciones de lecturas y escrituras cruzadas, invitación, aceptación de un solo uso y revocación de acceso. No se usaron credenciales ni datos reales.
- **Regresión corregida:** las configuraciones previas dentro de `scripts/` apuntaban a reglas inexistentes y permitían arranques permisivos. La primera integración detectó la falsa autorización; se trasladaron las configuraciones a raíz y se añadió verificación obligatoria de rutas. Los primeros intentos fallaron por tipos de la prueba, rutas de Firebase CLI y expectativas de denegación; los fallos se corrigieron y el commit `33afc85f` pasó ambos workflows.
- **Paso 2 sigue ABIERTO:** el recorrido no monta navegador/Android/iPad; la reserva huérfana de negocio sin OWNER atómico en reglas staged originales sigue **PENDIENTE** de revisión humana. No se desplegaron reglas ni se certificó producción. Caja y MIXTO históricos siguen **PENDIENTE**. Siguiente: revisión aislada de la propuesta OWNER y validación visual/manual con dos cuentas ficticias; después paso 3.


## Paso 2 — colisiones, visibilidad y recuperación de sesión en integración emulada (25 de octubre de 2026)

- **Alcance elegido tras revisar CI:** el HEAD `c2cacd78` tenía Quality checks #40270343749 y Staged Firestore security tests #40270343659 en **success**. Se amplía la integración existente, sin repetir la corrección de rutas, el envío público, la URL ni Clientes/Membresías.
- **Prueba ampliada:** `scripts/test-business-registration-emulator.mts` cubre el intento de registrar un handle ocupado por otro propietario y comprueba que B conserve sesión, catálogo y membresía; comprueba lectura anónima de ficha y catálogo publicados de A, bloqueo de B despublicado y configuración privada; empleado KITCHEN solo consulta su tenant y no edita catálogo; al revocar su acceso, el listado de negocios queda vacío; A y B recuperan sus propios negocios al volver a iniciar sesión.
- **Evidencia:** prueba de integración con SDK Firebase Auth/Firestore y API Express sobre emuladores, no una navegación visual. **PENDIENTE CI del commit de esta ampliación**; no afirmar aprobación hasta ver resultado. Sin cambio de reglas staged ni desplegadas.
- **Bloqueos abiertos:** propuesta OWNER atómico aún sin autorización ni aplicación; revisión visual Android/iPad y recorrido UI completo pendientes. Caja histórica y MIXTO continúan **PENDIENTE** aunque otros scripts salgan con código cero.
- **Siguiente paso:** comprobar TypeScript/build y test de integración en GitHub Actions; corregir regresiones, registrar evidencia y seguir con validación UI del paso 2. Paso 3 solo después de resolver las puertas de seguridad.
