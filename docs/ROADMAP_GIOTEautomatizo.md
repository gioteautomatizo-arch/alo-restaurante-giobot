# Roadmap maestro de Gioteautomatizo

Actualizado: 2026-10-13
Rama de trabajo: `feat/gioteautomatizo-multinegocio-core`

## Objetivo del producto
Un directorio público que permita descubrir negocios, consultar catálogos y comenzar pedidos sin cuenta; un portal privado para propietarios y empleados; y una plataforma multinegocio con datos aislados por tenant.

## Implementado en el código (pendiente de validar en ejecución)
- Directorio público con búsqueda y tarjetas de negocios.
- Ruta privada de acceso de negocios: `#business`.
- Registro de negocio: `#business-new`.
- Espacio privado por negocio: `#business/{id}`.
- Página pública por negocio: `#negocio/{id}`.
- Catálogo público, carrito local y preparación de pedido por WhatsApp.
- Historial de tickets cerrados agrupado por fecha, con filtro por día, subtotal diario y sin límite artificial de 20 tickets (pendiente de validación en ejecución).
- Módulos de marca, catálogo, personal, operaciones y reportes.
- Perfiles públicos separados en `publicBusinessProfiles/{businessId}`.
- Publicar/ocultar página desde el espacio del propietario.
- Lectura de empleados limitada a responsables activos del negocio.
- Lectura de documentos completos de negocio limitada a membresías activas o superadministración.
- Calientito conserva su ruta histórica; el directorio incluye una tarjeta de compatibilidad.

## Fase 0 — Seguridad y verificación inmediata
- [ ] Desplegar reglas Firestore actualizadas al proyecto y base de datos correctos.
- [ ] Ejecutar pruebas de reglas: visitante anónimo, propietario, empleado y superadministrador.
- [ ] Verificar que documentos privados de negocio y personal no son legibles por visitantes.
- [ ] Verificar que el directorio consulta solo perfiles con `published == true`.
- [ ] Publicar desde el propietario de Giomero y comprobar que aparece; ocultarlo y comprobar que desaparece.
- [ ] Probar alta de un negocio nuevo después de retirar la lectura pública de `businesses`.
- [ ] Probar en móvil el enlace público, QR de Calientito y el pedido por WhatsApp.
- [ ] Ejecutar build, lint y pruebas automáticas en CI/AI Studio.

## Fase 1 — Piloto
- [ ] Revisar datos reales, fotos, precios, horarios y WhatsApp de Calientito, Giomero y Gioteperfumo.
- [ ] Comprobar que cada negocio solo ve y modifica sus propios pedidos, catálogo y empleados.
- [ ] Probar el flujo VIP, incluidos sellos, canje y desvinculación local.
- [ ] Corregir errores de accesibilidad y visualización móvil.

## Fase 2 — Núcleo multinegocio
- [ ] Superadministrador con estados de publicación, búsqueda y actividad.
- [ ] Auditoría de aislamiento de todas las colecciones antiguas (órdenes, mesas, VIP, inventario, gastos, caja, turnos y reportes).
- [ ] Unificar el modelo de permisos entre interfaz y reglas de Firestore.
- [ ] Flujos de invitación y asignación de roles con pruebas de autorización.
- [ ] Estado de publicación (borrador/publicado/oculto) y validación de perfil completo.
- [ ] Plantillas por giro y módulos habilitados por negocio.

## Fase 3 — Operación comercial
- [ ] Pedidos centralizados con estados y notificaciones, si el modelo lo requiere.
- [ ] POS, comandas, inventario, compras, cierres de caja y reportes consistentes por tenant.
- [ ] Pagos en línea solo después de definir proveedor, comisiones y conciliación.
- [ ] Métricas de visitas, conversiones y pedidos.

## Fase 4 — Giobot y conocimiento
- [ ] Base de conocimiento con el método operativo del fundador.
- [ ] Asistente al cliente y asistente privado del dueño con límites por negocio.
- [ ] Derivación a personal humano y registro de calidad/costos.
- [ ] Pruebas de seguridad contra filtración de información entre negocios.

