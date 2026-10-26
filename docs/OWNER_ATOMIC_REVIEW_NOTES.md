# Revisión técnica pendiente — alta OWNER atómica (paso 2 de beta)

**Estado: NO APROBADO PARA DESPLIEGUE.** Este documento reúne evidencia de código y pruebas sintéticas, no autoriza cambios en Firebase. Rama de trabajo: `feat/gioteautomatizo-multinegocio-core`.

## Situación observada

- En `docs/firestore.launch-security.STAGED.rules`, la creación de `businesses/{businessId}` exige UID del propietario, identificador coincidente y que el negocio no exista, **pero no exige OWNER en la misma operación**. Un usuario autenticado puede reservar un ID sin membresía; `scripts/test-owner-registration.mjs` lo registra como **PENDIENTE**.
- El cliente `registerBusiness` utiliza un batch con negocio y membresía OWNER, pero eso **no obliga a otros clientes** a hacer lo mismo. Las reglas son la barrera de seguridad.
- `scripts/owner-atomic-proposal-rules.mjs` construye **solo en memoria** una variante que añade `existsAfter/getAfter` para exigir membresía activa OWNER del UID y negocio correspondientes en el estado posterior a la escritura. El archivo staged protegido y `firestore.rules` no se modifican.

## Matriz de compatibilidad y riesgos

| Caso sintético | Comportamiento que se comprueba | Implicación |
| --- | --- | --- |
| Alta normal en batch, propietarios A y B | Permitida con OWNER y tenant coherentes | Compatible con el cliente actual, sujeto a pruebas finales. |
| Reserva sin OWNER, OWNER inactivo, rol o UID discordante | Denegada por la propuesta | Evita nuevos registros huérfanos desde cliente normal. |
| Dos propietarios intentan el mismo handle | Solo uno debe confirmar negocio y membresía | El perdedor no debe dejar datos parciales. |
| Batch con membresía inválida | Se rechaza completo | Sin negocio o OWNER parcial. |
| Negocio huérfano **preexistente** con `ownerUserId` válido | El propietario identificado puede agregar su OWNER después | Permite recuperar un legado verificable, pero **no** obliga a que ambas escrituras sean simultáneas en ese caso. |
| Negocio histórico **sin** `ownerUserId` | No permite autorreclamación de OWNER | Requiere evaluación/migración privilegiada; nunca asignar dueño automáticamente. |
| Membresía OWNER **preexistente** sin negocio, sembrada por administrador | `existsAfter` permite crear luego el negocio sin reescribir la membresía | `existsAfter` valida **estado final**, no demuestra creación de la membresía en el mismo batch. Es un límite de la propuesta, no una ruta de alta libre para clientes. |

Los últimos cuatro casos necesitan una decisión de compatibilidad: impedir cualquier alta que use membresía preexistente podría bloquear recuperaciones legítimas. La regla staged de membresías exige que el negocio exista después de la operación para crear un OWNER desde cliente; la pre-siembra aislada de la matriz se hace exclusivamente con privilegios del **emulador**, no con una cuenta real.

## Límites y controles previos a cualquier aprobación

1. Revisar el comportamiento de altas históricas, eliminaciones y re-creación de negocios: las reglas versionadas permiten borrar un documento de negocio a un OWNER; hay que definir qué ocurre con membresías y subcolecciones que podrían permanecer.
2. Revisar explícitamente el coste/límite de lecturas `getAfter` y `existsAfter` por operación y lote, incluidas futuras escrituras; no extrapolar el éxito de un batch pequeño a lotes arbitrarios.
3. Confirmar la compatibilidad de las reglas **realmente desplegadas** mediante un procedimiento autorizado y comparar con la versión candidata. Los tests de staged no certifican producción.
4. Diseñar migración manual auditada para reservas huérfanas sin propietario verificable y un plan de reversión. No reescribir documentos reales, roles ni cobros durante estas pruebas.
5. Ejecutar CI de TypeScript/build, suite de reglas, flujo React/jsdom con dos negocios y revisión visual Android/iPad; luego solicitar revisión humana independiente antes de proponer cualquier despliegue.

**Evidencia reproducible:** `scripts/test-owner-atomic-proposal.mjs` y `scripts/test-business-registration-emulator.mts`, este último también bajo `TEST_ATOMIC_OWNER_PROPOSAL=1`. Ambas pruebas usan Auth/Firestore emulados y datos ficticios. El resultado de GitHub Actions del commit final debe registrarse en `docs/BETA_ORDERED_CHECKLIST.md` antes de cerrar el bloque de pruebas.

**Puerta de beta:** paso 2 continúa ABIERTO hasta revisión/autorización de seguridad y validación visual/manual. Paso 4 Caja histórica y MIXTO continúa PENDIENTE incluso si los scripts diagnósticos salen en verde.
