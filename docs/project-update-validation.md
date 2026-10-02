# Actualización funcional — verificación

## Comprobaciones iniciales

- 242 pruebas Node/PGlite completadas sin fallos, incluyendo tres pruebas nuevas del contexto/configuración e historial.
- TypeScript sin errores; ESLint sin errores ni advertencias tras las correcciones.
- Build Next.js de producción correcto con `/configuracion`, `/consultar-ia` y las APIs de configuración e historial.
- Migración aditiva `projects.sql` aplicada al almacenamiento existente. Conserva datos y tablas previos.
- Navegador local: carga Inicio, menú simplificado y contexto Autodesk desconectado real; no se introdujeron sesiones ficticias.

## Prueba real Centro Español

Prueba en producción del 01-10-2026, con sesión real de Autodesk:

- AEC Shift → 2025.03.25 Centro Español. Se recuperó y guardó la fuente existente de Estructura: `CES-EST-Edif_A1_RV25.rvt`, V3, vista `{3D}`. Autodesk verificó esa selección; no se modificó el archivo RVT.
- Auditoría recibió la fuente compartida sin pedir nuevamente archivo ni vista. El primer intento informó `audit_derivative_pending`; al reintentar se guardó la revisión del 01-10-2026 22:10:10 (Chile): 1.723 elementos, 10 niveles AEC y 31 grillas AEC. Resultados: 78 comprobaciones no evaluadas y 30 informativas, sin comprobaciones PASS/WARNING/FAIL/NOT_APPLICABLE. La lectura correcta no implica cumplimiento técnico: siguen faltando entradas o reglas para esas comprobaciones.
- Cubicaciones abrió la misma fuente y leyó 1.723 elementos. La captura quedó persistida con motor `view-quantities-v2.5`, revisión de configuración 2, fecha 01-10-2026 21:59:48 (Chile). Se abrió el historial y se verificó su presencia.
- Consultar IA recibió esa fuente: 1.723 elementos geométricos y un catálogo de 100 campos. Abrir, cerrar, maximizar y restaurar el visor conserva la conversación. La consulta BIM de producción identificó `ai_auth_failed`: OpenAI rechaza las credenciales o permisos del servidor, aunque Autodesk y el catálogo están disponibles. El modelo configurado es `gpt-5-mini`, cuya compatibilidad se verificó con la integración local; esto no valida la credencial de producción. La sustitución de `OPENAI_API_KEY` quedó preparada en Vercel para el usuario. Falta repetir las consultas BIM y documental después del guardado y nuevo despliegue; no se afirma aceptación de respuestas IA.
- Cambio a Distrito Verde: se limpió la especialidad y no se mostró la fuente de Centro Español en el contexto del nuevo proyecto.
- Navegación compacta en la ventana integrada de 435 px y configuración publicada en Chrome a 1.920 px. Se validó la configuración desde la interfaz: versión actual verificada. Captura local: `web/work/configuracion-centro-espanol-publicada.jpg`. Sin errores de consola observados en la comprobación de escritorio. No se afirma una aceptación visual exhaustiva de todas las pantallas heredadas.

La conversación BIM se conserva durante la navegación de esta sesión, separada por usuario, proyecto, archivo, versión y vista; expira como máximo a los cinco días de su creación y se borra con Nueva conversación. No se persiste como conocimiento técnico.

## Límites conocidos

### Restablecimiento de OpenAI — 01-10-2026, 23:21–23:28 (Chile)

- El usuario actualizó `OPENAI_API_KEY` de Production; despliegue Vercel `9yp3M8d1p4kutmE245TVht6qnzjM` Ready, asociado a `app.cgsbim.cl`. No se leyó ni registró la clave.
- Consulta BIM real «Muéstrame las vigas»: 312 coincidencias sobre 1.723 elementos geométricos del archivo de Estructura V3. Evidencia visible: categoría `Revit Structural Framing`, ejemplos Concrete-Rectangular Beam y enlace a la versión Autodesk. Esto verifica el filtro de categoría aplicado, no una auditoría independiente de todos los tipos estructurales.
- Búsqueda documental real: encontró carpetas Órdenes de Compra DS 19 / DS 49 y Resumen OC, con rutas y enlaces; búsqueda terminada. La consulta de contenido de carpeta recuperó sus diez subcarpetas.
- Lectura de `OC1-CE-BIM.pdf`: 1 documento con texto leído de 1 procesado mediante OCR. Pregunta por subtotal respondió que no podía confirmar el dato con respaldo suficiente. La autenticación quedó restablecida; esta prueba no valida la extracción correcta del subtotal y conserva ese pendiente.
- Evidencia de interfaz local: `web/work/ia-restablecida-bim.jpg`.

### Pendientes funcionales

- Consultas a informes guardados: recuentos y acceso a evidencia; la síntesis conversacional transversal no está implementada.
- Un Bridge/Direct no disponible permanece pendiente; no se generan ni comparan datos de ejemplo.
- Capturas de cubicación: máximo 2,8 MB comprimidos por solicitud; lectura original limitada a 100 MB al descomprimir. Los errores de guardado se muestran y conservan la lectura temporal.
- No se consolida un total de errores críticos de ejecuciones históricas incompatibles.
- Inicio muestra modelos configurados y recuentos reales de ejecuciones. Quedan pendientes los indicadores técnicos consolidados y la cronología completa de actividad de la especificación.
- Las capturas persistidas se identifican como `VIEWER_CAPTURE`: el servidor valida fuente, estructura y agregación determinística; no vuelve a extraer independientemente todas las propiedades Autodesk recibidas del visor.