## Fase 5 — Crecimiento
- [ ] Enlaces/QR compartibles y material para invitar nuevos negocios.
- [ ] Plan gratuito y planes de pago validados con usuarios piloto.
- [ ] Onboarding y ayuda contextual.
- [ ] Lanzamiento gradual y métricas de retención.

## Reglas de lanzamiento
1. No fusionar ramas grandes sin build y revisión de diferencias.
2. No desplegar reglas Firestore sin probar el acceso del dueño, empleado y visitante.
3. No declarar una función terminada hasta probarla en el preview/publicación real.
4. No eliminar ni migrar datos productivos sin respaldo y aprobación explícita.

## Mejora añadida — POS multinegocio
- Código añadido: suscripción de pedidos filtrada por `businessId` explícito.
- Código añadido: creación de pedidos desde el POS con el `businessId` del negocio abierto.
- Código añadido: validación de pertenencia al negocio antes de cambiar el estado de un pedido.
- Estado: pendiente de compilación y pruebas en AI Studio; no se considera validado hasta probarlo.

## Mejora añadida — resumen de ventas diarias
- El resumen administrativo se suscribe al historial de tickets finales de Caja & Cobro.
- La tarjeta “Ventas de Hoy” suma `totalPaid` de tickets cerrados en la fecha actual de `America/Mexico_City`, mostrando también el número de tickets.
- Estado: código guardado; pendiente de build y comparación con caja real.

## Mejora 10X — reportes aislados por negocio
- El módulo de Reportes recibe el `businessId` activo y consulta pedidos únicamente de ese negocio mediante `subscribeToBusinessRestaurantOrders`.
- Se eliminó del módulo de reportes multinegocio el listener global sin filtro, que podía mezclar ventas entre negocios.
- Estado: cambios guardados; pendiente de compilación y prueba con al menos dos negocios.

## Revisión 10X de Claude — 15/10/2026
- Claude añadió panel del dueño con pestañas, resumen y checklist de preparación; página pública con logo, horarios, dirección, redes y favoritos; Control de Turno suma cobros por método.
- Corrección añadida: el resumen del negocio ahora suma ventas solo de pedidos pagados y usa la fecha de pago cuando está disponible.
- Corrección añadida: reportes multinegocio excluyen pedidos no pagados y agrupan ingresos por fecha de pago/creación como respaldo.
- Pendiente crítico antes de publicar: ejecutar `npm run lint` y `npm run build`; validar dos negocios sin cruces de datos; revisar reglas Firestore/Storage, publicación pública, QR/mesa y pedidos/cobros; revisar estado de `#business` y `#business-new` en móvil; confirmar rama desplegada y rollback.
- No publicar producción hasta pasar pruebas de permisos, aislamiento y flujos de cobro. Los cambios recientes no han sido compilados ni probados en ejecución desde esta revisión.

- Seguridad: restringida la lectura de `restaurant_orders` para negocios multinegocio a miembros activos del tenant o superadministrador; se conserva compatibilidad de lectura del flujo legado `alo-restaurante`. Pendiente probar reglas con dos cuentas y el emulador/entorno de prueba.

## Calidad automática añadida — 15/10/2026
- Se creó `.github/workflows/quality.yml` para ejecutar en GitHub Actions `npm run lint` (TypeScript) y `npm run build` al actualizar la rama de trabajo o abrir PR hacia ramas principales.
- El repositorio no contiene `package-lock.json` ni otro lockfile; por eso el workflow usa `npm install --no-package-lock`. Recomendación pendiente: generar y revisar un lockfile para builds reproducibles, sin subir secretos.
- La CI aún debe ejecutarse y pasar; no declarar listo para producción hasta revisar sus resultados y completar pruebas de aislamiento de tenants, cobro y reglas de Firebase.

