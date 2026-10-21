# Gioteautomatizo — respaldo y reversión antes de publicar (P0)

**Estado: procedimiento preparado, NO ejecutado.** Las pruebas automáticas usan datos ficticios; **no hay respaldo confirmado de Firestore real** y no se modificó la configuración de Firebase.

## Puerta de seguridad: no desplegar hasta completar
- [ ] Recuperar acceso del responsable a Google/Firebase y confirmar el proyecto y la base Firestore exactos.
- [ ] Comprobar que se tiene permiso para exportar y restaurar datos, y que el destino de respaldo es privado y distinto del repositorio. Registrar posibles costes de Storage/exportación antes de iniciar.
- [ ] Guardar en un lugar privado y controlado el ID de proyecto, ID de base, fecha, versión de `firestore.rules`, commit y ruta de respaldo **sin incluir secretos ni datos personales en GitHub**.
- [ ] Exportar Firestore usando el mecanismo administrado disponible para el proyecto o un proceso de backup aprobado. Verificar finalización **y capacidad de restauración en un proyecto de pruebas**. No asumir que una exportación equivale a una restauración comprobada.
- [ ] Comprobar colecciones críticas: `businesses`, `businessMemberships`, `publicBusinessProfiles`, catálogos anidados, `restaurant_orders`, `vip_profiles`, `table_sessions`, pagos, turnos, gastos y demás colecciones operativas usadas por Calientito. Verificar también que los datos locales de tarjetas VIP antiguas no están cubiertos por una exportación Firestore.
- [ ] Respaldar además los recursos externos relevantes (por ejemplo Cloudinary), y configuración/secretos por su propio medio seguro si aplica; un backup Firestore no cubre Auth, Cloudinary ni configuraciones locales.
- [ ] Conservar un procedimiento de rollback de servidor/front-end compatible con las reglas. **No restaurar indiscriminadamente toda la base para deshacer solo una regla**; podrían perderse pedidos nuevos.

## Ensayo controlado
1. Elegir un proyecto de ensayo separado de producción; no usar datos personales reales salvo autorización y tratamiento seguro.
2. Restaurar o recrear datos representativos de dos negocios y Calientito sin alterar la fuente.
3. Ejecutar las pruebas de CI y `node scripts/verify-launch-rules.mjs`.
4. Verificar dueño/empleados de ambos negocios, lectura de catálogos publicados/no publicados, pedidos públicos, caja, permisos y VIP.
5. Validar recuperación desde un segundo celular y que los VIP antiguos conservan sus sellos; revisar `docs/VIP_MIGRATION_CHECKLIST.md`.
6. Confirmar funcionamiento de `/api/vip/*` y del backend de invitaciones bajo la configuración del hosting real; los flags `VITE_SECURE_VIP_API` y `ENABLE_BUSINESS_INVITES` siguen desactivados hasta aprobar la migración.
7. Solo después preparar una ventana de despliegue con responsable presente y canal para detenerla. Mantener versiones anteriores verificadas y vigilar errores.

## Si falla el despliegue
- Detener nuevas activaciones, identificar si falló cliente, backend, membresías o reglas.
- Volver al frontend/backend previamente probado cuando sea compatible; revertir **solo** el conjunto de reglas afectado a una versión segura. No reabrir `vip_profiles` a lectura pública para resolver errores.
- No borrar membresías ni VIP durante la reversión. Investigar antes de restaurar documentos para no pisar pedidos capturados durante el incidente.
- Documentar el fallo sin teléfonos, PIN, claves, tokens ni información personal.

## Bloqueantes actuales
La regla versionada `firestore.rules` permite `allow get: if true` para perfiles VIP. La propuesta aislada resuelve la lectura pública, pero todavía requiere compatibilidad completa con clientes y administradores antiguos. **No hay autorización para sustituir automáticamente esa regla ni para publicar el MVP masivamente.**
