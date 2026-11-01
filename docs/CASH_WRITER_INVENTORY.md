# Inventario de escritores contables — preflight estático (1 de noviembre de 2026)

**Estado:** diagnóstico parcial de código, **NO** conciliación, **NO** autorización para cerrar Caja. Solo rama `feat/gioteautomatizo-multinegocio-core`; sin despliegue, escrituras reales, reglas ni endpoints nuevos.

## Escritores conocidos revisados

| Origen / ruta | Punto de escritura comprobado en código | Riesgo para un protocolo de época compartida |
| --- | --- | --- |
| `restaurant_orders` y espejo `public_table_orders` — `src/lib/ordersService.ts` | Altas por `addDoc`, `setDoc`, lote de mesa; cambios de estado, cobro fuera de mesa y edición por `updateDoc` o `runTransaction`. Incluye caminos heredados y multinegocio. | No todos participan en una misma transacción con una época de negocio. Un espejo puede escribirse después o fallar independientemente en rutas legadas. |
| `table_payments` + `restaurant_orders` — `src/lib/paymentsService.ts` | `settleTableAccount` crea pago y marca pedidos dentro de `runTransaction`; actualiza `public_table_orders` después, en escrituras independientes. | No incrementa una época común; el espejo puede quedar desfasado. El flujo legado utiliza `RESTAURANT_ID` fijo al filtrar pedidos y `getActiveRestaurantId()` al registrar el pago: requiere revisar el contrato de contexto antes de cualquier generalización. **No se modificó el cobro.** |
| `businesses/{id}/shifts` — `BusinessShiftView.tsx` y `tenantModules.ts` | Apertura y cierre de turno mediante dos llamadas a `saveModuleDoc`, que utiliza `setDoc` cliente. | No es autoridad exclusiva de servidor ni serializa contra pedidos, pagos, gastos y resguardo. |
| `businesses/{id}/expenses` y `vault` — vistas y `tenantModules.ts` | Alta/reemplazo por `saveModuleDoc`; eliminación por `deleteModuleDoc`. | La UI puede modificar o eliminar datos que afectan el saldo sin época compartida; bitácora asíncrona no sustituye transacción. |
| `shifts` + `shiftAuthority` — `shiftOpenAuthorityPreflight.mjs`, `shiftCloseAuthorityPreflight.mjs` | Candidatos Admin transaccionales: `tx.create`, `tx.update`, `tx.delete`. | **No conectados** a Caja/HTTP productivo. El cierre experimental mantiene bloqueos de históricos y pagos de mesa; no reemplaza escrituras cliente. |
| `restaurant_orders` y espejo — `publicOrderAuthorityTransaction.ts` | Candidato Admin `tx.create` para pedido, espejo e intento. | Experimento **sin endpoint activado**; no demuestra cobertura de clientes existentes. |
| `sale_receipts` — `src/lib/saleReceiptsService.ts` | Tres rutas `setDoc` de recibos y recuperación. | Fuente adicional de evidencia fuera de las seis colecciones del auditor contable; debe incluirse en revisión histórica y rollback. |

## Prueba de deriva reproducible

`src/lib/shiftCashWriterInventoryPreflight.mjs` contiene el mapa **conocido** de diez archivos, los conteos de sus sitios de escritura y las relaciones explícitas de `shifts`, `expenses`, `vault`, pedidos y recibos. `scripts/test-shift-cash-writer-inventory.mjs` lee esos archivos en modo solo lectura y falla si se elimina o agrega un sitio conocido, cambia un vínculo de tenant/módulo, falta un archivo o aparece un archivo adicional no revisado en el mapa. También prueba estas regresiones mediante mutaciones **en memoria**, sin tocar el repositorio ni Firestore. El test está incluido en Quality.

Ejecutar desde la raíz:

```sh
node scripts/test-shift-cash-writer-inventory.mjs
```

**Límites explícitos:** es una comprobación textual de rutas seleccionadas, no un parser completo ni un barrido exhaustivo del repositorio. Un reemplazo de una llamada por otra que conserve el mismo conteo podría escapar; tampoco cubre clientes instalados, repositorios externos, escrituras Admin fuera de las rutas inventariadas, reglas desplegadas ni cambios después de la lectura. `knownWriterSitesStable=true` significa únicamente que no cambió el patrón conocido; `writerInventoryComplete=false`, `snapshotCertified=false`, `canCloseCash=false` y `status=BLOCKED` **siempre**. El script imprime `PENDIENTE` deliberadamente.

## Puertas antes de activar una autoridad real

1. Extender el inventario a **todos** los escritores y versiones de clientes; decidir tratamiento de `public_table_orders`, `sale_receipts`, pagos históricos sin fecha y registros huérfanos.
2. Diseñar y revisar un backend que autorice cada mutación por negocio, con idempotencia y época/serialización atómica compartida, incluidos gastos y resguardo. Las reglas candidatas deben impedir escrituras legadas fuera del protocolo **solo tras aprobación y plan de reversión**.
3. Probar con Firebase Emulator dos cajeros, cambios concurrentes pedido/pago, pago MIXTO/mesa, rollback, reconexión, turnos heredados y comprobantes históricos; demostrar integridad sin tratar un `PENDIENTE` como conciliado.
4. Confirmar permisos realmente desplegados, respaldo/restauración y validación visual Android/iPad antes de publicación. **No desplegar desde este bloque.**

Reversión de este inventario: retirar el módulo, su test, el paso de Quality y esta documentación. No existe migración de datos ni cambio de cobros.