## Mejoras de identidad y QR — 15/10/2026
- Se agregó la paleta universal **Crema & Café** a la configuración de identidad por negocio; no reemplaza los valores guardados en Calientito ni cambia otras identidades automáticamente.
- Se corrigió el enrutamiento para aceptar parámetros QR tanto antes como después del fragmento de URL, por ejemplo `?table=2` o `#negocio/alo-restaurante?table=2`.
- La página pública multinegocio conserva el número de mesa del QR y lo incluye en el mensaje de pedido enviado por WhatsApp.
- Pendiente: generar/descargar hojas de QR desde el panel de cada negocio; verificar en dispositivos reales los QR antiguos y nuevos; ejecutar lint/build y probar QR para Calientito y para un negocio multinegocio. Estos cambios no han sido validados con una compilación ejecutada.
- Estrategia de lanzamiento recomendada: directorio y menú gratuitos; QR autogenerados y descargables incluidos en el plan básico; instalación personalizada, reportes avanzados, multi-sucursal y automatizaciones asistidas como futuros planes de pago. Donación voluntaria opcional, sin bloquear el uso básico.


---

## Plan maestro para publicar y escalar Gioteautomatizo
Actualizado: 16/10/2026

### Estado de ramas
- `feat/gioteautomatizo-multinegocio-core`: rama de trabajo con la implementación más avanzada.
- `integration`: la comparación consultada indica que la rama de trabajo tiene 1 commit adicional.
- `main`: la comparación consultada indica que la rama de trabajo está 171 commits por delante. No fusionar directamente sin revisar el diff completo, ejecutar CI y preparar rollback.
- El usuario confirmó una prueba real de pedido de Giomero satisfactoria; faltan pruebas repetibles de seguridad, móvil y varios tenants.

### Estado real por nivel de evidencia
- **Probado por el usuario:** pedido público de Giomero llega a Pedidos y Caja tras Pull.
- **Presente en el código, pendiente de pruebas de aceptación:** directorio, perfiles públicos, catálogo/carrito, panel del dueño, personal, reportes, marca/colores, pedidos y módulos.
- **Pendiente de validar antes de publicar:** reglas Firestore, permisos de Storage, separación entre negocios, QR antiguos/nuevos, pagos, tickets, caja, fecha/horario CDMX, dispositivos móviles, accesibilidad, build/CI y restauración desde respaldo.
- **No implementado aún como producto completo:** red social empresarial, feed, seguidores, mensajes, reseñas/moderación avanzada, inventario conectado a compras/recetas, sincronización offline robusta, IA administrativa/clientes de producción, pagos integrados, multi-sucursal y app móvil nativa.

### Fase P0 - Puerta de seguridad antes de abrir registros
- [ ] Ejecutar GitHub Actions: `npm run lint` y `npm run build`; corregir todo error.
- [ ] Validar reglas con Firebase Emulator o proyecto de pruebas antes de desplegar.
- [ ] Probar propietario, empleado, cliente anónimo y superadministrador.
- [ ] Probar dos negocios simultáneos: ningún usuario de Giomero puede leer o modificar Calientito y viceversa.
- [ ] Verificar que pedido anónimo solo se acepte para perfil público publicado y que no pueda asignarse como pagado.
- [ ] Confirmar que los pedidos públicos reales incluyen todos los campos permitidos por reglas.
- [ ] Verificar reglas de Storage: solo dueño/roles autorizados suben archivos a su negocio; limitar tipo y tamaño.
- [ ] Revisar y restringir lectura pública de datos de empleados, clientes VIP, cuentas, mesas y configuración privada.
- [ ] Probar los flujos heredados de Calientito antes de desplegar reglas nuevas.
- [ ] Preparar exportación/respaldo y procedimiento de rollback.
- [ ] No fusionar `feat/gioteautomatizo-multinegocio-core` a `main` hasta pasar todas las pruebas anteriores.

