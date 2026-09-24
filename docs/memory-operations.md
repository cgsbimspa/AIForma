# Operación de la memoria

La política normativa es [memory-architecture.md](memory-architecture.md). Esta implementación añade Recent Context, User Intelligence, Project Knowledge, Platform Intelligence y evidencia, sin entrenar modelos ni implementar el Knowledge Center completo.

## Activación

Se necesita PostgreSQL persistente con TLS, permisos para ejecutar la migración y un programador periódico. No se usa memoria de una función Vercel ni localStorage como sustituto de la base de datos.

Variables del servidor (sin NEXT_PUBLIC):

- `MEMORY_DATABASE_URL`: conexión de ejecución; el código usa `SET LOCAL ROLE ai_forma_memory` con políticas RLS.
- `MEMORY_MIGRATION_DATABASE_URL`: conexión administrativa opcional, sólo para el script de migración; no es necesaria en Vercel.
- `MEMORY_ENCRYPTION_KEY`: clave hexadecimal de 32 bytes independiente de OAuth para cifrar mensajes, parámetros y resultados. Mantenerla estable y respaldada de forma segura: perderla hace ilegible el historial.
- `CRON_SECRET`: secreto exclusivo para el proceso periódico. No se acepta acceso anónimo.

Instalar con `node --env-file=.env.local scripts/migrate-memory.mjs` desde web. La migración crea los roles sin login `ai_forma_memory` y `ai_forma_retention`, y los concede al usuario de migración. Si la conexión de ejecución usa otro usuario, concederle esos dos roles mediante la administración PostgreSQL. No entregar esa conexión al cliente.

Se creó una base exclusiva Neon Free para AI Forma y se aplicó la migración v1. Las variables de conexión, cifrado y `CRON_SECRET` están configuradas en producción. `web/vercel.json` programa `GET /api/internal/memory-retention` cada día a las 08:00 UTC (Vercel Hobby puede ejecutar dentro de esa hora), autenticado con `CRON_SECRET`. El plan Hobby permite una ejecución diaria; no se contrató un plan pagado. La programación se activa con el despliegue. El endpoint devuelve conteos y registra cada ejecución en `memory_maintenance_log`. Comprobar fallos desde los logs de Vercel; este MVP no incorpora un servicio externo de alertas.

Los vencimientos se filtran por PostgreSQL en cada lectura, incluso si falla el programador. La eliminación física ocurre en la primera limpieza posterior al vencimiento (normalmente hasta unas 25 horas con la programación diaria, si el proveedor ejecuta el trabajo sin errores). Los mensajes/resultados heredan el vencimiento fijo de la conversación; ninguna actividad extiende sus cinco días. El vencimiento y borrado descritos corresponden a la base activa. Eliminar filas no elimina automáticamente copias históricas del proveedor; no se ha certificado aquí la eliminación de backups/PITR.

Sin configuración, las respuestas indican que el historial no se guardó. No se inventa un guardado exitoso. Consultas con alcance «toda mi base» no se persisten, pues pueden cruzar organizaciones; seleccionar un proyecto permite vincular organización/proyecto reales.

## Aislamiento y procedencia

La organización se identifica por el hub Autodesk comprobado y el proyecto por el proyecto verificado en ese hub. El usuario se obtiene del perfil Autodesk actual en el servidor. Nunca se aceptan organization_id/user_id aportados por el navegador como identidad. RLS separa conversaciones por organización/proyecto/usuario y preferencias por organización/usuario. El conocimiento técnico es compartido sólo dentro del proyecto autorizado, con su estado visible. Las credenciales OAuth, cursores de búsqueda y claves API se excluyen de los resultados conservados.

El historial recuperado se presenta como histórico, sin renderizarlo como evidencia nueva. Las respuestas documentales siguen consultando documentos y versiones actuales; el historial no se incorpora al motor de respuesta documental como fuente. Las operaciones registradas son las herramientas de servidor efectivamente ejecutadas por el asistente, con parámetros, resultados, duración y referencias de versión contenidas en sus resultados. No se conserva toda la carga interna de los proveedores ni tokens. Cargas mayores a 1,5 millones de caracteres se sustituyen por un registro explícito de omisión por tamaño.

## Preferencias

Reglas determinísticas sólo reconocen comandos completos explícitos de presentación (por ejemplo, «agrupa por nivel»). No extraen tolerancias, cantidades ni equivalencias. Las observaciones débiles permanecen marcadas como no activas hasta cinco repeticiones. Confidence = proporción de observaciones del valor × min(1, observaciones totales / 20): es consistencia de comportamiento, no exactitud técnica. `last_seen`, `observations`, `confidence` y `decay_version=not_activated` preparan decay; no se aplica un calendario de decay inventado. Las preferencias se registran, consultan y pueden borrarse; todavía no alteran reglas ni se inyectan como instrucciones al motor técnico.

## Conocimiento técnico

API `/api/memory/knowledge`: crear propuesta DETECTED, pasar a SUGGESTED, confirmar VALIDATED, rechazar REJECTED o marcar OBSOLETE. Las transiciones requieren pertenecer a `memory_knowledge_validator` para el proyecto; no hay autoinscripción ni equivalencia entre permiso de lectura Autodesk y autoridad de validación. La asignación de validadores queda a un administrador mediante SQL, con IDs verificados. No se asignan validadores por defecto.

La confirmación crea evidencia `user_confirmation` con identidad y fecha del validador. Un trigger de base de datos impide insertar directamente conocimiento validado o validarlo sin evidencia/autorización. Los valores y dependencias de versión son inmutables: una modificación exige una propuesta nueva. Las dependencias de documento/modelo requieren versión. `reusableKnowledge` rechaza estados no validados, evidencia ausente, versiones distintas y periodos vencidos. Esta fase no incorpora automáticamente conocimiento guardado a auditorías, cálculos BIM ni respuestas documentales.

## Métricas y eliminación

Los eventos no admiten prompts ni texto libre: sólo enums de módulo, evento, acción, resultado, duración e identificadores de aislamiento. Después de cinco días se agregan por organización/día/tipo, eliminando eventos individuales y sus IDs de usuario/proyecto; no hay cruces entre empresas. El trabajo usa una transacción y bloqueo para evitar dobles conteos. Los logs de limpieza contienen conteos y fecha, sin contenido, y vencen a los 30 días.

IntentFeedback está preparado como entidad con vocabulario acotado y retención de cinco días. No se infieren automáticamente correcciones a partir de conversaciones ambiguas ni se modifica el routing sin validación de una fase posterior. No se publica un panel global de métricas mientras no exista autorización de administrador de organización.

«Eliminar» en Historial borra la conversación con sus mensajes y herramientas. «Olvidar mis preferencias aprendidas» borra las señales de usuario en esa organización. «Nueva conversación» sólo inicia otra; no equivale a borrar historial guardado.

## Verificación antes de activar

- Migración aplicada en PostgreSQL real, RLS operativo y TLS verificado.
- Pruebas de aislamiento entre usuarios, proyectos y organizaciones.
- Lectura/guardado/recuperación real desde el asistente y confirmación del vencimiento.
- Limpieza programada registrada y ejecución autenticada verificada; supervisión mediante logs del proveedor.
- Revisión de retención de backups del proveedor; no afirmar eliminación completa de copias sin comprobarla.
- No activar Knowledge Center, entrenamiento, embeddings, aprendizaje semántico ni mezcla entre empresas.
