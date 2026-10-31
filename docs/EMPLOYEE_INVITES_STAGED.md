# Invitaciones seguras para empleados — preparación

Estado: **servidor implementado; desactivado por defecto; sin despliegue**.

El servicio `businessInviteApi.ts` ofrece:
- `POST /api/business-invites` — responsable autenticado crea una invitación para correo, rol y negocio específicos.
- `GET /api/business-invites?businessId=...` — lista invitaciones pendientes del negocio para un responsable autorizado.
- `POST /api/business-invites/preview` — presenta negocio y correo parcialmente oculto al portador del token.
- `POST /api/business-invites/revoke` — revoca una invitación pendiente con autorización del responsable.
- `POST /api/business-invites/accept` — usuario autenticado con correo verificado acepta una invitación.
- Vencimiento de 72 horas, token aleatorio de un solo uso, validación del responsable al crear y al aceptar y actualización atómica de membresía + índice de personal.

**Bloqueado** salvo que el servidor tenga `ENABLE_BUSINESS_INVITES=true` y el cliente `VITE_BUSINESS_INVITES=true`. Hay interfaz de invitación/aceptación en código, pero sigue desactivada por defecto; no se ha publicado ni activado.

## Pendiente antes de usar
1. Añadir interfaz de invitación y aceptación, revocación, límites de solicitudes y protección contra abuso.
2. Probar con Firebase Emulator y con cuentas reales de prueba (propietario, encargado, nuevo empleado, otro negocio, correo incorrecto y correo no verificado).
3. Asegurar que el servidor use Firebase Admin solo del lado servidor.
4. Probar reenvío, vencimiento, permisos revocados, doble aceptación y cambio de rol.
5. Sustituir gradualmente la creación de empleados con contraseña administrada por el propietario; no eliminar el flujo viejo antes de la migración.
6. No incluir tokens de invitación en registros o analíticas. No subir secretos.

**No desplegar reglas ni activar la función en producción sin validar todos los pasos.**

## Protección adicional del flujo heredado de Empleados (29 de octubre de 2026)

- `src/lib/businessEmployeeService.ts` verifica la membresía activa, identidad del tenant, rol del responsable y raíz OWNER **antes** de crear o autenticar una cuenta secundaria de Firebase. Vuelve a comprobar estos permisos tras Auth y antes de vincular al empleado mediante el batch. En edición y retiro, verifica también la identidad/rol del empleado objetivo, la jerarquía de roles y la sesión antes de escribir.
- El preflight reduce intentos que antes creaban una cuenta Auth sin autorización para vincularla; **no es una transacción entre Firebase Auth y Firestore**. Si Auth se crea y la revocación ocurre después, o el batch falla, la cuenta Auth puede quedar sin membresía. No borrar automáticamente esas cuentas ni afirmar que el alta fue revertida; el responsable debe revisar la vinculación por el procedimiento autorizado.
- Prueba: `scripts/test-business-employee-lifecycle.mjs`, Auth/Firestore completamente simulados con negocios A/B; incluida en Quality CI. No prueba proveedores de identidad reales, reglas desplegadas ni dispositivos. La vía de invitaciones segura sigue opt-in y apagada; no se habilitó.

## Integridad del vencimiento y del emisor (31 de octubre de 2026)

- `businessInviteIntegrity.ts` comparte el contrato de listado, vista previa y aceptación: `status=PENDING`, `createdAt`/`expiresAt` numéricos enteros seguros (milisegundos), creación no futura, expiración posterior a creación, no vencida y ventana máxima de 72 horas. Un valor ausente, textual, `NaN` o plazo extendido **no** deja el token vigente.
- El emisor `createdBy` se valida antes de construir la ruta de membresía con Firebase Admin SDK; los registros malformados fallan cerrados. No se borran ni reparan invitaciones históricas automáticamente.
- `scripts/test-business-invite-integrity.mjs` comprueba el contrato sin Firebase; `scripts/test-business-invites.mjs` incorpora escenarios de corrupción/restauración con Auth/Firestore Emulator. **No afirmar aprobación de CI o emuladores sin verificar sus ejecuciones del commit funcional.**
- Pendientes de seguridad: revisión independiente de permisos/compatibilidad histórica, ventana de revocación no atómica en listados y límite de 150 documentos sin paginación; un histórico grande podría ocultar invitaciones nuevas. Revisar costo, índices y paginación antes de habilitar el servicio. No desplegar ni activar sin autorización.
