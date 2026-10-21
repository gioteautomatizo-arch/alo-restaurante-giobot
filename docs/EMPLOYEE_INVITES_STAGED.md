# Invitaciones seguras para empleados — preparación

Estado: **servidor implementado; desactivado por defecto; sin despliegue**.

El servicio `businessInviteApi.ts` ofrece:
- `POST /api/business-invites` — responsable autenticado crea una invitación para correo, rol y negocio específicos.
- `GET /api/business-invites/:token` — presenta negocio y correo parcialmente oculto.
- `POST /api/business-invites/accept` — usuario autenticado con correo verificado acepta una invitación.
- Vencimiento de 72 horas, token aleatorio de un solo uso, validación del responsable al crear y al aceptar y actualización atómica de membresía + índice de personal.

**Bloqueado** salvo que el servidor tenga `ENABLE_BUSINESS_INVITES=true`. No se ha activado y no hay interfaz de usuario publicada para generar o aceptar enlaces.

## Pendiente antes de usar
1. Añadir interfaz de invitación y aceptación, revocación, límites de solicitudes y protección contra abuso.
2. Probar con Firebase Emulator y con cuentas reales de prueba (propietario, encargado, nuevo empleado, otro negocio, correo incorrecto y correo no verificado).
3. Asegurar que el servidor use Firebase Admin solo del lado servidor.
4. Probar reenvío, vencimiento, permisos revocados, doble aceptación y cambio de rol.
5. Sustituir gradualmente la creación de empleados con contraseña administrada por el propietario; no eliminar el flujo viejo antes de la migración.
6. No incluir tokens de invitación en registros o analíticas. No subir secretos.

**No desplegar reglas ni activar la función en producción sin validar todos los pasos.**
