# Gioteautomatizo — Roadmap general de producto, operación y lanzamiento

**Corte:** 16 de octubre de 2026  
**Rama de referencia:** `feat/gioteautomatizo-multinegocio-core`  
**Estado:** documento maestro de planificación. No sustituye las pruebas de aceptación ni certifica que cada función esté lista para producción.

## 0. Meta global

Crear una plataforma multinegocio que permita a restaurantes, cafeterías, pizzerías, tiendas pequeñas, puestos ambulantes, vendedores de tianguis, ghost kitchens, perfumerías y otros comercios crear su presencia digital y administrar operaciones desde un mismo producto.

La visión a largo plazo combina:
- Un directorio/red empresarial de descubrimiento, perfiles, promociones, publicaciones, seguidores, reseñas y comunidad, con inspiración en redes como Facebook, Instagram e Hi5.
- Un sistema operativo de negocio: catálogo, pedidos, POS, caja, trabajadores, turnos, inventario y reportes.
- Dos asistentes de IA separados: atención a clientes y asistencia administrativa privada por negocio.
- Una arquitectura que pueda expandirse por regiones e idiomas sin mezclar datos de negocios.

**Principio:** primero publicar un MVP pequeño, estable, útil y seguro; después crecer mediante hitos comprobables. No hace falta completar la red social global para lanzar la primera versión.

## 1. Inventario general de capacidades que ya existen en el código

> "En el código" significa que hay componentes/servicios o reglas presentes en la rama revisada. No implica que cada flujo haya pasado una prueba completa de producción.

### Plataforma pública y multinegocio
- [x] Directorio público de negocios con búsqueda y tarjetas (código presente; validar en navegador).
- [x] Página pública por negocio y catálogo para compartir.
- [x] Rutas del portal privado `#business`, registro `#business-new`, espacio de negocio `#business/{id}` y página pública `#negocio/{id}`.
- [x] Modelo de negocio/membresías y roles.
- [x] Perfiles públicos separados de los documentos privados en `publicBusinessProfiles`.
- [x] Opción de publicar u ocultar la página desde el panel del propietario (requiere prueba con reglas).
- [x] Identidad visual por negocio: nombre, logo, portada, descripción, contacto y colores; existe paleta Crema & Café.
- [x] Catálogo, carrito y preparación de pedido público.
- [x] Pedidos públicos con folio y flujo alternativo por WhatsApp.
- [x] El usuario confirmó que una prueba real de Giomero llegó a Pedidos y Caja tras hacer Pull.
- [x] Mensaje visible si falla el guardado del pedido; pendiente probar casos de fallo.
- [ ] Generación/descarga de una hoja completa de QR por mesas: no dar por terminada.
- [ ] Validar QR antiguos, nuevos y contexto de mesa en dispositivos reales.

### Operación multinegocio
- [x] Espacio del propietario con secciones de resumen, catálogo, operaciones/pedidos, reportes, empleados e identidad.
- [x] Servicios de pedidos con funciones que aceptan un `businessId` explícito.
- [x] Reportes multinegocio conectados a consulta de pedidos filtrada por negocio.
- [x] Perfiles públicos con estado de publicación.
- [x] Reglas Firestore con miembros/roles y controles por negocio; las reglas más recientes requieren pruebas en emulador antes de desplegar.
- [x] Flujo de importación/carga de catálogo y plantillas de catálogo presentes en el código.
- [ ] No se considera demostrado todavía el aislamiento de todas las colecciones y archivos entre dos negocios.

## 2. Restaurante Calientito — módulos de referencia que ya tiene el producto legado

Calientito es la referencia operativa más completa. Se conserva como implementación histórica que debemos proteger, mientras sus patrones reutilizables se extraen gradualmente para otras plantillas.

