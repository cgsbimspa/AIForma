# Navegación de proyecto — actualización 2026-10-01

Empresa / Hub → Proyecto → Configuración → Auditar / Cubicar / Consultar IA.

## Menú

- Inicio: selección real de empresa/proyecto y resumen de registros disponibles.
- Configuración: especialidades, archivo, versión y vista, guardado y validación Autodesk. Recuperación explícita de fuentes de módulos anteriores; no las reemplaza automáticamente.
- Auditar: Auditoría BIM y Revisión Normativa. Las sub-vistas BIM quedan dentro de un desplegable secundario.
- Cubicar: tablero de la especialidad activa, filtros y cantidades, criterios, capturas históricas y comparación.
- Consultar IA: una entrada para documentos y modelo; rutas antiguas `/asistente` y `/chat-bim` redirigen. Resultados guardados se consultan con recuentos y acceso al módulo de origen; no se interpreta un recuento como respuesta técnica.
- Más: Incidencias, Planos, Control Documental y Actividad. Administración separada.

La barra puede contraerse en escritorio y se adapta a móvil. El encabezado conserva proyecto, especialidad activa, fuente y usuario Autodesk; Volver retorna a la jerarquía. Cambiar proyecto limpia el contexto activo y conserva estados por usuario/empresa/proyecto, sin mezclar sus datos.

## Configuración

La tabla admite activar/desactivar especialidades, elegir RVT en cualquier carpeta accesible y seleccionar versión/vista publicadas. Guardar valida la fuente en Autodesk. Validar consulta además la publicación actual; ofrece mantener o actualizar. Actualizar no reutiliza una vista por su parecido: requiere seleccionar una vista de esa versión. La comparación del configurador es de metadatos de publicación; diferencias de cantidades requieren dos lecturas.

La selección de una especialidad no asigna automáticamente elementos a categorías técnicas. Las reglas determinísticas, sus parámetros y las asociaciones confirmadas siguen en los motores existentes. Las especialidades sin motor muestran la limitación.

## Consulta IA y visor

La primera pregunta se enruta por intención a los componentes existentes. Si no se reconoce una fuente se pide aclaración. El chat BIM espera la lectura de parámetros y ejecuta operaciones verificables en la vista. El visor comienza cerrado y puede abrirse, cerrarse o ampliarse sin desmontar la conversación. En documentos, el explorador del proyecto puede mostrarse u ocultarse; se conserva la navegación e historial existentes de cinco días.

## Cubicaciones persistentes

Una lectura de vista con criterios guardados intenta conservarse automáticamente; ante error muestra el motivo y permite reintentar. Historial carga capturas anteriores sin sobrescribir resultados. Las capturas se identifican como evidencia del visor, con versión/motor/criterios; no son una segunda lectura independiente del RVT en servidor.

## Aceptación

Pruebas automatizadas y verificación de navegador se registran en `docs/project-update-validation.md`. Ningún modelo sintético de prueba constituye una línea base técnica de Centro Español. Las fuentes Bridge/Direct sólo pueden compararse cuando existan exportaciones reales con procedencia verificable.
