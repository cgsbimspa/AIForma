# Arquitectura actual — diagnóstico previo a la migración

Fecha: 2026-10-01. Base inspeccionada: `07f15c8`. Este documento describe esa base; los cambios posteriores se registran en ARCHITECTURE.md.

## Estructura y tecnología

Aplicación única en `web/`, Next.js 16.3.4 App Router, React 19.2.6, TypeScript 5.9.3, Node 24. CSS global/Tailwind 4 y componentes locales en `components/ui`. No hay servicios separados ni servidor MCP. `package-lock.json` fija dependencias. `docs/` conserva principios, especificaciones y decisiones; `web/tests` contiene pruebas Node y bases efímeras PGlite. `public/quantity-v2` comparte motores JavaScript determinísticos con el visor; `scripts/` contiene extracción documental y migraciones SQL. Hay documentación inicial obsoleta en web/README.md que aún describe módulos implementados como pendientes.

## Frontend y rutas

| Rutas | Componentes y responsabilidad |
|---|---|
| `/` | Catálogo de módulos; no existe aún Project Home |
| `/asistente` | Explorador de proyectos/documentos, búsqueda por etapas, preguntas, resúmenes y extracción con citas |
| `/chat-bim` | Selección de fuente y chat de acciones sobre datos BIM |
| `/auditoria-bim`, `/auditoria-bim/[section]` | AuditProvider, configuración, reglas, ejecuciones, grillas, niveles y resultados |
| `/coordinacion-normativa/[[...section]]` | CoordinationProvider, sistemas sanitarios, reglas RIDAA, revisión e historial |
| `/cubicaciones` | Catálogo de especialidades, configuración, visor, motores estructura/MEP, filtros y exportación |
| `/[module]` | Estados pendientes de incidencias, documentos, láminas, actividad y administración |

`workspace-shell.tsx` monta ProjectProvider y el contexto normativo por usuario/cuenta/proyecto. Encabezado y sidebar compartidos. `project-context.tsx` contiene la identidad Autodesk, las cuentas, los proyectos paginados y fuentes por módulo. `project-session.ts` aísla estado de sesión por usuario/cuenta/proyecto/slot (5 días, memoria acotada); sessionStorage conserva sólo el cursor de identidad/cuenta/proyecto. Cambiar proyecto remonta proveedores y evita mezclar resultados.

## Backend y APIs

Route Handlers Node en `web/app/api`; validación Zod, respuestas privadas sin caché compartida, autenticación y autorización de proyecto en servidor.

| Familia | Responsabilidad |
|---|---|
| `/api/autodesk/{connect,callback,status,refresh,disconnect,browse}` | OAuth, sesión, renovación, hubs/proyectos/carpetas/archivos |
| `/api/assistant/{chat,search,documents}` | Interpretación, búsqueda y respuestas fundamentadas |
| `/api/bim-chat` | Plan de acciones validado para datos del modelo |
| `/api/audit` | Configuración, catálogos, lectura publicada, ejecución, historial, solicitud de incidencia |
| `/api/coordination` | Configuración sanitaria, inspección, revisión, resultados, anotaciones, comparación |
| `/api/quantities` | Especialidades, plantillas, fuentes, versiones, configuración y ejecuciones compatibles |
| `/api/quantities/viewer-frame`, `/viewer/[ticket]/[...path]` | Visor y recursos APS autorizados |
| `/api/memory/{history,knowledge,preferences}` | Contexto reciente, conocimiento validado, preferencias |
| `/api/internal/memory-retention` | Retención y agregación de eventos |

Los handlers todavía orquestan parte de la lógica de negocio. Las bibliotecas `lib/audit`, `lib/coordination`, `lib/quantities`, `lib/search`, `lib/documents` y los motores del visor son reutilizables; no existe aún un registro uniforme de herramientas con contratos de ejecución comunes.

## Persistencia

PostgreSQL mediante `postgres` 3.4.9; `lib/memory/database.ts` configura transacciones, roles de mínimo privilegio, contexto de usuario/organización/proyecto y tiempos máximos. No se deduce el proveedor de alojamiento a partir del código. Payloads sensibles cifrados con AES-GCM y vinculados al contexto. SQL versionado en `web/db/`:

