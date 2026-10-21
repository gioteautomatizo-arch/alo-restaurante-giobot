# Guía operativa — migración controlada VIP y acceso administrativo

**Estado:** preparación / ensayo únicamente. **NO ejecuta migración, NO autoriza despliegue.**
Revisión: 21 de octubre de 2026. Proyecto GitHub: `gioteautomatizo-arch/alo-restaurante-giobot`.

Esta guía es para cualquier negocio de Gioteautomatizo. El tenant histórico `alo-restaurante` (Calientito) requiere una excepción controlada: algunas tarjetas carecen de `restaurantId` y ciertos usuarios del panel previo no tienen una cuenta Firebase Auth vinculada a `businessMemberships`. No conceder roles mediante PIN, nombre visible, correo escrito a mano ni sesión local.

## Puerta 0 — comprobaciones antes de manipular datos

1. Identificar a la persona responsable/autorizada del negocio y recuperar su acceso administrativo legítimo a Google/Firebase. Confirmar **proyecto, base Firestore y dominio publicado** en una sesión protegida. No facilitar contraseña, PIN o credenciales a ChatGPT ni registrarlas en GitHub.
2. Revisar si la exportación/restauración de Firestore y el almacenamiento privado implican costes; solicitar autorización al propietario **antes** de generar gastos o adquirir servicios. Aplicar el principio de mínimo privilegio y no usar servicios de pago por sorpresa.
3. Respaldar `vip_profiles`, `businessMemberships` y `businesses`, más dependencias operativas; registrar en ubicación privada el momento del respaldo y la versión de reglas. Ensayar una restauración en entorno **separado**, sin sobrescribir producción. **Firestore no respalda tarjetas locales del navegador, Firebase Auth ni Cloudinary**.
4. Evitar migrar durante servicio concurrido o actividad intensa. Preparar un plan de reversión por documento (no restaurar toda la base si hubo pedidos nuevos), ventana de pruebas y contactos de aprobación. La recuperación nunca debe depender de volver a abrir lectura pública de VIP.
5. Revisar todo acceso histórico a `vip_profiles` y `restaurant_orders`; `firestore.rules` actual **no es la propuesta segura**. Ni una auditoría limpia ni CI verde sustituyen la revisión del proyecto real.

## Puerta 1 — inventario confidencial, sin escrituras

**No hay un exportador productivo automático en este repositorio.** Un administrador autorizado puede preparar, desde su entorno controlado, un manifiesto JSON mínimo para el auditor offline (usar datos ficticios mientras no esté aprobado el tratamiento de datos reales):

```json
{
  "businessId": "alo-restaurante",
  "profiles": [
    {"id": "demo-card", "restaurantId": "alo-restaurante", "stamps": 3, "totalOrders": 6, "rewardAvailable": false, "pendingStampsToValidate": 0}
  ],
  "memberships": [
    {"id": "alo-restaurante_demo-owner", "restaurantId": "alo-restaurante", "userId": "demo-owner", "role": "OWNER", "active": true}
  ],
  "expectedAdmins": [
    {"uid": "demo-owner", "role": "OWNER", "identityVerifiedByOwner": true}
  ]
}
```

`expectedAdmins` significa identidades de **Firebase Auth comprobadas por el responsable**, no propietarios supuestos. El esquema está ilustrado exclusivamente con datos ficticios. Si se va a analizar un conjunto real, el manifiesto puede contener IDs internos sensibles: conservarlo **solo fuera del repositorio, de la conversación y de las carpetas sincronizadas públicas**. No copiar datos personales (nombres, teléfonos, direcciones, PIN, hashes) al archivo. Si hay tarjetas únicamente locales, llevar un conteo separado; este manifiesto **no puede verlas**.

Ejecución local offline:

```bash
node scripts/vip-migration-preflight.mjs --input /ruta/privada/manifiesto.json
```

La herramienta únicamente lee el archivo e imprime **totales y códigos de bloqueo**, nunca las filas ni sus IDs. `PREFLIGHT_PASSED` significa que el manifiesto **declarado** superó las comprobaciones, NO que la base real esté íntegra, haya respaldo o se permita publicar; `approvalToDeploy` siempre es `false`. Repetir la auditoría tras cualquier corrección validada y antes de la ventana final.

## Puerta 2 — revisar administradores por UID y negocio

