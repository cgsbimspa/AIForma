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

### Asistente IA — 24 de septiembre de 2026

- Commit `2c996de`: explorador Forma, selección de alcance y asistente OpenAI.
- Publicación `dpl_7wZBEztWxZQvtcPFM4SeiXZi2V7y` en estado Ready, aplicada a `app.cgsbim.cl`.
- OpenAI configurado como secreto del servidor; conexión real y contrato de herramientas comprobados. Prueba de contrato con datos identificados como TEST, sin sustituir datos del explorador.
- 16 pruebas automáticas, ESLint y compilación Next.js aprobados. Endpoints de datos y chat rechazan consultas anónimas con HTTP 401.
- El usuario completó el consentimiento adicional `data:read`. Se verificó el explorador con cuentas, proyectos y carpetas reales.

### Búsqueda documental — 24 de septiembre de 2026

- Commit `49c0b24` publicado en producción: recorrido recursivo con paginación y consulta de nombres, rutas y contenido de archivos.
- 24 pruebas aprobadas, incluyendo parsers reales de PDF/DOCX/XLSX/TXT/CSV con datos TEST, rutas anidadas, referencias, versión y aislamiento de sesiones. TypeScript, ESLint y compilación Next.js aprobados.
- Prueba real en el navegador: coincidencias de texto en un Word y dos PDF de un proyecto accesible, con párrafos/páginas, versión, ruta y enlaces nativos de Autodesk. No se guardan nombres, contenido ni identificadores privados del proyecto en este registro público.
- Recorrido extenso probado con pausas y continuación. Los resultados observados son parciales: el sistema mantiene pendientes y archivos no legibles explícitos.

Realizar los cambios dentro de este proyecto, ejecutar `npm run build` y `npm run typecheck` desde `web`, y subir los commits a `main`. Vercel está configurado para construir la aplicación desde `web` usando Node.js 24.x y `npm ci`.

## Límites

Repositorio de Links queda fuera de este trabajo: no se modifican sus archivos, repositorio remoto, configuración Vercel ni DNS de `dashboards.cgsbim.cl`. Tampoco se cambia la raíz `cgsbim.cl` ni sus registros de correo.
