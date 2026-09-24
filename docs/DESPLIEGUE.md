# Publicación independiente de AI Forma

## Destino solicitado

- Cuenta Vercel: CGS BIM's projects (`cgs-bim-s-projects`), comprobada en el panel.
- Proyecto creado: `cgs-ai-forma`.
- Subdominio solicitado: `app.cgsbim.cl`.
- Repositorio creado por el usuario: https://github.com/cgsbimspa/AIForma (público).
- Producción Vercel: https://cgs-ai-forma.vercel.app.

## Preparación completada

- Aplicación migrada de Vinext a Next.js 16.3.4 estándar.
- Node.js 24.x, instalación reproducible con `npm ci` y compilación `npm run build`.
- Configuración de Vercel en `web/vercel.json`; Root Directory: `web` para importar el repositorio completo.
- Sin variables de entorno ni credenciales necesarias para la Etapa 0.1.
- Exclusión de dependencias locales, compilaciones, cachés, registros y archivos de secretos en Git.
- Compilación Next.js y validación TypeScript completadas.
- Servidor de producción local probado: inicio y nueve módulos HTTP 200, ruta inexistente HTTP 404.

## Publicación realizada

- Código cargado en la rama `main` del repositorio independiente.
- Proyecto Vercel conectado al repositorio GitHub, con Root Directory `web`.
- Primera compilación y publicación de producción completada en Vercel.
- Registro CNAME creado en cPanel: `app.cgsbim.cl.` → `5f935769a35d9c60.vercel-dns-017.com.`.
- Vercel confirmó el DNS como `configured-correctly` y la propiedad del dominio como verificada.

## Verificación final — 23 de septiembre de 2026

- Certificado HTTPS emitido y acceso a https://app.cgsbim.cl comprobado sin omitir validaciones TLS.
- Inicio y nueve módulos respondieron HTTP 200; ruta inexistente respondió HTTP 404.
- Navegación del inicio a Auditoría BIM comprobada en el navegador público.
- Despliegue automático del commit `994d667` terminado en estado `Ready`, con `app.cgsbim.cl` y `cgs-ai-forma.vercel.app` como alias.
- Identificador de esa publicación: `dpl_5GBqwRFiQobSWpSForKvGKoerQYy`.

## Actualizaciones futuras

Realizar los cambios dentro de este proyecto, ejecutar `npm run build` y `npm run typecheck` desde `web`, y subir los commits a `main`. Vercel está configurado para construir la aplicación desde `web` usando Node.js 24.x y `npm ci`.

## Límites

Repositorio de Links queda fuera de este trabajo: no se modifican sus archivos, repositorio remoto, configuración Vercel ni DNS de `dashboards.cgsbim.cl`. Tampoco se cambia la raíz `cgsbim.cl` ni sus registros de correo.
