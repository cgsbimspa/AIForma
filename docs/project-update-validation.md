# Actualización funcional — verificación

## Comprobaciones iniciales

- 242 pruebas Node/PGlite completadas sin fallos, incluyendo tres pruebas nuevas del contexto/configuración e historial.
- TypeScript sin errores; ESLint sin errores ni advertencias tras las correcciones.
- Build Next.js de producción correcto con `/configuracion`, `/consultar-ia` y las APIs de configuración e historial.
- Migración aditiva `projects.sql` aplicada al almacenamiento existente. Conserva datos y tablas previos.
- Navegador local: carga Inicio, menú simplificado y contexto Autodesk desconectado real; no se introdujeron sesiones ficticias.

## Prueba real Centro Español

Pendiente de ejecutar tras publicar. Registrar configuración → auditoría → cubicaciones → IA → cambio de proyecto y cualquier limitación observada. No convertir una compilación correcta en una afirmación de aceptación BIM.

## Límites conocidos

- Consultas a informes guardados: recuentos y acceso a evidencia; la síntesis conversacional transversal no está implementada.
- Un Bridge/Direct no disponible permanece pendiente; no se generan ni comparan datos de ejemplo.
- Capturas de cubicación: máximo 2,8 MB comprimidos por solicitud; lectura original limitada a 100 MB al descomprimir. Los errores de guardado se muestran y conservan la lectura temporal.
- No se consolida un total de errores críticos de ejecuciones históricas incompatibles.
