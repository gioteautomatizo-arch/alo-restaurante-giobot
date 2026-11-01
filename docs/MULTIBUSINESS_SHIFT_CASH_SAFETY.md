# Corte de Caja multinegocio: comprobaciones antes del lanzamiento
Corte de revisión: 23 de octubre de 2026

## Implementado en la rama de desarrollo
- Los datos de pedidos, turnos, gastos y resguardo se consultan para un solo negocio.
- Mientras falte alguna de las cuatro consultas, no se permite abrir ni cerrar turno.
- Si una consulta falla, se informa y no se presenta el saldo como cero.
- Si hay dos o más turnos abiertos en el negocio, se bloquea la operación manual en esa vista.
- El fondo inicial empieza vacío: el usuario debe escribir expresamente el efectivo real (incluido $0 si corresponde); no se precarga $500 ni $0.
- Efectivo inicial y contado se validan: valores no negativos y dos decimales como máximo.
- Si un turno abierto carece de fecha de apertura válida, la vista bloquea su cierre y evita calcular ventas desde el inicio de la época Unix (1970). No repara automáticamente el registro.
- Si un pedido creado durante el turno figura pagado pero carece de fecha de cobro válida, se avisa y se bloquea el cierre de ese turno (no se corrige ni altera el pedido).
- Se conserva la separación entre estado de entrega y registro de cobro de un pedido.
- Hay pruebas puras en scripts/test-business-shift-readiness.mts, ejecutadas desde Quality checks.

## Restricciones y bloqueos conocidos
- Estas validaciones son **de interfaz**, no una garantía transaccional contra dos cajeros abriendo turnos simultáneamente: se requiere validación segura en backend/reglas.
- Firestore en producción no fue modificado ni se presume igual a las reglas versionadas.
- onSnapshot puede entregar cache local; antes de un cierre contable real debe existir estrategia de conciliación con estado confirmado en servidor.
- El cobro universal no está terminado. No convertir manualmente pendientes en pagados sin verificación de reglas y permisos.
- Pedidos pagados sin fecha de pago requieren conciliación; nunca deben asignarse silenciosamente a un turno. La nueva protección cubre los creados desde la apertura; pedidos anteriores cobrados durante el turno podrían seguir sin identificarse: se necesita conciliación backend e historial antes de producción.
- En Reportes multinegocio, los pedidos PAGADO sin `paidAt` válido ahora se excluyen de ventas por día y se muestra su cantidad pendiente de conciliación en todo el historial consultado. Antes se atribuían a `createdAt`, lo que podía alterar las ventas diarias. Este cambio es solo de lectura y no modifica pedidos ni cobros.
- Esta corrección puede hacer que el total mostrado disminuya respecto a versiones anteriores si existen cobros históricos sin fecha: **no implica pérdida de dinero ni cancelación de pagos**; exige conciliación documental antes de presentar reportes como definitivos.
- Los tests automatizados NO equivalen a prueba visual ni a certificación contable.

## Prueba visual de bajo riesgo
1. Abrir la interfaz administrativa de un negocio de DEMO.
2. Confirmar que la pantalla de Turno muestra consulta de datos antes de mostrar el fondo inicial.
3. Con acceso adecuado, corroborar que el fondo está vacío y que se exige ingresar el monto real (incluido cero).
4. Verificar que las lecturas fallidas muestran aviso de error (NO 'sin ventas').
5. Comprobar solo con pruebas unitarias que un turno con fecha de apertura ausente o inválida queda bloqueado; no alterar registros reales para provocar el caso.
6. No abrir/cerrar turnos ni registrar cobros de negocios reales durante esta revisión.

## Pendiente para habilitar cobros y cierre de caja en producción
- Definir operación transaccional backend/Firestore por negocio, turno y pedido, sin doble cargo.
- Validar roles autorizados con emulador y reglas efectivamente desplegadas.
- Conciliar fecha de pago, tickets, gastos y movimientos de efectivo y simular carreras de dos cajeros.
- Preparar despliegue solo tras revisión y autorización explícita, sin tocar producción por defecto.

## Matriz de conciliación sintética (24 de octubre de 2026)

Los siguientes casos están cubiertos por `scripts/test-shift-sales.mts`. **PASS en GitHub Actions significa que se verificó el comportamiento descrito, no que las discrepancias hayan sido corregidas.** Todos los importes son ficticios.

| Caso | Comportamiento observado | Estado y criterio de salida |
| --- | --- | --- |
| MIXTO con desglose completo | $90 = $30.25 efectivo + $59.75 tarjeta | Verificado en pruebas; conservar centavos y método. |
| MIXTO sin desglose | Ticket cerrado: $0 clasificado; pago de mesa: $90 a plataformas | **Pendiente:** no atribuir automáticamente los $90 a transferencia; contrastar comprobantes. |
| MIXTO parcial | Total declarado $90; métodos suman $30 | **Pendiente:** identificar documentalmente los $60 faltantes. |
| MIXTO excesivo | Total declarado $90; métodos suman $110 | **Pendiente:** investigar $20 de exceso; no considerarlos ingresos. |
| Pedido pagado sin `paidAt` | Caja usa `createdAt` y suma $50; Reportes no lo suma y alerta | **Pendiente:** reconstruir fecha de cobro verificable sin inventarla. |
| Método externo no reconocido | Caja clasifica $45 como plataformas; Reportes conserva $45 sin clasificar | **Pendiente:** mantener método desconocido visible hasta tener evidencia. |
| Pedido externo de $0 y −$10 | Turno: $0 / 0 pedidos; diario y Reportes: −$10 / 2 pedidos | **Pendiente:** definir tratamiento contable de ceros/negativos; no presumir devoluciones. |
| Pagos de mesa de $0 y −$10 | Turno: $0 / 2 pagos; diario: −$10 / 2 pagos | **Pendiente:** alinear criterios solo tras revisión contable. |

