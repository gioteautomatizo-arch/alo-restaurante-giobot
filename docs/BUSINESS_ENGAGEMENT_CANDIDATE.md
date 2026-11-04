# Gioteautomatizo — visitas y estrellas (candidato NO ACTIVADO)

**Rama:** feat/gioteautomatizo-multinegocio-core. **Estado:** código para staging; no se ha activado en producción ni modificado Firestore remoto.

## Rutas y experiencia

- El QR general (URL raíz) abre el registro de negocios en `#business-new`. El directorio sigue en `#explorar`. Los QR individuales y de mesa siguen a sus rutas particulares.
- La navegación «Interfaces de prueba» y accesos de Calientito están reservados al Super Admin verificado por Firebase; no se crea una nueva sección pública.
- El panel existente `#platform-admin` muestra el número de negocios multinegocio registrados (excluye Calientito histórico). El apartado de visitas y estrellas se incorpora dentro de cada tarjeta de negocio, no como otra app.
- La medición no genera un valor histórico: empieza cuando se active el sistema. El panel distingue «Sin medición» y un total real. Una ausencia de votos no significa cero estrellas.

## Cómo se mide

- **Visita:** una apertura de la página pública de un negocio por sesión de navegador y día UTC. No se afirma que sean personas únicas, compradores, órdenes ni visitas antes de habilitar el sistema.
- Se genera en el navegador un identificador aleatorio de sesión (16 bytes) guardado temporalmente para el día; el servidor guarda solo un hash con salt privado. No se guardan las IP en claro. Se aplican límites de 50 visitas por IP/negocio/día y 10,000 por negocio/día (ambos provisorios, sujetos a prueba de tráfico real).
- **Estrellas:** voto entero del 1 al 5 por cuenta autenticada Firebase y negocio publicado. El mismo usuario puede modificar su voto, sin crear dos reseñas. El servidor realiza el cálculo de promedio y conteo dentro de una transacción, no acepta valores agregados desde React.
- Las estrellas no verifican que el votante haya comprado; no pueden presentarse como «compradores verificados». Antes de exponer valoraciones en beta abierta faltan medidas de abuso, un proceso para reportar votos sospechosos y revisar normativa de privacidad.
- El panel privado usa el token Firebase Auth y comprueba `platformAdmins/{uid}` en el servidor. Puede consultar datos de negocios no publicados sin mostrar esos datos en la página pública.

## Implementación candidata

- Backend: `businessEngagementService.ts`, `businessEngagementApi.ts`; rutas `/api/engagement/:businessId/visit`, `/api/engagement/:businessId/rating` (GET, PUT), `/api/engagement/platform/metrics` (POST).
- Clientes: `src/lib/businessEngagementClient.ts`, `src/components/platform/BusinessRatingWidget.tsx` y el panel existente `PlatformAdminPanel.tsx`. Las visitas no afectan la confirmación de pedidos ni los cobros si falla la analítica.
- Colecciones: `businessVisitSessions`, `businessVisitBudgets`, `businessVisitDays`, `businessVisitSummaries`, `businessRatingVotes`, `businessRatingSummaries`. Los permisos de escritura directa quedan prohibidos por las reglas comodín actuales; las APIs usan Admin SDK y verifican identidad.
- **APAGADO por defecto:** el backend devuelve 404 salvo `ENABLE_BUSINESS_ENGAGEMENT_API=true`; la interfaz no monta valoraciones ni envía visitas salvo `VITE_BUSINESS_ENGAGEMENT_API=true`.
- Configuración necesaria exclusivamente en staging: `ENGAGEMENT_ALLOWED_APP_IDS` (Firebase App Check real), `ENGAGEMENT_HASH_SALT` secreto aleatorio de 32+ caracteres solo en servidor, y `ENGAGEMENT_TRACKING_SINCE` como fecha UTC. El frontend requiere además `VITE_FIREBASE_APPCHECK_SITE_KEY`; nunca colocar el salt ni credenciales Admin en `VITE_*`.

## Puertas antes de activar

1. Confirmar que las pruebas de emulador con Auth/App Check simulados y ambos negocios A/B están verdes. Esto no prueba tokens reales.
2. Configurar un proyecto Firebase staging independiente, App Check real, cuentas reales de prueba y validar el panel Gio contra una segunda cuenta sin permisos.
3. En producción: configurar TTL sobre `businessVisitSessions.expiresAt` y `businessVisitBudgets.expiresAt`, revisar índices y costo de cada visita, límites distribuidos, alertas y firewall/rate limiting de infraestructura.
4. Documentar aviso de privacidad, destino de datos y medidas contra votos de cuentas falsas; decidir si las valoraciones requerirán pedido comprobado más adelante.
5. Habilitar el backend y la UI solo tras validar despliegue en hosting real, con reversión. Nunca modificar permisos de pedidos, Caja o VIP para activar las métricas.

**No son datos reales todavía:** la sección de estrellas y conteo por negocio solo mostrará resultados reales después de la activación y recepción de visitas/votos.
