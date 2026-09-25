# Apertura de modelos y lectura de parámetros

La apertura conserva la validación de cuenta/proyecto, toda la ruta de carpetas,
pertenencia del archivo y versión, metadatos de vista y correspondencia de GUID
en los manifiestos. El ticket cifrado sigue ligado a la sesión, versión y vista.

Las consultas de versión/metadatos se solapan con la comprobación de la ruta;
los dos manifiestos se consultan en paralelo. Los comandos de lectura no
consultan el perfil de almacenamiento: ya verifican el proyecto en Autodesk.
Las operaciones guardadas siguen resolviendo su actor y aislamiento de datos.
Las comprobaciones de sesión simultáneas comparten una operación dentro de la
pestaña y conservan el bloqueo entre pestañas para rotaciones de credenciales.

En el visor, `OBJECT_TREE_CREATED_EVENT` inicia la lectura mientras se descarga
la geometría. `GEOMETRY_LOADED_EVENT` continúa siendo la condición para activar
el cálculo geométrico. No se publica una cubicación completa antes de finalizar
la inspección. El progreso de parámetros muestra elementos recibidos/esperados.

`getBulkProperties2` conserva `ignoreHidden:false` y `needsExternalId:true`, sin
filtros de nombres/categorías. Se consultan los propietarios de geometría de la
vista, con lotes de hasta 800 elementos y máximo dos solicitudes pendientes.
Cada lote valida identidad, unicidad y presencia del arreglo de propiedades.
Una fila vacía significa que Autodesk no devolvió propiedades para ese elemento,
no que todos los parámetros del RVT estén disponibles.

Las filas completas se reutilizan únicamente para el mismo objeto Model de APS
en memoria. La paleta y las lecturas técnicas comparten esa fuente; otra vista,
versión, recarga o sesión no reutiliza esa memoria. No se añaden cachés persistentes
ni se cambian las políticas privadas del proxy. La extracción MEP usa un índice
de nombres exactos normalizados y conserva ambigüedades, unidades y valores fuente.

La apertura evita consolidar mallas de forma anticipada (`useConsolidation:false`)
y mantiene los fragmentos originales para la geometría técnica. Los visores no
se recrean por cambios de identidad de objetos React con la misma selección.
La preparación inicial dispone de un plazo de 90 s para evitar esperas indefinidas.

APIs comprobadas en la fuente del SDK de Autodesk 7.119.0 utilizada por el
proyecto: eventos de árbol/raíz/geometría, `loadDocumentNode` y opción
`useConsolidation`; no se cambia la versión de SDK ni el formato de los derivados.

Pruebas: `quantity-loading.test.mjs` cubre orden de lotes, cobertura completa,
parámetros internos/duplicados, aislamiento entre Model, reintentos tras lecturas
incompletas, validación de ruta/vista y comprobaciones de sesión simultáneas.
Las pruebas de cantidades, MEP y protocolo verifican las sumas y filtros existentes.
El tiempo real depende además del tamaño de la publicación y de la red/Autodesk;
no se establece una garantía de segundos ni un porcentaje de mejora sin medición.