### Orden seguro para resolver

1. Crear un inventario **sin datos personales** de los tipos de discrepancia y su frecuencia en un entorno autorizado; no consultar ni modificar producción en esta fase.
2. Definir invariantes contables: total declarado, suma del desglose, método desconocido, fecha de cobro comprobable y tratamiento explícito de cero/negativos.
3. Añadir pruebas de regresión con datos sintéticos para cada política aprobada, incluyendo bordes de turno y medianoche de Ciudad de México.
4. Proponer por separado un cambio de cálculo, revisable y reversible, con comparación antes/después; no activarlo ni desplegarlo sin autorización.
5. Exigir revisión de seguridad, aislamiento por negocio y pruebas visuales de Caja/Reportes antes de dar por conciliado el MVP.

No se ejecutó migración, escritura de Firestore, cobro, despliegue ni publicación al documentar esta matriz.

## Bloqueo identificado: cobro de mesa legado frente a nuevos negocios (24 de octubre de 2026)

Revisión estática, **sin ejecutar cobros ni acceder a datos de clientes**:

- En `src/lib/paymentsService.ts`, `subscribeToTablePayments` consulta pagos filtrados por `getActiveRestaurantId()`, pero `settleTableAccount` acepta órdenes frescas solo cuando `order.restaurantId === RESTAURANT_ID`; esa constante sigue siendo `'alo-restaurante'`. El pago que se construiría, en cambio, usa `restaurantId: getActiveRestaurantId()`. **Riesgo funcional:** si el flujo legado se utiliza para cobrar una mesa de otro negocio, no encontrará órdenes elegibles y rechazará el cobro. No asumir que el POS multinegocio usa esta ruta sin trazar antes sus llamadas.
- En `src/lib/shiftSales.ts`, `computeShiftSalesAll` y `computeShiftSalesCombined` reciben listas de pagos y pedidos y **no comprueban por sí mismas el negocio**. El aislamiento depende de que los suscriptores/llamadores entreguen listas del mismo tenant; la coincidencia de totales no prueba aislamiento.
- En `src/lib/ordersService.ts` existe una suscripción multinegocio explícita `subscribeToBusinessRestaurantOrders(businessId, ...)`, distinta del listener histórico basado en el negocio activo. No mezclar ambas rutas sin validar el cambio de contexto.

**Criterio de salida antes de habilitar cobros de mesa multinegocio:** trazar qué interfaz llama a `settleTableAccount`, diseñar un identificador de negocio consistente para lectura/transacción/escritura, comprobar en emuladores dos tenants con pedidos de mesa sintéticos y verificar permisos/aislamiento, idempotencia y conciliación del turno. Cualquier cambio de cobro o reglas necesita revisión y autorización separadas. **No se corrigió ni habilitó este flujo en producción.**


## Trazado de llamadas: cobro legado frente a turno multinegocio (24 de octubre de 2026)

Revisión estática de las referencias de código, sin ejecutar operaciones de Caja:

- Ruta de cobro de mesa **legada**: `src/components/admin/AdminDashboard.tsx` muestra `TableAccountsView`; `src/components/admin/TableAccountsView.tsx` envuelve `TableAccountsCoreView`; `src/components/admin/TableAccountsCoreView.tsx` llama directamente a `settleTableAccount` de `src/lib/paymentsService.ts`. La búsqueda de referencias de GitHub encontró **un único llamador directo** de `settleTableAccount` en el código fuente. Esto confirma que el riesgo del identificador fijo sí está conectado a una pantalla administrativa, pero **no demuestra** que esa pantalla esté habilitada para todos los negocios.
- Ruta de turno **multinegocio**: `src/components/platform/BusinessShiftView.tsx` recibe `businessId`, consulta pedidos con `subscribeToBusinessRestaurantOrders(businessId, ...)` y módulos de turnos/gastos/resguardo con `subscribeToModule(businessId, ...)`. Calcula ventas con `computeShiftSalesFromOrders`; **no llama** a `settleTableAccount`. Esto separa los dos flujos en el código, pero no certifica que los cobros de mesa sean seguros para un tenant nuevo.
- Ruta de corte **legada**: `src/components/admin/ShiftControlView.tsx` y `src/components/admin/AdminDashboard.tsx` reciben pagos con `subscribeToTablePayments` y pedidos con `subscribeToRestaurantOrders`, y llaman a `computeShiftSalesAll`. La función suma las listas recibidas y no verifica por sí misma `restaurantId`; hay que auditar los filtros de cada suscripción y los cambios de negocio.
- Prueba previa a cualquier habilitación: con **dos negocios sintéticos** y emuladores, comprobar que un pedido del negocio B no se puede cobrar desde A, que un pago de B jamás aparece en el corte de A y que la operación es idempotente ante dos cajeros. No intentar la prueba contra Firestore real ni modificar el flujo transaccional hasta aprobar el diseño de aislamiento.

**Alcance:** solo trazado de referencias; sin modificación de interfaz, reglas, transacciones, importes o datos. Las comprobaciones automatizadas existentes no equivalen a una prueba de cobro multinegocio.

 
## Protección de Caja del 31 de octubre de 2026 — sin migración

La rama multinegocio corrigió cálculos de lectura, no cobros históricos. `computeShiftSalesFromOrders` y `offTableSalesForDay` no usan `createdAt` como fecha de cobro cuando falta `paidAt`. `computeShiftSalesFromPayments`, `computeShiftSalesFromReceipts` y `paymentsSalesForDay` excluyen de los importes clasificados los MIXTO sin desglose, parciales, excesivos o con método/centavos inválidos. El dinero sigue registrado en su documento original; excluirlo de la clasificación **no equivale a borrarlo ni conciliarlo**.

