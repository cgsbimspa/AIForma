# Cubicaciones — MVP 1.0

Implementación de la especificación suministrada el 24 de septiembre de 2026. La interfaz está en `/cubicaciones` y reutiliza la sesión OAuth y el conector Autodesk existentes. No llama a un LLM.

## Disponible

- Selección de cuenta/proyecto real; catálogo único de las 12 especialidades solicitadas, sin clasificación Interior/Exterior.
- Configuración compartida dentro del proyecto; especialidad única por organización/proyecto. Conflictos de edición detectados por revisión.
- Plantillas nombradas explícitamente por el usuario, con versiones inmutables. Se crean **sin reglas**, no se inventan parámetros, categorías, unidades ni fórmulas.
- Cálculo asocia automáticamente «Cálculo base · v1» cuando no existen otras plantillas de esa especialidad en el proyecto. Su definición conserva los cuatro indicadores y agrupaciones suministrados por el usuario; `configuration` permanece `null` hasta disponer de reglas verificadas. La definición de presentación no habilita el cálculo. Al abrir un proyecto, un POST autenticado prepara las configuraciones antiguas sin plantilla. La operación es idempotente y conserva cualquier versión ya asignada; si hay una única familia existente usa su última versión, y si hay varias exige selección explícita. No copia datos entre proyectos.
- Exploración paginada de carpetas y archivos RVT reales. Lista de versiones, última publicación y vistas publicadas mediante APS. Los nombres, identificadores, fechas y enlaces se recuperan de Autodesk; se verifica pertenencia al proyecto/archivo en el servidor al guardar.
- Mesa de trabajo 20/50/30 en escritorio amplio; configuración colapsable, adaptación a notebook/tablet/móvil.
- Visor Autodesk integrado para el archivo, versión y vista seleccionados. Carga independiente de la plantilla de cubicación; navegación, zoom y controles del SDK oficial. El GUID de metadatos se resuelve mediante la relación explícita entre el recurso gráfico y su geometría padre en el manifiesto, o mediante el mismo `viewableID` publicado por Autodesk en ambos manifiestos. No se elige una vista por su nombre ni la vista predeterminada.
- Acceso al visor mediante proxy de lectura del servidor. Los tokens OAuth no se entregan al SDK: cada autorización cifrada queda ligada a la sesión y al modelo verificado, caduca y limita las rutas a recursos observados en su manifiesto. El iframe aísla estilos y estado global del SDK. Errores de acceso, publicación o geometría se presentan como errores, con opción de recarga y enlace a la versión en Autodesk.
- Selección manual de una versión nueva; conserva la vista solamente si existe el mismo identificador. El nombre no acredita equivalencia entre vistas.
- Paneles de resultados, historial y comparación preparados para ejecuciones verificadas. Estados sin configurar, lista, actualizada, desactualizada y error calculados desde la evidencia disponible. `PROCESSING` reservado al ejecutor futuro.
- Comparación determinística: nuevas/eliminadas/aumentadas/disminuidas/sin cambios, delta y porcentaje. Exige dos ejecuciones completas, trazables, de la misma organización, proyecto, especialidad, archivo y vista. Rechaza unidades incompatibles; advierte cambios de plantilla.
- Ausencia de partida se conserva como `null` en el informe. Únicamente al restar dos ejecuciones completas se trata la ausencia como cero. No hay porcentaje ante base cero o inexistente.
- Trazabilidad de proyecto, archivo, versión, vista, plantilla/versionado, motor, regla, fecha e identificadores de elementos. No se infieren correspondencias entre elementos de distintas versiones.

## Bloqueos explícitos de esta entrega

La especificación prohíbe definir reglas técnicas aún no suministradas. Por tanto:

1. **Procesar / Actualizar Cubicación permanece deshabilitado.** El servidor también responde `422 quantity_rules_required`. No se crean ejecuciones ni cantidades ficticias.
2. El visor permite examinar el modelo publicado; su visualización no acredita que se haya ejecutado una cubicación. La conexión de elementos seleccionados con partidas de resultados requiere completar el ejecutor y su contrato `ViewerBinding`.
3. El motor se conecta mediante `QuantityEngineAdapter`; falta el adaptador de extracción y la configuración validada de reglas, categorías, parámetros, filtros, agrupaciones y unidades. La interfaz no permite publicar reglas arbitrarias como validadas.
4. No hay ejecuciones reales hasta completar ese contrato. La comparación y persistencia están implementadas y probadas con fixtures **TEST**, pero no se afirma validación de cantidades de un proyecto real.
5. Las vistas listadas son las publicadas por Model Derivative, no todas las vistas del RVT original. Sin derivado, permiso o metadatos se informa indisponibilidad; no se solicita una traducción ni se escriben cambios en Autodesk.
6. La última publicación se verifica al abrir la mesa o pulsar el control de verificación. Se muestra la hora de consulta. No hay webhook ni actualización automática de resultados.

Para habilitar el primer procesamiento se debe definir una plantilla técnica concreta con evidencia de los parámetros/unidades del modelo, integrar el ejecutor determinístico y verificar que el visor y el ejecutor usan exactamente el mismo archivo, versión y vista. No se deben activar botones antes de completar esos controles.

## Datos, aislamiento y migración

`web/db/quantities.sql` crea tablas independientes `quantity_configuration`, `quantity_template_version` y `quantity_run`. Los objetos Source/Template/Result son snapshots cifrados. Los informes `QuantityComparison`/`QuantityComparisonItem` se calculan desde dos ejecuciones inmutables y conservan sus IDs; no necesitan duplicar resultados históricos en otra tabla.

