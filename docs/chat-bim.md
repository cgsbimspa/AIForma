# Chat BIM IA

Módulo `/chat-bim`, ubicado entre Asistente IA y Auditoría BIM. Patrón de interacción revisado en Nexo AI (`NEXO_AI_AGENT_SPEC.md`, agente y controlador del visor). Implementación adaptada al visor autenticado de AI Forma.

El usuario selecciona cuenta, proyecto, RVT, versión y vista publicada. Se reutilizan los endpoints Autodesk de navegación, versiones y visor; no se crean plantillas ni configuraciones de cubicación. El chat vive en esta sesión de la página y se descarta al cambiar de fuente o salir. Se aplica además un límite de cinco días en una página que permanezca abierta. No se escribe conocimiento técnico ni se aprenden equivalencias desde conversaciones.

La lectura recorre los nodos con geometría de la vista publicada, consulta todas sus propiedades expuestas por Autodesk en lotes y falla si faltan registros. No acredita todos los elementos del RVT original ni modelos vinculados omitidos por esa vista. Se reutilizan las asociaciones de especialidad/subespecialidad previamente definidas por el usuario, con su versión de regla. Los valores originales permanecen consultables en la paleta del visor.

OpenAI recibe la pregunta, hasta cuatro consultas previas y ejemplos acotados de propiedades observadas, con `store:false`. Solo devuelve un plan estructurado. Un motor determinista aplica los filtros a todos los elementos leídos; no se usan IDs ni cantidades sugeridos por el modelo. Mayúsculas y acentos se normalizan; los pisos se comparan literalmente. Los parámetros ausentes no se convierten en cero ni en coincidencias negativas. La búsqueda parcial por nombre se identifica como textual.

Acciones: seleccionar, aislar, atenuar el resto, ocultar, encuadrar, pintar con una paleta fija, consultar propiedades, mostrar todo, restaurar colores y limpiar selección. Son cambios locales de visualización; no se escribe en Autodesk. Los botones permiten operar sin otra consulta al LLM. Los mensajes de éxito se construyen después del reconocimiento del visor. Los resultados incluyen archivo, versión, vista, criterios, total leído, conteo y ejemplos reales; una muestra acotada no limita la acción aplicada al conjunto completo.

Cada mensaje entre página e iframe comprueba origen, ventana, URN, vista y correlación. Se rechazan repeticiones, acciones no permitidas y selecciones ajenas. Nueva conversación cancela solicitudes; cambiar de modelo desmonta el visor y descarta respuestas tardías. El endpoint autentica la sesión y verifica de nuevo pertenencia de archivo/versión/vista antes de interpretar. No hay ejecución de código generado, URLs arbitrarias ni credenciales en el navegador.

La colorización usa las APIs documentadas de Autodesk Viewer v7 `setThemingColor` y `clearThemingColors`: https://aps.autodesk.com/blog/revisiting-viewers-theming-coloring-selective-cancelling-deferred-rendering-and-recursive

Pruebas: `web/tests/bim-chat.test.mjs` cubre clasificación, normalización, pisos, datos ausentes, selección, evidencia, límites del intérprete, ejecución del visor, repetición y cancelación. Los datos TEST solo viven en pruebas. La regresión de clasificación/visor/cálculo comprueba la reutilización en Cubicaciones.
