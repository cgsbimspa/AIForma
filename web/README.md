# Web BIM + IA — Etapa 0.1

## Requisitos y ejecución

Node.js 24.x y npm. Desde esta carpeta:

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
```

La dirección prevista es http://127.0.0.1:5173/. Si el servidor informa otra dirección, revisar si ya existe una instancia usando el puerto. Para la instalación actual, las dependencias ya están instaladas y se puede usar `../Iniciar-web.ps1`.

En el entorno de Codex se encontró Node.js 24.19.0 y pnpm, sin npm en PATH. Se puede invocar npm mediante `pnpm --package=npm@11 dlx npm ci`. No se requiere este mecanismo en equipos con npm instalado.

```sh
npm run build
node node_modules/typescript/bin/tsc --noEmit
```

La navegación pública no requiere cuentas. La conexión real de Autodesk y el Asistente necesitan variables del servidor: consultar `../docs/AUTODESK-OAUTH.md` y `../docs/ASISTENTE-IA.md`. Nunca guardar claves en Git ni usar variables `NEXT_PUBLIC_` para secretos.

## Tecnología y decisiones

- React 19.2.6 y TypeScript 5.9.3.
- Next.js 16.3.4 con App Router y compilación estándar para Vercel.
- Tailwind CSS 4.2.1, componentes locales Shadcn y Lucide React para iconos.
- Las versiones resueltas se encuentran en `package-lock.json`.
- Se retiraron Vinext y la configuración de Cloudflare/Sites al elegir Vercel para esta aplicación. No hay autenticación simulada ni configuración de bases de datos.
- El despliegue usa un proyecto independiente; no comparte configuración con Repositorio de Links.

## Publicación en Vercel

Importar el repositorio de AI Forma, seleccionar `web` como Root Directory y Next.js como framework. `web/vercel.json` fija `npm ci` y `npm run build`. Usar Node.js 24.x y configurar las variables privadas indicadas en los documentos de integración.

El destino solicitado es `app.cgsbim.cl`. Su DNS debe utilizar el valor exacto que indique Vercel para este nuevo proyecto. No reutilizar valores de otros proyectos ni modificar `dashboards.cgsbim.cl`.

El estado real de publicación se registra en `../docs/DESPLIEGUE.md`.

## Estructura

| Archivo | Responsabilidad |
| --- | --- |
| `app/layout.tsx` | Idioma, metadatos y estructura compartida |
| `components/workspace-shell.tsx` | Navegación lateral, encabezado y menú móvil |
| `app/page.tsx` | Inicio y accesos a módulos |
| `lib/modules.ts` | Nombres, rutas y propósito planificado según el roadmap |
| `app/[module]/page.tsx` | Estado vacío de los módulos pendientes |
| `app/asistente/page.tsx` | Explorador Forma y consultas mediante OpenAI |
| `app/not-found.tsx` | Recuperación de direcciones inexistentes |
| `app/globals.css` | Tema, estilos y adaptación a pantallas estrechas |
| `components/ui/` | Primitivas de interfaz incluidas en el starter |

## Continuar con un módulo

Definir primero su alcance y sus fuentes. Cuando exista una implementación autorizada, crear su ruta específica en `app/<ruta>/page.tsx`, que podrá sustituir su página vacía compartida, o extraer componentes propios. Actualizar también el estado mostrado en el inicio. El Asistente ya tiene explorador y consultas de metadatos; los demás módulos siguen pendientes.

Las descripciones del catálogo son objetivos del roadmap, no resultados de análisis. El estado de cada módulo se informa explícitamente. No añadir datos ficticios ni convertir ausencia de evidencia en un cero.

La autenticación Autodesk y la consulta de metadatos usan APIs reales. El almacenamiento de proyectos, la indexación del contenido documental y los motores técnicos siguen pendientes.