- AES-256-GCM con clave de almacenamiento existente y AAD propio de cubicaciones + organización/proyecto/registro.
- Rol SQL separado `ai_forma_quantities`, RLS forzado por organización/proyecto. Cada solicitud verifica acceso vivo al proyecto Autodesk y obtiene el usuario real.
- La configuración es colaborativa para los usuarios con acceso al proyecto. Se conserva quién y cuándo guarda; no se implementan roles administrativos no definidos en esta especificación.
- Las ejecuciones y versiones de plantilla son append-only, protegidas también por triggers. La API no permite cargar resultados desde el navegador. `appendRun` es un punto de integración interno para el futuro ejecutor verificado.
- Cubicaciones **no hereda el TTL de cinco días** del historial del asistente. No hay eliminación automática ni cascada desde memoria.
- La pantalla limita el historial cargado a 500 ejecuciones del proyecto y avisa si hay más; los registros anteriores permanecen almacenados.
- Ejecutar una vez con conexión de migración: `node --env-file=work/memory-production.env scripts/migrate-quantities.mjs`. Nunca publicar archivos de entorno ni rotar la clave existente como parte de esta migración.

## Documentación oficial consultada

- [Autodesk: relaciones de versión y derivative URN](https://aps.autodesk.com/blog/get-derivative-urn-accbim360-file-viewing-it-viewer).
- [Autodesk: Items API, versiones de archivo](https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/ItemsApi.md).
- [Autodesk: Model Derivative metadata](https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/DerivativesApi.md).
- [Autodesk: proxy de Viewer](https://aps.autodesk.com/blog/proxying-forge-viewer).
- [Autodesk: Viewer e interfaz](https://get-started.aps.autodesk.com/tutorials/simple-viewer/viewer).

## Verificación

`web/tests/quantities.test.mjs`: diferencias y porcentajes, cero/ausencia, rechazo de cobertura parcial y procedencia incompleta, unidades/vistas incompatibles, estados de vigencia, vínculo de versiones/vistas APS, SQL real en PGlite, RLS, configuración compartida dentro del proyecto, duplicados, concurrencia por revisión, cifrado e inmutabilidad. Los datos sintéticos permanecen exclusivamente en pruebas.

`web/tests/quantity-viewer.test.mjs`: correspondencia de vista por identificador publicado (rechazo de nombres iguales y relaciones ambiguas), autorización cifrada ligada a sesión/versionado, caducidad, manipulación, rutas y consultas permitidas; rechazo de otros modelos, traversal y destinos arbitrarios.

Verificación en producción del visor, 24-09-2026: en la configuración existente de Cálculo del proyecto 2025.03.25 Centro Español se cargó visualmente `CES-EST-Edif_A1_RV25.rvt`, V3, vista `{3D}`. El GUID de metadatos correspondía al recurso gráfico hijo; se comprobó la relación en el manifiesto real. Esta verificación acredita la visualización, no cantidades ni cumplimiento técnico.

## Mesa ejecutiva (especificación de pantalla, 24-09-2026)

Cubicaciones dispone de un shell propio sin navegación vertical. En desktop/notebook el layout usa 100dvh, dos columnas (modelo 53% / datos 47%) y desplazamiento interno de tabla/configuración. La configuración de archivo, versión, vista y plantilla se abre en un diálogo. En anchos inferiores a 950px los paneles se apilan. La identidad BIM + IA, tipografía e iconos Lucide se conservan.

Los tres filtros de presentación son Especialidad (Hormigón, Enfierradura, Acero Galvanizado), Subespecialidad (las ocho opciones especificadas) y Piso (Todos más niveles reales de resultados). Son diferentes del catálogo de disciplinas que vincula cada configuración a un archivo y vista; no se reclasifican configuraciones antiguas ni se modifica el modelo.

Los cuatro KPI y siete columnas utilizan exclusivamente una ejecución coincidente con archivo, versión, vista y plantilla. El contrato de presentación exige groupingData.metric, specialty, subspecialty, typeName y floor explícitos, además de unidad coincidente. Sin ese mapeo se informa cobertura no disponible; nunca se deduce un material del nombre, disciplina o unidad. Las sumas y diferencias son determinísticas. Sin métricas verificadas se muestra No calculado, incluso en Totales; no se sustituye por cero. Las pruebas TEST verifican aislamiento por versión/vista/plantilla, filtros y estados desconocidos.

La selección tabla/visor se vincula exclusivamente mediante el mapa de external IDs de la misma versión del modelo. No se convierten nombres ni IDs arbitrarios en dbIds. El Viewer existente y su proxy autenticado se reutilizan; los controles nativos siguen disponibles. API contrastada con el tutorial oficial: https://autodesk-platform-services.github.io/aps-aecdm-tutorial/connection/home/.

Actualizar versión consulta la última publicación y sus vistas; cambiarla deja un borrador que se debe guardar. El historial y la comparación reutilizan QuantityRuns inmutables y el motor existente. Las variaciones KPI sólo se muestran si la ejecución comparada es la activa y ambos totales son verificables (base distinta de cero).

Actualizar cubicación sigue bloqueado mientras falten reglas y un adaptador de cálculo registrado. Exportar presenta únicamente Excel y PDF como formatos pendientes. Las notificaciones permanecen deshabilitadas: no se muestran avisos ficticios. Estas acciones no simulan éxitos ni generan archivos vacíos.
