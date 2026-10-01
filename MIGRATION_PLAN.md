# Plan de migración incremental

Fecha: 2026-10-01. Sin reescritura masiva. CURRENT_ARCHITECTURE.md registra la base; TARGET_ARCHITECTURE.md el destino.

| Orden | Reutilizar / refactorizar / crear | Aceptación y riesgo |
|---|---|---|
| 1 — este incremento | ProjectProvider, autorización APS y RLS. Sustituir catálogo inicial por selección de empresa/proyecto e Inicio del proyecto. Crear resumen sólo lectura, referencias guardadas y rutas actuales como accesos. | Cambiar A→B→A no mezcla datos; desconocido no es cero; las rutas antiguas funcionan. Sin migración SQL ni cambios OAuth. |
| 2 | Añadir metadatos propios de proyecto/etapa y roles sólo con definición de permisos. Adaptar navegación Auditoría BIM/Normativa. | Revisiones, aislamiento, matriz de roles y autorizaciones servidor; nunca atribuir rol administrador a un lector. |
| 3 | Unificar chat documental y BIM reutilizando sus motores; ContextPanel y adaptadores de herramientas. | Conservación de conversaciones por alcance y TTL; no ampliar selección sin intención del usuario. |
| 4 | Auditoría MODEL y VIEW; aprovechar proveedor AEC/grillas/niveles; applicability + estado/severidad/blocking. | Reglas con fuentes y datos; no convertir datos faltantes en PASS/N/A. Compatibilidad de historiales. |
| 5 | Normativa por etapa, contrato común de resultados, hallazgos→Viewer. | Fuentes normativas controladas y aplicabilidad validada; unidades explícitas. |
| 6 | Herencia verificada de fuente, gate técnico y persistencia v2 de Hormigón/Moldaje. | Exacta versión/configuración; ningún gate ficticio ni cantidad guardada sin entrada verificable. |
| 7 | ActivityLogger transversal reutilizando eventos; tool registry preparado para MCP. | Logs mínimos, retención, fallos observables; no entrenar con información privada. |
| Posterior | Comparación entre especialidades, publicación/importación de incidencias, MCP completo, costos y otros módulos. | Alcance nuevo y fuentes verificadas; no implementado por este plan. |

## Eliminar y conservar

Eliminar del inicio el catálogo de fases como flujo principal y mensajes obsoletos de módulos pendientes que ya funcionan. Conservar rutas, configuraciones, sesiones, datos históricos, plantillas, motores y especialidades. No borrar componentes antiguos hasta migrar sus consumidores y probar equivalencia. No modificar Repositorio de Links.

## Primer incremento: decisiones

- Cuenta Autodesk es el identificador de empresa del contexto; los nombres vienen de APS.
- Project Home usa datos agregados de registros existentes. No ejecuta auditorías/cubicaciones ni descarga geometría al abrir.
- Contar modelos configurados por item, y versiones/vistas por separado. No llamar a esa lista inventario completo de la nube.
- Resumen sin acceso a una fuente muestra error/indisponible, nunca resultado cero sustituto.
- Publicaciones recientes conservan su versión; no se declaran actuales sin comprobación Autodesk.
- Autenticación, scopes y tablas permanecen; toda lectura nueva pasa autorización del proyecto y roles RLS existentes.

## Regresión y entrega

Pruebas automatizadas: aislamiento de cuentas/proyectos, agregación sin duplicados, ausencia de datos, fuente fallida, recuentos persistidos, navegación y preservación del contexto. Prueba de aceptación Centro Español: localizar cuenta/proyecto real, abrir Inicio y herramientas manteniendo identidad; registrar evidencia. Cantidades/grillas/niveles esperados quedan pendientes hasta obtener baseline validado, sin usar ejemplos numéricos del documento.

Ejecutar suite existente, lint, TypeScript y build; comprobar interfaz escritorio/móvil. Publicar incremento compatible y comprobar dominio. Rollback: revertir commit de interfaz/API; no hay conversión irreversible de datos en incremento 1. Habilitar etapas posteriores con pruebas de contratos y migraciones reversibles, si necesarias.
