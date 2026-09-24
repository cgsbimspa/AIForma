# Conexión real con Autodesk

La portada usa OAuth 2.0 Authorization Code de APS con una aplicación confidencial. Se adaptó el flujo utilizado por Nexo AI en `Auditor Documental ISO/apps/resolve-mcp` y `packages/autodesk/src/resolve.ts` a Next.js y Vercel. Los archivos de Nexo no se modificaron.

## Configuración

Variables exclusivamente del servidor: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_CALLBACK_URL` y `AUTODESK_SESSION_SECRET` (32 bytes aleatorios en hexadecimal). Los valores reales están en variables sensibles de Vercel para producción y en `web/.env.local`, ignorado por Git, para desarrollo. Nunca usar prefijo `NEXT_PUBLIC_` ni guardar credenciales en el código.

Callbacks registrados en la aplicación APS existente:

- Producción: `https://app.cgsbim.cl/api/autodesk/callback`.
- Desarrollo: `http://127.0.0.1:5173/api/autodesk/callback`.
- Se conserva el callback original de Nexo: `http://localhost:4010/auth/callback`.

Para probar localmente, abrir la dirección 127.0.0.1 indicada; el origen debe coincidir con el callback configurado. En producción, usar `app.cgsbim.cl`.

## Comportamiento y límites

- Botón «Conectar Autodesk»: redirige al inicio de sesión y consentimiento de Autodesk.
- Punto rojo y «Autodesk sin conectar» mientras no exista una conexión verificada.
- Punto verde brillante y «Conectado con usuario [nombre]» solo tras consultar satisfactoriamente `https://api.userprofile.autodesk.com/userinfo` con el token del usuario actual.
- Estado revisado al abrir la página, recuperar el foco y cada minuto mientras sea visible. Una respuesta rechazada, un error de verificación o la expiración quitan el indicador verde.
- «Desconectar» elimina la sesión de esta plataforma; no cierra la cuenta global de Autodesk ni la sesión de Nexo.
- Alcance mínimo actual: `user-profile:read`. Esto verifica identidad, no acredita acceso a proyectos ACC, modelos ni otros módulos.
- La sesión dura como máximo una hora y nunca supera el vencimiento del token emitido por APS. Después se vuelve a conectar. No se almacenan refresh tokens en esta etapa.

## Protección

El Client Secret y el intercambio de código permanecen en el servidor. Token de sesión cifrado con AES-256-GCM dentro de una cookie HttpOnly, Secure y SameSite=Lax en producción, sin dominio compartido. No hay tokens en localStorage ni respuestas JSON públicas. El estado OAuth aleatorio se vincula al navegador y vence a los diez minutos. Inicio y desconexión requieren POST del mismo origen. Las respuestas de autenticación usan no-store y no-referrer. Los errores de Autodesk se transforman en mensajes controlados sin registrar tokens ni cuerpos sensibles.

## Verificación

- `npm test`: pruebas de estado OAuth, cifrado y alteraciones, caducidad, origen, errores del proveedor y perfil válido.
- `npm run typecheck`, `npm run build` y ESLint sobre los archivos incorporados.
- Comprobaciones HTTP de endpoints locales: estado desconectado, cookies HttpOnly, rechazo de origen externo, callback inválido y desconexión.

Fuentes: [OAuth de Autodesk](https://aps.autodesk.com/en/docs/oauth/v2/tutorials/get-3-legged-token/), [autenticación en Hubs Browser](https://get-started.aps.autodesk.com/tutorials/hubs-browser/auth), [UserInfo en el taller oficial DevCon](https://autodesk-platform-services.github.io/mcp-devcon2026/4-three-legged-aps).
