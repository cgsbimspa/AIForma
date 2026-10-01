# Arquitectura objetivo

Fecha: 2026-10-01. Propuesta basada en la especificación del usuario; no implica que todas las capacidades estén implementadas.

## Entrada y contexto

Empresa/cuenta Autodesk → Proyecto → Inicio del proyecto → Herramientas. `companyId` referencia el hub Autodesk, sin inferir personalidad jurídica. `projectId` referencia el proyecto Autodesk dentro de esa cuenta. Metadatos propios complementan la fuente, no sustituyen nombres, permisos ni versiones. Cada operación conserva actor, cuenta, proyecto, archivo, versión, vista (si aplica), configuración, ejecución y motor.

El inicio muestra referencias de modelos configuradas, ejecuciones guardadas y fecha de registros. Un consolidado incompleto se identifica como parcial. Incidencias, errores críticos o publicaciones no consultados tienen valor desconocido. No confundir configuración con ejecución ni última consulta con última publicación.

## Capas

1. UI: Project Home, navegación de proyecto, un Asistente y ContextPanel contextual DOCUMENTS/VIEWER/TABLE/RESULTS/ISSUES; visor abrible, minimizable, maximizable y cerrable.
2. Casos de uso/herramientas determinísticos: contratos Zod, entrada y salida tipadas, autorización, límites, errores, ActivityLogger y evidencia. Reutilizar motores existentes.
3. Dominio: auditoría MODEL/VIEW/CROSS_MODEL; normativa por etapa; cantidades y trazabilidad; hallazgos/incidencias.
4. Integraciones: APS/Data Management/Model Derivative/AEC, extracción documental, OpenAI. LLM interpreta y explica; nunca fabrica resultados ni reglas.
5. Persistencia: PostgreSQL/RLS/cifrado actuales; migraciones aditivas sólo cuando una nueva capacidad requiera registros propios.
6. Futuro MCP: adaptador del registro de herramientas, sin lógica técnica paralela ni autorizaciones implícitas del modelo.

## Entidades y fuentes

| Entidad lógica | Fuente / evolución |
|---|---|
| Company, Project | Referencias Autodesk; descripción/etapa/estado propios sólo explícitos y con autor |
| ProjectUsers, roles, permissions | Autodesk cuando API y scopes permitan; roles locales explícitos, nunca inferidos de acceso lector |
| ProjectFiles / ProjectViews | Referencias verificadas a item/version/view, sin copiar todo el catálogo |
| Audit/Regulatory configs, runs, results | Reutilizar registros existentes; nuevos contratos versionados |
| Quantity configs, runs, results | Conservar plantillas y reglas; persistencia verificable de v2 antes de declararlo publicación |
| Issues / Documents / ActivityLogs | Referencias y eventos mínimos; publicación Autodesk requiere decisión explícita |
| CostDatabase / UnitPrice / CostEstimate | Diseño futuro, sin tablas ni presupuesto en esta etapa |

`projectStage`: CONCEPTUAL, BASIC_DESIGN, DETAILED_DESIGN, CONSTRUCTION, AS_BUILT o pendiente de definición. No elegir etapa automáticamente ni usarla para omitir controles sin matriz de aplicabilidad validada.

## Resultados y gate técnico

Separar `status` (PASS/WARNING/FAIL/NOT_APPLICABLE/NOT_EVALUATED/INFORMATIVE), `severity` (incluido CRITICAL) y `blocking`. Compatibilidad INFORMATIONAL→INFORMATIVE mediante adaptador; no modificar historiales. NOT_APPLICABLE exige evidencia de inaplicabilidad; NOT_EVALUATED indica evaluación debida que no pudo ejecutarse.

Gate de cubicación: comprobaciones críticas verificadas, asociadas a la misma fuente/versión/vista/alcance/configuración. Resultados antiguos o desconocidos no representan aprobación. Antes de activarlo, definir política de estados incompletos y catálogo validado de reglas bloqueantes; no inventar umbrales o reglas constructivas.

Hallazgos referencian IDs externos y dbIds con modelo/instancia/vista; boundingBox y ubicación sólo si disponibles. Componente común de ver/aislar/colorear/ocultar/encuadrar. Herencia Auditoría→Cubicaciones propone fuente comprobada y conserva independencia de reglas/plantillas.

## Seguridad, memoria y observabilidad

Mantener tokens en servidor, proyecto autorizado por solicitud, RLS y cifrado contextual. Empresa no equivale a rol administrador. No ampliar scopes para el primer flujo. Nuevos permisos Autodesk y roles locales se diseñan y validan antes de escritura.

ActivityLogger central con usuario/cuenta/proyecto/acción/módulo/fecha/duración/resultado/código de error y metadatos permitidos; sin tokens ni documentos completos. Reutilizar eventos estructurados y retención existentes. No copiar chats a logs permanentes. Historial conversacional 5 días; conocimiento técnico sólo con evidencia validada.

## Aceptación del MVP y benchmark

Centro Español será el proyecto estable de aceptación. Registrar IDs reales, archivo/version/vista, configuración, motor, fecha y resultado validado antes de comparar cantidades. Cada baseline numérico requiere fuente independiente o confirmación explícita; cambiar versión exige nueva referencia. Pruebas sintéticas se rotulan TEST y nunca se presentan como validación del modelo real.

Entrega por incrementos: contexto de proyecto primero; después Asistente unificado, auditoría global/vista/normativa, visualización, gate y persistencia de cantidades Hormigón/Moldaje. No retirar MEP o Enfierradura ya funcionales por ser segunda prioridad del roadmap.
