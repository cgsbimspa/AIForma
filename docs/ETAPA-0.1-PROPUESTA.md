# Etapa 0.1 — Propuesta de base navegable de la plataforma

Estado: propuesta de alcance para revisión. No representa funcionalidades implementadas ni decisiones técnicas aprobadas.

## Objetivo

Disponer de una aplicación navegable que establezca la estructura de la futura plataforma Autodesk + IA, con acceso a sus módulos y páginas vacías que comuniquen honestamente su estado.

Esta etapa es una subdivisión propuesta del trabajo inicial, no una fase adicional del roadmap. Por sí sola no completa la Fase 1 de octubre de 2026: esa fase exige conexión con Autodesk, configuración de especialidades y proyectos, estructura de datos y un asistente operativo.

## Base de la propuesta

- Roadmap proporcionado por el usuario: siete fases entre octubre de 2026 y abril de 2027.
- [Principios del proyecto](PRINCIPIOS.md): evidencia verificable, procesamiento técnico determinístico, trazabilidad y ausencia de datos ficticios en los módulos de la Etapa 0.1.
- Inspección inicial de la carpeta de trabajo: no existía una aplicación sobre la cual implementar esta propuesta.

Los nombres de módulos y su secuencia provienen del roadmap. La navegación, las rutas y los detalles de interfaz descritos a continuación son propuestas de implementación, no requisitos previamente especificados por el usuario.

## Alcance propuesto

### 1. Estructura de aplicación

- Una estructura visual compartida con navegación lateral, encabezado y área de contenido.
- Una página de inicio que explique el propósito de la plataforma y permita acceder a los módulos, sin métricas, proyectos ni actividad simulada.
- Navegación que identifique la página activa y funcione también en pantallas estrechas.
- Un tratamiento explícito para rutas inexistentes.
- Textos iniciales en español.

### 2. Páginas y navegación

Las rutas son una propuesta; no son endpoints de Autodesk ni APIs existentes.

| Página | Ruta propuesta | Relación con el roadmap | Entrega en 0.1 |
| --- | --- | --- | --- |
| Inicio | `/` | Acceso general propuesto | Propósito y enlaces a módulos |
| Asistente IA | `/asistente` | Fase 1 | Página vacía; sin conversación ni respuestas generadas |
| Auditoría BIM | `/auditoria-bim` | Fase 2 | Página vacía; sin auditorías, métricas ni resultados |
| Cubicaciones | `/cubicaciones` | Fase 3 | Página vacía; sin cantidades, cálculos ni exportaciones |
| Coordinación Normativa | `/coordinacion-normativa` | Fase 4 | Página vacía; sin reglas ni conclusiones de cumplimiento |
| Revisión de Láminas | `/revision-laminas` | Fase 5 | Página vacía; sin planos ni revisiones |
| Control Documental | `/control-documental` | Fase 5 | Página vacía; sin documentos ni versiones |
| Incidencias | `/incidencias` | Transversal a fases 1–5 | Página vacía; sin incidencias ni estados operativos |
| Actividad y Consumo | `/actividad-consumo` | Fase 6 | Página vacía; sin registros, gráficos ni indicadores |
| Administración | `/administracion` | Fase 7 | Página vacía; sin usuarios, empresas, roles ni permisos |

Revisión de Láminas y Control Documental tienen accesos separados porque el roadmap los enumera como módulos separados, aunque se desarrollan en la misma fase. Incidencias se incluye como acceso transversal; su operación queda fuera de esta etapa.

### 3. Contenido de cada página de módulo

Cada página incluye únicamente:

1. Nombre del módulo.
2. Descripción breve de su propósito futuro, tomada del roadmap y redactada sin prometer disponibilidad actual.
3. Un estado explícito: «Módulo aún no implementado».

No se incorporan tablas vacías con columnas técnicas aún no definidas, gráficos, contadores, filtros ni botones que aparenten ejecutar funciones pendientes.

La ausencia de integración no permite afirmar que un proyecto no tiene modelos o documentos. En esta etapa tampoco se simulan búsquedas, análisis o errores de APIs que nunca se han consultado.

