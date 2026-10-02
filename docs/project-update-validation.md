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
- Auditoría recibió la fuente compartida sin pedir nuevamente archivo ni vista. La ejecución informó `audit_derivative_pending`: la API de propiedades de Autodesk devolvió preparación pendiente. No se guardó un informe ficticio.
- Cubicaciones abrió la misma fuente y leyó 1.723 elementos. La captura quedó persistida con motor `view-quantities-v2.5`, revisión de configuración 2, fecha 01-10-2026 21:59:48 (Chile). Se abrió el historial y se verificó su presencia.
- Consultar IA recibió esa fuente y leyó un catálogo de 100 campos. Abrir y cerrar el visor conservó la pregunta. La primera llamada a OpenAI falló (`ai_unavailable`); se dejó explícito `OPENAI_MODEL=gpt-5-mini` en producción después de verificar una respuesta HTTP 200/completed con la integración. Falta verificar la consulta BIM tras el nuevo despliegue.
- Cambio a Distrito Verde: se limpió la especialidad y no se mostró la fuente de Centro Español en el contexto del nuevo proyecto.
- Navegación compacta en la ventana integrada de 435 px; la verificación local anterior cubrió escritorio. No se afirma una aceptación visual exhaustiva de todas las pantallas heredadas.

La conversación BIM se conserva durante la navegación de esta sesión, separada por usuario, proyecto, archivo, versión y vista; expira como máximo a los cinco días de su creación y se borra con Nueva conversación. No se persiste como conocimiento técnico.

## Límites conocidos

- Consultas a informes guardados: recuentos y acceso a evidencia; la síntesis conversacional transversal no está implementada.
- Un Bridge/Direct no disponible permanece pendiente; no se generan ni comparan datos de ejemplo.
- Capturas de cubicación: máximo 2,8 MB comprimidos por solicitud; lectura original limitada a 100 MB al descomprimir. Los errores de guardado se muestran y conservan la lectura temporal.
- No se consolida un total de errores críticos de ejecuciones históricas incompatibles.
