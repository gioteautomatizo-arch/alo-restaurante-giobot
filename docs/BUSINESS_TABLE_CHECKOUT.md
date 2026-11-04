# Cobro de mesas multinegocio

Giomero y los demás negocios tienen **Pedidos y Caja → Mesas y QR**.
Cada tarjeta presenta pedidos pendientes, importe y **Cobrar mesa N**. La confirmación
muestra las comandas incluidas y permite registrar efectivo, tarjeta o transferencia
ya recibidos; no procesa pagos bancarios. Efectivo exige monto suficiente y muestra cambio.

El servicio usa un negocio explícito y membresía OWNER/ADMIN/CASHIER activa. Una
transacción vuelve a leer membresía y pedidos, compara versión/importe/mesa,
crea `table_payments` y actualiza los pedidos con referencias recíprocas, fecha,
operador y método. Un segundo cobro concurrente falla sin otro pago. Cambios,
cancelación o sesión distinta requieren revisar de nuevo. Pedidos nuevos durante
la confirmación no se incorporan silenciosamente a la cuenta seleccionada.

No libera mesas ni cierra sesiones, no asigna mesero y no cobra mostrador/domicilio.
Configuración única de 0 a 60 mesas en businesses/{businessId}.tableCount. Se
recupera gio_table_count_{businessId} hasta que el responsable guarda en Firestore.
Los demás dispositivos leen esa misma configuración. Los pedidos pendientes de
mesas fuera del número configurado permanecen visibles. Cada tarjeta contiene su
QR y cobro; Resumen conserva solo el QR general y un acceso al módulo único.
La escritura compara la versión previa para no pisar cambios de otro dispositivo.
Las reglas versionadas y STAGED admiten mesas 1–60 en public_table_orders y
table_payments con el mismo criterio para todos los negocios.
ATENCIÓN: publicar estas reglas sigue pendiente. Las reglas antiguas pueden
rechazar el pedido o cobro de mesas 3, 10–60. Este commit no despliega Firebase.
No incluye descuentos, propina ni pago mixto. No publica reglas Firebase.
La conciliación y cierre de turno de mesas siguen pendientes: este cambio no
elimina sus guardas ni garantiza un cierre contable completo. El resumen público
legado no recibe actualización de pago; el comprobante del cliente sigue siendo
confirmación de envío, no seguimiento del cobro.

Validación: TypeScript, build, React/jsdom (carga incompleta, efectivo, doble clic,
error recuperable, confirmación y cambio de negocio), Firestore Emulator con
reglas del repositorio (concurrencia, aislamiento, sesión, monto, cancelación,
mesa, permisos y tarjeta). Se prueba adicionalmente la copia de reglas suministrada
por Gio, sin consultar ni modificar producción.

Pendiente tras sincronizar/publicar AI Studio: recorrido Android/Xbox de un pedido
QR → tarjeta mesa → pago recibido → pedidos pagados y referencia del pago.

## Prueba manual reportada — 3 de noviembre de 2026

- Entorno informado por el responsable: **Giomero** abierto desde la vista previa de Google AI Studio en Xbox, Firestore `(default)` del proyecto Gioteautomatizo. El responsable confirmó haber publicado las reglas puntuales de mesas 1–60 en la consola; no se cotejó el texto remoto desde una herramienta de despliegue.
- Recorrido realizado por el responsable: pedido por QR de mesa → notificación sonora → aparición en Pedidos y Caja → cobro en efectivo con importe recibido superior al total → cambio correcto → indicadores actualizados → recarga y mesa sin saldo pendiente/libre.
- Evidencia visual comunicada: avisos de dos pedidos marcados **Pagado** por **$150** y **$210**, tarjeta **Pedidos pagados hoy: $360** y tarjeta **Pedidos de hoy sin cobro registrado: 0**. La pestaña **Por cobrar** mostraba todavía un contador de 1 correspondiente a un pendiente no identificado; no afirmar conciliación completa ni que todos los cobros históricos estén cerrados.
- **Resultado:** validado manualmente un flujo feliz de pedido, notificación y cobro de mesa. No se verificaron desde esta prueba la doble confirmación en dos dispositivos, la integridad de un cierre de turno, los permisos de otra cuenta, el dominio final publicado ni los importes del recibo con datos históricos. No repetir esta misma demostración como si estuviera pendiente.
- **Reglas actuales:** la versión copiada desde la consola para la prueba solo amplió el rango de `public_table_orders` y `table_payments`; conserva reglas directas antiguas de `vip_profiles`, alta y modificación de pedidos. No equivale a reglas STAGED ni a un corte seguro.
- Para la transición futura, `docs/firestore.table-checkout.SECURITY-CANDIDATE-NO-PUBLICAR.rules` ensaya la transacción de mesa con roles más estrictos; no está desplegado y no permite todavía publicar beta abierta. Ver `docs/TABLE_CHECKOUT_SECURITY_CANDIDATE_REVIEW.md`.