- [x] Resumen.
- [x] Mesas.
- [x] Caja & Cobro.
- [x] Comandas separadas para Cocina y Cafetería.
- [x] Control de Turno.
- [x] Gastos & Comprobantes.
- [x] Sobre / Resguardo.
- [x] Clientes VIP y sellos/recompensas.
- [x] Inventario de Papel.
- [x] Menú del Día.
- [x] Info Restaurante: contacto, ubicación, horario por día, WhatsApp, entrega, formas de pago/políticas, reglas VIP, descuento ecológico, promociones semanales, portada, logo y enlaces.
- [x] Historial de Cortes.
- [x] Bitácora & Auditoría.
- [x] Colaboradores & Accesos/roles.
- [x] Selector de servicio con horario de Ciudad de México.
- [x] Ajustes de historial de tickets por fecha y de resumen de ventas basadas en tickets finales están en la rama; verificar cuadre real.
- [ ] Confirmar que el nombre del mesero llega al ticket cuando exista asignación en mesa/sesión/comanda.
- [ ] Verificar que Resumen, Caja y Reportes cuadran con cobros pagados, sin duplicados.
- [ ] Universalizar los módulos que aplican a otros negocios sin asumir que todos tienen mesas, cocina o menú del día.

## 3. Diferencia entre estado de código y estado real

Usar estas etiquetas en cada revisión:
- **Probado por el usuario:** el pedido público de Giomero llegó a Pedidos y Caja después de Pull.
- **Presente en el código:** existe una pantalla, servicio o regla, pero falta prueba completa.
- **Pendiente:** la función está incompleta, necesita integración, pruebas, reglas o despliegue.
- **Bloqueante:** no publicar hasta resolverlo.
- No marcar un módulo como completo solo porque se vea una pestaña o pase una prueba de tipos.

## 4. Roadmap de lanzamiento por fases

### P0 — Seguridad, estabilidad y control de versiones (bloqueante)
- [ ] Ejecutar GitHub Actions y verificar `npm run lint` y `npm run build` en el commit actual.
- [ ] Probar reglas de Firestore en Firebase Emulator o proyecto separado; no desplegar reglas recién modificadas sin probar.
- [ ] Probar visitante anónimo, propietario, empleado, administrador y superadministrador.
- [ ] Probar al menos dos negocios y verificar aislamiento en pedidos, catálogo, mesas, VIP, clientes, empleados, caja, turnos, gastos, reportes y archivos.
- [ ] Confirmar que pedidos anónimos solo puedan crearse para un negocio publicado, con estado pendiente y campos permitidos.
- [ ] Confirmar que nadie pueda marcar su pedido como pagado desde el cliente público.
- [ ] Revisar Storage: acceso por negocio, tipos de archivo permitidos, tamaño y autorización de carga.
- [ ] Revisar reglas de documentos privados de negocio, personal, clientes VIP, cuentas y configuración.
- [ ] Probar las rutas y flujos históricos de Calientito antes de cambiar reglas de producción.
- [ ] Preparar respaldo/exportación y procedimiento de rollback.
- [ ] No fusionar los 171 commits de diferencia con `main` a ciegas: revisar diff, CI, permisos y plan de vuelta atrás.

### P1 — MVP público confiable
- [ ] Directorio y búsqueda sin cuenta obligatoria.
- [ ] Página de negocio con catálogo, precios, disponibilidad, horarios y contacto.
- [ ] Registro de pedido con folio y aparición en Pedidos y Caja.
- [ ] Solo mostrar confirmación de pedido guardado después de confirmar la escritura.
- [ ] Si falla Firestore, avisar con claridad y ofrecer WhatsApp como alternativa, sin afirmar que se guardó.
- [ ] Evitar pedidos duplicados por doble toque o reintento; definir clave de idempotencia.
- [ ] Generar QR por negocio y mesa; descargar PNG y/o PDF e imprimir hoja múltiple.
- [ ] Validar los QR anteriores y nuevos en Android, iPad y escritorio.
- [ ] Estados de carga, error, vacío y falta de conexión claros.
- [ ] Política de privacidad, términos, contacto de soporte y mecanismo para reportar contenido.
- [ ] Flujo de lanzamiento piloto listo y checklist de soporte.

