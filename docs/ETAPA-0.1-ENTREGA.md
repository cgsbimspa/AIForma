# Entrega de la Etapa 0.1

## Implementado

- Aplicación local en `web/`, con inicio y los nueve módulos de la propuesta.
- Navegación lateral con página activa, encabezado contextual y menú para pantallas estrechas.
- Páginas de módulos con propósito planificado y estado «Módulo aún no implementado».
- Página para direcciones inexistentes, con enlace de regreso al inicio.
- Identidad visual azul basada en el roadmap, etiqueta de trabajo «BIM + IA» y favicon propio.
- Acceso por teclado, enlace para saltar al contenido, foco visible y reducción de movimiento según la preferencia del sistema.
- Documentación y script PowerShell para volver a iniciar la web.

## Comprobaciones realizadas

- TypeScript: verificación sin errores.
- Compilación de Vinext/Vite: completada correctamente.
- HTTP: inicio y nueve rutas de módulos responden 200; dos rutas inexistentes, incluida una de varios segmentos, responden 404.
- Navegador: navegación por los nueve módulos y comprobación del mensaje de no implementación en cada uno.
- Recarga directa de Administración: contenido conservado.
- Revisión visual de inicio en la vista de escritorio disponible y a 390 × 844; revisión del estado vacío de Cubicaciones a ese tamaño móvil.
- Menú móvil: abre y se cierra tras seleccionar Cubicaciones. En esa página, ancho del documento y viewport iguales a 390 px, sin desbordamiento horizontal.
- Página inexistente: mensaje correcto y regreso al inicio funcional.
- Consola: sin errores ni advertencias en la captura de la navegación de los nueve módulos.

Estas verificaciones cubren la base navegable. No son pruebas de integración con Autodesk, de motores técnicos, de seguridad productiva ni una auditoría completa de accesibilidad.

## Límites de la entrega

No hay datos de proyecto, integraciones, autenticación, IA operativa, cálculos, tablas de resultados, análisis ni despliegue productivo. El código mantiene desactivada la autenticación simulada del starter. Las dependencias del starter incluyen herramientas para posibles capacidades futuras; su presencia no significa que estén implementadas.

La Fase 1 del roadmap continúa pendiente más allá de esta base visual. El siguiente trabajo debe definir e implementar una primera funcionalidad real con evidencia verificable.
