# Paso 2 — preflight offline de raíces y membresías (NO autoriza corte)

## Alcance y uso

`scripts/business-membership-inventory-preflight.mjs` exporta `auditBusinessMembershipInventory({ coverage, businesses, memberships })`. Es una **función pura**: no importa Firebase, no abre conexiones, no escribe ni modifica registros. Se usa exclusivamente con datos entregados por un proceso de inventario autorizado y revisado aparte. **No se incluye un extractor de datos reales ni credenciales.**

Formato mínimo de entrada (ejemplo ficticio, no usar como certificación):

```js
import { auditBusinessMembershipInventory } from './scripts/business-membership-inventory-preflight.mjs';
const result = auditBusinessMembershipInventory({
  coverage: {
    businesses: { complete: true, documentCount: 2, pagesRead: 1 },
    businessMemberships: { complete: true, documentCount: 3, pagesRead: 1 },
  },
  businesses: [
    { docId: 'tenant-a', restaurantId: 'tenant-a', ownerUserId: 'uid-a', employeeUserIds: [] },
    { docId: 'tenant-b', restaurantId: 'tenant-b', ownerUserId: 'uid-b', employeeUserIds: ['uid-a'] },
  ],
  memberships: [
    { docId: 'tenant-a_uid-a', restaurantId: 'tenant-a', userId: 'uid-a', role: 'OWNER', active: true },
    { docId: 'tenant-b_uid-b', restaurantId: 'tenant-b', userId: 'uid-b', role: 'OWNER', active: true },
    { docId: 'tenant-b_uid-a', restaurantId: 'tenant-b', userId: 'uid-a', role: 'WAITER', active: true },
  ],
});
```

La cobertura de **ambas colecciones completas** debe incluir un conteo exacto de documentos y al menos una página leída, incluso si está vacía. El auditor bloquea escaneos parciales, conteos discordantes, inventarios vacíos, claves duplicadas, identidades de raíz o membresía discordantes, UID/tenant inválidos, roles desconocidos, estados no booleanos, membresías huérfanas, raíces sin OWNER activo y OWNER de raíz discordante. **SUPER_ADMIN no es un rol válido de membresía de negocio:** la autorización global debe proceder de `platformAdmins/{uid}`; si aparece en un documento `businessMemberships`, el preflight bloquea el corte para revisión, aunque su UID y ruta coincidan. Un `ownerUserId` ausente se trata como histórico que requiere revisión, **no se inventa**. Varios OWNER activos requieren revisión independiente, sin borrarlos automáticamente.

La salida incluye únicamente códigos, colección, índice de entrada y contadores agregados; **no** incluye IDs, UID, nombres, correos ni documentos. El llamador debe mantener el inventario original fuera de logs/CI. No alimentar la función con datos privados sin autorización. Los conteos y el indicador `complete` son afirmaciones del llamador: **no prueban que se haya consultado toda la base correcta**.


## Revisión de colisiones históricas de empleados (31 de octubre de 2026)

El auditor ahora cruza `businesses/{id}.employeeUserIds` con **todas** las membresías del negocio, también inactivas. El alta de empleados actual impide repetir un UID indexado, pero su `transaction.set` puede sobrescribir una membresía histórica existente sin índice; este preflight detecta esa condición antes de proponer un corte, **no la repara**. Detecta también índices malformados, UID inválidos o repetidos, referencias a membresías inexistentes y roles OWNER/CLIENT incorrectamente indexados. Las membresías CLIENT no indexadas se señalan como **posible colisión de UID**, no como prueba de que sean empleados; no se agregan automáticamente al roster.

Códigos nuevos: `UNINDEXED_MEMBERSHIP_COLLISION_REVIEW`, `INVALID_EMPLOYEE_INDEX_SHAPE`, `INVALID_EMPLOYEE_INDEX_UID`, `DUPLICATE_EMPLOYEE_INDEX_UID`, `EMPLOYEE_INDEX_WITHOUT_MEMBERSHIP` y `NON_EMPLOYEE_ROLE_IN_INDEX`. Los contadores agregados `unindexedMemberships`, `staleEmployeeIndexEntries` e `invalidEmployeeIndexEntries` no incluyen identificadores. Un negocio sin índice ni membresías de empleados puede seguir a revisión independiente; uno con membresías sin índice queda bloqueado, incluso si están revocadas. Un miembro inactivo correctamente indexado no es una anomalía por sí mismo.

**Limitaciones:** el índice y las membresías pueden cambiar después de una captura; los conteos y la cobertura siguen siendo afirmaciones del llamador. Un inventario sintético coherente no demuestra que exista respaldo, que los clientes antiguos toleren el cambio o que las reglas desplegadas sean seguras. No se autoriza extraer datos reales, ejecutar backfill, borrar membresías, crear cuentas Auth, habilitar el candidato Admin SDK ni activar flags. El corte requiere inventario real autorizado, congelamiento/consistencia, revisión independiente y rollback probado.

## Interpretación y condiciones pendientes

- `BLOCKED`: existen anomalías o evidencia insuficiente. Revisar el origen del inventario y los registros señalados fuera de logs. No migrar automáticamente.
- `READY_FOR_INDEPENDENT_REVIEW`: el conjunto entregado es internamente coherente; **no** significa que el inventario sea real, exhaustivo o que las reglas sean seguras. `safeToDeploy` permanece siempre `false`.
- `node scripts/test-business-membership-inventory-preflight.mjs`: prueba exclusivamente escenarios sintéticos A/B y casos negativos. Quality CI ejecuta la prueba; no accede a Firebase.

Para un inventario histórico autorizado siguen faltando procedimiento de extracción segura con verificación de proyecto y paginación, aprobación humana, respaldo/restauración probados, análisis de compatibilidad de clientes antiguos, revisión de reglas STAGED y recorrido A/B real en entorno aislado Android/iPad. El directorio privado `GET /api/businesses/mine` y su cliente permanecen **desactivados**. No activar flags ni desplegar reglas a partir de este informe.

**Otros bloqueos:** el alta OWNER atómica en STAGED sigue pendiente; el paso 3 conserva el riesgo crítico de pedidos públicos con precios manipulados; el paso 4 de Caja/MIXTO mantiene diagnósticos `PENDIENTE` aunque CI termine en verde.
