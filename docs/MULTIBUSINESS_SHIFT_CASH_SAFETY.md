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
