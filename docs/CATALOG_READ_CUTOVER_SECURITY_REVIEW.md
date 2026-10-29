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

## Comprobación adicional de raíz y perfil publicados (29 de octubre de 2026)

- La propuesta de lectura de `menu_catalog` público ahora exige que exista `businesses/{id}` con `restaurantId == id` y `publicBusinessProfiles/{id}` con `published == true`, `businessId == id` y `restaurantId == id`. No basta con un perfil publicado huérfano. Se conserva el acceso interno identificado a un catálogo no publicado; esto no certifica permisos de escrituras.
- El test del emulador incluye cinco casos sintéticos: perfil publicado sin raíz, raíz con `restaurantId` cruzado, perfil con `businessId` cruzado, perfil histórico sin campos de identidad y raíz sin `restaurantId`. STAGED los considera públicos; el candidato debe rechazarlos. Son casos ficticios, no se han detectado estos registros en producción.
- **HOLD adicional de compatibilidad:** un perfil publicado histórico sin ambos campos de identidad o una raíz sin `restaurantId` dejará de exponer su menú bajo el candidato. Auditar únicamente con autorización y datos de solo lectura, validar migración y respaldo antes de cualquier corte. No completar campos automáticamente ni volver a reglas inseguras ante un error.
- **Costo/seguridad:** el candidato añade consultas de documentos raíz y perfil en la evaluación de reglas; revisar presupuestos de lecturas y límites de acceso del motor de Firestore con el conjunto completo de reglas, además de la latencia y el comportamiento de clientes antiguos. Un `success` de emulador no certifica despliegue ni rendimiento real.


## Identidad del documento de catálogo (29 de octubre de 2026)

- El candidato en memoria exige además `resource.data.businessId == businessId` para leer `menu_catalog`, incluso si la raíz y el perfil son coherentes o quien lee es miembro activo. Un catálogo con `businessId` cruzado, sin campo o con tipo incorrecto falla cerrado. Se mantiene el acceso de Super Admin a efectos de auditoría y la lectura de documentos legítimos por sus miembros.
- La matriz del emulador siembra tres catálogos publicados con documento cruzado/ausente/mal tipado y uno privado con identidad cruzada, con propietarios ficticios legítimos para comprobar que su membresía no elude el control. STAGED sigue permitiendo esas lecturas; el candidato debe rechazarlas. **No hay evidencia de tales documentos en producción.**
- **HOLD histórico:** cualquier `menu_catalog` heredado sin `businessId` dejaría de ser legible para clientes y miembros ordinarios al activar el candidato. Antes de autorizar un corte, inventariar documentos con permiso de solo lectura, clasificar los casos y ensayar respaldo/restauración y compatibilidad de clientes antiguos. No completar campos, desplegar ni hacer rollback a una regla pública insegura automáticamente.
- Esta validación de lectura no garantiza que los elementos internos del catálogo sean correctos, que las escrituras estén protegidas ni que los pedidos públicos calculen precios de forma autoritativa. Mantener paso 2 ABIERTO y pasos 3/4 PENDIENTE.
