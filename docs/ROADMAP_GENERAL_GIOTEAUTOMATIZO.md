# Roadmap general de Gioteautomatizo
**Corte:** 16 de octubre de 2026  
**Rama de referencia:** `feat/gioteautomatizo-multinegocio-core`  
**Repositorio:** `gioteautomatizo-arch/alo-restaurante-giobot`

> Este documento separa lo que está presente en el código, lo que el usuario ya probó, lo que falta validar y lo que aún es visión futura. Una función no se considera terminada solo porque aparezca en pantalla.

## 1. Meta general
Construir una plataforma multinegocio para que comercios de cualquier tamaño tengan presencia pública, catálogo, pedidos, POS, empleados, inventario, reportes y asistentes de IA. A largo plazo, convertirla en una red empresarial mundial inspirada en Facebook, Instagram e Hi5, con perfiles, publicaciones, promociones, seguidores, reseñas y mensajería segura.

La prioridad es publicar primero un MVP pequeño, estable y seguro. La comunidad global, la IA avanzada y las funciones complejas vendrán por etapas.

## 2. Gioteautomatizo: funciones generales presentes en el código

### Plataforma y acceso
- Directorio público con búsqueda y tarjetas de negocios.
- Página pública por negocio y enlaces compartibles.
- Acceso privado de negocios mediante `#business`.
- Registro de negocio mediante `#business-new`.
- Espacio de trabajo por negocio mediante `#business/{id}`.
- Modelo de negocios y membresías con roles.
- Panel de propietario con secciones de catálogo, pedidos/caja, reportes, empleados e identidad.
- Publicar u ocultar una página de negocio.
- Perfiles públicos separados de los documentos privados del negocio.

### Página pública, catálogo y pedidos
- Catálogo público, carrito y flujo para preparar pedidos.
- Integración de WhatsApp cuando el negocio configura su número.
- Código/folio del pedido y estado de confirmación.
- El usuario confirmó que una prueba real de Giomero desde su página pública llegó a Pedidos y Caja tras hacer Pull.
- Se añadió un aviso cuando falla el guardado del pedido.
- Las reglas recientes pretenden limitar pedidos anónimos a negocios publicados; deben probarse en un entorno seguro antes de desplegarse.

### Identidad y QR
- Edición de nombre, logo, portada, slogan, descripción, WhatsApp, horario, dirección, redes y paleta por negocio.
- Paleta universal Crema & Café, además de opciones de color personalizadas.
- Se añadió compatibilidad de parámetros de mesa en URL/QR y se conserva el número de mesa en el flujo público multinegocio.
- **Pendiente de validar/completar:** generar, descargar e imprimir QR de negocio y por mesa; comprobar QR antiguos y nuevos en dispositivos reales.

### Calidad y seguridad en código
- Reglas Firestore para membresías, roles y datos operativos.
- Reglas recientes para pedidos públicos multinegocio.
- Workflow de GitHub Actions preparado para lint y build.
- **Pendiente:** confirmar que CI pasa; probar reglas y Storage con cuentas y negocios diferentes; revisar datos privados y el flujo heredado de Calientito.

## 3. Restaurante Calientito: referencia operativa existente

Calientito tiene la experiencia administrativa más completa y sirve como referencia para convertir módulos en funciones genéricas configurables por giro.

### Módulos del panel
- Resumen.
- Mesas.
- Caja & Cobro.
- Comandas.
- Control de Turno.
- Gastos & Comprobantes.
- Sobre / Resguardo.
- Clientes VIP.
- Inventario de Papel.
- Menú del Día.
- Info Restaurante.
- Historial de Cortes.
- Bitácora & Auditoría.
- Colaboradores & Accesos.

### Funciones de operación
- Mesas, comensales, asignación operativa de mesero y órdenes.
- Comandas separadas para Cocina y Cafetería con estados de preparación.
- Caja, métodos de pago, tickets e historial de cortes.
- Control de turno, gastos, comprobantes, sobre/resguardo y auditoría.
- Menú del Día con disponibilidad semanal, plato fuerte, sopa/entrada, guarniciones, agua fresca, postre, alternativas y precios adicionales.
- Información del establecimiento: dirección, horario por día, WhatsApp, entrega, políticas, formas de pago, sellos VIP, descuento ecológico, promociones semanales, portada, logo y redes.
- Colaboradores y permisos por rol.
- Clientes VIP y sellos/recompensas.

### Pendiente específico de Calientito y de universalización
- Probar que el mesero asignado aparezca en tickets de cobro.
- Confirmar que Caja, Resumen y Reportes cuadren por fecha/turno y cuenten solo ventas pagadas sin duplicados.
- Validar el historial de tickets por fecha, comandas y cortes en varios días.
- Probar sellos VIP, evitar registros por el dispositivo del dueño o por escanear QR, y permitir desvincular una cuenta del dispositivo.
- Confirmar que las reglas nuevas no rompan el sistema legado.
- Llevar los módulos comunes al panel genérico sin copiar datos ni nombres exclusivos de Calientito.

