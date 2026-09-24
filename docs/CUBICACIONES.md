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

## Inspector compacto de propiedades

El botón nativo Propiedades abre un PropertyPanel propio compacto, redimensionable y con desplazamiento interno. Consulta un elemento de la selección cada vez usando Model.getBulkProperties2([dbId], {ignoreHidden:false, needsExternalId:true}), sin propFilter ni categoryFilter. En selecciones múltiples se puede elegir el elemento a inspeccionar; no se mezclan valores de elementos diferentes. Se muestran todas las entradas recibidas sin deduplicar nombres, incluidos metadatos internos, valores crudos y unidades publicadas. El contador se deriva de la respuesta completa del SDK; el filtro de texto indica explícitamente cuándo reduce las filas visibles. Un timeout, un identificador diferente o una respuesta ausente produce un error, nunca un estado de lectura completa.

La procedencia identifica dbId y externalId y se limita al modelo/version/vista cargados. No afirma que Autodesk haya publicado todos los parámetros del RVT original, ni que se hayan leído o cubicado todos los elementos del modelo. Las propiedades heredadas se resuelven por el SDK; las referencias internas no se interpretan como cantidades. Los callbacks obsoletos se descartan cuando cambia la selección. El canvas conserva la gestión de densidad de píxeles del SDK, separada del tamaño de la interfaz.

API y comportamiento contrastados en el código oficial de Viewer 7.119.0 (viewer3D.js: Model.getBulkProperties2, PropDbLoader.getBulkProperties2, PropertyDatabase.getObjectProperties, PropertiesManagerExtension.setPanel) y https://aps.autodesk.com/blog/adding-custom-properties-property-panel. Pruebas: quantity-properties.test.mjs y quantity-viewer.test.mjs.

## Clasificación solicitada el 24-09-2026 y guardado

Guardar configuración permite volver a verificar y guardar la fuente aunque no existan cambios, sin depender de reglas de cálculo. Los errores aparecen dentro del diálogo y el éxito se confirma tras la respuesta del servidor.

El visor de Cálculo aplica reglas versionadas en `web/public/quantity-classification.js`: Hormigón por Especialidad = Hormigón **o** Sub Especialidad en la lista literal recibida; Enfierradura exige Especialidad = Enfierradura; Acero Galvanizado/Metalcon exige Especialidad = Acero Galvanizado. La condición OR permite pertenecer a más de un filtro, sin generar ni duplicar cantidades. La versión 2 incorpora las asociaciones solicitadas por el usuario: Losa Fundación/Losa Fund/Losa Fun (con o sin «de») → Fundaciones; Viga Fundación/Viga Fund/Viga Fun → Vigas de Fundación; singular/plural de Losas, Muros, Pilares, Emplantillado y Enfierradura; abreviaturas controladas de Acero Galvanizado. Se normalizan mayúsculas, espacios, acentos y separadores. Las coincidencias abarcan el nombre completo: no se usa similitud difusa ni coincidencia parcial de palabras. Los rótulos no reconocidos quedan sin asociación.

Se inspeccionan objetos con geometría de la vista publicada en lotes de 400, excluyendo registros de tipo/padres sin geometría. La clasificación se conserva sólo durante la vida de ese visor. Una lectura incompleta o nombres de parámetros con valores contradictorios no se presentan como clasificación completa. Los datos de clasificación no se guardan como QuantityRun.

Moldaje permanece visible con Todas/Hormigón y se oculta con Enfierradura/Acero Galvanizado. La clasificación no define los parámetros numéricos ni sus unidades. Se habilitó el motor de sumas de vista descrito abajo para Volumen de Hormigón y Longitud de Acero Galvanizado. Siguen pendientes Moldaje, Fe y el motor de ejecuciones persistidas en servidor. El endpoint process histórico conserva su bloqueo; las sumas de vista no se presentan como QuantityRun.

Los filtros de visor y tabla comparten el mismo catálogo de asociaciones; el selector muestra sólo grupos canónicos. La tabla conserva los textos originales de resultados históricos y no reescribe cantidades ni versiones. La paleta de propiedades muestra en Procedencia el texto original, grupo asociado y versión del criterio. Las asociaciones también se pueden consultar en Configurar fuente BIM.

## Cubierta, visibilidad y sumas de vista (criterio v3)

Reglas por Nombre de tipo con prioridad: 40CA085, Viga Perfil y Metalcon (tokens completos, admitiendo sufijos) → Cubierta / Acero Galvanizado. PL OSB, Placa(s) OSB y Tablero(s) OSB → Cubierta / Placas de techumbre. Un tipo que satisface ambas reglas se considera ambiguo. Los tipos de Cubierta no heredan la pertenencia previa a Hormigón.

Procesar Cubicación / Actualizar cubicación ejecutan `published-view-quantities-v1` en el visor autenticado de la fuente seleccionada. Se leen todos los propietarios de geometría mediante el SDK y se suman únicamente Volumen publicado en m³ para la clasificación de Hormigón y Longitud publicada en metros para Acero Galvanizado. No se calculan cantidades a partir del nombre del tipo, geometría visual, peso teórico ni dimensiones inferidas. La longitud se muestra como ml. Unidades explícitas del SDK o símbolos métricos requeridos; no se convierten unidades desconocidas. Parámetros duplicados, unidades ausentes, valores no numéricos/negativos e identificadores externos duplicados quedan pendientes.

Cada lectura conserva dbId, externalId si existe, parámetro, categoría, valor original y unidad, fuente URN/vista, fecha, motor y versión de regla. Un total completo exige todos los valores de sus elementos elegibles; de lo contrario se muestra No calculado y sólo un subtotal identificado en Cobertura. Los filtros usan las mismas reglas en visor y datos. Pisos con múltiples valores de Nivel distintos se muestran como Piso no verificado.

La transmisión entre iframe y mesa valida mismo origen, ventana, URN, vista, requestId y esquema. Cambiar archivo/versión/vista descarta la presentación anterior. Las sumas se conservan en esta sesión de la mesa y NO se guardan en el historial; no permiten comparación histórica como si fueran QuantityRuns.

Aislar selección, Ocultar selección y Mostrar todo operan sobre la selección nativa del visor. Son cambios de visibilidad, no cambios del conjunto sumado. La sincronización de selección ya no reaplica el filtro sobre cada clic nativo, evitando deshacer una ocultación manual.

## Criterios v4 y filtros enlazados

- Metalcon, Metlcon y variantes con sufijos de perfil se asocian a Cubierta / Acero Galvanizado, también cuando aparecen en Especialidad o Sub Especialidad. Las placas de techumbre pertenecen a Cubierta. Los valores originales no se modifican.
- Nombre de tipo V xx/yy se asocia a Vigas; conserva la especialidad demostrada por los parámetros originales.
- Las opciones de los tres filtros se obtienen de los elementos con geometría de la vista (incluidos elementos sin métrica calculada). Cada lista aplica los otros dos filtros; los pisos contradictorios permanecen como Piso no verificado.
- Aplicar un filtro selecciona sus dbIds reales, incluyendo el piso. No oculta automáticamente. Aislar selección oculta el resto; Atenuar resto lo muestra atenuado; Ocultar selección oculta los seleccionados; Mostrar todo restaura la visibilidad. Estas acciones no cambian las sumas.
- El inventario se comparte sólo desde el iframe de la versión/vista activa y se valida antes de poblar las listas. Se reutiliza la lectura de propiedades de esa vista.
