# Corte de Caja multinegocio: comprobaciones antes del lanzamiento
Corte de revisión: 23 de octubre de 2026

## Implementado en la rama de desarrollo
- Los datos de pedidos, turnos, gastos y resguardo se consultan para un solo negocio.
- Mientras falte alguna de las cuatro consultas, no se permite abrir ni cerrar turno.
- Si una consulta falla, se informa y no se presenta el saldo como cero.
- Si hay dos o más turnos abiertos en el negocio, se bloquea la operación manual en esa vista.
- El fondo inicial inicia en $0 como valor sugerido, NO en $500; el usuario debe confirmar el efectivo real.
- Efectivo inicial y contado se validan: valores no negativos y dos decimales como máximo.
- Se conserva la separación entre estado de entrega y registro de cobro de un pedido.
- Hay pruebas puras en scripts/test-business-shift-readiness.mts, ejecutadas desde Quality checks.

## Restricciones y bloqueos conocidos
- Estas validaciones son **de interfaz**, no una garantía transaccional contra dos cajeros abriendo turnos simultáneamente: se requiere validación segura en backend/reglas.
- Firestore en producción no fue modificado ni se presume igual a las reglas versionadas.
- onSnapshot puede entregar cache local; antes de un cierre contable real debe existir estrategia de conciliación con estado confirmado en servidor.
- El cobro universal no está terminado. No convertir manualmente pendientes en pagados sin verificación de reglas y permisos.
- Pedidos pagados sin fecha de pago requieren conciliación; nunca deben asignarse silenciosamente a un turno.
- Los tests automatizados NO equivalen a prueba visual ni a certificación contable.

## Prueba visual de bajo riesgo
1. Abrir la interfaz administrativa de un negocio de DEMO.
2. Confirmar que la pantalla de Turno muestra consulta de datos antes de mostrar el fondo inicial.
3. Con acceso adecuado, corroborar que el fondo sugerido es $0 y que se explica la necesidad de ingresar el monto real.
4. Verificar que las lecturas fallidas muestran aviso de error (NO 'sin ventas').
5. No abrir/cerrar turnos ni registrar cobros de negocios reales durante esta revisión.

## Pendiente para habilitar cobros y cierre de caja en producción
- Definir operación transaccional backend/Firestore por negocio, turno y pedido, sin doble cargo.
- Validar roles autorizados con emulador y reglas efectivamente desplegadas.
- Conciliar fecha de pago, tickets, gastos y movimientos de efectivo y simular carreras de dos cajeros.
- Preparar despliegue solo tras revisión y autorización explícita, sin tocar producción por defecto.
