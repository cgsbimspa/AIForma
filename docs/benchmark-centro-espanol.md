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
