# Migración segura de Membresías VIP — Gioteautomatizo

**Estado al 18/10/2026: EN PREPARACIÓN, NO DESPLEGAR.**
**Rama:** `feat/gioteautomatizo-multinegocio-core`.
**Reglas vigentes:** `firestore.rules` (sin modificar en esta fase).
**Propuesta aislada:** `docs/firestore.vip-secure.STAGED.rules` (documento, NO archivo de despliegue).
**Comprobación estática:** `node scripts/verify-vip-staged.mjs`.

## Propósito y alcance
Proteger los nombres, teléfonos, direcciones, referencias y puntos VIP de cada comercio. Calientito y los negocios demo no deben perder sus tarjetas, ventas ni datos. El antiguo panel «Clientes» permanece fuera del nuevo flujo; la función útil es «VIP / Membresías». La plataforma usa IDs de negocio y roles para que todas las mejoras sean comunes, sin reprogramar comercio por comercio.

## Hallazgos del código (no son pruebas de producción)
1. Las reglas actuales permiten **`allow get: if true`** para `vip_profiles`: cualquier cliente con un ID de documento puede leer el perfil, que incluye datos personales. Además existe un flujo público de creación/edición de perfiles. **No publicar el MVP con esta configuración.**
2. `vipRecoveryApi.ts` ya tiene registro, recuperación, consulta/edición con sesión temporal, límites de intentos y respuestas sin `pinHash`. Requiere credenciales Firebase Admin **solo en el servidor**.
3. `src/lib/vipStorage.ts` todavía utiliza el acceso directo a Firestore salvo que `VITE_SECURE_VIP_API=true`. No activar reglas restrictivas antes de migrar TODOS los consumidores que dependen de las consultas directas.
4. Al activar ese flag, `getVipProfile` no muestra el perfil local sin una sesión temporal activa; en dispositivos de Calientito podría parecer que «desapareció» la tarjeta, aunque siga almacenada. Diseñar y probar recuperación explícita con teléfono+PIN y una ruta para tarjetas locales sin sincronizar antes de activar el modo.
5. Las reglas propuestas usan `businessMemberships` para los permisos de administración. El personal histórico de Calientito podría no tener ese vínculo y quedaría sin acceso administrativo hasta migrar los roles.
6. El identificador y hash actuales dependen de teléfono + PIN corto y una sal estática incluida en código cliente. Esto **no equivale a un hash lento de contraseñas** y podría permitir ataques de fuerza bruta si se filtran hashes. Planificar un esquema nuevo con verificador lento del lado servidor, compatible con la recuperación antigua; no cambiar hashes existentes sin migración probada.
7. Los nuevos endpoints guardan los intentos y sesiones en colecciones internas (`vip_recovery_attempts`, `vip_sessions`). Verificar reglas de denegación de acceso desde clientes y políticas de eliminación/TTL antes del despliegue.

## Orden obligatorio de publicación

### 1. Respaldo y compatibilidad
- [ ] Realizar un respaldo de `vip_profiles` y de las membresías administrativas; documentar cómo restaurarlo y no descargar datos reales en el repositorio.
- [ ] Identificar el usuario `OWNER/ADMIN/MANAGER` que gestiona Calientito; migrar roles a `businessMemberships` sin crear propietarios duplicados.
- [ ] Registrar qué tarjetas son antiguas locales, sincronizadas y de otros negocios. Probar recuperación en un segundo teléfono.
- [ ] Identificar TODOS los lectores y escritores de `vip_profiles` (app pública, panel administrativo, pedidos y sellos). Asegurarse de que no haya flujos directos no migrados.
- [ ] Acordar qué sucede con tarjetas locales sin PIN y sellos pendientes de validación; nunca borrar ni reiniciar puntos automáticamente.

