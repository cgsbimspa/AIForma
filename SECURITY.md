# Seguridad y límites de la plataforma

Actualizado: 2026-10-01. Descripción del código y de este incremento; no certificación externa.

- Autodesk autentica al usuario. OAuth Authorization Code confidencial, state y retorno acotado; tokens cifrados en cookies HttpOnly, configuración y credenciales sólo servidor. Scopes actuales: `user-profile:read data:read`.
- `memoryActor` verifica perfil y acceso al proyecto bajo la cuenta seleccionada, independientemente del LLM o de lo que muestre el frontend. La nueva API de Inicio reutiliza esa comprobación.
- PostgreSQL usa roles separados, RLS forzada, contexto transaccional de organización/proyecto/usuario y límites de consulta. Los payloads cifrados están vinculados a contexto e ID. Los catálogos de empresa no se confunden con registros de otro proyecto.
- Las mutaciones existentes comprueban origen, esquema, alcance y revisiones cuando corresponda. El resumen es sólo lectura. SQL nuevo usa parámetros para identificadores de datos; nombres de tablas se eligen de una unión cerrada interna.
- No hay nuevo acceso de administración, scopes de escritura Autodesk ni publicación automática de incidencias. Acceso lector al proyecto no demuestra rol administrador. Una matriz de roles locales es trabajo pendiente con enforcement servidor.
- Las respuestas autenticadas usan encabezados privados. Project Home no mantiene un cache compartido de datos; cancela solicitudes al cambiar contexto. Las lecturas fallidas muestran indisponibilidad y no valores inventados.
- ActivityLogger sólo admite campos controlados (actor autorizado, acción fija, tiempo y códigos). No registra tokens, prompts, contenidos documentales, propiedades o respuestas crudas. Los logs operacionales no sustituyen un ActivityLogs persistente; su retención depende del proveedor y no se afirma una duración sin configurarla.
- Historial conversacional: 5 días, eliminación/retención según `docs/memory-architecture.md` y `docs/memory-operations.md`. Preferencias operativas no modifican reglas técnicas. Conocimiento requiere evidencia validada.
- No se copian permisos/usuarios Autodesk a registros ficticios. Una futura sincronización requiere API/scopes comprobados y minimización de datos.

## Verificación de este incremento

Pruebas con políticas SQL reales en PGlite y actores TEST de distinta empresa/proyecto; rechazo adicional de referencias fuera del scope al construir resumen. La autorización APS se conserva en cada petición. No se guardan credenciales, datos privados masivos ni estados de navegador en pruebas versionadas.

## Limitaciones pendientes

Roles administrativos propios, consolidación de hallazgos por versión, registro transversal persistente y permisos de publicación de incidencias requieren etapas posteriores. No confundir una ruta visible con autorización backend, ni una configuración guardada con un cálculo validado. Revisar estas garantías al ampliar herramientas o MCP.
