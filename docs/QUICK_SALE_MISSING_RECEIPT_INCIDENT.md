# Incidencia: venta rápida cobrada pero ticket rechazado (Calientito)

**Estado:** correcciones preparadas en GitHub; ningún cambio en Firebase de producción. No declarar solucionado hasta comprobar el iPad.

## Síntomas observados

En una venta rápida se guarda el pedido en `restaurant_orders`, se actualiza `billingStatus: PAGADO` y después falla la creación de `sale_receipts/offtable-{orderId}` con `Missing or insufficient permissions`. El panel puede mostrar varias ventas pagadas sin ticket. En una captura posterior la barra superior pasó a **«No autenticado — Iniciar sesión Google»**, aunque antes mostraba «Sincronizado». La captura posterior no demuestra por sí sola que la sesión estuviera cerrada en el momento exacto de la venta.

**Nunca volver a cobrar ni generar un pedido nuevo para «arreglar» el ticket.** Antes de cualquier ajuste de turno, conciliar los pedidos pagados con los movimientos de caja.

## Operación segura desde el iPad

1. Comprobar el indicador superior. Si dice **No autenticado**, pulsar **Iniciar sesión Google** con la cuenta empresarial autorizada. No compartir credenciales.
2. Confirmar que cambie a **Sincronizado** y que los pedidos pagados sigan apareciendo en Caja & Cobro.
3. Abrir **Caja & Cobro → Tickets cerrados**. Si se informa de comprobantes faltantes, pulsar **Generar tickets faltantes** una sola vez y esperar.
4. Verificar que el comprobante aparezca una sola vez y que el pedido continúe como PAGADO, sin generar un segundo ingreso.
5. Si persiste `permission-denied`, detener reintentos y revisar con el administrador del proyecto Firestore **(default)**, cuenta Firebase Auth efectiva, versión de reglas desplegada y resultado de las escrituras a `sale_receipts`. No cambiar reglas a `allow write: if true`.
6. **Si no se puede iniciar sesión**, no cobrar desde Venta rápida: guardar pedidos pendientes por el flujo permitido y usar el procedimiento operativo acordado de caja hasta recuperar acceso legítimo.

## Detalles técnicos y límites

- `src/components/admin/QuickOrdersView.tsx` separa creación de pedido, cobro y ticket. Se agregó verificación previa de Firebase Auth antes de iniciar un cobro nuevo; esto no garantiza conectividad durante toda la operación.
- `src/lib/saleReceiptsService.ts` contiene reintento que consulta el pedido PAGADO en Firestore, verifica tenant y genera el ticket con ID estable `offtable-{orderId}`, sin volver a cobrar. Se conservó la reparación histórica desde **Tickets cerrados**.
- Las reglas en `firestore.rules` permiten crear tickets `OFF_TABLE` mediante `isAuthorizedRestaurant` si el usuario está autenticado. **Esto solo describe GitHub, no verifica las reglas reales desplegadas.**
- **Bloqueo de seguridad independiente:** tanto las reglas heredadas versionadas como el borrador STAGED aún permiten leer datos de Calientito a cualquier Firebase Auth autenticado mediante `canReadRestaurantDoc`. No desplegar estas reglas sin resolver la migración de responsables y cerrar esta lectura transversal.
- La suite `scripts/test-quick-sale-receipt-rules.mjs` reproduce la creación desde un usuario autenticado y registra expresamente esa exposición heredada. No demuestra que el iPad ni producción estén reparados.
- Los cálculos de turno basados exclusivamente en tickets pueden diferir de los pedidos PAGADOS hasta regenerar y conciliar los comprobantes.

## Criterio de cierre

En un entorno controlado, verificar cuenta conectada; un único pedido PAGADO; emisión de ticket; una sola contabilización; recuperación de comprobante faltante tras un fallo; sesión desconectada bloquea nuevo cobro; permisos restrictivos entre negocios; y resultado correcto en iPad después del Pull/reload autorizado.
