# Publicación independiente de AI Forma

## Destino solicitado

- Cuenta Vercel: CGS BIM's projects (`cgs-bim-s-projects`), comprobada en el panel.
- Nuevo proyecto propuesto: `cgs-ai-forma`.
- Subdominio solicitado: `app.cgsbim.cl`.
- Repositorio independiente previsto: `cgsbimspa/cgs-ai-forma`, privado.

## Preparación completada

- Aplicación migrada de Vinext a Next.js 16.3.4 estándar.
- Node.js 24.x, instalación reproducible con `npm ci` y compilación `npm run build`.
- Configuración de Vercel en `web/vercel.json`; Root Directory: `web` para importar el repositorio completo.
- Sin variables de entorno ni credenciales necesarias para la Etapa 0.1.
- Exclusión de dependencias locales, compilaciones, cachés, registros y archivos de secretos en Git.
- Compilación Next.js y validación TypeScript completadas.
- Servidor de producción local probado: inicio y nueve módulos HTTP 200, ruta inexistente HTTP 404.

## Pendiente

- Creación y carga del repositorio privado en la cuenta correcta de GitHub.
- Creación y despliegue del proyecto independiente de Vercel.
- Registro del CNAME exacto entregado por Vercel, validación DNS y HTTPS.

No se afirma que el subdominio esté publicado hasta verificar estos pasos.

## Límites

Repositorio de Links queda fuera de este trabajo: no se modifican sus archivos, repositorio remoto, configuración Vercel ni DNS de `dashboards.cgsbim.cl`. Tampoco se cambia la raíz `cgsbim.cl` ni sus registros de correo.
