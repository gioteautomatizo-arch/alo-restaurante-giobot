# Puerta de autoridad para pedidos públicos — propuesta de seguridad, NO desplegada

**Estado (28 de octubre de 2026): PENDIENTE CRÍTICO.** Esta propuesta no habilita un backend nuevo, no cambia las reglas STAGED ni las desplegadas y no autoriza una beta pública. Se limita al paso 3 del orden de `docs/BETA_ORDERED_CHECKLIST.md`; el paso 2 de permisos sigue abierto.

## Evidencia reproducible

`scripts/test-public-order-price-authority-audit.mjs` ejecuta escrituras sintéticas contra `docs/firestore.launch-security.STAGED.rules` en Firestore Emulator. El catálogo de A contiene un producto de $75 y otro agotado; B tiene un producto exclusivo de $110. El diagnóstico espera que las reglas actuales acepten pedidos anónimos para A publicado con precio alterado a $0, producto agotado, producto exclusivo de B y subtotal/total incoherentes. Confirma además que B despublicado y `billingStatus=PAGADO` son rechazados, y que el OWNER de B no puede leer pedidos privados de A. Un resultado `PASS` significa **que se reprodujo el defecto**, no que se corrigió. No hay cobros reales ni se altera Firebase remoto.

El preflight `getDocFromServer` de `BusinessPublicPage.tsx` reduce errores accidentales, pero un cliente modificado puede omitirlo. La validación ocurre antes de la escritura y no comparte transacción con ella.

## Contrato propuesto para un servicio confiable

1. **Entrada no confiable.** Aceptar `businessId`, identificador de intento opaco, tipo/origen, mesa si aplica, datos mínimos de entrega y líneas de `productId`, cantidad y selecciones por IDs. No aceptar `unitPrice`, `totalPrice`, `subtotal`, `total`, descuentos, envío, `billingStatus`, estado ni folio como fuente de verdad. Limitar tamaño, cantidades, longitud de textos y abuso antes de procesar.
2. **Lecturas autoritativas.** En una operación confiable (backend con credenciales privadas), consultar el perfil publicado del tenant y `businesses/{businessId}/catalog/menu_catalog`; verificar que el catálogo pertenece a ese tenant, que todos los productos y opciones existen y están disponibles, que las elecciones cumplen reglas de requerido/múltiple y que cada cantidad es válida. Calcular importes con aritmética monetaria exacta (centavos enteros), descuentos/envío solo desde políticas confiables; no inferir inventario a partir del flag `available` cuando no exista stock transaccional.
3. **Escritura consistente.** Leer versión/revisión del catálogo y el documento de idempotencia dentro de una transacción, volver a validar las condiciones de negocio antes de crear el pedido. Si hay control real de stock, reservar/descontar en la misma transacción o rechazar sin escritura parcial. Crear `restaurant_orders` y, para mesa, `public_table_orders` con el mismo ID/folio de manera atómica. Reintentar la misma clave debe devolver el mismo resultado **sin** duplicar pedido ni cobrar; una clave con contenido distinto debe rechazarse.
4. **Permisos.** El cliente no debe poder escribir directamente pedidos públicos si se habilita esta ruta. Reglas candidatas deben denegar esa escritura y permitir solamente la operación confiable, sin abrir lectura privada. Mantener separado el contrato de POS y los flujos heredados de Calientito hasta demostrar compatibilidad. Nunca exponer credenciales Admin en el navegador.
5. **Seguridad y operación.** Validar abuso y límites de frecuencia, minimizar PII, observar errores sin registrar secretos, y diseñar respuestas de estado incierto. App Check y rate limiting pueden reducir abuso pero **no** sustituyen la validación autoritativa. Diseñar recuperación cuando se pierde la respuesta tras un commit.

## Pruebas obligatorias antes de cualquier activación

- A/B ficticios: propietario, empleado, cuenta ajena, visitante anónimo, negocio publicado/despublicado, lectura cruzada y cambios de sesión.
- Precio correcto, precio alterado, producto agotado, producto inexistente o de B, opción inválida, cantidad negativa/excesiva, sumas incoherentes, descuentos/envío manipulados y catálogo actualizado durante el envío.
- Reintentos simultáneos, dos pestañas, dos dispositivos con la **misma** clave de idempotencia, claves distintas, respuesta perdida y colisión de ID; nunca doble pedido o cobro por una misma clave.
- Mesa válida, mesa 3 actualmente rechazada por STAGED, creación de resumen, rollback por fallo del resumen y compatibilidad con pedidos externos `pickup`.
- Caja: comprobar que importes autoritativos y recibos coinciden; **no** declarar resueltos pagos MIXTO ni discrepancias históricas que todavía imprimen `PENDIENTE`.
- TypeScript/build, Quality y Security CI sobre el SHA exacto; emuladores con reglas candidatas, revisión independiente de seguridad, recorrido visual Android/iPad y prueba de rollback con respaldo autorizado.

## Decisión de publicación y reversión

**No activar ni desplegar** hasta revisión de seguridad, plan de transición cliente/reglas/backend y aprobación explícita. Evitar una ventana en la que un cliente nuevo escriba mediante backend mientras reglas antiguas aún admitan pedidos anónimos manipulados. Si no se puede coordinar el corte, mantener la beta cerrada; no declarar el preflight del navegador como solución. Conservar las rutas antiguas solo en una migración explícita y auditada, nunca como bypass permanente.

**Siguiente bloque recomendado:** revisión independiente del paso 2; luego implementar el contrato en un entorno aislado con tests de manipulación y transacciones, sin tocar datos reales ni desplegar reglas.
