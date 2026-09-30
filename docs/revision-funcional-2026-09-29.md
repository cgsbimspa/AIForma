# Revisión funcional de la plataforma — 29-09-2026

Implementación sobre los módulos existentes, siguiendo la revisión entregada por el usuario. Cambios funcionales en `1a6fb88` y corrección de verificación en `3deda42`. Producción: https://app.cgsbim.cl/.

## 1. Archivos modificados

Todos los siguientes caminos son relativos a la raíz del repositorio.

| Área | Archivos |
| --- | --- |
| Contexto y navegación | `web/components/project-context.tsx`, `web/lib/project-session.ts`, `web/components/workspace-shell.tsx`, `web/app/layout.tsx`, `web/app/workspace-context.css`, `web/app/page.tsx`, `web/components/autodesk-connection.tsx` |
| Integración de módulos | `web/components/assistant-workspace.tsx`, `web/components/bim-chat-workspace.tsx`, `web/components/coordination/context.tsx`, `web/components/coordination/page.tsx`, `web/components/coordination/sidebar.tsx` |
| Auditoría: interfaz | `web/app/auditoria-bim/layout.tsx`, `web/components/audit/audit-context.tsx`, `web/components/audit/audit-context-cards.tsx`, `web/components/audit/audit-page.tsx`, `web/components/audit/audit-results.tsx` |
| Auditoría: lectura y contratos | `web/lib/audit/coordinates.ts`, `web/lib/audit/result-status.ts`, `web/lib/audit/contracts.ts`, `web/lib/audit/catalog.ts`, `web/lib/audit/engine.ts`, `web/lib/audit/provider.ts`, `web/lib/audit/grids.ts`, `web/lib/audit/store.ts` |
| Cubicaciones | `web/components/quantity-workspace.tsx`, `web/components/quantity-model-desk.tsx`, `web/lib/quantities/specialty-state.ts`, `web/lib/quantities/contracts.ts`, `web/lib/quantities/store.ts`, `web/app/api/quantities/route.ts` |
| Visor | `web/public/quantity-viewer.js`, `web/public/quantity-properties.js`, `web/public/quantity-viewer.css` |
| Pruebas | `web/tests/project-context.test.mjs`, `web/tests/audit-coordinates.test.mjs`, `web/tests/audit.test.mjs`, `web/tests/audit-grids.test.mjs`, `web/tests/audit-levels.test.mjs`, `web/tests/quantities.test.mjs`, `web/tests/quantity-properties.test.mjs` |

## 2. Componentes nuevos

- `ProjectProvider`, `ProjectPicker` y `ModelContext`: una selección global de cuenta/proyecto y una fuente activa por módulo.
- `useProjectState` y `ProjectSession`: conservación temporal por usuario, cuenta, proyecto y módulo; evita cruces entre proyectos.
- `AuditModelCard`, `AuditCoordinatesCard` y `DatumCounts`: ficha contextual, extracción de coordenadas y conteos de referencias.
- Catálogo de estados de resultado en `result-status.ts` y estado de especialidad en `specialty-state.ts`.

## 3. Componentes y servicios reutilizados

Se conservan Sidebar, menús de Auditoría y Coordinación, selector de archivos/versiones/vistas, modal de configuración, visor Autodesk, APIs de Autodesk, conexión OAuth, almacenamiento cifrado, tableros y motores determinísticos existentes. Se mantuvieron los filtros múltiples y la selección bidireccional del visor.

La interfaz inicial de Auditoría muestra G01/G02, resumen y áreas. Las reglas e inventarios se abren a demanda. Las especialidades de Cubicaciones provienen del catálogo existente; sus configuraciones anteriores se conservan. El texto visible «Mesa de trabajo» se cambió por «Tablero».

## 4. Modelo de datos

- Configuración de Cubicaciones: campos opcionales `enabled` y `hidden`. Una configuración histórica que no incluya estos campos conserva su estado habilitado/visible.
- Inventario de Auditoría: evidencia de coordenadas con valor original, campo, objeto/documento, ruta de origen y fuente.
- Estructura G02: `coordinateData`, `coordinateEvidence`, `coordinateComparison` y `coordinateResult` separados.
- Resultados de Auditoría: `PASS`, `WARNING`, `FAIL`, `NOT_EVALUATED`, `NOT_APPLICABLE`, `INFORMATIVE`. Las etiquetas en pantalla son en español. Los informes históricos se normalizan al leerlos, sin reescribir la evidencia almacenada.
- Recibo temporal de cálculo por configuración/versión/vista/revisión; permite distinguir «Procesada en esta sesión» de una ejecución persistida.

## 5. Backend y API

- Acción `visibility` en la API existente `/api/quantities`, con validación de entrada, comprobación de revisión y autorización del proyecto. Actualiza visibilidad/habilitación conservando fuente, plantilla y criterios.
- Lectura de coordenadas desde propiedades nativas publicadas y datos AEC. No convierte elevaciones de elementos en elevación del proyecto ni deduce coordenadas compartidas.
- Versiones del motor/catálogo de Auditoría actualizadas a 1.3.0 por los nuevos resultados informativos G01/G02 y los códigos normalizados. Se conservan las reglas técnicas restantes.
- Sin migración SQL: los campos se almacenan en los documentos cifrados ya existentes.

## 6. Persistencia

