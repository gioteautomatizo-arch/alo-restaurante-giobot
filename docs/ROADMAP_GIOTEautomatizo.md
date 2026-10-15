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
