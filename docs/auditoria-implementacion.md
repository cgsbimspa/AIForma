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

La primera entrega ejecuta identificación disponible, inventarios de niveles/ejes publicados, duplicidad exacta de nombres, parejas de niveles con elevaciones de unidades explícitas y tolerancia confirmada, referencias verticales según catálogo, inventarios de offsets y distribución por referencia. Una referencia superior configurada también debe estar disponible. No se equiparan N2/Piso 2, no se consideran inexistentes los niveles que no aparecen en la vista y los offsets no generan FAIL automático.

Los métodos, intencionalidad de ejes, geometría, nomenclaturas, excepciones o datos no definidos permanecen NOT EVALUATED. Una advertencia no se convierte en incumplimiento. G05–G08 cuentan con matriz y resultados explícitos de disponibilidad, sin fingir motores geométricos ni capacidad de leer warnings/worksets/solidez BRep no expuestos. D01–D08 y Comparaciones son estructura de expansión, Por Configurar.

La conformidad se calcula por reglas con resultados evaluativos; sólo PASS, WARNING y FAIL participan. NOT EVALUATED, INFORMATION y N/A no penalizan, incluso en una regla parcialmente evaluada. Siempre se presenta cobertura, pendientes y cantidad de controles al lado del porcentaje. No equivale a certificación de cumplimiento integral.

## Persistencia y seguridad

Migración aditiva `web/db/audit.sql`, ejecutable con `scripts/migrate-audit.mjs`. Rol independiente sin permisos UPDATE/DELETE, RLS por organización/proyecto, catálogos de empresa visibles sólo en la misma organización. Configuraciones y catálogos generan revisiones con comprobación de concurrencia; auditorías generan UUID independiente. Payloads y etiquetas se cifran con la clave existente, asociando organización, proyecto e identificador al cifrado autenticado.

Cada ejecución conserva fuente, inventario recibido, matriz completa, configuración, catálogos, tolerancias, motor, fecha, usuario, resultados, observados/esperados y elementos. No tiene TTL de conversaciones. Las respuestas de interfaz resumen conjuntos extensos, indicando total; el detalle pagina elementos y las acciones del visor usan todos los externalId verificados del hallazgo. Los filtros usan facetas del conjunto completo.

Hallazgo no equivale a incidencia: el botón guarda una solicitud explícita trazada, estado PENDING_REVIEW_INTEGRATION, e informa que todavía no se ha publicado una incidencia en Review.

## Verificación

Fixtures exclusivamente TEST: límites de vista, nodos agrupadores, propiedades directas/anidadas, ambigüedad, ausencia de datos, tolerancias y unidades, mapeo base/superior, puntuación, N/A de MEP, API pendiente, cifrado, aislamiento entre proyectos/organizaciones, herencia y revisiones inmutables. Compilación TypeScript/Next y lint de los archivos afectados.

La categoría también puede proceder del árbol publicado, con etiqueta exacta del catálogo y una sola coincidencia en sus ancestros. Se conserva la ruta y el endpoint del árbol como evidencia; un nombre de instancia o una ruta ambigua no clasifica el elemento. Referencia del proveedor: https://www.autodesk.com/support/technical/article/caas/tsarticles/ts/7mkuSf30eQ0mX8fJZAlUOg.html
