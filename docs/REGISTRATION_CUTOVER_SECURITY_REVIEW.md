# Paso 2 — revisión independiente del corte de registro empresarial 2 → 3

**Estado: BLOQUEADO / SOLO PROPUESTA.** Fecha de revisión: 27 de octubre de 2026. Rama exclusiva: `feat/gioteautomatizo-multinegocio-core`. No autoriza despliegue, migración, cambios de reglas, operaciones con datos reales ni publicación.

## Alcance y evidencia observable

El cliente actual `src/lib/businessAuthService.ts` crea `businesses/{id}` y `businessMemberships/{id}_{uid}` en un lote de **dos documentos**. Las reglas `docs/firestore.launch-security.STAGED.rules` permiten crear la raíz sin exigir la membresía OWNER en el mismo lote y no contienen la reserva permanente `businessHandleReservations/{id}`. El contrato candidato de tres documentos y la puerta de congelación se construyen **solo en memoria** en `scripts/owner-atomic-proposal-rules.mjs`.

La matriz `scripts/test-business-registration-version-matrix.mjs` demuestra en Firebase emulado: staged acepta 2/rechaza 3; freeze-before rechaza ambos; candidate rechaza 2/acepta 3; freeze-after rechaza ambos y conserva operaciones existentes; volver directamente a staged permite de nuevo altas sin reserva. Las pruebas con dos negocios, personal y catálogo son emuladas. **No se verificaron las reglas realmente desplegadas ni una restauración real.**

`node scripts/business-registration-cutover-audit.mjs` es un diagnóstico **sin Firebase ni red**, que inspecciona fuentes locales y marca `BLOCKED` cuando detecta el cliente de dos documentos, ausencia de OWNER atómico/reserva en staged, rollback directo inseguro o evidencia de revisión ausente. La opción `--enforce` devuelve error cuando la revisión no está completa. Su salida `READY_FOR_INDEPENDENT_REVIEW` solo sería una invitación a revisar pruebas y aprobaciones, **nunca una autorización automática para desplegar**. La detección del código usa patrones conservadores: si el código cambia de forma no reconocida, se bloquea para revisión.

## Puertas obligatorias antes de cualquier cambio de producción

| Puerta | Evidencia requerida | Estado |
|---|---|---|
| Identificar versión exacta | SHA de cliente, reglas, backend y contrato de lote; comprobar que no hay clientes antiguos activos incompatibles | **PENDIENTE** |
| Inventario histórico | Enumeración certificada de raíces, OWNER, membresías, perfiles públicos, catálogos y reservas; revisar rutas duplicadas y referencias cruzadas | **PENDIENTE** |
| Reserva permanente | Revisión manual de propietarios, colisiones y IDs huérfanos; plan de backfill idempotente, auditable y sin reasignación automática | **PENDIENTE** |
| Respaldo y restauración | Respaldo privado autorizado y **restauración probada** en proyecto aislado, con datos representativos y retención definida | **PENDIENTE** |
| Seguridad independiente | Revisión de `existsAfter/getAfter`, presupuesto de accesos documentales, Auth, roles, invitaciones, pedidos públicos y Admin SDK; aprobación explícita | **PENDIENTE** |
| Compatibilidad de clientes | Ensayar corte/rollback con versiones exactas de cliente y reglas; no permitir altas de dos documentos bajo reglas de tres | **PENDIENTE** |
| Recorrido manual | Dos negocios ficticios: alta, catálogo, publicación, invitación, revocación, cambio de cuenta, pedido y recuperación; Android e iPad | **PENDIENTE** |
| Baja y perfiles residuales | Protocolo administrativo de despublicación y retiro atómicos, auditoría de perfiles huérfanos y conservación de reservas | **PENDIENTE** |

No incluir PII, tokens, credenciales, exports reales ni listas de propietarios en el repositorio. El manifiesto de aprobación, si se usa, debe guardar solo referencias no sensibles a evidencias privadas controladas y SHA exactos. Los booleanos sintéticos de los tests no acreditan una aprobación humana.

## Orden candidato de operación, NO ejecutable sin autorización

1. Recuperar acceso administrativo legítimo y confirmar proyecto/base exactos, permisos, costes y responsables. Preparar respaldo y restauración de ensayo.
2. Congelar **solo nuevas altas** mediante reglas revisadas; verificar que negocios existentes conservan catálogo, empleados, publicación y pedidos. Si falla, detener; no improvisar reglas abiertas.
3. Certificar inventario histórico y backfill de reservas con aprobación de propietarios; ejecutar primero ensayo con dos tenants y casos huérfanos, duplicados y referencias cruzadas. **No ejecutar backfill automático por el preflight.**
4. Revisar y desplegar, únicamente tras autorización separada, un cliente y reglas compatibles con lote atómico de tres documentos. Controlar clientes antiguos, reintentos Auth y errores de red.
5. Confirmar integridad de reservas, OWNER, aislamiento, pedidos y directorio en el entorno aprobado. Registrar la versión exacta y monitorear.
6. Solo entonces decidir reapertura de altas y posterior beta cerrada. La aprobación de reglas **no** sustituye los pasos 3 (pedidos) y 4 (Caja) del checklist maestro.

## Reversión segura candidata, NO ejecutada

Si el corte falla, **mantener las altas congeladas** y restaurar únicamente versiones de frontend/backend compatibles con la puerta cerrada. No volver directamente a staged: el ensayo muestra que reabre altas sin reserva permanente. Conservar las reservas, membresías y pedidos ya escritos; no restaurar indiscriminadamente toda la base. Investigar el error, documentar incidentes y repetir la revisión antes de reabrir. Las reglas de cliente **no** limitan el Admin SDK: la baja privilegiada exige despublicación y auditoría separadas.

## Comprobaciones locales y límites

- `node scripts/test-business-registration-cutover-audit.mjs`: escenarios sintéticos del diagnóstico y `--enforce`; integrado en Quality checks. Una ejecución verde confirma que el **bloqueo se detecta**, no que el corte sea seguro.
- `node scripts/business-registration-cutover-audit.mjs`: inspección de las fuentes actuales, imprime `BLOCKED` y `PENDIENTE` cuando corresponde.
- `node scripts/business-registration-cutover-audit.mjs --enforce`: salida no cero mientras falten puertas. No conectar a Firebase.
- `scripts/test-business-registration-version-matrix.mjs`: requiere emulador y se ejecuta en Security CI; verifica contratos por fase, pero no el despliegue ni la migración real.

**Criterio para continuar:** revisión humana independiente y pruebas manuales con dos negocios ficticios, sin tocar datos reales. Hasta entonces, paso 2 **ABIERTO**. Paso 3 pedido/recuperación y paso 4 Caja histórica/MIXTO **PENDIENTES**; los logs que imprimen `PENDIENTE` no prueban conciliación.