### Fase P1 - MVP público confiable
- [ ] Directorio público con búsqueda y páginas compartibles sin exigir cuenta.
- [ ] Página pública y catálogo con estado de publicación, horarios, dirección, redes y datos mínimos.
- [ ] Pedido web que llega a Pedidos y Caja, folio claro y alternativa WhatsApp cuando aplique.
- [ ] QR de mesa y QR de negocio: generación, descarga PNG/PDF, impresión y regeneración; cada QR debe apuntar al tenant y mesa correctos.
- [ ] Acceso de clientes opcional al explorar; solicitar cuenta solo para funciones que realmente la necesiten.
- [ ] Política de cancelación, privacidad, contacto y reporte de contenido.
- [ ] Estados de carga/error/sin conexión claros; evitar mostrar éxito cuando el pedido no se guardó.
- [ ] Pruebas de extremo a extremo en Android, iPad y escritorio.

### Fase P2 - Operación del negocio y equivalencia con Calientito
- [ ] Tickets/caja separados por fecha, zona horaria America/Mexico_City y turno.
- [ ] Cuadre entre Caja, Resumen y Reportes; incluir solo ventas pagadas y evitar doble conteo.
- [ ] Meseros en tickets, comanda de cocina/cafetería, estados y tiempos.
- [ ] Mesas, cuentas divididas, cierre de cuenta, propinas/descuentos y permisos por rol.
- [ ] Control de turno, gastos/comprobantes, sobre/resguardo, cortes, bitácora y auditoría.
- [ ] Clientes VIP/sellos con prevención de duplicados, consentimiento y opción de desvincular/solicitar eliminación.
- [ ] Plantillas universales por giro; módulos activables sin nombres ni reglas exclusivas de Calientito.
- [ ] Exportar ventas y reportes CSV/PDF; recuperar información ante errores.

### Fase P3 - Clientes, inventario y pequeños comercios/tianguis
- [ ] CRM básico por negocio con historial, consentimiento, preferencias y datos mínimos.
- [ ] Inventario por producto/variante, unidad, existencia, entradas, salidas y ajustes auditados.
- [ ] Compras a proveedores, costo y margen, alertas de bajo stock.
- [ ] Recetas/insumos y descuento de inventario solo después de probar consistencia.
- [ ] POS rápido para tiendas pequeñas, puestos ambulantes, tianguis y ghost kitchens.
- [ ] Modo móvil con botones grandes, flujo rápido, impresora opcional y operación con conectividad limitada.
- [ ] Roles de propietario y trabajadores, límites de caja, permisos y auditoría para que el dueño supervise a distancia.
- [ ] Pruebas con 3-5 comercios piloto de giros distintos antes de generalizar.

### Fase P4 - Giobot y automatización con IA
- [ ] Separar asistente de cliente y asistente privado del propietario.
- [ ] Base de conocimiento por negocio con el método operativo del fundador, editable y versionada.
- [ ] Límites de permisos: la IA no debe revelar datos de otros negocios ni ejecutar reembolsos/pagos sin autorización.
- [ ] Aprobación humana para acciones sensibles; bitácora de acciones de IA.
- [ ] Medición de coste por conversación, límites de uso, protección contra abuso y respuestas de fallback.
- [ ] Pruebas de prompt injection, privacidad, exactitud, derivación a humano y calidad en español.
- [ ] No activar IA costosa por defecto en el plan gratuito hasta conocer coste por usuario.

### Fase P5 - Comunidad / red social empresarial
- [ ] Perfiles de negocio, seguir/favoritos y feed de novedades/promociones.
- [ ] Publicaciones con fotos/video, categorías, búsqueda y recomendaciones.
- [ ] Reseñas verificadas, denuncia, moderación y mecanismo de apelación.
- [ ] Mensajería solo cuando existan controles anti-spam, bloqueo, reporte y retención definida.
- [ ] Analítica de visitas, conversiones y retorno.
- [ ] Reglas comunitarias, derechos de imágenes, propiedad del contenido y políticas de suspensión.
- [ ] Lanzamiento regional gradual; medir retención y actividad real antes de buscar escala global.

