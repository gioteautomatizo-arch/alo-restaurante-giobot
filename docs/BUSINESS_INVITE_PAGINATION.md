# Paginación segura de invitaciones — contrato previo a beta

Estado: candidato en `feat/gioteautomatizo-multinegocio-core`, **desactivado** por defecto. No implica publicación ni cambio de reglas Firebase.

## Contrato del endpoint

`GET /api/business-invites?businessId=<tenant>&pagination=1&cursor=<opcional>` requiere ID token de usuario con rol autorizado. La consulta siempre filtra `businessId` y ordena por ID de documento; cada página examina hasta 150 documentos históricos (incluidos los no vigentes) y devuelve `{invites, nextCursor}`, donde `nextCursor` es un ID de documento validado o `null` al terminar. No es el token secreto de invitación.

Se revalidan actor, raíz del negocio y emisores antes de devolver nombres/correos **en cada página**. El cliente acumula hasta 50 páginas y solo muestra la lista tras completar la lectura; verifica el UID en cada espera, cursor válido/no repetido, documentos no duplicados y contrato explícito de `nextCursor`. Si alguna página falla, muestra error recuperable y no una lista parcial.

## Límites y riesgos antes de activar

- No existe snapshot transaccional entre páginas; cambios concurrentes pueden alterar la enumeración. Reintentar tras conflicto; no interpretar el resultado como historial contable inmutable.
- Hasta 50 páginas y lecturas adicionales de miembros/raíces; revisar volumen, índice, costos, retención/archivo y tiempos de respuesta con inventario **autorizado**, sin datos reales en este trabajo.
- Compatibilidad: el cliente nuevo envía `pagination=1` en cada página y rechaza servidores antiguos sin `nextCursor`. Un cliente antiguo que no envía `pagination` obtiene la lista completa solo cuando hay **hasta 150 documentos históricos**; si hay 151 o más, el servidor lee un documento centinela y responde **409 sin `invites`**, exigiendo actualizar la aplicación. Un cursor sin `pagination=1` o una versión desconocida se rechaza con 400. El modo legado nunca entrega una primera página que pueda confundirse con historial completo. La condición cuenta documentos históricos, incluidos vencidos/revocados, por seguridad conservadora. Coordinar versiones y corte/rollback antes de habilitar el flag de invitaciones.
- La autorización de aceptar/revocar invitaciones continúa siendo transaccional; listar no concede permisos. No se han verificado reglas realmente desplegadas ni dispositivos Android/iPad.

## Evidencia

Prueba pura local de cursor: PASS. CI sobre `f16f3fdf`: [Quality checks #41225346202](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41225346202) y [Staged Security #41225346220](https://github.com/gioteautomatizo-arch/alo-restaurante-giobot/actions/runs/41225346220), ambas **success**. El segundo incluye 160 invitaciones sintéticas y recorrido A/B en emuladores; no hay despliegue.

## Protección de clientes antiguos (31 de octubre de 2026)

La negociación de protocolo es solo de lectura y mantiene las invitaciones **OFF** por defecto. Para volver al servidor anterior basta revertir el commit funcional; no hay migración de datos. **No activar el endpoint si existen clientes antiguos que deban seguir mostrando historiales grandes**: ahora reciben 409 en vez de una lista incompleta, pero la interfaz antigua podría no mostrar el mensaje del servidor. Las pruebas con emuladores verifican 160 documentos ficticios A, rechazo legado y recuperación paginada sin mezclar B; las pruebas de cliente simulado verifican que siempre envía `pagination=1`. Ninguna de ellas acredita versiones instaladas ni inventario real.