- `memory.sql`: conversaciones, mensajes, herramientas, preferencias, conocimiento/evidencia, eventos/métricas y mantenimiento. Historial 5 días; preferencias y conocimiento separados.
- `audit.sql`: `audit_record` append-only (configuración, catálogo, ejecución, solicitud de incidencia); catálogos de empresa o proyecto.
- `coordination.sql`: `coordination_record` append-only por sistema/proyecto.
- `quantities.sql`: `quantity_configuration`, `quantity_template_version`, `quantity_run`; revisiones y plantillas/ejecuciones inmutables.

RLS forzada por organización/proyecto; memoria personal además por usuario. Las configuraciones técnicas son compartidas entre usuarios con acceso al proyecto. No existe un directorio propio Company/ProjectUsers ni RBAC administrativo de la plataforma. Autodesk es la fuente del proyecto y del acceso, no una tabla ficticia de usuarios.

## Autodesk y visor

OAuth Authorization Code confidencial APS v2, permisos `user-profile:read data:read`, cookies cifradas HttpOnly, origen controlado para mutaciones, renovación del servidor. Data Management proporciona hubs/proyectos/carpetas/items/versiones; Model Derivative y AEC proporcionan representaciones y metadatos publicados. `verifiedSource` comprueba fuente/versión/vista; el visor APS 7.119.0 comparte lectura de propiedades, vínculos, selección y filtros. Las propiedades publicadas no garantizan todos los parámetros del RVT original. Grillas y niveles AEC complementan lo disponible en la vista; coordenadas ausentes permanecen desconocidas.

## IA y motores

OpenAI se invoca desde servidor con claves privadas; búsquedas y evidencia documental se verifican en código. Extracción PDF/Office/texto, OCR con Tesseract y renderizado; límites y cobertura explícitos. Dos experiencias aún independientes: documental y BIM. Cantidades, reglas, clasificaciones confirmadas y mediciones no se delegan al LLM. Auditoría tiene estados normalizados (incluido INFORMATIVE); normativa conserva contrato histórico distinto. La auditoría operativa requiere actualmente una vista, aunque parte de la evidencia es global AEC. Comparación completa de modelos y gate crítico común aún no existen.

## Duplicaciones, deuda y riesgos

- Selectores/fuentes/visores se repiten en módulos; ProjectProvider ya elimina repetición de cuenta/proyecto. No unificar mecánicamente configuraciones técnicas diferentes.
- Contratos de estados, errores y resúmenes diferentes entre motores; migrar con adaptadores, sin reescribir historiales.
- Cálculo v2 en visor no equivale a ejecución persistida de `quantity_run`. El dashboard no debe contar cálculos de sesión como publicaciones guardadas.
- Varias consultas de workspace cargan historiales completos/payloads grandes. Project Home necesita lectura agregada acotada, sin descargar propiedades ni ejecutar auditorías al abrir.
- No existe consolidado fiable de errores críticos del proyecto ni inventario completo de incidencias Autodesk. Ausencia de integración no significa cero.
- Eventos de memoria cubren parte de IA; no existe todavía ActivityLogger transversal. Roles locales diferenciados requieren definición y aplicación en servidor.
- Error de red/DNS/firewall es distinto de un error de renderizado. No corregir una indisponibilidad externa inventando resultados.
- Un archivo/version/vista de otro módulo no puede adoptarse sin verificar acceso, pertinencia y reglas. dbId es local a una representación y no identidad universal.
- Centro Español no tiene un volumen de referencia validado en este diagnóstico. No convertir números ilustrativos de la especificación en pruebas reales.

Dependencias de extracción (pdfjs-dist, mammoth, ExcelJS, CFB, fast-xml-parser, JSZip, sharp y Tesseract) y UI (Radix/Base UI, Lucide, Recharts) constan en package.json. No se propone actualizarlas para este cambio. Despliegue Next en Vercel, raíz `web`, dominio app.cgsbim.cl; integración independiente de Repositorio de Links.