1. Enumerar los responsables que hoy necesitan consultar o ajustar VIP y verificar presencialmente/con el responsable del negocio su identidad, rol, acceso a Firebase Auth y si la cuenta sigue activa. **No recopilar contraseñas**.
2. Confirmar el único propietario autorizado para el piloto: revisar membresías `OWNER` activas existentes. El preflight se bloquea con **propietarios duplicados o ajenos al consentimiento del negocio**. Si existen varios propietarios legítimos, definir y aprobar primero una política explícita, no borrar cuentas precipitadamente.
3. Para cada responsable válido, diseñar una membresía `businessMemberships/{businessId}_{uid}`, con `restaurantId`, `userId`, `role` (`OWNER`, `ADMIN` o `MANAGER`) y `active: true`. La aprobación y asignación efectiva deben hacerse a través de una operación backend autenticada/autorizada y auditada, **nunca desde un formulario público ni del PIN antiguo**. No se implementan escrituras en este documento.
4. Detectar cuentas suspendidas, sin correo verificado o vinculadas a otro negocio. Revocar accesos indebidos antes del piloto y no promover empleados de caja/cocina automáticamente.
5. Confirmar que el tenant `businesses/{businessId}` existe y contiene una configuración coherente; `BusinessWorkspace` exige negocio y membresía, no basta con crear la membresía sola.

## Puerta 3 — tarjetas VIP antiguas y saldos

1. Identificar tarjetas `vip_profiles` que traen `restaurantId` igual al negocio. Para Calientito, identificar **sin adjudicar automáticamente** las que carecen del campo. Valores `null`, `""` u otro negocio son conflictos, no tarjetas históricas confirmadas.
2. Relacionar cada tarjeta sin tenant con evidencia independiente del negocio correspondiente (historial de registro, soporte/verificación del titular y registro administrativo autorizado). El identificador hash o el simple teléfono no demuestran por sí solos propiedad empresarial.
3. Tras respaldo verificable, consentimiento y revisión individual, preparar un cambio **solamente de `restaurantId`** en cada tarjeta aceptada. Comparar la versión/fecha de actualización previa y abortar si cambió; no reescribir `stamps`, `totalOrders`, `rewardAvailable`, `pendingStampsToValidate`, `phone`, `pinHash` ni `memberId`. Registrar quién aprobó cada decisión en bitácora privada sin PIN.
4. Los puntos almacenados solo en `localStorage` **no se trasladan automáticamente**. Si hay sellos, pedidos o recompensa local, preservar el dispositivo y pedir validación administrativa; no borrar la tarjeta ni prometer que se puede restaurar si se pierde el teléfono.
5. Probar con dos negocios y Calientito: la consulta administrativa `where('restaurantId','==',businessId)` debe listar solo las tarjetas del propio tenant. Restaurar en staging perfiles y permisos ficticios primero.

## Puerta 4 — verificación humana antes de cualquier publicación

- Responsable OWNER recupera su acceso Firebase, abre su negocio, visualiza lista VIP y mantiene todos los saldos con permisos nuevos.
- ADMIN y MANAGER autorizados pueden consultar y editar solo sellos/recompensas permitidos.
- CASHIER/WAITER/KITCHEN y personal inactivo **no** obtienen acceso a perfiles; usuario de negocio A no accede a B.
- Titular recupera tarjeta con teléfono+PIN en **otro dispositivo**; PIN incorrecto y sesiones caducadas no funcionan. Para perfiles anteriores, confirmar saldos, historial y recompensas.
- Probar el backend `/api/vip/*` en el **dominio y hosting previstos** con identidad administrativa del servidor protegida; no basta con la prueba del emulador. Mantener `VITE_SECURE_VIP_API` desactivado hasta completar el recorrido de migración.
- Observar logs y costes sin registrar PIN, hashes, tokens o PII; conservar un canal para detener operaciones al primer fallo.

## Puerta 5 — autorización/reversión

Se requiere decisión explícita del propietario con fecha, personal responsable y evidencia de: inventario coherente, respaldo restaurable, acceso validado de administradores, comparaciones de saldo, dominio/backend probado, costes aceptados y plan de rollback revisado. Sin cualquiera de esos elementos **no publicar, no habilitar flags ni desplegar reglas**.

La reversión debe ser selectiva: respetar pedidos y canjes ocurridos después del respaldo. No revertir a `allow get: if true` para VIP ni compartir copias de datos personales en GitHub.

### Estado real al crear esta guía

- Auditoría `scripts/vip-migration-preflight.mjs` agregada y probada con datos **ficticios**.
- Pruebas de reglas Firestore STAGED y de recuperación por backend agregadas.
- **No se ha ejecutado** respaldo, inventario privado real, asignación de UID, migración ni despliegue.
- Bloqueantes vigentes: acceso Google/Firebase del responsable, copia restaurable, emparejamiento de cuentas y tarjetas reales, verificación de dominio/hosting y protección completa de reglas antes del lanzamiento.
