# Benchmark Centro Español

Fecha de identificación: 2026-10-01. Proyecto principal de aceptación solicitado por el usuario.

- Cuenta mostrada por Autodesk: **AEC Shift**, hub `b.9ca7e254-cf8f-41c9-9d77-308867877159`.
- Proyecto: **2025.03.25 Centro Español**, ID `b.ba716411-aa34-440f-a1a1-cb201db4e26b`.
- Evidencia: opciones seleccionadas del encabezado en sesión autenticada de app.cgsbim.cl/auditoria-bim. Identidad verificada, no una medición del modelo.

## Regresión automatizada

`web/tests/project-home.test.mjs` utiliza la identidad observada para verificar conservación del contexto entre módulos y separación por usuario/cuenta/proyecto. Sus valores de estado son TEST, no resultados BIM. Otras pruebas PGlite verifican consultas del resumen con RLS real, datos cifrados, recuentos persistidos y ausencia de fuga entre proyectos.

Ejecutar en `web`: `node --experimental-strip-types --test tests/project-home.test.mjs` y la suite `npm test`.

## Aceptación de navegación

1. Conectar Autodesk, elegir AEC Shift y buscar Centro Español.
2. Entrar al proyecto; comprobar encabezado y referencias/ejecuciones efectivamente guardadas.
3. Abrir Auditoría, Cubicaciones y Asistente; volver a Inicio conservando cuenta/proyecto.
4. Cambiar a otro proyecto y volver; comprobar que no se muestran fuentes del proyecto anterior.
5. Actualizar página; restaurar sólo el contexto de la identidad autenticada.
6. Revisar pantalla estrecha y escritorio; errores de consulta deben ser explícitos.

## Baseline técnico pendiente

No hay todavía un ExpectedConcreteVolume validado para esta migración. No se usarán como referencia los números ilustrativos de la especificación ni un resultado calculado por el mismo motor sin validación independiente.

Para habilitar regresión numérica: elegir el RVT, versión y vista del piloto; conservar fuente de cantidades validada (tabla de Revit o revisión explícita), reglas, unidades, cobertura, IDs y versión del motor. Registrar esperados para hormigón/moldaje y tolerancia numérica justificada. Un cambio de versión invalida la comparación hasta aprobar la nueva referencia. Esta limitación no impide verificar ahora el flujo de proyecto y su aislamiento.

## Primera comprobación publicada — 2026-10-01

Versión `56213e0`, despliegue Vercel `dpl_7oyoTjJL1uBx8QAFNAdseQGGGM5d`, estado Ready y alias app.cgsbim.cl comprobados.

En sesión autenticada, Inicio recuperó dos archivos configurados: `COORD. EDIFICIO A1.rvt`, V4, vista `3D SAN`; y `CES-EST-Edif_A1_RV25.rvt`, V3, vista `{3D}`. Son referencias guardadas, no confirmación de que sean las últimas versiones publicadas. El resumen informó cero ejecuciones guardadas en los tres almacenes; cubicación en memoria no se cuenta como publicación.

El recorrido Inicio → Auditoría → Inicio → Cubicaciones → Inicio → Asistente conservó la identidad de Centro Español. El Asistente mostró «Todo este proyecto / 2025.03.25 Centro Español» y su alcance de consulta correspondiente. Las especialidades Cálculo y MEP conservaron su configuración.

Se repitió Empresa → AEC Shift → búsqueda «centro espanol» → Centro Español → Inicio. La búsqueda encontró el nombre con ñ sin exigir el acento. Escritorio 1440 y móvil 390: sin desbordamiento horizontal; se restauró el tamaño original. No hubo errores de consola en la comprobación final. Evidencia visual local en `web/work/project-home-centro-espanol.png` y `web/work/project-home-mobile.png` (no versionada).

Pruebas automatizadas: 239/239, lint, TypeScript y build correctos. Endpoint sin sesión: 401 y Cache-Control privado/no-store. No se ejecutaron nuevos cálculos ni se alteraron configuraciones técnicas durante esta comprobación.
