# Contrato de lectura del catálogo — revisión de seguridad antes de beta

Estado: **HOLD / NO DESPLEGAR**. Este documento acompaña exclusivamente a `scripts/test-menu-import-draft-rule-proposal.mjs`, que deriva reglas en memoria para Firebase Emulator. No modifica `firestore.rules`, `docs/firestore.launch-security.STAGED.rules` ni reglas desplegadas.

## Contrato propuesto (lecturas)

| Documento | Anónimo | Miembro activo identificado | Editor identificado (OWNER/ADMIN/MANAGER) | Super Admin |
| --- | --- | --- | --- | --- |
| `menu_catalog`, negocio publicado | Sí | Sí | Sí | Sí |
| `menu_catalog`, negocio no publicado | No | Sí | Sí | Sí |
| `menu_import_draft`, publicado o no | No | No (CASHIER/WAITER/KITCHEN/EMPLOYEE) | Sí | Sí |
| Cualquier otro ID en `catalog` | No | No | No | Sí |

Una membresía *identificada* debe estar activa y contener `restaurantId == businessId` y `userId == auth.uid`, además de existir bajo la ruta `businessMemberships/{businessId}_{uid}`. No confiar solamente en el nombre de documento o el campo `active`.

## Evidencia reproducible

Ejecutar en entorno **aislado**, sin conectar Firebase real, el paso `Test menu import draft Firestore rule proposal` de `.github/workflows/security-firestore.yml`. El script prueba reglas STAGED actuales (diagnóstico de exposición) y luego la propuesta derivada en memoria con dos negocios ficticios. La prueba diagnóstica imprime `PENDIENTE` deliberadamente: no significa que STAGED esté corregido.

Comprobar en el log: lectura pública del `menu_catalog` publicado, denegación de borrador y documentos desconocidos a visitantes, lectura de catálogo no publicado por propietario legítimo, denegación de borrador a CASHIER/revocados/cuentas ajenas y rechazo de membresías mal asociadas o sin campos de identidad. Los tests de cliente con mocks/jsdom no sustituyen este emulador ni la validación visual Android/iPad.

## Riesgos y puerta de migración

1. **Históricos:** membresías antiguas sin `userId` o `restaurantId` serán rechazadas por el candidato, incluso si el usuario es legítimo. Antes de aplicar, inventariar con auditoría de solo lectura, verificar propietarios y respaldar/restaurar. **No completar campos automáticamente** ni alterar datos reales.
2. **Consumidores:** verificar todas las rutas de lectura de `businesses/{id}/catalog/{doc}` y clientes antiguos; la propuesta solo reconoce `menu_catalog` y `menu_import_draft`. Los IDs adicionales requieren clasificación, contrato propio y prueba antes de corte. No abrir lectura pública de un ID desconocido para resolver un error de compatibilidad.
3. **Alcance:** esta propuesta endurece **lecturas**; las escrituras STAGED y el alta OWNER atómica, reglas de pedidos y protección del precio requieren revisión separada. Un cliente antiguo puede intentar escrituras fuera del contrato. No afirmar que el candidato resuelve esos bloqueos.
4. **Reglas efectivas:** éxito en CI no prueba reglas desplegadas ni acceso desde una app real. Requiere revisión independiente, autorización explícita de despliegue y verificación posterior, fuera de esta tarea.

## Secuencia segura de corte (no ejecutada)

- Revisar inventario y compatibilidad con dos negocios A/B, propietario, encargado, caja, empleado revocado y visitante.
- Obtener aprobación independiente, respaldo verificable y procedimiento de restauración; congelar cambios incompatibles mientras se prepara la transición.
- Ensayar el mismo conjunto de reglas y clientes en emuladores, incluidos clientes antiguos y cuentas históricas representativas; detener si aparecen lecturas legítimas denegadas.
- **Solo en un proceso autorizado distinto**, planificar aplicación gradual y monitoreo, con plan de reversión que no restaure exposición pública de borradores. Ante incidencia, suspender acceso al módulo afectado en lugar de volver ciegamente a reglas inseguras.

## Estado de pasos

Paso 1: visual Android/iPad pendiente. **Paso 2: ABIERTO / HOLD** hasta compatibilidad histórica, seguridad OWNER atómico y recorrido completo A/B. Paso 3: validación autoritativa de pedidos públicos PENDIENTE CRÍTICO. Paso 4: Caja histórica/MIXTO **PENDIENTE** aunque CI esté verde. Pasos 5 y 6 no autorizados.