### P2 — Operación equivalente a Calientito, en módulos universales
- [ ] Tickets por fecha, turno y zona horaria `America/Mexico_City`.
- [ ] Caja, Resumen y Reportes con misma fuente de verdad para ventas cobradas.
- [ ] Mesero asignado y trazabilidad desde mesa/comanda hasta ticket.
- [ ] Mesas y cuentas divididas solo en giros que lo requieran.
- [ ] Cancelaciones, descuentos, propinas, devoluciones y permisos por rol.
- [ ] Comandas con estados y tiempos; módulos de cocina según tipo de negocio.
- [ ] Turnos, gastos, comprobantes, resguardo, cortes y auditoría.
- [ ] VIP/sellos sin crear cuentas por el mero escaneo; consentimiento, deduplicación y opción de desvincular el dispositivo.
- [ ] Configuración por negocio de horarios, servicio, entrega, políticas, promociones, colores y logo.
- [ ] Exportación de ventas y reportes a CSV/PDF.
- [ ] Módulos activables por giro: restaurante, cafetería, tienda, tianguis, ghost kitchen, perfumes y otros.

### P3 — Clientes, inventario y comercios pequeños
- [ ] CRM por negocio con datos mínimos, historial y consentimiento.
- [ ] Inventario por producto/variante/unidad.
- [ ] Entradas, salidas, ajustes y responsable auditados.
- [ ] Compras a proveedores, costos, márgenes y alertas de stock.
- [ ] Recetas/insumos; no descontar stock hasta asegurar la consistencia de la transacción.
- [ ] POS rápido con búsqueda de producto, cantidades, caja y ticket.
- [ ] Flujos para tiendas, puestos ambulantes, tianguis y ghost kitchens.
- [ ] Vista móvil de botones grandes, lector de código de barras opcional e impresora opcional.
- [ ] Supervisión remota del dueño: ventas, movimientos, caja, trabajadores y alertas.
- [ ] Política de modo sin conexión: definir claramente qué permite y cómo sincroniza.
- [ ] Pilotear con 3–5 comercios de giros distintos antes de declarar que el POS sirve para todos.

### P4 — Giobot e IA administrativa / para clientes
- [ ] Asistente de cliente y asistente privado del dueño separados.
- [ ] Base de conocimiento por negocio con el método del fundador, editable y versionada.
- [ ] El asistente de cliente responde catálogo, horario, políticas y preguntas autorizadas.
- [ ] El asistente administrativo ayuda con ventas, tendencias, promociones, costos y operación.
- [ ] La IA no puede leer datos de otros negocios ni ejecutar pagos/reembolsos/acciones sensibles sin aprobación.
- [ ] Bitácora de acciones sensibles de IA, fallback a persona y límites por plan.
- [ ] Pruebas de privacidad, prompt injection, exactitud y respuestas inventadas.
- [ ] Medir coste por conversación antes de incluir IA ilimitada en un plan gratuito.

### P5 — Confianza, soporte y funcionamiento como producto
- [ ] Panel superadministrador para búsqueda, publicación, incidencias y soporte con permisos estrictos.
- [ ] Alta guiada, plantillas por giro y checklist de perfil listo para publicar.
- [ ] Onboarding para dueño y trabajadores, invitaciones y revocación de accesos.
- [ ] Registro de errores, latencia, pedidos fallidos y gasto sin almacenar secretos.
- [ ] Backups automáticos y prueba real de restauración.
- [ ] Versionado de releases, pruebas de regresión, soporte y rollback.
- [ ] Revisión de accesibilidad y experiencia móvil.
- [ ] Proceso de eliminación, exportación y corrección de datos de acuerdo con la ley aplicable.

### P6 — Comunidad empresarial, inspirada en redes sociales
- [ ] Perfiles y favoritos/seguir negocios.
- [ ] Feed de promociones y novedades.
- [ ] Publicaciones con fotos/video y búsqueda por giro/ubicación.
- [ ] Reseñas verificadas y denuncias.
- [ ] Moderación, bloqueo, apelación, controles antispam y reglas de comunidad.
- [ ] Mensajería solo después de definir privacidad, retención y herramientas antiabuso.
- [ ] Métricas de alcance, visitas, conversión y retención.
- [ ] Expansión regional antes de mundial: idioma, moneda, horarios, normas locales y soporte.

