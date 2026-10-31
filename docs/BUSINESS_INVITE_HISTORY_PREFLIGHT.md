# Paso 2 — preflight offline de historial de invitaciones (sin Firebase)

**Estado:** herramienta de diagnóstico para la beta, no una migración ni una autorización de despliegue.

`scripts/business-invite-history-preflight.mjs` exporta `auditBusinessInviteHistory({ coverage, businesses, memberships, invites, now })`. No conecta a Firebase, no extrae datos, no modifica registros y nunca devuelve identificadores, nombres, correos, tokens ni documentos. No ejecutar sobre datos reales sin inventario autorizado y custodiado fuera de CI.

La entrada exige `coverage` con `complete: true`, `documentCount` exacto y `pagesRead >= 1` para **businesses**, **businessMemberships** y **business_invites**; `now` es un timestamp de referencia en milisegundos. `businesses` y `memberships` siguen el contrato de [preflight de membresías](BUSINESS_MEMBERSHIP_INVENTORY_PREFLIGHT.md). Cada invitación debe incluir `docId` (hash SHA-256 de 64 caracteres hexadecimales, **no token**), `businessId`, `createdBy`, `role`, `status`, `createdAt` y `expiresAt`. Los campos PII no son necesarios ni deben incluirse. Ejemplo sintético:

```js
import { auditBusinessInviteHistory } from './scripts/business-invite-history-preflight.mjs';
const now = 1_800_000_000_000;
const report = auditBusinessInviteHistory({
  now,
  coverage: {
    businesses: { complete: true, documentCount: 1, pagesRead: 1 },
    businessMemberships: { complete: true, documentCount: 1, pagesRead: 1 },
    business_invites: { complete: true, documentCount: 1, pagesRead: 1 },
  },
  businesses: [{ docId: 'tenant-a', restaurantId: 'tenant-a', ownerUserId: 'uid-a', employeeUserIds: [] }],
  memberships: [{ docId: 'tenant-a_uid-a', restaurantId: 'tenant-a', userId: 'uid-a', role: 'OWNER', active: true }],
  invites: [{ docId: 'a'.repeat(64), businessId: 'tenant-a', createdBy: 'uid-a',
    role: 'WAITER', status: 'PENDING', createdAt: now - 1000, expiresAt: now + 1000 }],
});
```

## Bloqueos detectables

El auditor bloquea inventarios parciales o inconsistentes; raíces/OWNER anómalos mediante el preflight existente; documentos, hashes, tenants, estados, roles o fechas de invitación inválidos; emisores de invitaciones pendientes y aún vigentes sin permisos actuales (incluida la separación A/B); y exceso de documentos históricos **por tenant**.

- **151 o más documentos:** el cliente legado sin `pagination=1` recibe 409 sin historial; requiere revisión de versiones instaladas y estrategia de actualización. Se cuentan también invitaciones revocadas, aceptadas y vencidas.
- **7500 o más documentos:** el cliente actualizado con máximo 50 páginas de 150 no puede garantizar completar la lectura; incluso 7500 exactos requieren una página final vacía que excedería el límite. Revisar retención/archivo y paginación antes de activar.
- Una invitación pendiente **vencida** con timestamps estructuralmente válidos se cuenta como histórica no accionable; no exige que el emisor siga autorizado. Una pendiente **vigente** sí exige membresía y rol actual correctos. No se borran ni revocan registros automáticamente.

`BLOCKED` significa revisión requerida, no reparación automática. `READY_FOR_INDEPENDENT_REVIEW` solo indica coherencia **de la entrada entregada**; `safeToDeploy` es siempre `false`. La cobertura y `now` son declaraciones del llamador: no acreditan proyecto correcto, captura atómica, reglas efectivas, disponibilidad de versiones antiguas, correos válidos, costos, índices ni dispositivos. No existe extractor de producción ni aprobación para obtener datos reales. Para revertir el bloque basta retirar auditor, prueba y paso de Quality; no se migran datos.

Prueba: `node --import tsx scripts/test-business-invite-history-preflight.mjs` con negocios A/B y límites 150/151/7499/7500. Se ejecuta en Quality CI sin Firebase. Sigue pendiente el inventario real autorizado y revisión humana antes de activar invitaciones; Android/iPad, reglas desplegadas, paso 3 de pedidos y paso 4 de Caja no quedan certificados.

## Evidencia de captura por páginas (paso previo a inventario autorizado)

Antes de interpretar un resultado de este auditor sobre un inventario histórico autorizado, validar también el manifiesto de páginas con `auditBusinessInviteCaptureManifest`, descrito en [BUSINESS_INVITE_CAPTURE_MANIFEST.md](BUSINESS_INVITE_CAPTURE_MANIFEST.md). Este segundo control comprueba que los conteos declarados coincidan con las páginas y que se haya observado una página terminal para cada colección; no certifica la fuente ni un snapshot real. Ambos informes requieren revisión humana independiente y mantienen `safeToDeploy: false`.
