# Gioteautomatizo — ensayo de corte seguro de pedidos públicos (NO desplegar todavía)

**Estado 3 de noviembre de 2026:** guía de ensayo y matriz de evidencias, sin autorización de lanzamiento. El cobro de mesas Giomero fue comprobado por el responsable en vista previa, pero eso no acredita el cierre de permisos.

## Arquitectura y contratos

- Checkout actual: `BusinessPublicPage.tsx` y `ordersService.ts` escriben directamente en Firestore por defecto. Es compatible con Giomero pero permite construir intentos de importe desde un cliente no confiable.
- Checkout nuevo (inactivo): `src/lib/publicOrderClientApi.ts`, con opt-in `VITE_SECURE_PUBLIC_ORDER_API=true` y App Check. El servidor `POST /api/public-orders` exige `ENABLE_SECURE_PUBLIC_ORDER_API=true`, `PUBLIC_ORDER_ALLOWED_APP_IDS`, token App Check y Firebase Admin. Calcula importes a partir de Firestore en una transacción idempotente, sin confiar en precios del navegador.
- Límite compartido en `publicOrderQuota.ts`: contadores transaccionales por negocio y cliente, usando IDs hash. Requiere TTL y un firewall/capa de abuso, y no sustituye una protección contra DDoS.
- Cierre cliente (CANDIDATO): `scripts/public-order-write-gate-proposal-rules.mjs` genera solo **en memoria** unas reglas donde `CLIENTE_QR` de negocios nuevos no puede hacer `create` directamente. El servidor Admin sí puede. No es el archivo desplegado ni sustituye la revisión del resto de las reglas.
- Cobro de mesa: `docs/firestore.table-checkout.SECURITY-CANDIDATE-NO-PUBLICAR.rules`, también separado de las reglas STAGED. No hay un conjunto consolidado de reglas listo para pegar a Firebase.

## Comprobación automática

| Puerta | Evidencia aislada | Estado operativo |
|---|---|---|
| UI con folio, WhatsApp y precio de servidor | `scripts/test-public-checkout-ui-secure.mjs` | Aprobación de CI requerida en cada cambio |
| Cálculo de catálogo, opciones, mesa 1–60, reintento | `scripts/test-public-order-authority-transaction.mts` | Emulator, no producción |
| Token App Check, allowlist y API cerrada | `scripts/test-public-order-http-boundary.mts` | App Check **simulado** |
| Límites por negocio y concurrencia | `scripts/test-public-order-quota.mts` | Emulator, no infraestructura real |
| Escritura directa QR denegada | `scripts/test-public-order-write-gate-proposal.mjs` | Reglas **candidatas** en memoria |
| Cliente + reglas candidatas + servidor en el mismo entorno | `scripts/test-public-order-cutover-emulator.mts` | **Ensayo nuevo**, confirmar CI |
| Privacidad VIP, clientes antiguos y cobros | `docs/VIP_MIGRATION_CHECKLIST.md` y pruebas emuladas | **Pendiente de migración y revisión humana** |

## Puertas obligatorias antes de mover un solo ajuste productivo

1. **Inventario exacto**: identificar versiones abiertas del frontend (AI Studio/hosting), todos los consumidores de `restaurant_orders`, `public_table_orders`, `vip_profiles` y caminos de Caja/POS, y obtener pruebas cruzadas de dos negocios y roles; no asumir que todos usan el nuevo checkout.
2. **Separación real**: crear proyecto de Firebase **staging distinto** de `gioteautomatizo-8e2f8` y datos exclusivamente ficticios. Vincular Firebase Admin solo al servidor, jamás a una variable `VITE_*` ni al repositorio. No probar secretos ni importes de clientes reales aquí.
3. **Respaldo y reversión**: guardar versión anterior de reglas y exportación de Firestore con controles de acceso; ensayar restauración en staging. Preparar estado de mantenimiento/fallo cerrado. No revertir reglas públicas inseguras para volver a aceptar pagos reales.
4. **App Check real**: configurar app web y dominio real de staging; verificar emisión de token, ID esperado en allowlist, token ausente, expirado, manipulado, y dos instancias; probar con Android y navegador Xbox. Preparar WAF y presupuestos/alertas para costos y TTL de cuota.
5. **Corte coordinado SIN ventana abierta**: con el ingreso de pedidos suspendido de forma explícita, montar backend y frontend nuevos, desplegar reglas restrictivas candidatas **consolidadas y auditadas** para nuevos negocios, y probar que no existe ruta vieja capaz de escribir QR directamente; luego reanudar solo tras smoke test de extremo a extremo. Si se detecta un hueco, mantener pedidos suspendidos; no permitir un fallback silencioso.
6. **Convivencia con Calientito**: la excepción `alo-restaurante` para escritura heredada sigue abierta incluso bajo el candidato. Elegir y probar migración o deshabilitación de esa excepción antes de decir «nadie puede alterar precios». No eliminarla sin pruebas de compatibilidad y autorización.
7. **Caja y VIP**: comprobar cobro, cambio, reportes, reintentos de cobro simultáneo, conciliación, y conservación de tarjetas/sellos sin lectura pública de datos personales. Completar `docs/VIP_MIGRATION_CHECKLIST.md`; VIP no es opcional si la beta expone esas rutas a terceros.
8. **Aprobación explícita**: responsable autoriza fecha/entorno de corte después de revisar CI y el inventario; jamás se infiere autorización por un «continúa». Mantener la beta privada si alguna puerta falla.

## Smoke tests de corte (todos con datos ficticios)

- Anónimo y cliente logueado: pedidos QR legítimos **denegados por SDK directo**, incluso `total=0`; API con token real responde con precio de catálogo.
- Tenant A/B: no leer pedidos privados de otro negocio ni usar producto ajeno; un pedido de A con mismo `attemptId` que B conserva otro ID.
- Doble clic, pestañas, pérdida de respuesta y dos solicitudes concurrentes: un mismo folio y una sola cuenta; reintento de payload diferente debe ser 409.
- Mesa 3 y 60: pedido + resumen coincidentes; mesa 61 denegada; Caja muestra total correcto y sin segundo cobro; efectivo de más calcula cambio sin registrar dinero extra como venta.
- VIP: token/perfil de A no accede B; PIN y hash jamás aparecen en respuesta, logs ni rutas públicas; no se pierden sellos históricos.
- Degradación: backend/API/App Check/cuota caídos deben devolver error claro y conservar el carrito, sin abrir WhatsApp con pedido no confirmado ni escribir directo como fallback.

## Reversión operativa

Ante fallo, deshabilitar el ingreso de pedidos públicos y mantener la seguridad más restrictiva mientras se investiga; no volver a reglas de escritura anónima manipulable con clientes reales. Restaurar backend y cliente solo junto con reglas compatibles, tras ensayos en staging. Verificar recibos/cobros ya confirmados y conciliar antes de aceptar nuevos pedidos.

**Resultado permitido hoy:** cambios de código y Emulator. **No** hay un corte seguro completo, ni beta pública, ni despliegue de reglas nuevo. Las pruebas de una propuesta no equivalen a pruebas del conjunto final de reglas.
