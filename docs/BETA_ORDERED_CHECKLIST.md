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
