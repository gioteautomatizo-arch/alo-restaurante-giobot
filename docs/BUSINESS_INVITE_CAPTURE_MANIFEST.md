# Paso 2 — manifiesto offline para inventarios históricos de invitaciones

**Propósito:** preparar una revisión independiente de captura de `businesses`, `businessMemberships` y `business_invites`, sin consultar Firebase desde esta herramienta. No es un extractor, una migración, una copia de seguridad ni una autorización para activar el directorio o las invitaciones.

`auditBusinessInviteCaptureManifest({ capture, coverage, businesses, memberships, invites })`, en `scripts/business-invite-capture-manifest-preflight.mjs`, valida la **coherencia interna declarada** de las páginas entregadas: tres colecciones, conteos, tamaños de página, consulta terminal explícita, huellas declaradas de fuente/instantánea y ventana temporal. Su salida solo incluye códigos y conteos agregados, sin nombres, UID, tokens ni fingerprints. `safeToDeploy` siempre es `false`.

## Contrato de captura (ejemplo completamente ficticio)

```js
import { auditBusinessInviteCaptureManifest } from './scripts/business-invite-capture-manifest-preflight.mjs';
const sourceFingerprint = 'a'.repeat(64); // Etiqueta pseudónima, NO identificador de proyecto.
const snapshotFingerprint = 'b'.repeat(64); // Etiqueta pseudónima, NO prueba de snapshot atómico.
const page = pageCounts => ({ sourceFingerprint, snapshotFingerprint, pageSize: 150, pageCounts });
const result = auditBusinessInviteCaptureManifest({
  capture: {
    sourceFingerprint, snapshotFingerprint,
    startedAt: 1800000000000, finishedAt: 1800000000500,
    collections: {
      businesses: page([2]),
      businessMemberships: page([3]),
      business_invites: page([150, 1]),
    },
  },
  coverage: {
    businesses: { complete: true, documentCount: 2, pagesRead: 1 },
    businessMemberships: { complete: true, documentCount: 3, pagesRead: 1 },
    business_invites: { complete: true, documentCount: 151, pagesRead: 2 },
  },
  businesses: [{}, {}], memberships: [{}, {}, {}], invites: Array.from({ length: 151 }, () => ({})),
});
```

Este verificador comprueba solo **páginas y metadatos**, no la validez de los documentos. Para el contenido, ejecutar por separado `auditBusinessInviteHistory` sobre inventarios sanitizados y con aprobación de acceso. Ambos resultados deben llegar a revisión humana; que los dos indiquen `READY_FOR_INDEPENDENT_REVIEW` no autoriza desplegar.

## Procedimiento sujeto a autorización (NO ejecutar desde esta automatización)

1. Obtener autorización expresa del responsable del proyecto, definir alcance y personas con acceso. Registrar fuera del repositorio la identidad del proyecto y del entorno, el responsable, la ventana de captura y el método de respaldo. No registrar credenciales ni PII en GitHub, logs o CI.
2. Preferir una **exportación inmutable autorizada** de las tres colecciones, con comprobación independiente de procedencia y consistencia. Si se recorre una base viva, no declarar snapshot consistente solo por repetir el mismo `snapshotFingerprint`: inserciones, revocaciones y cambios de permisos entre páginas invalidan esa afirmación. No congelar ni modificar producción sin aprobación separada.
3. En un entorno custodiado, recorrer cada colección con un orden estable, páginas acotadas y sin omisiones; registrar únicamente `pageCounts` y una **consulta terminal** de menos de `pageSize` documentos. Si la última página tiene exactamente `pageSize`, consultar otra página, que podrá estar vacía. No inferir fin de colección de una página llena.
4. Transformar los documentos al esquema mínimo del [auditor de invitaciones](BUSINESS_INVITE_HISTORY_PREFLIGHT.md) en el entorno autorizado. Nunca incluir token, email, nombre ni secreto en el manifiesto. No subir los inventarios reales al repositorio ni a los workflows.
5. Comparar conteos y páginas, comprobar que la fuente y la instantánea sean las mismas según evidencia externa (no por las huellas autodeclaradas), ejecutar ambos preflights **fuera de CI** y custodiar los resultados agregados. Repetir la captura si el origen cambió o no hay evidencia de consistencia.
6. Someter a revisión independiente los permisos OWNER, compatibilidad de clientes 2→3, límites 150/7500, costos, reglas efectivas, respaldos/restauración y plan de reversión. No activar flags ni publicar hasta cerrar también el recorrido A/B y los demás pasos de beta.

## Bloqueos, pruebas y reversión

`BLOCKED` se emite ante páginas incompletas, ausencia de página terminal, conteos discordantes, cobertura no exhaustiva, tiempos inválidos, huellas mal formadas o etiquetas de fuente/instantánea diferentes entre colecciones. Una página vacía `[0]` es válida para una colección vacía. Para 150 documentos exactos con `pageSize: 150`, el manifiesto exige `[150, 0]`, no `[150]`.

**Límite esencial:** todos los metadatos son declaraciones del capturista. Un manifiesto sintético coherente no prueba el origen, la autorización, la integridad de una exportación real, un snapshot atómico ni la ausencia de documentos omitidos. Las huellas son etiquetas pseudónimas; no son firmas ni hashes del contenido. Ninguna acción de esta herramienta extrae, migra, elimina o cambia registros.

Prueba local: `node scripts/test-business-invite-capture-manifest-preflight.mjs`. Quality CI ejecuta solo fixtures ficticios. Para revertir, retirar los dos scripts, este documento y su paso en `.github/workflows/quality.yml`. No existe migración ni despliegue que revertir.

**Paso 2 permanece abierto** hasta inventario histórico autorizado, revisión independiente, reglas efectivas y recorrido manual Android/iPad. **Paso 3** conserva precios/disponibilidad e idempotencia persistente pendientes. **Paso 4** Caja/MIXTO sigue `PENDIENTE`, incluso cuando los diagnósticos terminen con código cero.
