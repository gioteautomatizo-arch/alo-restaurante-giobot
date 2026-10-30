# Paso 2 — Preflight offline de catálogos históricos antes de un corte de reglas

**Estado: instrumento de diagnóstico; NO autoriza despliegue, migración ni lectura de producción.** El objetivo es comprobar con datos ficticios o un inventario local expresamente autorizado si el contrato actual de lectura/edición de catálogos podría rechazar documentos históricos legítimos.

## Ejecución segura

```sh
node scripts/test-business-catalog-cutover-preflight.mjs
node scripts/run-business-catalog-cutover-preflight.mjs inventario-local-autorizado.json
```

La prueba integrada en Quality CI utiliza exclusivamente objetos sintéticos. El CLI solo lee el archivo local que se le pasa; no importa Firebase, no solicita credenciales, no consulta la red y no modifica registros. Sale con código **0** cuando no encuentra inconsistencias en el inventario *declarado*, **1** cuando encuentra bloqueos y **2** ante entrada ilegible/inválida. **Código 0 NO significa permiso para desplegar**.

## Formato del inventario

Objeto JSON con `scope: "business-catalog-cutover-inventory"` y cuatro arrays: `businesses`, `businessMemberships`, `publicBusinessProfiles`, `businessCatalogs`. Debe incluir `coverage` para cada uno de esos nombres, con `{ "complete": true, "documentCount": N, "pagesRead": P }`. La bandera `complete`, el conteo y las páginas son declaraciones del operador: **no prueban que se hayan leído todos los documentos**.

- `businesses`: documentos de raíz como `{ "docId": "tenant-a", "restaurantId": "tenant-a", "ownerUserId": "uid-a" }`.
- `businessMemberships`: `{ "docId": "tenant-a_uid-a", "restaurantId": "tenant-a", "userId": "uid-a", "role": "OWNER", "active": true }`. Incluir también personal activo e inactivo, no solo OWNER.
- `publicBusinessProfiles`: `{ "docId": "tenant-a", "businessId": "tenant-a", "restaurantId": "tenant-a", "published": true }`. Incluir publicados y ocultos.
- `businessCatalogs`: `{ "path": "businesses/tenant-a/catalog/menu_catalog", "businessId": "tenant-a", "revision": "rev-1", "items": [{ "id": "p-1", "name": "Producto ficticio", "price": 10, "available": true }] }`. Un documento histórico puede tener `updatedAt` en vez de `revision`; la ausencia de ambos produce HOLD. Los otros documentos bajo `catalog` deben aparecer en el inventario para activar el bloqueo de ID desconocido.

No adjuntar a GitHub ni a incidencias un inventario real con UID, productos o datos personales. Guardarlo fuera del repositorio y bajo las autorizaciones y controles de acceso correspondientes. La salida solo incluye códigos, colección, índice y conteos, nunca identificadores, nombres ni productos.

## Qué se comprueba

Cobertura declarada de las cuatro colecciones, paginación y conteos; identidad de raíz/OWNER/membresía, duplicados y membresías huérfanas; coherencia de perfiles publicados; documentos `menu_catalog` asociados a su tenant, presencia de catálogo si un negocio está publicado, IDs de catálogo no reconocidos, productos con IDs repetidos, precios no finitos y catálogos sin revisión. Un resultado `BLOCKED` requiere investigación autorizada antes de cualquier cambio de reglas o cliente.

**Integridad de opciones y extras:** si `optionGroups` está presente debe ser un array. Cada grupo requiere ID y nombre no vacíos, banderas booleanas `required`/`multiple`, al menos una opción, IDs y nombres de grupo sin duplicados (nombres comparados sin distinguir mayúsculas). Cada opción requiere nombre único dentro del grupo y `price` numérico, finito y no negativo; no se aceptan precios como texto ni opciones sin precio. Se emite `CATALOG_OPTION_GROUP_INCOMPATIBLE` sin incluir nombres, importes, IDs o UID en el resultado. `optionGroups` ausente o `[]` sigue siendo válido para productos históricos sin extras. La auditoría **no limpia, redondea, repara ni migra** opciones; exige revisión humana para evitar que el carrito interprete grupos ambiguos o precios incorrectos.

**Límites:** el preflight no verifica exhaustividad real, permisos efectivos, políticas de subcolecciones no inventariadas, todos los campos de producto, integridad de opciones de tipos no documentados, stock ni precios autoritativos del servidor. No verifica datos de producción ni la capacidad de restaurar respaldos. Una migración histórica, si llega a aprobarse, requiere revisión humana independiente, respaldo/restauración probados, control de versiones de clientes y pruebas A/B con Auth/Firestore aislados. No rellenar automáticamente identidades, fechas ni revisiones.

**Orden beta:** paso 1 visual Android/iPad pendiente; paso 2 ABIERTO por OWNER atómico y borradores STAGED, reglas efectivas, inventario autorizado y recorrido integral A/B. Paso 3 checkout autoritativo/deduplicación PENDIENTE CRÍTICO. Paso 4 Caja/MIXTO histórico PENDIENTE aunque los diagnósticos impriman PASS o terminen con código 0. Pasos 5/6 no autorizados.


## Prevención al guardar (30 de octubre de 2026)

La auditoría offline anterior detecta catálogos históricos ambiguos. Además, la ruta real `buildCatalogPayload` del servicio de catálogo ahora ejecuta `assertUniqueOptionGroupIdentity` después de `cleanOptionGroups`: rechaza grupos con IDs o nombres repetidos, o IDs vacíos/con espacios, **antes** de iniciar una escritura. Los IDs de grupo son claves de selección del carrito: duplicarlos podría aplicar la misma selección a dos grupos y sumar extras más de una vez. El rechazo devuelve `OPCIONES_CATALOGO_INVALIDAS` para que el operador revise el producto; no migra ni repara datos históricos.

Cobertura: `node --import tsx scripts/test-catalog-option-group-identity.mts` (puro) y `scripts/test-business-catalog-identity-emulator.mjs` (SDK real con dos tenants ficticios en Firebase Emulator), integrados en Quality/Security CI. No valida precios en servidor, no verifica catálogos reales ni cambia reglas desplegadas. El preflight histórico conserva `safeToDeploy: false`.
