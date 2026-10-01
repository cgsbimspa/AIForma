# Arquitectura viva

Actualización: 2026-10-01. Diagnóstico de partida: [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md). Destino: [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md). Orden y límites: [MIGRATION_PLAN.md](MIGRATION_PLAN.md).

## Estado de este incremento

Entrada Company → Project → Project Home con referencias Autodesk; sin nuevas tablas de empresas o proyectos. Frontend Next/React en `web`, ProjectProvider compartido y conservación por usuario/cuenta/proyecto. `/` monta `ProjectHome`; un enlace directo a herramientas sin proyecto muestra primero el selector. Los módulos conservan sus rutas y configuraciones. Cambiar cuenta/proyecto desde el encabezado abre Inicio.

`GET /api/projects/summary` valida el scope y `memoryActor` comprueba identidad y acceso APS; consulta los tres almacenes por roles RLS existentes. `lib/projects/store.ts` lee sólo configuraciones actuales y COUNT/MAX sobre ejecuciones, sin geometría o payloads de informes. `summary.ts` deduplica items y conserva referencias de versiones/vistas por módulo; rechaza fuentes fuera de proyecto. Respuestas privadas, sin caché compartida. Errores de una fuente producen resumen parcial y valor desconocido.

El resumen cuenta ejecuciones guardadas, no resultados del visor en memoria. Modelos configurados no significa todos los archivos de Autodesk. Fecha del último registro no es fecha de última publicación. Advertencias/críticos de proyecto e incidencias no tienen aún consolidado verificable.

## Componentes técnicos

| Área | Implementación / límite |
|---|---|
| Frontend | App Router, componentes de proyecto y módulos existentes; CSS responsive |
| Backend / tool layer | Route Handlers autenticados y bibliotecas determinísticas; registro uniforme de herramientas futuro |
| Database / Storage | PostgreSQL, transacciones por actor, RLS, payloads AES-GCM, stores existentes |
| Autodesk APS / Forma | OAuth v2, Data Management, Model Derivative, AEC y Viewer 7.119.0; sólo datos accesibles/publicados |
| Authentication | Cookies HttpOnly cifradas y renovación; mismo alcance de lectura |
| LLM | OpenAI servidor, interpretación/explicación con evidencia; dos experiencias todavía operativas |
| MCP | Diseño futuro; no servidor habilitado |
| Security | [SECURITY.md](SECURITY.md), sin nuevos permisos ni secretos de cliente |
| Logging | ActivityLogger estructurado para lectura del inicio, en logs operacionales; eventos de IA en memoria existentes |
| Deployment | Vercel, raíz web, Node24, dominio app.cgsbim.cl, repositorio AIForma |

## Decisiones

ADR-001: `companyId = hubId` como namespace, no afirmación de razón social. `projectId` conserva identidad Autodesk y nombres consultados. Metadatos como descripción, etapa, fecha de creación o rol no se inventan.

ADR-002: lectura agregada independiente de motores; abrir Inicio no crea ejecuciones, plantillas ni auditorías. Ninguna modificación del esquema ni de historiales.

ADR-003: mantener rutas actuales durante migración. El proyecto común es el paso inicial; cada fuente técnica de módulo sigue siendo explícita. La herencia de fuente auditada se implementará con verificación de compatibilidad.

ADR-004: errores críticos/advertencias no se calculan sumando indiscriminadamente hallazgos históricos de versiones diferentes. Se necesita una política de última ejecución por alcance y versiones; quedan no consolidados.

ADR-005: ActivityLogger de este incremento es observabilidad operacional, no historial permanente de actividad. La tabla de eventos actual restringe módulo/acción a IA; ampliarla requiere una migración posterior y política de retención, no etiquetar accesos al proyecto como consultas del asistente.

## Pruebas

Regresión Node/PGlite: aislamiento cuenta/proyecto, descifrado contextual de referencias, recuentos completos sin payload de informes, deduplicación por archivo y conservación de versión/vista, fuentes parciales y desconocidos. Centro Español: protocolo y evidencia en `docs/benchmark-centro-espanol.md`. Las pruebas sintéticas no sustituyen aceptación BIM real.
