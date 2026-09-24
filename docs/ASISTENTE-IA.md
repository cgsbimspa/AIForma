# Asistente IA y explorador Forma

El área principal de `/asistente` se divide en un explorador izquierdo y un chat derecho. La navegación lateral se conserva. En pantallas estrechas se apilan ambos paneles.

## Datos y alcance

- Lectura real de Forma Data Management (Autodesk Docs/ACC) mediante APS Data Management v1: cuentas, proyectos, carpetas raíz, subcarpetas y nombres de archivos. No incluye todas las APIs de Forma Site Design. La búsqueda documental descarga de forma temporal los originales permitidos para extraer texto.
- Los proyectos de cada cuenta se cargan al abrir el explorador. Las carpetas se consultan al expandirlas; las páginas adicionales se muestran con «Cargar más». El filtro sólo cubre los proyectos ya cargados.
- «Toda mi base de Forma» consulta únicamente lo accesible al usuario autenticado. Elegir un proyecto limita las herramientas del asistente a ese proyecto en el servidor; cambiar el alcance cancela la consulta y vacía la conversación anterior.
- El círculo junto a cada carpeta o archivo permite limitar la consulta: una carpeta incluye sus descendientes; un archivo lee sólo ese documento. La flecha expande sin cambiar el alcance. La ruta seleccionada se muestra sobre el chat y en el explorador. La selección es de una ubicación a la vez.
- Antes de iniciar una consulta limitada, el servidor reconstruye y verifica la ruta completa con listados actuales de Autodesk, incluida la paginación. Los listados de ancestros sólo verifican pertenencia; sus otros documentos no se buscan ni se descargan. Una ubicación movida, eliminada o no verificable exige actualizar y volver a seleccionar. El cursor conserva ese alcance y no permite ampliarlo al continuar.
- Se conservan endpoint, proyecto, página, fecha de consulta, número de elementos devueltos, páginas pendientes y advertencias. Una advertencia de Autodesk se muestra como lista parcial; un error nunca se interpreta como lista vacía.
- La cuenta Autodesk debe habilitar la aplicación APS y permitir acceso al usuario. Una respuesta 403 se informa sin inventar proyectos.

## OpenAI

Variables privadas adicionales: `OPENAI_API_KEY`, `OPENAI_MODEL` (por defecto `gpt-5-mini`). Se reutiliza la configuración de Nexo AI sin modificar ese proyecto. No se exponen claves ni tokens Autodesk en el cliente o los mensajes enviados a OpenAI.

La API Responses recibe la consulta, un historial limitado y metadatos necesarios. Usa `store:false`, razonamiento medium, hasta 10 llamadas de herramientas por consulta y 4096 tokens de salida por llamada. La conversación vive en memoria del navegador y no se persiste en esta aplicación. `store:false` no equivale a retención cero por parte del proveedor.

Para respetar los principios del proyecto, el modelo navega y selecciona registros verificados; el servidor genera los nombres, tipos, listas y conteos mostrados a partir de los resultados APS. Una fuente o ID inventado invalida la respuesta. Las solicitudes para buscar documentos o texto se derivan al motor de búsqueda descrito abajo. Las propiedades BIM, normativa y cubicaciones que requieren cálculo o validación siguen sin implementarse.

## Protección y límites

OAuth solicita `user-profile:read data:read`. Las sesiones de la versión anterior necesitan nuevo consentimiento. Cookies cifradas HttpOnly; vida máxima una hora. Sin refresh token. Endpoints privados sin caché. Chat exige POST del mismo origen y limita el tamaño de cuerpo/historial, las iteraciones y la duración. Tokens exclusivamente en servidor, sin logs de credenciales o datos de proyecto.

La paginación valida origen, ruta y avance; nunca reenvía el token a URLs suministradas por la respuesta. El asistente sólo desciende a registros descubiertos en el turno actual. No existen herramientas de escritura ni borrado de datos en Autodesk. La descarga temporal de originales queda confinada al servidor.

## Comprobación

`npm test`, `npm run lint`, `npm run typecheck` y `npm run build`. Pruebas con fixtures identificados como TEST para permisos, paginación insegura, errores, IDs inventados, proyecto seleccionado y contrato Responses. El usuario completó el consentimiento de lectura y el explorador se comprobó conectado con cuentas y proyectos reales.

Fuentes técnicas: [Data Management APS](https://aps.autodesk.com/data-management-api), [Hubs Browser oficial](https://get-started.aps.autodesk.com/tutorials/hubs-browser/data), [Function calling de OpenAI](https://developers.openai.com/api/docs/guides/function-calling), [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses). Rutas y paginación contrastadas con el SDK APS ya utilizado en Nexo AI.

## Búsqueda recursiva y texto documental

OpenAI interpreta la consulta en grupos de términos visibles. El servidor recorre todas las subcarpetas y páginas accesibles del alcance elegido; prioriza rutas coincidentes y continúa con el resto. Busca en nombres, rutas y texto extraído con normalización de mayúsculas, tildes y separadores. No hay un índice persistente ni búsqueda semántica sobre documentos; las variantes de términos propuestas por la IA se muestran al usuario.

Formatos: PDF con capa de texto (página), DOCX (párrafo extraído), XLSX (hoja, fila y celdas), TXT/MD (línea) y CSV (registro). Máximo 25 MB por original, 1000 páginas PDF, 2 millones de caracteres y 20 segundos por extracción. Los PDF escaneados sin texto se identifican como OCR requerido; no se simula reconocimiento. Un nombre/ruta coincidente no se presenta como coincidencia dentro del contenido.

Cada archivo leído se vincula al item y la versión devueltos por el endpoint tip. Se muestran ruta completa, versión, endpoint, fecha, enlace web oficial cuando Autodesk lo proporciona y hasta cuatro fragmentos exactos encontrados. Las URLs firmadas S3 nunca salen del servidor ni reciben el bearer Autodesk. El parser corre aislado, sin las variables de credenciales, con memoria/tiempo limitados y borrado del temporal privado.

La búsqueda avanza en lotes y entrega coincidencias progresivas. Los cursores cifrados AES-GCM contienen la cola, alcance, términos, progreso y hash de la sesión; no contienen tokens de acceso ni texto documental. Están ligados a la sesión y vencen con ella. Se puede detener y continuar; cambiar de proyecto cancela y limpia el estado. Tras 15 lotes automáticos aparece Continuar si queda trabajo. Se muestran hasta 500 coincidencias y 100 ejemplos de problemas; los contadores preservan el total de hallazgos del recorrido.

Los límites de 20000 entradas/6000 tareas pendientes o de tamaño del cursor, los permisos, errores y archivos no legibles producen cobertura parcial explícita. Ninguna lista parcial permite afirmar que no existen coincidencias en todo el alcance. Las búsquedas consultan versiones disponibles al momento de lectura, no una instantánea transaccional de Autodesk.

El paquete de extracción se compila antes de Next.js con esbuild. La función de búsqueda incluye el worker, PDF.js y sus dependencias nativas mediante output tracing. Pruebas adicionales cubren lectura real de formatos con fixtures TEST, subcarpetas/paginación, coincidencia sólo en contenido, rutas, versiones, enlaces, SSRF, aislamiento de cursores y permisos.