| Información | Ubicación y comportamiento |
| --- | --- |
| Proyecto activo | `sessionStorage` guarda sólo identificadores de usuario, cuenta y proyecto. Se verifica la identidad al restaurarlos. |
| Archivo, publicación y vista por módulo | Configuración existente en backend; selección de trabajo conservada en memoria por proyecto. |
| Especialidades, fuente, plantilla y criterios | Backend del proyecto; deshabilitar u ocultar no elimina estos datos. |
| Auditorías y revisiones normativas ejecutadas | Historial persistente existente en backend, con su evidencia y versión. |
| Tablero, filtros, respuesta seleccionada y cálculos en vivo | Memoria de la sesión, separada por proyecto y usuario. Se recuperan al navegar entre módulos. Caducidad máxima: cinco días. |

No se guardan modelos, matrices de propiedades ni resultados BIM indiscriminadamente en `localStorage`. Recargar completamente la aplicación reinicia la caché de trabajo; las configuraciones y ejecuciones guardadas se recuperan del backend. Los cálculos en vivo de Cubicaciones V2 siguen siendo resultados de sesión, con exportación de evidencia; no se presentan como un nuevo historial permanente.

## 7. Pendientes explícitos

- Comparación técnica entre modelos de G02: estructura preparada, sin emitir aprobación hasta definir referencias, unidades y tolerancias verificadas.
- Coordenadas que Autodesk no publica: se identifican como NO ENCONTRADAS/NO DISPONIBLES; no se rellenan con ceros.
- La aplicación actual autoriza por acceso al proyecto de Autodesk; no tiene una matriz interna Administrador/Consumidor. Esta revisión reutiliza ese permiso y no introduce roles ficticios ni un sistema nuevo de autorización. Separar esos perfiles exige definir su fuente de roles.
- Los apartados técnicos ya marcados «Por configurar» conservan esa condición; esta iteración no implementa nuevos motores de auditoría ni módulos futuros.

## 8. Decisiones técnicas

- Context de React y caché acotada; sin biblioteca nueva de estado global.
- Identidad principal: proyecto. La fuente y vista se mantienen por módulo para no sobrescribir una selección de Auditoría con una de Cubicaciones.
- Ejes y niveles recuperados de datos AEC independientemente de su presencia como geometría en la vista. Los conteos de AEC y vista no se suman como objetos únicos.
- Extracción informativa separada de evaluación. `NOT_EVALUATED` queda para controles pendientes, no para representar un valor inexistente.
- Un encabezado común y menú lateral con iconos al colapsar; conservación de rutas existentes.
- El panel completo de propiedades funciona de manera independiente de la barra opcional de Autodesk. Se detectó que `PropertiesManager` de Viewer 7.119 intentaba acceder a su botón todavía no creado; el panel propio evita esa dependencia y conserva el lector completo.

## 9. Riesgos y límites

- El acceso a la plataforma, recursos de Autodesk y datos AEC depende de sus servicios y de la red del usuario. No se modificaron firewalls ni restricciones de red.
- «Propiedades publicadas» significa lo devuelto por la base de propiedades de Autodesk; no certifica que todos los parámetros del RVT original se hayan publicado.
- Un reporte conservado puede corresponder a una publicación anterior. La interfaz mantiene explícita la versión del resultado y el indicador de publicación disponible.
- La fecha `createTime` se muestra con su nombre y procedencia; no se convierte sin evidencia en una fecha de publicación de la vista.

## 10. Pruebas realizadas

- Suite completa final: 235 pruebas aprobadas, cero fallas.
- Verificación posterior a los ajustes: 38 pruebas dirigidas aprobadas; después de corregir el visor se aprobaron 10 pruebas de regresión de propiedades, permisos del visor y contexto, incluida una nueva prueba del panel sin barra de Autodesk.
- Linter y TypeScript sin errores. Build local aprobado; ambos despliegues funcionales confirmados en estado Ready.
- Recorrido real en producción con la sesión de Autodesk: Distrito Verde → Cubicaciones → Auditoría → Cubicaciones; se restauró el tablero y su versión.
- Segundo proyecto: Lomas del Patagual 1 mostró su archivo y configuración de Alcantarillado. Volver a Distrito Verde recuperó su tablero estructural, sin mezclar fuentes.
- Auditoría real: se recuperaron referencias AEC aunque no estuvieran como elementos de la vista; G02 devolvió transformación publicada con evidencia. Reglas e inventarios de grillas/niveles se abrieron desde su resumen.
- Se recuperó la nueva auditoría desde el historial después de una recarga completa.
- El Asistente IA mantuvo el proyecto activo como alcance de consulta al entrar desde Auditoría. Se verificó el menú móvil y se conservó el nombre del módulo en su encabezado compacto.
- Visor corregido: una losa seleccionada devolvió 94 propiedades publicadas (34 internas); el resumen y las partidas se limitaron a ese elemento. Filtro Floors + Aislar aplicado correctamente. No aparecieron nuevas excepciones del panel después de la corrección.
- La comprobación visual se realizó a 1600 × 950 y a 539 píxeles de ancho. A 539 px, el ancho del contenido y el viewport coincidieron, sin desbordamiento horizontal. El encabezado permanece visible al desplazarse. Capturas locales: `web/work/review-proof/auditoria-resumen.png`, `auditoria-responsive.png` y `cubicaciones-propiedades.png` (no se publican los datos del modelo como recursos de la aplicación).

Referencia técnica del patrón de panel independiente: [Autodesk APS — Model Summary](https://get-started.aps.autodesk.com/tutorials/dashboard/panel/). Se contrastó con el SDK 7.119 usado por la plataforma.