### 4. Base de trabajo mantenible

- Organización del código para compartir la estructura visual y mantener separadas las páginas de módulos.
- Instrucciones verificadas de instalación y ejecución local, una vez elegida la tecnología.
- Registro de decisiones técnicas adoptadas y de funcionalidades pendientes.
- Aplicación de `AGENTS.md` y de la política completa de evidencia.

No se crean motores vacíos, conectores supuestos, esquemas de base de datos ni contratos de APIs futuras solo para anticipar el roadmap. La trazabilidad se mantiene como requisito documentado hasta que se definan las primeras fuentes y operaciones reales.

## Fuera del alcance de 0.1

- Integraciones con ACC, Forma, APS, AEC Data Model u otros servicios Autodesk.
- Credenciales, OAuth, inicio de sesión, roles y autorización.
- Configuración real de proyectos y especialidades.
- Base de datos y almacenamiento de información de proyectos.
- Visor BIM, carga de modelos o extracción de propiedades.
- Integración con un LLM, chat operativo o recuperación de documentos.
- Auditorías, cubicaciones, evaluaciones normativas y revisión automática de planos.
- Gestión operativa de documentos, versiones e incidencias.
- Analítica de uso, consumo y productividad.
- Despliegue productivo.

Estos límites corresponden a esta propuesta inicial; no eliminan ninguna entrega del roadmap.

## Estados de información

La política distingue `AVAILABLE`, `NOT_AVAILABLE`, `NOT_FOUND`, `NOT_CALCULATED`, `PENDING`, `ERROR` y `UNVERIFIED`. No es necesario implementar todos esos estados en las páginas vacías.

«Módulo aún no implementado» describe disponibilidad funcional. Es distinto de «Dato no encontrado», que exige haber ejecutado una consulta, o de «Análisis no ejecutado», que describe una operación técnica. Ninguna ausencia se sustituye por cero ni por un resultado aparente.

## Criterios de aceptación

| Criterio | Verificación prevista |
| --- | --- |
| Todas las páginas del alcance son accesibles | Abrir cada enlace y su ruta directamente; comprobar también la recarga |
| La navegación mantiene el contexto | Comprobar título, página activa y regreso al inicio |
| La interfaz comunica el estado real | Revisar que cada módulo indique que aún no está implementado |
| No existen datos ficticios en los módulos | Revisar contenido visible y código: sin proyectos, usuarios, modelos, cantidades, documentos o resultados simulados |
| No se aparentan operaciones reales | Verificar que no haya chat, conexión, análisis o exportación que simule funcionar |
| La interfaz es utilizable | Revisar una pantalla de escritorio y una estrecha; navegación por teclado, foco visible y etiquetas comprensibles |
| Una ruta inexistente se informa claramente | Abrir una ruta no definida y comprobar la opción de volver al inicio |
| La aplicación se puede ejecutar | Seguir la documentación de instalación, iniciar la aplicación y ejecutar los chequeos propios de la tecnología elegida |

Estos son criterios futuros: todavía no se han ejecutado ni se afirma que estén cumplidos.

## Orden de implementación propuesto

1. Definir la tecnología y el entorno objetivo de esta primera entrega.
2. Crear la aplicación mínima y sus instrucciones de ejecución.
3. Implementar la estructura visual compartida y la navegación.
4. Incorporar las páginas vacías y sus textos de estado.
5. Verificar los criterios de aceptación y registrar el resultado.

## Decisiones pendientes antes de programar

- Tecnología: el roadmap no especifica framework, lenguaje ni herramientas de construcción.
- Entorno objetivo: esta propuesta plantea una aplicación web ejecutable localmente; falta confirmar si existen restricciones corporativas o de alojamiento que condicionen la base.
- Identidad visual: la imagen del roadmap sirve como referencia de color, pero no define nombre comercial, logotipo ni sistema visual de la aplicación.

No hacen falta credenciales Autodesk, modelos BIM ni documentos del proyecto para construir esta base navegable. Sí serán necesarios, según la funcionalidad, para las entregas de integración posteriores.
