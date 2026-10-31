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