**Importante:** que exista un módulo en Calientito no significa que ya esté disponible y probado en todos los tipos de negocio.

## 4. Roadmap de lo que falta implementar

### P0 — Seguridad y estabilidad (bloquea el lanzamiento)
- [ ] Ejecutar GitHub Actions: `npm run lint` y `npm run build`; corregir todos los errores.
- [ ] Probar reglas Firestore con Emulator o proyecto de prueba antes de desplegar.
- [ ] Probar visitante anónimo, propietario, empleado, administrador y superadministrador.
- [ ] Probar dos negocios a la vez: ningún negocio puede leer/modificar pedidos, mesas, clientes, VIP, empleados, caja, turnos, gastos, reportes o archivos de otro.
- [ ] Asegurar que los visitantes no puedan leer datos privados, empleados, VIP ni documentos operativos.
- [ ] Verificar que los pedidos anónimos solo se creen para negocios publicados y nunca puedan autoasignarse como pagados.
- [ ] Validar permisos de Storage para fotos, logos y portadas, con límites de tipo y tamaño.
- [ ] Probar inicio de sesión, recuperación de cuenta, invitaciones y permisos.
- [ ] Preparar respaldo y procedimiento de rollback.
- [ ] No fusionar ramas grandes ni desplegar reglas sin revisar diferencias y pruebas.

### P1 — MVP público
- [ ] Directorio y páginas públicas rápidos, accesibles y adaptables a móvil.
- [ ] Catálogo con precios, disponibilidad, horarios, contacto y estado publicado.
- [ ] Flujo fiable de pedido: mostrar éxito solo cuando el pedido se guarda; si falla, explicar el error y ofrecer WhatsApp como alternativa.
- [ ] QR de negocio y QR por mesa generados automáticamente, descargables en PNG/PDF e imprimibles.
- [ ] Validar QR antiguos/nuevos, negocio correcto y número de mesa correcto en Android/iPad.
- [ ] Permitir explorar y pedir sin cuenta; exigir cuenta solo para historial sincronizado, favoritos o funciones sociales.
- [ ] Mostrar términos, privacidad, contacto y mecanismo para reportar contenido.
- [ ] Probar doble toque, mala conexión, reintentos, estados de carga y errores.

### P2 — Convertir las funciones de Calientito en módulos universales
- [ ] Diseñar módulos activables por giro: restaurante, cafetería, pizzería, tienda, puesto ambulante/tianguis, ghost kitchen, perfumes/decants y otros.
- [ ] Caja y tickets por fecha/turno con zona horaria correcta.
- [ ] Conciliar Caja, Resumen y Reportes usando pagos reales y evitando dobles conteos.
- [ ] Mostrar mesero asignado en el ticket y mantener trazabilidad mesa → comanda → ticket → cobro.
- [ ] Mesas, cuentas divididas, descuentos, propinas, cancelaciones y permisos.
- [ ] Cocina/Cafetería con estados, tiempos, filtros y recuperación tras recargar.
- [ ] Turnos, gastos, comprobantes, sobre/resguardo, cortes y bitácora.
- [ ] VIP/sellos con prevención de duplicados, consentimiento y desvinculación.
- [ ] Configuración por negocio de horarios, servicios, promociones, formas de pago, marca y reglas operativas.
- [ ] Exportación CSV/PDF y pruebas de recuperación.

### P3 — Clientes, inventario y POS para microcomercios
- [ ] CRM por negocio con datos mínimos, consentimiento y preferencias.
- [ ] Inventario por producto/variante/unidad; entradas, salidas y ajustes auditados.
- [ ] Proveedores, compras, costos, márgenes y alertas de bajo stock.
- [ ] Recetas/insumos con descuento consistente y auditado.
- [ ] POS rápido para tiendas pequeñas, puestos ambulantes, tianguis y ghost kitchens.
- [ ] Búsqueda rápida, código de barras opcional y registro de métodos de pago.
- [ ] Interfaz móvil con botones grandes, impresión opcional y conectividad limitada.
- [ ] Supervisión remota del dueño: ventas, movimientos, caja, empleados y alertas.
- [ ] Piloto con 3–5 negocios de giros distintos.

### P4 — Giobot e IA
- [ ] Asistente de clientes separado de la IA administrativa privada.
- [ ] Base de conocimiento por negocio con el método operativo del fundador, editable y versionada.
- [ ] IA de clientes que responda sobre productos, menú, horarios, políticas y pedidos con datos autorizados.
- [ ] IA administrativa para resúmenes, análisis, promociones y recomendaciones.
- [ ] Aprobación humana para acciones sensibles; bitácora de acciones de IA.
- [ ] Evitar filtraciones entre negocios y probar prompt injection, errores y derivación a humanos.
- [ ] Medir coste por conversación y establecer límites para evitar gastos inesperados.

