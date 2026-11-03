# Cobro de mesas multinegocio

Giomero y los demás negocios tienen **Pedidos y Caja → Mesas y cobros**.
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
Los números disponibles siguen los QR y reglas existentes: 1, 2, 4, 5, 6, 7, 8, 9.
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