### 2. Probar el backend en ambiente NO productivo
- [ ] Configurar las credenciales de Firebase Admin **solo en servidor** mediante identidad administrada del entorno o un secreto protegido. No subir JSON de cuenta de servicio ni usar variables `VITE_*` para secretos.
- [ ] Verificar el servidor `/api/vip/register`, `/api/vip/recover`, `GET /api/vip/profile`, `PATCH /api/vip/profile` con el flag privado activo en el entorno de prueba.
- [ ] Probar registro y recuperar tarjeta con teléfono+PIN correctos.
- [ ] Probar PIN incorrecto, 5 intentos de abuso, caducidad y repetición de sesiones, errores 401/429/503.
- [ ] Confirmar que un token del negocio A no permite leer ni editar negocio B.
- [ ] Confirmar que un cliente no puede enviar ni modificar `stamps`, `totalOrders`, `rewardAvailable`, `memberId`, `restaurantId` ni `pinHash` mediante PATCH.
- [ ] Verificar que respuestas del servidor, logs, caché y almacenamiento del navegador no expongan PIN, hashes ni credenciales.
- [ ] Evaluar límites de uso/rate limiting para impedir abuso de altas con teléfonos aleatorios (el límite actual es por teléfono+negocio, no global).

### 3. Probar reglas con Firebase Emulator
Ejecutar `node scripts/verify-vip-staged.mjs` para detectar errores de integración **estáticos**. Luego levantar Firebase Emulator con reglas de la propuesta en un proyecto de prueba; no ejecutar `firebase deploy` apuntando a producción.

| Escenario | Resultado esperado |
|---|---|
| Visitante anónimo obtiene una tarjeta VIP por ID | DENEGADO |
| Visitante anónimo lista `vip_profiles` | DENEGADO |
| Visitante anónimo crea/edita tarjetas directamente en Firestore | DENEGADO |
| Cliente recupera su tarjeta mediante backend y PIN correcto | PERMITIDO para su negocio |
| Token recuperado para negocio A consulta perfil de B | DENEGADO |
| Empleado de negocio A consulta perfiles VIP de B | DENEGADO |
| OWNER/ADMIN/MANAGER activo de negocio A administra VIP de A | PERMITIDO, sujeto a controles |
| CASHIER/WAITER/KITCHEN de A lista perfiles VIP | DENEGADO salvo diseño explícito de privilegios |
| Administrador edita negocio, teléfono, PIN o ID miembro existentes | DENEGADO |
| Administrador autorizado actualiza sellos y recompensas de su comercio | PERMITIDO, con validación de valores |
| Propietario Calientito sin membresía migrada | DENEGADO: **bloqueo de lanzamiento** |
| Negocio nuevo se registra, publica VIP y recupera tarjeta | PERMITIDO en su propio tenant |

**Importante:** la regla staged todavía permite a OWNER/ADMIN/MANAGER crear perfiles y actualizar cualquier campo no declarado inmutable, incluidos sellos. Antes de desplegar, añadir validaciones de tipo, rangos, auditoría y límites específicos según la política final.

### 4. Activación controlada
- [ ] CI verde: `npm run lint`, `npm run build` y `node scripts/verify-vip-staged.mjs`.
- [ ] Confirmar URLs y hosting: el frontend debe tener rutas `/api/vip/*` funcionando en **el dominio publicado**, no únicamente en Preview.
- [ ] Probar acceso de administradores Calientito, negocio demo y segundo negocio con permisos reales.
- [ ] Habilitar `VITE_SECURE_VIP_API=true` únicamente para pruebas; la versión publicada del frontend debe usar la API **antes** de cerrar acceso directo.
- [ ] Una vez migradas tarjetas, consumidores y roles, revisar la propuesta de reglas contra las reglas vigentes (pueden haber cambiado) y aplicar únicamente el bloque VIP aprobado.
- [ ] Activar reglas restrictivas tras aprobación explícita; monitorear recuperación de tarjetas y operaciones VIP.

### 5. Reversión (rollback)
- [ ] Guardar una copia versionada de las reglas anteriores y de la versión del frontend/backend antes de desplegar.
- [ ] Si falla recuperación o un administrador legítimo pierde acceso, detener el despliegue, analizar permisos y revertir la versión afectada; **no abrir perfiles VIP al público como arreglo rápido**.
- [ ] Preservar datos, sesiones y evidencia de error sin guardar PIN ni secretos en logs.

## Verificación del avance
El archivo `docs/firestore.vip-secure.STAGED.rules` solo es una **propuesta**; GitHub no la aplica al Firestore real. La comprobación estática tampoco certifica seguridad efectiva. **NO publicar estas reglas hasta completar la matriz de pruebas con Firebase Emulator, probar en la app y asegurar Calientito.**