### P5 — Operación y soporte
- [ ] Panel de superadministrador con búsqueda, estado de publicación, actividad y soporte.
- [ ] Onboarding guiado, plantillas por giro y checklist para publicar.
- [ ] Centro de ayuda y canal de soporte.
- [ ] Métricas de visitas, conversión, pedidos fallidos, latencia y errores.
- [ ] Respaldos automáticos y pruebas periódicas de restauración.
- [ ] CI, pruebas de regresión, versiones y rollback documentado.

### P6 — Red social empresarial
- [ ] Perfiles, seguir negocios, favoritos y feed de novedades/promociones.
- [ ] Publicaciones con fotos, búsqueda, categorías y recomendaciones.
- [ ] Reseñas verificadas, denuncias, bloqueo, moderación y apelación.
- [ ] Mensajería con límites anti-spam y reglas de retención.
- [ ] Analítica y campañas con consentimiento.
- [ ] Reglas comunitarias y gestión de derechos de contenido.
- [ ] Escala regional antes de intentar una expansión global.

## 5. Plan de lanzamiento gradual

1. **Equipo interno:** probar Calientito y Giomero; cerrar seguridad, QR, caja/reportes y recuperación de errores.
2. **Piloto de 3–5 negocios:** distintos giros; acompañar el alta y registrar problemas reales.
3. **10–20 negocios:** medir uso, fallos, costes, carga y si pueden administrar el negocio sin ayuda constante.
4. **Lanzamiento regional:** directorio público, enlaces compartibles, soporte, términos, privacidad y monitoreo.
5. **Escala:** más regiones y categorías; después comunidad social e IA avanzada.

## 6. Modelo gratis, donaciones y capacidad

- Se puede empezar con coste muy bajo y cuotas gratuitas, pero no prometer coste cero ni capacidad infinita.
- Plan básico sugerido: perfil público, catálogo y QR autogenerado/descargable con límites razonables.
- Donación voluntaria opcional, sin bloquear las funciones básicas.
- Futuro pago por IA intensiva, múltiples sucursales, analítica avanzada, automatizaciones y soporte prioritario.
- Los costes posibles incluyen lecturas/escrituras de Firestore, almacenamiento/transferencia de imágenes, hosting, logs, notificaciones y llamadas de IA.
- No se puede prometer cuántos negocios soportará hasta medir el uso real. Medir con 5, 20 y 100 negocios: pedidos diarios, lecturas/escrituras, archivos, errores y gasto.
- Configurar alertas y límites antes de invitar a mucha gente.

## 7. Políticas y logística necesarias

- Aviso de privacidad y términos acordes con la legislación aplicable en México.
- Finalidad clara y minimización de datos; procesos de acceso, corrección, exportación y eliminación cuando corresponda.
- Consentimiento para promociones; permitir dejar de recibir mensajes.
- Mínimo privilegio, aislamiento por negocio, reglas de Storage y secretos fuera del frontend.
- No almacenar datos sensibles de tarjetas; elegir un proveedor de pagos antes de integrar cobros en línea.
- Reglas para contenido, derechos de imagen, denuncias, moderación, suspensión y apelación.
- Respaldos, restauración, monitoreo, soporte y protocolo de incidentes.

## 8. Criterios para declarar listo el MVP

- [ ] CI pasa.
- [ ] Reglas Firestore/Storage pasan pruebas; no hay cruces entre negocios.
- [ ] Calientito sigue funcionando y Giomero recibe pedidos públicos.
- [ ] QR por negocio/mesa se generan y se prueban en un dispositivo real.
- [ ] Caja, ticket, mesero, Resumen y Reportes cuadran.
- [ ] Alta, acceso, recuperación y roles funcionan.
- [ ] Términos, privacidad, soporte y contacto están visibles.
- [ ] Respaldo, alertas de gasto y rollback listos.
- [ ] 3–5 negocios piloto completan sus tareas sin asistencia constante.

## 9. Siguiente orden de trabajo
1. Ejecutar y revisar CI y reglas de seguridad.
2. Completar generación/descarga de QR y validar rutas de mesa.
3. Probar el flujo completo pedido → comanda → ticket → cobro → resumen/reporte, sin regresiones en Calientito.
4. Universalizar los módulos de Calientito por plantillas.
5. Abrir el piloto pequeño y medir antes de escalar.

## 10. Estado de ramas conocido
- Rama de trabajo: `feat/gioteautomatizo-multinegocio-core`.
- La comparación anterior indicaba que esta rama tenía 1 commit adicional sobre `integration` y 171 sobre `main`.
- No fusionar a `main` a ciegas. Revisar diff, CI, reglas, pruebas de aceptación y rollback primero.
- Cambios recientes relevantes: pedido público con aviso si falla el guardado; reglas iniciales que requieren perfil publicado para pedidos anónimos; documento de roadmap en el repositorio.
