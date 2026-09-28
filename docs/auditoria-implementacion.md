# AUDITORÍA — primera entrega funcional

Fuente de requisitos: [especificación proporcionada por el usuario](auditoria-especificacion.txt), 27-09-2026.

## Navegación

El módulo conserva la barra izquierda de la plataforma. Las rutas `/auditoria-bim/*` separan resumen, proyecto/vista, referencias verticales, tolerancias, matriz, contexto, capítulos 3D, datos y hallazgos. La configuración no ocupa el espacio del visor. Los grupos del submenú se expanden y el enlace activo identifica la ubicación.

## Fuente y alcance

El servidor verifica acceso Autodesk al proyecto, cadena de carpetas, archivo RVT, versión y GUID de vista 3D con el conector existente. Recupera árbol y propiedades del GUID específico mediante Model Derivative y cruza ambos por objectid. Sólo se consideran hojas publicadas del árbol de esa vista; los agrupadores y filas ajenas al árbol se excluyen. No se expande el alcance al RVT. La población publicada puede no incluir niveles, ejes ni contenido no visible del archivo; su ausencia en esta respuesta nunca prueba ausencia en Revit.

API comprobada: [Autodesk, consulta de propiedades por vista](https://aps.autodesk.com/blog/advanced-query-model-derivative-api), [jerarquía y forceget](https://aps.autodesk.com/blog/faster-get-hierarchy-api-and-how-solve-error-413). Las propiedades pueden ser hijos directos o grupos anidados. No se confunde objectid de APS con Element ID nativo. Se conserva externalId para localizar el objeto en el visor de la misma versión/vista.

Respuesta 202, errores, datos ambiguos y límites de lectura no producen una auditoría vacía aparentemente válida. La lectura actual admite 80 MiB por respuesta y 150.000 registros; superar límites se informa. No se incluyen tokens en respuestas, evidencia ni almacenamiento.

## Motor y criterios

La matriz completa G01–G08 reside en `web/lib/audit/catalog.ts`; la interfaz no define reglas técnicas. Las 20 tolerancias iniciales valen 0 y están Por Configurar. GLOBAL → COMPANY → PROJECT aplica precedencia explícita, con fuente requerida para confirmar un criterio. Restaurar un criterio quita el override de esa capa y recupera su herencia. Los valores de cubicaciones no se transfieren a Auditoría.

La primera entrega ejecuta identificación disponible, inventarios de niveles/ejes publicados, duplicidad exacta de nombres de niveles, parejas de niveles con elevaciones de unidades explícitas y tolerancia confirmada, referencias verticales según catálogo, inventarios de offsets y distribución por referencia. Una referencia superior configurada también debe estar disponible. No se equiparan N2/Piso 2, no se consideran inexistentes los niveles que no aparecen en la vista y los offsets no generan FAIL automático.

Los métodos, intencionalidad de ejes, geometría, nomenclaturas, excepciones o datos no definidos permanecen NOT EVALUATED. Una advertencia no se convierte en incumplimiento. G05–G08 cuentan con matriz y resultados explícitos de disponibilidad, sin fingir motores geométricos ni capacidad de leer warnings/worksets/solidez BRep no expuestos. D01–D08 y Comparaciones son estructura de expansión, Por Configurar.

La conformidad se calcula por reglas con resultados evaluativos; sólo PASS, WARNING y FAIL participan. NOT EVALUATED, INFORMATION y N/A no penalizan, incluso en una regla parcialmente evaluada. Siempre se presenta cobertura, pendientes y cantidad de controles al lado del porcentaje. No equivale a certificación de cumplimiento integral.

## Persistencia y seguridad

Migración aditiva `web/db/audit.sql`, ejecutable con `scripts/migrate-audit.mjs`. Rol independiente sin permisos UPDATE/DELETE, RLS por organización/proyecto, catálogos de empresa visibles sólo en la misma organización. Configuraciones y catálogos generan revisiones con comprobación de concurrencia; auditorías generan UUID independiente. Payloads y etiquetas se cifran con la clave existente, asociando organización, proyecto e identificador al cifrado autenticado.

Cada ejecución conserva fuente, inventario recibido, matriz completa, configuración, catálogos, tolerancias, motor, fecha, usuario, resultados, observados/esperados y elementos. No tiene TTL de conversaciones. Las respuestas de interfaz resumen conjuntos extensos, indicando total; el detalle pagina elementos y las acciones del visor usan todos los externalId verificados del hallazgo. Los filtros usan facetas del conjunto completo.

Hallazgo no equivale a incidencia: el botón guarda una solicitud explícita trazada, estado PENDING_REVIEW_INTEGRATION, e informa que todavía no se ha publicado una incidencia en Review.

## Verificación

Fixtures exclusivamente TEST: límites de vista, nodos agrupadores, propiedades directas/anidadas, ambigüedad, ausencia de datos, tolerancias y unidades, mapeo base/superior, puntuación, N/A de MEP, API pendiente, cifrado, aislamiento entre proyectos/organizaciones, herencia y revisiones inmutables. Compilación TypeScript/Next y lint de los archivos afectados.

La categoría también puede proceder del árbol publicado, con etiqueta exacta del catálogo y una sola coincidencia en sus ancestros. Se conserva la ruta y el endpoint del árbol como evidencia; un nombre de instancia o una ruta ambigua no clasifica el elemento. Referencia del proveedor: https://www.autodesk.com/support/technical/article/caas/tsarticles/ts/7mkuSf30eQ0mX8fJZAlUOg.html

Los inventarios G05-A01, G06-A01 y G06-A03 agrupan categorías, familias y tipos publicados, manteniendo NOT EVALUATED para los datos ausentes. G08-A01 registra la ficha de fuente/cobertura sin certificar salud del modelo. El detalle de cada hallazgo es una sub-vista con retorno a resultados.

## Lectura ampliada de grillas · motor y matriz 1.1.0

El inventario G04 consulta nodos de referencia del árbol completo de la vista, incluidos padres, y los archivos `Autodesk.AEC.ModelData` descubiertos en el manifiesto de la versión autorizada. Primero consulta Model Derivative y, si no hay un recurso AEC, el manifiesto del Viewer. No busca nombres de archivos por aproximación ni descarga URLs arbitrarias. Sólo envía autorización a `developer.api.autodesk.com`, con redirecciones deshabilitadas. Los datos AEC complementan la población de la vista; no se suman como elementos únicos ni se presentan como visibles en la vista.

Fuentes verificadas: [estructura AEC de grillas y documentos vinculados](https://aps.autodesk.com/blog/consume-aec-data-which-are-model-derivative-api), [descubrimiento de AEC en el manifiesto](https://aps.autodesk.com/blog/mapping-between-sheets-and-3d-views-aec-models), [endpoint de descarga de un derivado](https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/DerivativesApi.md). Se conservan `id`, `label`, `document`, `segments.guid`, `segments.type` y extremos XYZ publicados. El código numérico de tipo no se traduce sin una equivalencia comprobada. No se inventan dbIds, Element ID ni instancias de vínculo a partir de esos datos.

G04-A01/A02 incluyen las fuentes disponibles; A03 muestra códigos originales; A04 calcula el ángulo XY de la cuerda entre extremos, módulo 180 grados; A05 muestra las coordenadas originales, sin inferir unidades. No se calcula tangencia de curvas a partir de sus extremos. G04-B01 agrupa candidatos por documento y nombre exactos, únicamente informativos: dos vínculos con el mismo nombre de eje no son automáticamente un error, y el campo `document` por sí solo no resuelve instancias repetidas. No se certifican coincidencias, excentricidades ni distancias entre modelos sin unidades, transformaciones, correspondencias y criterios confirmados.

En Grillas hay sub-vistas Inventario, Geometría y Cobertura, búsqueda sin distinguir mayúsculas/acentos por nombre/ID/documento/ruta, filtro de origen y paginación de 100 registros. La evidencia muestra fuente, fecha y cobertura. Las auditorías anteriores siguen inmutables y muestran «AEC aún no consultado»: es necesario ejecutar otra auditoría para usar el nuevo lector.

La lectura suplementaria comparte un presupuesto de 25 segundos, máximo 8 archivos AEC, 20.000 registros por archivo y 1.000 segmentos por grilla. Ausencia del campo `grids`, errores, límites o segmentos incompletos producen estado explícito, y no se pierde la lectura válida de la vista. Los errores de autenticación siguen requiriendo una sesión válida. Las pruebas TEST cubren origen, duplicados, geometría incompleta, ángulos, manifiestos, límites de alcance, caída de AEC y conservación de evidencia, además de la suite de auditoría existente.

## Lectura ampliada de niveles (motor y reglas 1.2.0)

G03-A01 incorpora `levels` de los mismos archivos AEC recuperados para grillas, sin nuevas descargas. Conserva GUID, nombre, elevación, altura y flags publicados (planta, estructural, terreno, planos asociados); incluye cotas cero/negativas y niveles con buildingStory=false. Inspecciona los registros `linkedDocuments` incluidos en el payload: únicamente registra niveles cuando existe su campo `levels`; no copia niveles anfitriones a vínculos ni recorre otros RVT. Cada registro retiene documento, ruta exacta dentro del payload, endpoint y fecha. Límites: 20.000 niveles, 2.000 documentos y profundidad 16 por archivo.

La sub-vista Niveles tiene Inventario y Cobertura, búsqueda sin distinguir mayúsculas/acentos, filtro por origen, evidencia y páginas de 100 registros. Diferencia campo ausente, colección vacía, registros inválidos e informes anteriores. Las elevaciones AEC numéricas conservan sus unidades originales no verificadas; sólo las propiedades con unidad explícita reconocida se convierten a metros. No se asigna dbId, piso, unidad o transformación por similitud. El valor especial de altura 2147483647 no se presenta como una altura física calculada.

G03-B01 añade candidatos informativos por nombres idénticos dentro del mismo origen AEC, sin confundir nombres de distintos vínculos. Los controles de correspondencia vertical y separación mantienen sus requisitos de evidencia y tolerancias; leer niveles AEC no certifica por sí solo cumplimiento ni habilita asignaciones automáticas de pisos. Los registros suplementarios no inflan la población de elementos de la vista. Los informes anteriores permanecen inmutables: para ampliar su lectura hay que ejecutar una nueva auditoría.

Referencias de campos: https://aps.autodesk.com/blog/add-revit-levels-and-2d-minimap-your-3d y https://aps.autodesk.com/blog/consume-aec-data-which-are-model-derivative-api . Pruebas TEST: cotas negativas/cero, flags falsos, orígenes vinculados, lectura parcial, unidades explícitas, límites, reutilización de descarga, trazabilidad y compatibilidad con informes anteriores.
