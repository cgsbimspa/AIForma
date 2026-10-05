# Proyecto Autodesk como contexto de trabajo

## Inspección y reutilización (05/10/2026)

Se reutilizan `ProjectProvider`, `ProjectSession`, el listado APS de hubs/proyectos,
`verifyProject`, `verifyLocation`, `QuantitySourcePicker`, los motores técnicos y
los almacenes cifrados de Auditoría, Cubicaciones y Coordinación. El selector
documental usa el mismo cliente APS; no copia los archivos del proyecto.

El problema estructural era el uso de una sola configuración de especialidad y
fuente para todas las herramientas. Ahora la clave es hub + proyecto + módulo.
La configuración anterior permanece disponible para recuperación explícita.
No se sobrescriben sus revisiones ni los resultados históricos.

## Implementado

- `app_project`: identidad UUID con unicidad por hub/proyecto Autodesk. Se registra
  al entrar, después de verificar el acceso y nombre con APS. Volver al mismo
  proyecto recupera el mismo UUID. Los nombres no identifican el proyecto.
- `/api/projects/enter`: utiliza autenticación real existente. No crea proyectos
  Autodesk ni realiza descargas masivas.
- `/configuracion`: entrada a configuración independiente de Auditoría,
  Cubicaciones, Normativa, Asistente y Control Documental.
- `project_module_configuration`: revisiones cifradas e inmutables, control de
  concurrencia y RLS por cuenta/proyecto. La selección activa también se separa
  por módulo. Cada motor conserva su configuración técnica existente.
- Activación de fuentes idempotente: regresar a un módulo no revierte los cambios
  guardados dentro de él. Un cambio explícito de revisión o especialidad aplica
  nuevamente la fuente de su configuración de módulo.
- Cambio de proyecto desmonta los componentes de trabajo y sus visores. Cargas
  de configuración tienen cancelación y claves de identidad; el historial sigue
  consultándose mediante roles SQL y autorización Autodesk por proyecto.
- El Asistente no puede cambiar silenciosamente de proyecto al abrir un resultado
  documental o recuperar una conversación.
- Control Documental: configuración persistente de carpetas/archivos reales,
  exploración paginada y verificación del recorrido en servidor; no exige RVT ni
  vista. La selección no modifica los documentos en ACC.
- Auditoría y Normativa: índice de reutilización por fuente/versión/vista,
  configuración/revisión, catálogo/reglas y motor. Sólo se indexan ejecuciones
  COMPLETED, después de guardarlas. Se verifica el acceso a la fuente antes de
  recuperar el resultado. Existe acción explícita para reprocesar.
- Cubicaciones conserva su captura persistente y deduplicación existentes. No se
  cambia el cálculo técnico del visor en esta migración.

## Despliegue y comprobaciones

Ejecutar `node scripts/migrate-projects.mjs` con la conexión de migración existente.
La versión 2 agrega tablas y políticas sin alterar los registros anteriores.
Fue aplicada al almacenamiento configurado mediante el archivo local de entorno
de producción el 05/10/2026; el script confirmó la instalación de v2.

57 pruebas dirigidas pasaron (contexto, configuraciones, home, auditoría,
normativa y cantidades), además de TypeScript, ESLint de los archivos cambiados
y compilación Next.js en copia aislada del índice de Git.

## Límites y aceptación pendiente

- La validación real con Centro Español y el cambio a otro proyecto requieren
  una sesión Autodesk utilizable. Las pestañas de producción consultadas seguían
  mostrando error de conexión. No se reemplaza esta prueba por fixtures.
- Control Documental era un espacio sin implementación de procesamiento. Esta
  entrega adapta su configuración y referencias; no afirma que existan motores
  de publicación, reportes documentales ni histórico de ejecuciones inexistentes.
- Las empresas/usuarios/roles administrativos no se inventan: se reutiliza el hub
  y usuario autenticado. El acceso a archivos sigue siendo autorizado por APS.
  No se ha integrado un catálogo administrativo de roles de ACC.
- La auditoría geométrica existente sigue requiriendo vista 3D; no se impone ese
  requisito globalmente a los módulos documentales.
- El índice de reutilización nuevo no evita la lectura inicial de geometría y
  parámetros del visor de Cubicaciones. Su captura guardada conserva procedencia.

No declarar completa la aceptación extremo a extremo mientras falte la prueba
con la sesión real y su modelo autorizado.