### P7 — Modelo económico sostenible
- [ ] Plan gratuito: directorio, perfil, catálogo básico, pedidos y QR autogenerado con límites claros.
- [ ] Donación voluntaria opcional; nunca bloquear lo esencial por no donar.
- [ ] Planes futuros para IA de alto uso, multi-sucursal, analítica avanzada, automatización y soporte prioritario.
- [ ] Establecer límites transparentes por plan: productos, empleados, pedidos, sucursales y consumo de IA.
- [ ] Validar disposición a pagar con los pilotos antes de definir precios.
- [ ] Alertas de presupuesto y límites de uso para Firebase, hosting, almacenamiento e IA.
- [ ] Revisar cada mes coste por negocio activo y coste por pedido.

## 5. Políticas y logística antes de abrir al público
- [ ] Aviso de privacidad y términos adecuados a la legislación aplicable en México.
- [ ] Explicar finalidades y datos recopilados; evitar recopilar datos que no se necesitan.
- [ ] Definir retención, acceso, corrección, exportación y eliminación de datos cuando aplique.
- [ ] Consentimiento para marketing; un número telefónico no equivale a permiso para promociones.
- [ ] Política de contenido, derechos de imágenes, quejas, suspensión y apelación antes de activar comunidad.
- [ ] No almacenar datos sensibles de tarjetas; integrar proveedor de pago solo tras evaluar comisiones, conciliación y reembolsos.
- [ ] Canal de soporte y proceso de respuesta a incidentes.
- [ ] No prometer “gratis para siempre” sin conocer consumo y límites de proveedores.

## 6. ¿Puede operar gratis y cuántos negocios soporta?
- Se puede comenzar con coste bajo y aprovechar cuotas gratuitas, pero no hay capacidad infinita ni garantía de coste cero.
- El consumo depende de pedidos por día, lecturas/escrituras, fotografías, transferencias, empleados, listeners y llamadas de IA.
- No prometer una cifra de negocios sin medir el uso real.
- Medir con 5, después 20 y después 100 negocios piloto; seguir pedidos/día, uso por pedido, almacenamiento, fallos y coste.
- Permitir explorar y pedir como invitado. Pedir cuenta para historial sincronizado, favoritos entre dispositivos, reseñas o funciones sociales.
- Poner alertas de presupuesto y límites antes de invitar masivamente.

## 7. Plan de lanzamiento gradual
1. **Prueba interna:** Calientito y Giomero, con flujos de pedido, caja, QR, reportes y permisos.
2. **Piloto pequeño:** 3–5 negocios de diferentes giros, acompañando el alta y capturando incidencias.
3. **Piloto ampliado:** 10–20 negocios, medir fiabilidad, soporte, costes y actividad.
4. **Lanzamiento regional:** directorio público, enlaces compartibles, políticas, monitorización y canal de soporte.
5. **Escala:** crecer por región y añadir comunidad/IA según demanda medida.

## 8. Criterios mínimos de “listo para publicar”
- [ ] CI lint/build verde en el commit candidato.
- [ ] Reglas Firestore y Storage probadas con visitante, dueño, empleado y admin.
- [ ] Dos negocios aislados correctamente.
- [ ] Calientito conserva los flujos críticos sin regresiones.
- [ ] Pedido público llega a Pedidos y Caja; los fallos no se presentan como éxito.
- [ ] QR de negocio/mesa probado físicamente.
- [ ] Caja, mesero, tickets, Resumen y Reportes cuadran en varios días/turnos.
- [ ] Políticas, contacto de soporte, backup y rollback disponibles.
- [ ] 3–5 negocios piloto completan tareas sin intervención constante.
- [ ] Costes medidos y alertas activadas.

## 9. Registro de cambios del corte
- El usuario confirmó el pedido público de prueba de Giomero: llegó a Pedidos y Caja después de Pull.
- Commit `8c273314`: aviso cuando falla el guardado del pedido público.
- Commit `612bb180`: endurecimiento inicial de reglas para pedidos anónimos de negocios publicados.
- Commit `924b33d2`: roadmap anterior ampliado.
- Las reglas de `612bb180` siguen pendientes de pruebas de emulador/proyecto de prueba y de compatibilidad con el flujo legado de Calientito; no desplegar a producción sin esas pruebas.
- La rama de trabajo comparada estaba 171 commits por delante de `main` y 1 commit por delante de `integration` en la consulta del 16/10/2026. Volver a comparar antes de integrar porque ambas ramas pueden cambiar.
