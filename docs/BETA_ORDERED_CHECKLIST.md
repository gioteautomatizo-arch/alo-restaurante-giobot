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
