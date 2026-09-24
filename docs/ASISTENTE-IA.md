# Asistente IA y explorador Forma

El área principal de `/asistente` se divide en un explorador izquierdo y un chat derecho. La navegación lateral se conserva. En pantallas estrechas se apilan ambos paneles.

## Datos y alcance

- Lectura real de Forma Data Management (Autodesk Docs/ACC) mediante APS Data Management v1: cuentas, proyectos, carpetas raíz, subcarpetas y nombres de archivos. No incluye todas las APIs de Forma Site Design ni descarga o interpreta contenido documental.
- Los proyectos de cada cuenta se cargan al abrir el explorador. Las carpetas se consultan al expandirlas; las páginas adicionales se muestran con «Cargar más». El filtro sólo cubre los proyectos ya cargados.
- «Toda mi base de Forma» consulta únicamente lo accesible al usuario autenticado. Elegir un proyecto limita las herramientas del asistente a ese proyecto en el servidor; cambiar el alcance cancela la consulta y vacía la conversación anterior.
- Se conservan endpoint, proyecto, página, fecha de consulta, número de elementos devueltos, páginas pendientes y advertencias. Una advertencia de Autodesk se muestra como lista parcial; un error nunca se interpreta como lista vacía.
- La cuenta Autodesk debe habilitar la aplicación APS y permitir acceso al usuario. Una respuesta 403 se informa sin inventar proyectos.

## OpenAI

Variables privadas adicionales: `OPENAI_API_KEY`, `OPENAI_MODEL` (por defecto `gpt-5-mini`). Se reutiliza la configuración de Nexo AI sin modificar ese proyecto. No se exponen claves ni tokens Autodesk en el cliente o los mensajes enviados a OpenAI.

La API Responses recibe la consulta, un historial limitado y metadatos necesarios. Usa `store:false`, razonamiento medium, hasta 10 llamadas de herramientas por consulta y 4096 tokens de salida por llamada. La conversación vive en memoria del navegador y no se persiste en esta aplicación. `store:false` no equivale a retención cero por parte del proveedor.

Para respetar los principios del proyecto, el modelo navega y selecciona registros verificados; el servidor genera los nombres, tipos, listas y conteos mostrados a partir de los resultados APS. Una fuente o ID inventado invalida la respuesta. Las preguntas sobre contenido de archivos, propiedades BIM, normativa o cubicaciones se informan como no disponibles. El chat es inicialmente un asistente de navegación y consulta de estructura, no un motor de análisis documental.

## Protección y límites

OAuth solicita `user-profile:read data:read`. Las sesiones de la versión anterior necesitan nuevo consentimiento. Cookies cifradas HttpOnly; vida máxima una hora. Sin refresh token. Endpoints privados sin caché. Chat exige POST del mismo origen y limita el tamaño de cuerpo/historial, las iteraciones y la duración. Tokens exclusivamente en servidor, sin logs de credenciales o datos de proyecto.

La paginación valida origen, ruta y avance; nunca reenvía el token a URLs suministradas por la respuesta. El asistente sólo desciende a registros descubiertos en el turno actual. No existen herramientas de escritura, borrado o descarga.

## Comprobación

`npm test`, `npm run lint`, `npm run typecheck` y `npm run build`. Pruebas con fixtures identificados como TEST para permisos, paginación insegura, errores, IDs inventados, proyecto seleccionado y contrato Responses. La comprobación real de carpetas requiere consentimiento de lectura del usuario en Autodesk.

Fuentes técnicas: [Data Management APS](https://aps.autodesk.com/data-management-api), [Hubs Browser oficial](https://get-started.aps.autodesk.com/tutorials/hubs-browser/data), [Function calling de OpenAI](https://developers.openai.com/api/docs/guides/function-calling), [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses). Rutas y paginación contrastadas con el SDK APS ya utilizado en Nexo AI.
