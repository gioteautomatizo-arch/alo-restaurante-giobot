# Candidato de reglas para cobros de mesa — revisión aislada (NO PUBLICAR)

**Objetivo:** impedir que las reglas más restrictivas del entorno STAGED rompan el cobro de mesas probado en Giomero, sin conceder a meseros ni a clientes permiso para marcar pedidos como pagados.

**Estado:** únicamente código y pruebas con Firebase Emulator. **No altera** `firestore.rules`, `docs/firestore.launch-security.STAGED.rules` ni Firestore remoto; no equivale a una autorización de despliegue.

## Artefactos y comprobaciones

- Candidato: `docs/firestore.table-checkout.SECURITY-CANDIDATE-NO-PUBLICAR.rules`.
- Prueba de integración real: `scripts/test-business-table-checkout.mts` con `CHECKOUT_RULES_FILE` apuntando al candidato, ejecutada en CI sobre Firebase Emulator.
- Casos positivos: confirmación de pago y pedidos en una sola transacción, dos intentos simultáneos (solo uno válido), cambio de efectivo, tres mesas incluidas 3/12/60 y acceso de OWNER.
- Casos negativos: pago sin dinero suficiente, pago con pedido modificado/cancelado/ajeno, membresía ajena, escritura aislada de `billingStatus=PAGADO` sin pago enlazado, escritura directa de un pago por WAITER y mesa fuera de rango.

## Qué añade el candidato

Para negocios no heredados, la transición `PENDIENTE → PAGADO` de un pedido de mesa exige rol OWNER, ADMIN o CASHIER (o superadmin), preservar importe/productos/tenant y un documento `table_payments` creado en el mismo lote. El pago debe apuntar a ese pedido, a la misma mesa, negocio y cajero. Los pagos de mesa nuevos exigen identidad del cajero, rol autorizado y método compatible con el cliente. Los permisos anteriores del negocio heredado `alo-restaurante` se conservan provisionalmente.

## Bloqueos que impiden desplegar

1. **VIP:** las tarjetas antiguas siguen con un acceso directo que podría exponer datos personales. Migrar y probar la API segura, tarjetas locales y roles antes de cerrar permisos.
2. **Importes públicos:** los clientes todavía pueden proponer importes en Firestore en la ruta pública actual. La calculadora/operación autoritativa del servidor no está activada. Sin ella, ninguna regla de cobro garantiza que el pedido original tenga un precio válido.
3. **Fraude contable:** Firestore Rules no suma de forma autoritativa una lista arbitraria de pedidos ni demuestra una venta legítima solo por la creación de un documento `table_payments`. Un administrador autenticado todavía podría fabricar un pago con valores coherentes. Hace falta autoridad de servidor o conciliación más fuerte.
4. **Mostrador/domicilio:** esta ruta propuesta cubre solo mesas. La propuesta STAGED actual impide cambios de `billingStatus` desde la operación de `chargeOffTableOrder`, que requiere una transición propia y pruebas antes de migrar.
5. **Integración:** falta probar roles reales, sistema de permisos publicado, facturas/recibos, historial y cierre de turnos con dos negocios y respaldos. El emulador no sustituye un ensayo reversible de despliegue.

**Decisión:** mantener el archivo como candidato aislado; no pegarlo en Firebase Console, no habilitar beta pública. Priorizar reglas/autoridad de pedidos y VIP con un corte coordinado y reversión probada.
