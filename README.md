# Plataforma BIM + IA

Base web de la Etapa 0.1, con inicio y nueve módulos navegables. «BIM + IA» es una etiqueta de trabajo tomada del roadmap, no una marca comercial definitiva.

## Abrir localmente

Con el servidor iniciado, abrir http://127.0.0.1:5173/.

Para iniciarlo desde PowerShell en esta carpeta:

```powershell
.\Iniciar-web.ps1
```

El script utiliza Node.js instalado o el runtime local de Codex si está disponible. Mantener abierta la terminal durante el uso. Detener con Ctrl+C. Si el puerto ya está ocupado por esta web, usar la instancia existente.

## Publicación

- [Aplicación en Vercel](https://cgs-ai-forma.vercel.app).
- [Aplicación en el dominio CGS BIM](https://app.cgsbim.cl).
- [Repositorio de código](https://github.com/cgsbimspa/AIForma).
- [Configuración y estado de publicación](docs/DESPLIEGUE.md).

## Desarrollo

La aplicación y sus instrucciones técnicas están en [web/README.md](web/README.md).

- [Política de evidencia](docs/PRINCIPIOS.md).
- [Propuesta original de alcance](docs/ETAPA-0.1-PROPUESTA.md).
- [Entrega y verificación de la Etapa 0.1](docs/ETAPA-0.1-ENTREGA.md).

La portada permite conectar una cuenta real de Autodesk mediante OAuth y verificar el nombre del usuario. Ver [conexión Autodesk](docs/AUTODESK-OAUTH.md). Los módulos técnicos siguen pendientes: todavía no consulta modelos ni datos de proyecto, no ejecuta análisis ni utiliza IA.