`auditUnclassifiedPaidOrders` alimenta un aviso y bloqueo de cierre de turno para pedidos pagados del turno con método desconocido o importe no positivo; la alerta de fechas históricas sin `paidAt` permanece separada. [Quality #41244841516](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41244841516) pasó TypeScript, compilación y pruebas sintéticas de Caja sobre `4943d12b`. No hubo prueba visual ni validación de reglas remotas.

**PENDIENTES:** método desconocido permanece en `unclassifiedPaymentTotal` de Reportes pero no se inventa como categoría de Caja; la UI de turno no lee `table_payments` y no bloquea anomalías MIXTO de mesa; pedidos externos cero/negativos siguen divergiendo entre diario/Reportes y turno. La reversión es por código; no se modificaron reglas ni datos.

 
**Regresión adicional protegida:** `859d78ee` exige que un método principal no MIXTO sea reconocido y, si trae desglose, que éste contenga exactamente ese método; un método desconocido con desglose aparentemente válido no se clasifica. `b5fb8f07` cubre método desconocido y desglose MIXTO duplicado en pruebas sintéticas. [Quality #41245269025](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41245269025) aprobó TypeScript, build y pruebas sobre ese SHA. Sigue pendiente revisión documental de pagos reales y de reglas remotas.


## Paso 4 — coherencia de cobros externos entre Caja y Reportes (31 de octubre de 2026)

**Cambios de lectura, sin migración ni cobros reales:** `src/lib/shiftSales.ts` comparte la validación de importes positivos en centavos y métodos explícitos para turno, corte diario y auditoría. `src/lib/businessReports.ts` deja de sumar como ventas conciliadas los pedidos pagados con método desconocido, total cero/negativo o fracciones de centavo; los mantiene visibles por separado en `unclassifiedPaidCount`, `unclassifiedPaymentTotal` y `anomalousPaidCount`. `BusinessReportsView.tsx` muestra la alerta incluso si no hay ninguna venta verificable en el periodo. El origen de los registros no se modifica ni se trata un importe negativo como devolución.

**Pruebas sintéticas:** `scripts/test-shift-sales.mts` compara Caja, corte diario y Reportes con cobros válidos y anómalos; `scripts/test-business-reports.mts` comprueba contadores, periodos, ausencia de mutación y la presencia estática del aviso en estado vacío. [Quality #41248696530](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41248696530) aprobó TypeScript, build, ambas suites y los demás pasos sobre el commit funcional `56beca5a`. Esto no prueba UI visual ni reglas efectivas de Firebase.

**Riesgos pendientes:** pagos MIXTO de mesa no se cargan en `BusinessShiftView`, por lo que esa pantalla aún no bloquea sus anomalías; `computeShiftSalesFromPayments` conserva conteos de pagos anómalos aunque sus importes estén excluidos; falta conciliación documental histórica, revisión de filtros entre tenants y pruebas Android/iPad. La vista Reportes solo lee pedidos, no tickets de mesa, y por tanto no equivale al corte de Caja. La clasificación no autoriza cerrar turnos con datos faltantes.

**Rollback:** revertir `shiftSales.ts`, `businessReports.ts`, `BusinessReportsView.tsx` y las dos suites al estado anterior a `009b1de6` (sin tocar datos ni reglas). No activar cambios de seguridad ni despliegues en esta tarea. **PASO 4 PARCIAL: no hay conciliación histórica aprobada.**


## Paso 4 — conteo de pagos de mesa y diagnóstico sin mutación (31 de octubre de 2026)

**Cambio de lectura, no conciliación:** `computeShiftSalesFromPayments` solo aumenta `count` cuando el registro PAGADO de mesa tiene importe positivo en centavos exactos y método/desglose íntegramente clasificable. Antes, los registros MIXTO parciales/excesivos, método desconocido o importe no positivo aumentaban el contador del turno aunque aportaran cero a los ingresos; `paymentsSalesForDay` ya los excluía. Ahora ambos contadores representan pagos **clasificados**, no documentos históricos consultados. `computeShiftSalesFromReceipts` sigue contando tickets cerrados, una métrica distinta: no confundirlos ni usar su conteo para afirmar conciliación de pagos de mesa.

La función pura `auditUnclassifiedTablePayments` cuenta por ventana temporal registros de mesa pagados pero no clasificables y suma aparte únicamente importes positivos de centavos exactos (monto **pendiente de comprobación**, no ingreso verificado). Los registros sin fecha válida no se atribuyen a ningún turno. La función no consulta Firebase, no filtra por tenant ni escribe: **solo usar con un feed cuyo aislamiento por `restaurantId` y permisos se haya probado**. La vista `BusinessShiftView` todavía no consulta `table_payments` y por ello no muestra ni bloquea estas anomalías; conectar el feed exige revisión de reglas y de doble contabilización con pedidos de mesa.

Pruebas sintéticas A/B y de ventana temporal en `scripts/test-shift-sales.mts` comprueban conteos, importes, MIXTO válido/parcial, método desconocido, fechas inválidas, centavos inválidos y no mutación. **No se desplegaron reglas ni se alteraron cobros.** Reversión: restaurar `shiftSales.ts` y `test-shift-sales.mts` a la revisión anterior al bloque; no requiere migración. **PASO 4 PARCIAL:** faltan comprobantes históricos, feed seguro de mesa y recorrido visual/manual.


## Paso 4 — lectura aislada de pagos de mesa (31 de octubre de 2026)

Se añadió `src/lib/businessTablePayments.ts` con `subscribeToBusinessTablePayments(businessId, onData, onError, firestore?)`. El servicio **solo lee** `table_payments` con `where('restaurantId', '==', businessId)`, rechaza identificadores vacíos o con espacios exteriores, comprueba el tenant de cada documento, ordena los resultados y devuelve una función para cancelar la suscripción. Un error de Firestore se entrega por `onError` **sin llamar a `onData([])`**: no confundir denegación o pérdida de conexión con cero ventas. No usa el contexto global legado `getActiveRestaurantId()`.

`scripts/test-business-table-payments-emulator.mts` prueba el listener de producción con Firestore SDK y reglas STAGED en emulador: propietarios A/B, responsable activo, miembro revocado, extraño, anónimo, consultas cruzadas, consulta sin filtro y escritura no autorizada. Se ejecuta en `security-firestore.yml` con un proyecto ficticio aislado. El test NO comprueba las reglas realmente publicadas en Firebase, ni el acceso desde dispositivos reales. No se creó ninguna regla nueva ni se cambió el flujo de cobro.

**Integración deliberadamente pendiente:** `BusinessShiftView` todavía no consume este feed, y el cierre multinegocio sigue calculando ventas solo desde pedidos; por tanto **no usar su total como conciliación definitiva de mesas**. Antes de integrar: validar en emulador que `table_payments` y `restaurant_orders` no se dupliquen, que cada pago corresponda a un solo negocio y turno, que los pagos sin fecha o MIXTO incompletos bloqueen el cierre y que los cambios de tenant descarten callbacks tardíos. Luego verificar reglas desplegadas, permisos reales y Android/iPad. Los pagos históricos requieren comprobantes y revisión humana.

**Reversión:** eliminar `src/lib/businessTablePayments.ts`, su test y paso de CI; revertir esta nota y el checklist. No hay migración, reglas desplegadas ni datos modificados. **PASO 4 PARCIAL, NO CONCILIADO.**


## Paso 4 — preflight de correspondencia pago/pedido por tenant (31 de octubre de 2026)

`src/lib/tablePaymentReconciliation.ts` introduce `reconcileTenantTablePayments(businessId, payments, orders, shiftStart, shiftEnd?)` como **auditoría pura, sin escrituras**. Exige el mismo `restaurantId` en todas las filas (también pedidos externos), IDs únicos, referencias recíprocas `table_payments.orderIds` ↔ `restaurant_orders.paymentId`, pedidos de mesa efectivamente cobrados, fechas de cobro concordantes, importes/subtotal/descuento/propina en centavos exactos y método/desglose clasificable. Detecta pedidos pagados sin un pago de mesa observado, órdenes referenciadas por dos pagos y pagos anulados. Ante cualquier incidencia devuelve `tableTotals: null`, nunca un total parcial. El resultado `authorizesClose` es **siempre false**, incluso sin incidencias.

El cálculo solo usa `computeShiftSalesFromPayments` para pagos de mesa; los pedidos de mesa NO se vuelven a sumar como ventas. El test sintético `scripts/test-table-payment-reconciliation.mts` incluye dos tenants A/B, pago MIXTO, pedido externo adicional, duplicados, referencias faltantes, importe discrepante, fecha inválida y límites de turno. Se incorpora a Quality; las verificaciones exactas de CI se registran en el checklist una vez disponibles.

**Limitaciones que bloquean integración:** la función no demuestra que ambas consultas sean completas ni del mismo instante de servidor, ni verifica las reglas realmente desplegadas. No está conectada a `BusinessShiftView`, no habilita cierres ni cobros, y no repara pagos históricos. Un pago antiguo con fecha ausente o un pedido marcado pagado sin `paidAt` exige revisión documental; no inventar la fecha. Para integrar, probar consistencia de snapshots y permisos efectivos, bloqueo de cierre con MIXTO incompleto, cambios de sesión, y recorrido visual/manual Android/iPad. Reversión: revertir el archivo nuevo, su test, el paso de Quality y estas notas; sin migración de datos ni cambios de Firebase.


## Paso 4 — diagnóstico conjunto de pagos y pedidos de mesa A/B (31 de octubre de 2026)

`src/lib/businessTableReconciliationFeed.ts` coordina dos suscripciones Firestore **solo lectura** (`table_payments` y `restaurant_orders`) filtradas por `restaurantId == businessId` explícito. Rechaza IDs inválidos y filas ajenas; descarta instantáneas procedentes de caché o con escrituras locales pendientes y no produce diagnóstico hasta recibir ambas fuentes desde servidor. Si cualquiera falla, emite `error` y no publica cero ni totales parciales. Su función de cancelación impide callbacks posteriores al desmontar/cambiar de negocio. El estado `diagnostic` invoca la auditoría conservadora existente; `atomic: false` y `authorizesClose: false` son invariables, incluso sin incidencias.

**Advertencia fundamental:** dos queries independientes, aunque hayan recibido respuestas del servidor, **NO son una instantánea atómica**. Entre callbacks puede cambiar un pedido o pago; una auditoría sin incidencias no certifica integridad de un corte. Este coordinador no está conectado a `BusinessShiftView`, no habilita cierres, no altera pagos, reglas ni documentos, y no sustituye una transacción/autoridad contable del servidor. Un estado `loading` puede significar caché, conexión pendiente o lectura aún no confirmada; no se interpreta como saldo cero. Tras un error se requiere cancelar y suscribir de nuevo, nunca reintentar escrituras.

`scripts/test-business-table-reconciliation-feed-emulator.mts` usa el servicio de producción contra el emulador y reglas STAGED con dos tenants, propietarios, cuenta ajena, miembro revocado y anónimo. Comprueba separación de A/B, pago MIXTO íntegro, MIXTO parcial sin total, referencia no recíproca, recuperación tras nueva suscripción y prohibición permanente de cierre. El workflow `security-firestore.yml` lo ejecuta sin tocar Firebase real. **No extrapolar a reglas desplegadas**. CI exacto y cualquier fallo se registran en el checklist.

**Pendientes de salida:** auditoría histórica con comprobantes; comprobación de permisos desplegados; instantánea conjunta consistente/autorización de cierre por servidor; pruebas manuales Android/iPad; y validación del flujo de cobro de mesa multinegocio. **PASO 4 PARCIAL, NO CONCILIADO.** Reversión: retirar el coordinador, su test, su paso de Security y estas notas; no hay migración.


### Barrera de cierre ante mesa no conciliada (1 de noviembre de 2026)

La vista de Caja multinegocio no dispone de un feed de pagos de mesa con garantía transaccional. Un pedido PAGADO de `dine_in` o sin `orderType` verificable no es un ingreso de mesa conciliado. La vista solo presenta `pickup/delivery` como ventas **provisionales** y bloquea cierre si hay pedidos de mesa pagados en el turno o sin fecha de cobro. Un pago anterior con fecha verificable fuera del turno no bloquea el turno actual. Ningún cobro se reasigna ni se modifica.

Este control React NO es autoridad de servidor y no prueba completitud de snapshots, permisos efectivos ni conciliación histórica. No conectar el feed de mesa ni habilitar cierre automático por el diagnóstico. Reversión: retirar auditoría, guardia de interfaz y pruebas, sin migración.


## Paso 4 — preflight aislado de autoridad para apertura/cierre de turnos (1 de noviembre de 2026)

**Riesgo reproducible del diseño actual:** `src/lib/tenantModules.ts` guarda turnos mediante `setDoc` desde Firebase SDK cliente. Las reglas STAGED para `businesses/{businessId}/shifts/{shiftId}` solo exigen rol y `businessId` en creación/actualización: no verifican transición `abierto → cerrado`, importe, `openedAt/closedAt`, origen de pagos ni versión del documento. Un OWNER o CASHIER autorizado puede sobrescribir el mismo cierre desde dos clientes, crear un turno ya cerrado o reabrirlo; la guardia de `BusinessShiftView` no impide escrituras directas por SDK. Las reglas del repositorio **no certifican** las realmente desplegadas.

**Ensayo sin despliegue:** `scripts/shift-server-authority-proposal-rules.mjs` construye exclusivamente en memoria una variante que niega `create/update` cliente de `shifts`, sin alterar lectura ni otros módulos. `scripts/test-shift-server-authority-proposal.mjs` comprueba con Firestore Emulator y dos negocios ficticios la brecha STAGED, la denegación del candidato, roles ajenos/revocados/anónimos, doble intento de cierre, conservación del documento y escritura privilegiada simulada. Se incorpora a Staged Firestore Security; registrar su resultado exacto en el checklist. La prueba imprime **PENDIENTE** para recordar que el backend no existe.

**NO desplegar la propuesta:** bloquearía también la apertura/cierre legítimos del cliente actual. Antes de cualquier cambio efectivo hacen falta un endpoint autenticado con Firebase Admin SDK, verificación de membresía/rol y tenant en servidor, transacción con precondición de estado/versión para evitar dobles cierres, una sola apertura por negocio, datos completos y coherentes de pedidos/pagos/gastos/resguardo, bloqueo de MIXTO/fechas/importes anómalos, bitácora idempotente y pruebas de recuperación, concurrencia y compatibilidad histórica. Una transacción que solo actualiza el documento `shifts` NO certifica por sí sola la conciliación contable; si no hay snapshot/autoridad suficiente debe rechazar el cierre.

**Reversión:** eliminar los dos scripts de propuesta/prueba, su paso de `security-firestore.yml` y estas notas/checklist. No se cambiaron `firestore.rules`, reglas STAGED, backend operativo, cobros ni datos reales. **PASO 4 ABIERTO: sin autorización de servidor ni conciliación histórica.**


## Paso 4 — apertura transaccional aislada (1 de noviembre de 2026)

`src/lib/shiftOpenAuthorityPreflight.mjs` implementa un **preflight no conectado** que solo puede ser invocado desde un contexto con Firebase Admin SDK. Recibe un UID que en una futura ruta deberá provenir de `verifyIdToken(token, true)`, nunca de un parámetro del cliente. En una sola transacción lee raíz de negocio, membresía activa, candado `businesses/{id}/shiftAuthority/current` e historial acotado de turnos (máximo 200). Exige tenant coincidente, rol OWNER/ADMIN/MANAGER/CASHIER y OWNER consistente con la raíz; rechaza históricos sin `businessId` o estados ambiguos, más de 200 registros y cualquier turno abierto sin candado verificable. El primer intento crea turno y candado en la misma transacción; el mismo `requestId` y UID devuelve idempotencia sin escribir; un segundo cajero o intento distinto no abre otro turno.

**Límites deliberados:** no existe endpoint, ni conexión con `BusinessShiftView`, ni apertura en producción. El candado no se libera: no hay ruta de cierre; es un preflight que permanece bloqueado tras la primera apertura hasta implementar cierre de servidor. El escaneo de 200 turnos es una barrera conservadora, no una solución escalable para historiales largos. La prueba de emulador `scripts/test-shift-open-authority-preflight.mjs` usa datos inventados A/B, roles, revocación, concurrencia, reintento y legado; su resultado en CI debe constar en el checklist.

**Advertencia:** STAGED sigue permitiendo escrituras directas desde cliente; un atacante con rol válido puede eludir este preflight. No se tocaron reglas, backend operativo, cobros ni datos reales. **NO desplegar** el candidato server-only antes de migrar la apertura/cierre legítimos. Tampoco hay conciliación de pagos MIXTO ni cierre autorizado. Próximo: servicio de cierre con consistencia de pedidos/pagos/gastos/resguardo, concurrencia y compatibilidad histórica; evaluar transición de clientes y reglas solo tras revisión.

**Reversión:** eliminar el módulo preflight, su prueba y paso en `security-firestore.yml`, y revertir esta documentación/checklist. No requiere migración porque no está conectado.


## Paso 4 — preflight aislado de cierre transaccional (1 de noviembre de 2026)

`src/lib/shiftCloseAuthorityPreflight.mjs` es un **experimento Admin sin endpoint** que complementa la apertura aislada. Lee dentro de una transacción la raíz, membresía activa y rol, turno y candado, recibo idempotente, historial acotado (máximo 200 por fuente), pedidos `restaurant_orders` del tenant, pagos `table_payments` del tenant, gastos y movimientos de resguardo. Exige un único turno abierto y candado coincidente. Para pedidos PAGADOS del intervalo admite únicamente `pickup/delivery` con fecha ISO y método explícito efectivo/tarjeta/transferencia e importe positivo en centavos; rechaza mesa, MIXTO, método desconocido, fecha ausente, gasto/resguardo anómalo, tenant discordante e históricos ambiguos. **Cualquier pago de mesa del negocio bloquea el cierre** hasta contar con conciliación autoritativa, incluso si es anterior al turno: restricción intencional de este preflight, no solución histórica.

Para el subconjunto válido calcula en centavos ventas por método, gastos pagados desde caja, neto de resguardo, efectivo esperado y diferencia contada. En la misma transacción actualiza el turno, libera el candado de apertura y crea un recibo inmutable `shiftAuthority/closed-{shiftId}` para rechazar un segundo cierre y responder a reintentos idénticos del mismo UID/requestId. No acepta importes calculados por el cliente. La prueba `scripts/test-shift-close-authority-preflight.mjs` usa Firebase Emulator y negocios ficticios A/B: acceso ajeno/revocado, doble cierre concurrente, reintento, fechas, pagos MIXTO/mesa, gasto inválido, cálculos, siguiente apertura y no contaminación de tenants. Se ejecuta en `security-firestore.yml`; verificar resultado exacto de CI antes de considerarlo probado.

**No es autorización de producción:** el UID, hora y nombre todavía son parámetros del preflight, no datos extraídos de una ruta autenticada; la aplicación no lo invoca y las reglas STAGED permiten escrituras directas de turnos/pedidos/gastos. Una transacción con consultas filtradas por tenant no prueba completitud frente a registros históricos sin `restaurantId` ni escrituras cliente posteriores al cierre. No hay respaldo, reconciliación histórica, corte real, verificación de reglas desplegadas ni validación Android/iPad. **NO publicar reglas server-only** sin ruta compatible, migración y revisión humana. Si cualquier test imprime `PENDIENTE`, el paso 4 sigue ABIERTO.

**Reversión:** retirar `shiftCloseAuthorityPreflight.mjs`, su test, el paso de Security, su entrada en inventario de membresías y estas notas/checklist. No hay migración ni modificación de datos reales.


## Paso 4 — contrato HTTP de Caja aislado, sin rutas públicas (1 de noviembre de 2026)

`src/lib/shiftAuthorityHttpHandlers.mjs` expone `createShiftAuthorityHttpHandlers({ auth, db, now })` que construye dos **manejadores no registrados** (`open` y `close`) para los preflights Admin existentes. No se importa en `server.ts`, no abre rutas HTTP ni modifica el cliente. Cada petición requiere `Authorization: Bearer <Firebase ID token>` y llama a `auth.verifyIdToken(token, true)` (revocación). El UID y el nombre salen exclusivamente de las reclamaciones verificadas; la hora de apertura/cierre se genera en el servidor. No acepta campos cliente `actorUid`, `openedAt`, `closedAt`, ventas calculadas ni estados. Valida lista estricta de campos: apertura `businessId, requestId, initialCashFund`; cierre `businessId, shiftId, requestId, countedCash` y `notes` opcional. El preflight transaccional verifica tenant, rol, membresía y dinero; los errores se reducen a códigos HTTP sin exponer datos de otros negocios ni detalles internos de Firestore.

`scripts/test-shift-authority-http-handlers.mjs` ejecuta estos manejadores directamente con un Auth **simulado** que exige `checkRevoked=true`, y Firebase Admin Firestore **real contra Emulator** con A/B ficticios. Comprueba inyección de UID/hora/totales, tokens inválidos/revocados, cuenta ajena, apertura única, MIXTO rechazado, dos cajeros compitiendo, reintento idempotente y separación de negocios. También falla si `server.ts` registra accidentalmente estos manejadores o rutas `/api/shift(s)`. La prueba está en el workflow Staged Security; un CI verde no verifica el comportamiento de un proveedor Auth real ni despliegues.

**Compatibilidad que impide activación:** `BusinessShiftView.tsx` sigue llamando `saveModuleDoc('shifts')` desde SDK cliente; `tenantModules.ts` hace `setDoc` sin transacción. Los IDs históricos del cliente son aleatorios y el cierre Admin aislado exige `srv-<hash>`, candado y recibo de autoridad. Por ello no puede sustituirse directamente el flujo ni desplegar la regla server-only: rompería aperturas/cierres vigentes y dejaría turnos legados sin cierre. El guard de la UI es provisional; STAGED todavía permite el bypass de escrituras cliente. Se necesita un plan de corte que cubra clientes instalados, turnos activos/históricos, permisos desplegados, fuentes de pagos inmutables, recibos, idempotencia, logs, recuperación y reversión. No derivar saldos históricos ni fechas ausentes; pagos MIXTO/mesa siguen **PENDIENTE** y bloquean cierre.

**No hacer en este bloque:** registrar rutas, cambiar `server.ts`, reglas, `firebase.json`, Firebase real, datos/cobros, despliegues o publicación. Reversión: eliminar el módulo de manejadores, su prueba y el paso Security, más esta nota/checklist; sin migración. **PASO 4 ABIERTO** incluso si TypeScript/build y emulador aprueban.


## Paso 4 — puerta de compatibilidad cliente/servidor (1 de noviembre de 2026; sin activación)

`src/lib/shiftCutoverCompatibilityPreflight.mjs` es una auditoría **pura de inventario**: recibe filas sintéticas o ya materializadas de un único negocio, no consulta Firebase y no escribe. Distingue turnos con ID aleatorio de cliente frente a IDs `srv-<hash>`, comprueba estados, fechas, tenant, múltiples turnos abiertos, correspondencia de candado y recibos, duplicados y límite conservador de 200 filas. Devuelve **`status: 'BLOCKED'`, `canActivate: false` y `canCloseCash: false` incondicionalmente**, incluso para inventario limpio. `inventoryComplete: true` es solo una afirmación del llamador, nunca prueba que se hayan enumerado todos los documentos. No es una migración ni un permiso para cambiar reglas.

**Corte prohibido sin evidencia externa:** (1) inventario completo y respaldo/restauración comprobados, incluyendo registros sin `businessId` que no aparecen en consultas filtradas; (2) resolución documental de turnos activos legados, sin convertirlos automáticamente en `srv-...` ni fabricar candados; (3) comprobantes históricos de pagos de mesa/MIXTO, fechas e importes conciliados por negocio; (4) Auth Emulator con tokens reales, revisión de reglas efectivamente desplegadas y autoridad exclusiva del servidor; (5) estrategia de clientes antiguos, versiones y revocación de escrituras directas, con reversión probada; (6) recorrido A/B manual Android/iPad. La auditoría no sustituye ninguno de esos puntos. Si un paso falla, **no activar endpoint ni reglas server-only**, no cerrar Caja ni corregir cobros automáticamente.

**Reversión de este bloque:** eliminar el módulo puro, `scripts/test-shift-cutover-compatibility.mjs`, el paso de Quality y estas notas/checklist. No hay datos, endpoint, permisos ni despliegue que revertir. El test imprime `PENDIENTE` aunque finalice con código 0: **paso 4 sigue ABIERTO y NO CONCILIADO**.


## Paso 4 — tokens ID reales de Auth Emulator en contrato de Caja aislado (1 de noviembre de 2026)

`scripts/test-shift-authority-real-auth-emulator.mjs` complementa el test de Auth simulado: usa **Firebase Auth Emulator real** para crear cuentas ficticias y emitir tokens ID mediante `signInWithCustomToken`, que `getAuth(app).verifyIdToken(token, true)` verifica desde los manejadores existentes, junto con Firestore Emulator para dos negocios A/B. Comprueba ausencia de token, token falsificado, cuenta sin permisos, aislamiento entre negocios, rechazo de identidad cliente, identidad/nombre/hora derivados del servidor, apertura única, usuario deshabilitado (token previo rechazado), cierre e idempotencia. La prueba no registra rutas ni llama a Firebase de producción; exige hosts locales de ambos emuladores antes de crear usuarios o documentos.

**Límite y no activación:** la verificación del token y el estado de usuario deshabilitado en Auth Emulator no prueban la configuración de revocación, red, despliegue ni permisos efectivos de producción. No se prueban cobros reales ni se resuelven pagos históricos/MIXTO. El servicio sigue sin endpoint y las reglas STAGED permiten escrituras cliente. **No publicar reglas server-only ni activar Caja** sin migración de clientes, respaldo, inventario real y autoridad contable revisada. La nueva prueba se ejecuta con `firebase.invites-emulator.json` en Staged Security; confirmar CI exacto antes de considerarla aprobada.

**Reversión:** retirar el script, el paso de `.github/workflows/security-firestore.yml` y esta documentación/checklist. Sin cambios de esquema, rutas, permisos, datos reales ni secretos.


## Paso 4 — captura paginada aislada de turnos y recibos (1 de noviembre de 2026)

`src/lib/shiftCutoverEmulatorInventory.mjs` lee **exclusivamente** Firestore Emulator local (guard estricto `127.0.0.1:8080`) con Admin SDK; no monta endpoints, no ejecuta escrituras y no es importado por la aplicación. Enumera por ID todas las filas accesibles en `businesses/{businessId}/shifts` y `shiftAuthority` sin `where('businessId')`, para no ocultar identidades discordantes dentro de las subcolecciones. Hace dos recorridos paginados y compara IDs y marcas `updateTime` de cada documento; verifica la raíz, distingue `current` y `closed-{shiftId}`, rechaza documentos de autoridad inesperados y recibos cuyo ID no concuerda con el turno. Un fallo de lectura, un cambio observado, una raíz ajena o más de 200 filas por colección bloquean el diagnóstico sin fabricar un inventario vacío.

El resultado se pasa a `auditShiftCutoverCompatibility` únicamente si la captura acotada fue estable. **`inventoryComplete` sigue siendo false siempre**, porque dos lecturas consecutivas no son una instantánea atómica, no cubren documentos históricos sin identidad en otras colecciones y no prueban ausencia de escrituras después de la captura. Incluso para un inventario aparentemente limpio, el resultado devuelve `status: BLOCKED`, `canActivate: false` y `canCloseCash: false`. No concilia pedidos, pagos MIXTO, mesa ni fechas históricas.

Prueba `scripts/test-shift-cutover-emulator-inventory.mjs` con negocios A/B sintéticos: paginación de varias páginas, aislamiento, datos de otro tenant, documentos inesperados, cambios entre lecturas, más de 200 turnos, raíz ausente, fallo de lectura y negativa fuera del emulador. CI funcional: [Quality #41297901725](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41297901725) y [Staged Security #41297901718](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41297901718), ambas **success** sobre `2f90f875`. La prueba sigue imprimiendo `PENDIENTE` intencionalmente. **PASO 4 ABIERTO, NO CONCILIADO**.

Próximo: inventario paginado de pedidos, pagos, gastos y resguardo, con diagnóstico de registros sin identidad y límites de completitud, y posteriormente propuesta de consistencia/corte revisable. No activar Caja ni publicar reglas. Reversión: eliminar módulo, script, paso Security y notas; no hay datos reales ni migración.


## Paso 4 — lectura transaccional acotada de seis fuentes (1 de noviembre de 2026)

**Solo código experimental y pruebas de Firebase Emulator.** `src/lib/shiftAtomicCashReadSetEmulator.mjs` lee en **una transacción Admin de solo lectura** la raíz y las seis colecciones `businesses/{id}/shifts`, `shiftAuthority`, `restaurant_orders`, `table_payments`, `businesses/{id}/expenses` y `vault`. Las globales se leen sin filtro por tenant para detectar documentos huérfanos. El máximo configurable es 200 documentos **por colección global o anidada**; si se supera, bloquea el diagnóstico sin truncarlo ni declarar cero. Reutiliza las auditorías de compatibilidad de turnos y referencias contables, y comprueba identidad, recibos, pagos MIXTO, fechas e importes sospechosos. Solo entrega códigos y conteos, no filas ni importes.

**Alcance exacto de `atomicReadSet=true`:** las consultas terminadas pertenecen a la misma transacción del emulador; NO certifica historial fuera de esas seis colecciones, documentación externa, compatibilidad de clientes antiguos, permisos realmente desplegados ni que se puedan activar cierres. La auditoría pura cruzada conserva por diseño su aviso conservador `NOT_ATOMIC_SNAPSHOT` porque no acredita el historial completo. El resultado es **siempre** `status=BLOCKED`, `reconciled=false`, `inventoryComplete=false`, `canActivate=false` y `canCloseCash=false`.

**Pruebas y reversión:** `scripts/test-shift-atomic-cash-readset-emulator.mjs` cubre A/B, seis fuentes, referencia de mesa, MIXTO parcial, documento global sin tenant, gasto cruzado, recibo incompatible, límite y fallo transaccional. Se añadió a `.github/workflows/security-firestore.yml`. Para revertir, eliminar módulo, test y paso Security, más estas notas/checklist; no existe migración ni modificación de datos. La ejecución CI debe confirmarse en el SHA funcional; sintaxis V8 y adaptador transaccional simulado no sustituyen el Firebase Emulator.

**PENDIENTE:** conciliación histórica/MIXTO y mesa, pruebas de concurrencia con cambios de fuentes dentro de transacción, migración segura de turnos, autoridad exclusiva de servidor, reglas desplegadas, recorrido visual Android/iPad y aprobación humana antes de cualquier corte. No conectar esta función a UI/HTTP ni desplegar reglas.


### Paso 4 — gastos/resguardo propios y carrera de pago durante el preflight (1 de noviembre de 2026)

La captura de seis fuentes conserva la detección explícita de `EXPENSES_TENANT_MISMATCH` y `VAULT_TENANT_MISMATCH` cuando encuentra un documento ajeno bajo la raíz del negocio, pero ahora entrega **solo** `own.expenses` y `own.vault` a `auditAccountingCrossSource`. Antes le entregaba las filas crudas, produciendo diagnósticos secundarios `*_TENANT_MISMATCH_OR_MISSING` por volver a procesar documentos de otro negocio. Los globales `orders/payments` ya estaban filtrados. Esta corrección no elimina la señal primaria ni autoriza Caja.

La prueba offline de adaptador simula una instantánea por intento, cambia un pago MIXTO después de leer los pedidos y verifica que el primer análisis no mezcla versiones; el siguiente detecta `TABLE_PAYMENT_AMOUNT_MISMATCH`. **Evidencia ejecutada:** prueba offline completa con código de la rama en V8 y `assert/process` simulados: PASS; parseo V8 de módulo y scripts: PASS. **No equivale a Node nativo, Firebase Emulator, TypeScript ni build.**

La prueba en `scripts/test-shift-atomic-cash-readset-emulator.mjs` ahora introduce una actualización real de `table_payments` entre las lecturas de pedidos y pagos dentro del callback transaccional. Acepta snapshot anterior coherente, reintento que vea la inconsistencia posterior o fallo cerrado `TRANSACTION_READ_FAILED`; exige que la lectura posterior detecte el importe contradictorio, que se pueda restaurar el fixture y que el negocio B siga aislado. **Ejecución real de este escenario en Firebase Emulator y CI: pendiente de confirmar.** La captura es de solo lectura, pero el fixture de prueba escribe exclusivamente en emulador; no hay migración ni datos reales.

**PASO 4 ABIERTO / NO CONCILIADO.** La transacción solo describe un instante acotado: un pago puede cambiar inmediatamente después; no sustituye comprobantes históricos, validación de pagos MIXTO reales, permisos de servidor ni compatibilidad de turnos legados. No conectar endpoint, no desplegar reglas ni permitir cierres. Reversión: revertir filtrado y pruebas, sin cambios de esquema o datos persistentes.
