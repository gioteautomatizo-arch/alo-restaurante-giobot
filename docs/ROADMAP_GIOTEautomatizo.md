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
