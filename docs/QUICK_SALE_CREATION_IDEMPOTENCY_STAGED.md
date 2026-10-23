# Diseño seguro pendiente — idempotencia al crear Venta rápida

**Estado: NO ACTIVADO.** La ruta operativa continúa con `createRestaurantOrder` + cobro transaccional por pedido. No se han desplegado reglas.

## Hallazgo

Un ID persistente para cada venta y una creación transaccional ayudarían ante pérdidas de conexión. Sin embargo, la regla de lectura actual para `restaurant_orders` decide usando `resource.data.restaurantId`. En una consulta de un ID todavía inexistente, ese dato no existe y el SDK podría recibir `permission-denied`. Por ello, **NO se conectó a la interfaz** `createIdempotentQuickSaleOrder` ni el diario local experimental; se conservó el flujo probado para evitar un bloqueo en mostrador.

Además, un `setDoc` repetido con un ID determinístico no sería seguro bajo reglas heredadas: al permitir actualizaciones de pedidos, podría reescribir datos que ya están pagados. No usarlo como solución rápida.

## Propuesta por etapas, sin costes nuevos

1. Ensayar en Firestore Emulator una operación de creación con ID fijo, un segundo intento sobre el mismo documento, el intento concurrente desde dos dispositivos y la recuperación después de cortar la conexión. Usar **reglas realmente equivalentes a las del proyecto** y revisar tanto `firestore.rules` como STAGED.
2. Definir una operación `create-only` con rechazo de sobrescrituras y lectura restringida al tenant; comprobar que ninguna ruta pública puede crear ni marcar pedidos pagados.
3. Guardar un ID aleatorio en el navegador antes de empezar, sin almacenar teléfonos ni nombres; mantenerlo hasta consultar el resultado verificado en Firestore. La futura UI debe mostrar `Pendiente`, `Pagado` o `No comprobable` sin permitir que un reintento incierto cobre dos veces.
4. Añadir tests de concurrencia e integración al CI y evaluar compatibilidad con pedidos y cuentas antiguas de Calientito.
5. No desplegar reglas ni cambiar cobros reales hasta resolver acceso Firebase, respaldo/restauración y aprobación del responsable.

## Medidas activas confirmadas

- Bloqueo de doble pulsación en el dispositivo durante Venta rápida.
- Cobro `PENDIENTE → PAGADO` con transacción que consulta el pedido actual, evita un segundo cobro del mismo documento y conserva su método de pago.
- Tickets con ID determinístico y opción de recuperación **sin volver a cobrar**.
- Los problemas de permisos de tickets reales siguen abiertos hasta verificar las reglas desplegadas.

**Regla:** no prometer idempotencia completa tras cortes de red mientras no esté probado el flujo de creación.

## Prueba reproducible de permisos — 22/10/2026

Se incorporó `scripts/test-quick-sale-idempotency-staged.mjs` al CI para ensayar con dos conjuntos de reglas existentes en un **emulador aislado**. Compara:

- `getDoc` y transacción sobre ID de pedido que aún no existe;
- creación inicial por ID fijo;
- segundo `setDoc` después de que una venta ya figura `PAGADO`.

Estas pruebas **demuestran límites de las reglas actuales**; pasar la suite significa que las condiciones de riesgo fueron reconocidas correctamente, **NO** que sea seguro habilitar el algoritmo. Si falla la suite, revisar logs antes de interpretar el resultado. La versión publicada en Firebase no se consulta ni cambia.

**Criterio antes de activar:** reglas con lectura segura para comprobar IDs propios inexistentes y protección estricta contra sobrescritura de `PAGADO`, respaldadas por pruebas de aislamiento entre negocios y aprobación explícita del responsable.
