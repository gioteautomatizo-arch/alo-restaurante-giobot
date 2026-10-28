# Candidato de cierre de escritura directa de pedidos — SOLO EMULADOR

**28 de octubre de 2026 · Paso 2 ABIERTO / Paso 3 PENDIENTE CRÍTICO.** Este documento NO autoriza publicación, cambio de reglas, activación de endpoint ni migración de datos. El candidato vive en scripts/public-order-write-gate-proposal-rules.mjs y deriva reglas en memoria desde docs/firestore.launch-security.STAGED.rules.

## Alcance preciso del candidato

- restaurant_orders: para negocios distintos de alo-restaurante, retira la vía pública CLIENTE_QR y rechaza ese orderSource incluso si el cliente está autenticado como miembro con permiso POS. El personal autorizado mantiene su vía explícita MESERO/CAJA y billingStatus=PENDIENTE (no valida autoritativamente los importes del POS).
- public_table_orders: impide la creación pública de resúmenes de mesa para negocios nuevos; los empleados autorizados solo pueden crear un resumen que coincida con pedido existente o incluido en el mismo batch (existsAfter/getAfter: tenant, folio, total). La lectura pública existente NO cambia y requiere revisión independiente de privacidad.
- alo-restaurante: se conserva su camino legado de creación de pedido y resumen, por compatibilidad. **Este camino NO queda protegido contra precios falsificados por el candidato.** No declarar seguridad global.
- publicOrderAttempts: el backend Admin aislado registra intentos; no se propone acceso de escritura pública a esa ruta.
- El candidato no modifica firestore.rules, docs/firestore.launch-security.STAGED.rules, firebase.json ni reglas desplegadas. No contiene un endpoint ni activa publicOrderAuthorityTransaction.ts.

## Riesgo de incompatibilidad (bloqueo de activación)

El checkout público actual BusinessPublicPage.tsx y el servicio cliente todavía escriben pedidos de nuevos negocios directamente en Firestore. **Aplicar este candidato ahora rompería ese flujo.** Los clientes antiguos y sesiones abiertas también fallarían. Un backend Admin probado en emulador no equivale a un servicio público protegido, con identidad, mitigación de abuso y operación.

La migración requiere una revisión humana de seguridad, reglas candidatas y permisos, un endpoint seguro con idempotencia y lectura transaccional de catálogo, validación de origen/abuso, nueva versión del checkout, compatibilidad de clientes antiguos, observabilidad, respaldo/restauración autorizado y un procedimiento de corte coordinado que evite aceptar pedidos sin validación. Nunca habilitar una ventana de bypass. No publicar ni cambiar reglas hasta completar y aprobar esas puertas.

## Pruebas y criterios para continuar

node scripts/test-public-order-write-gate-proposal.mjs (dentro de firebase emulators:exec --only firestore con firebase.launch-security-emulator.json) verifica con A/B ficticios: cliente anónimo y autenticado, propietario A/B, cajero, miembro revocado, pedido válido y precio alterado, aislamiento entre tenants, pedido POS legítimo, resumen de mesa vinculado, rechazo de resumen huérfano, ruta heredada Calientito y escritura privilegiada simulada. El guard de derivación falla si cambian los bloques fuente. La prueba se ejecuta solo contra reglas candidatas en memoria, no contra STAGED original ni remoto.

La auditoría original scripts/test-public-order-price-authority-audit.mjs **debe seguir imprimiendo PENDIENTE CRÍTICO** mientras STAGED admita escrituras manipuladas; una ejecución CI verde NO resuelve el defecto. El módulo Admin transaccional tiene su propia prueba, pero evita reglas. Antes de activar: matriz con reglas realmente candidatas, revisión de compatibilidad, prueba de extremo a extremo con Auth y Firestore Emulator, reintentos de red/dispositivos, rollback ensayado, revisión visual Android/iPad y aprobación explícita.

## Reversión

En esta fase no existe cambio de reglas ni de comportamiento que revertir: eliminar la integración del test y el helper devuelve el repositorio al estado previo. Una eventual reversión operativa requeriría un plan de versiones cliente/backend/reglas con respaldo, ventana de mantenimiento y conciliación de pedidos de prueba; **no** se ejecuta aquí.

**Estado:** candidato aislado; paso 2 y paso 3 abiertos. Paso 4 Caja/MIXTO sigue PENDIENTE, aunque los scripts diagnósticos terminen con código 0.
