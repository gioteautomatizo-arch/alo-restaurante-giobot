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