### Fase P6 - Monetización sostenible
- [ ] Plan gratuito sostenible: directorio, perfil público, catálogo pequeño y QR autogenerado/descargable.
- [ ] Donación voluntaria claramente opcional; nunca bloquear funciones ya prometidas por donar poco o nada.
- [ ] Planes de pago futuros para personalización asistida, múltiples sucursales, analítica avanzada, automatización IA y soporte prioritario.
- [ ] Definir límites transparentes por plan (productos, pedidos, empleados, sucursales y uso de IA).
- [ ] No cobrar por funciones esenciales hasta validar disposición a pagar con pilotos.
- [ ] Presupuesto mensual y alertas de gasto en Firebase, hosting, almacenamiento, IA, correo y mensajes.
- [ ] Términos de servicio, privacidad, cookies/analítica, propiedad intelectual, soporte, reembolsos y baja.

### Política de publicación - checklist
- [ ] Aviso de privacidad conforme a la legislación aplicable en México y tratamiento de datos de clientes/empleados.
- [ ] Términos para negocios y clientes, reglas de contenido y proceso de denuncias.
- [ ] Consentimiento para WhatsApp y mensajes promocionales; opción para dejar de recibirlos.
- [ ] Proceso para corregir, exportar o eliminar datos personales según aplique, con excepciones legales documentadas.
- [ ] Seguridad: mínimo privilegio, reglas por tenant, no exponer secretos en frontend, rotación de credenciales y revisión de dependencias.
- [ ] Observabilidad: errores, latencia, fallos de pedidos, uso y gasto; no registrar contraseñas ni datos de pago sensibles.
- [ ] Backups y prueba de restauración.
- [ ] Plan de respuesta a incidentes y canal de soporte.
- [ ] Accesibilidad básica, términos visibles y contacto del responsable.
- [ ] Release versionado, pruebas de humo y procedimiento de rollback.

### Costos y capacidad: principios para decidir
- No existe capacidad infinita ni garantía de costo cero. Puede arrancarse con cuotas gratuitas de servicios, pero cada lectura/escritura, archivo, transferencia y llamada de IA puede consumir cuota o generar cobro.
- El número sostenible de negocios depende de actividad por negocio, productos, pedidos, empleados, imágenes, consultas, listeners y conversaciones de IA; no se debe prometer una cifra sin medir.
- Medir por 5, 20 y 100 negocios piloto: pedidos/día, lecturas y escrituras por pedido, almacenamiento, transferencia, errores y gasto mensual.
- Configurar alertas de presupuesto y límites de IA antes de invitar masivamente.
- Mantener el uso anónimo limitado a explorar y pedir; pedir cuenta para favoritos sincronizados, historial personal, reseñas o comunidad.
- No almacenar tarjetas ni procesar pagos propios hasta elegir un proveedor de pagos y revisar obligaciones, fraude, conciliación y comisiones.

### Criterio de salida para el primer lanzamiento público
Publicar el MVP cuando P0 esté completa, P1 pase pruebas en móvil y escritorio, Calientito siga funcionando, dos negocios estén aislados correctamente, haya respaldo/rollback y las políticas mínimas estén publicadas. La red social empresarial, la IA avanzada y el inventario completo son fases posteriores, no requisitos para el primer lanzamiento.

### Registro de cambios recientes
- 16/10/2026: ajuste en `BusinessPublicPage.tsx` para mostrar un aviso si falla el registro del pedido.
- 16/10/2026: endurecimiento inicial de `firestore.rules` para que pedidos anónimos multinegocio requieran perfil público publicado, estado pendiente, tipos/campos permitidos y límite de 100 artículos.
- **Advertencia:** las reglas nuevas aún deben ejecutarse en emulador/proyecto de pruebas y comprobarse con el flujo público de Giomero y los flujos heredados de Calientito antes de desplegar.
