PROYECTO: PLATAFORMA BIM + ARTIFICIAL INTELLIGENCE

ESPECIFICACIÓN:
MEMORIA, HISTORIAL Y APRENDIZAJE DE PLATAFORMA

OBJETIVO

Diseñar e implementar la arquitectura base para que la plataforma pueda:

1. mantener contexto reciente de interacción,
2. aprender preferencias de uso por usuario,
3. conservar conocimiento validado por proyecto,
4. aprender patrones globales de uso de la plataforma,
5. mantener trazabilidad,
6. evitar alucinaciones,
7. separar claramente comportamiento aprendido de conocimiento técnico.

Esta arquitectura debe quedar preparada desde ahora, aunque algunas capacidades se activen en fases posteriores.


==================================================
0. PRINCIPIO NO NEGOCIABLE
NO HALLUCINATIONS
==================================================

La plataforma nunca debe convertir una conversación, inferencia o patrón de uso en una verdad técnica sin evidencia.

Regla:

BEHAVIORAL LEARNING
puede ser automático.

TECHNICAL KNOWLEDGE
requiere evidencia o validación explícita.

Ejemplos:

PERMITIDO:

"Este usuario suele visualizar resultados agrupados por nivel."

NO PERMITIDO SIN VALIDACIÓN:

"Nivel N2 equivale a Piso 2."

PERMITIDO:

"El usuario prefiere trabajar con la última versión."

NO PERMITIDO SIN EVIDENCIA:

"Este modelo tiene 2.850 m3 de hormigón."

Aplicar el principio:

NO EVIDENCE → NO CLAIM.


==================================================
1. ARQUITECTURA GENERAL DE MEMORIA
==================================================

Separar la memoria de la plataforma en cuatro capas claramente distintas:

01. RECENT CONTEXT
02. USER INTELLIGENCE
03. PROJECT KNOWLEDGE
04. PLATFORM INTELLIGENCE

Agregar transversalmente:

05. EVIDENCE LAYER


Arquitectura conceptual:

                      USER
                        │
                        ▼
                    AI AGENT
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        ▼               ▼                ▼
 RECENT CONTEXT   USER INTELLIGENCE  PROJECT KNOWLEDGE
        │               │                │
        └───────────────┼────────────────┘
                        │
                        ▼
                   LLM + MCP
                        │
                        ▼
                 TOOLS / SERVICES
                        │
                        ▼
                AUTODESK / DATA
                        │
                        ▼
                PLATFORM INTELLIGENCE

EVIDENCE LAYER debe estar disponible transversalmente.


==================================================
2. RECENT CONTEXT
HISTORIAL DE 5 DÍAS
==================================================

El historial reciente debe conservar:

- conversaciones,
- búsquedas,
- prompts del usuario,
- respuestas del agente,
- llamadas a herramientas,
- resultados de herramientas,
- proyecto asociado,
- modelo asociado,
- versión consultada,
- timestamp.

RETENCIÓN:

5 días desde la creación.

Después de 5 días debe eliminarse automáticamente.

NO conservar conversaciones completas indefinidamente.


IMPORTANTE:

No llamar a este componente "cache".

Nombre recomendado:

Recent Interaction History

o

Recent Context


==================================================
3. POLÍTICA DE RETENCIÓN
==================================================

Implementar política TTL.

Ejemplo conceptual:

created_at:
2026-09-24T10:00

expires_at:
2026-09-29T10:00

Después de expires_at:

- eliminar mensaje,
- eliminar contenido conversacional,
- eliminar payloads innecesarios,
- mantener sólo señales estructuradas permitidas si fueron extraídas previamente.

No mantener texto original si ya expiró.


==================================================
4. ANTES DE BORRAR EL HISTORIAL
==================================================

Antes de eliminar conversaciones, el sistema podrá extraer señales estructuradas.

Ejemplo:

Durante 5 días el usuario dice frecuentemente:

"ordénalo por nivel"
"muéstrame por nivel"
"agrupa por nivel"

El sistema NO guarda la conversación completa.

Puede guardar:

preferred_grouping = "level"

Otro ejemplo:

"usa la última versión"
"trabajemos con la última"

Puede generar:

preferred_model_version = "latest"

Estas señales deben ser estructuradas.


==================================================
5. USER INTELLIGENCE
==================================================

Crear una capa persistente de preferencias operativas por usuario.

Objetivo:

aprender cómo cada usuario interactúa con la plataforma.

NO guardar información sensible innecesaria.

Ejemplos de preferencias válidas:

preferred_grouping
preferred_export_format
preferred_model_version
frequent_module
frequent_discipline
preferred_result_density
preferred_language_style
preferred_view_mode

Ejemplo conceptual:

{
  "user_id": "...",
  "preference_key": "preferred_grouping",
  "value": "level",
  "confidence": 0.88,
  "observations": 17,
  "last_seen": "...",
  "source": "behavioral_learning"
}


==================================================
6. APRENDIZAJE POR FRECUENCIA
==================================================

No crear una preferencia persistente porque ocurrió una sola vez.

Usar acumulación de evidencia.

Ejemplo conceptual:

1 observación:
señal débil

5 observaciones:
probable preferencia

20 observaciones:
preferencia fuerte

Guardar:

observations
confidence
last_seen


==================================================
7. CONFIDENCE SCORE
==================================================

Cada preferencia aprendida debe incluir nivel de confianza.

Ejemplo:

preferred_grouping = "level"

confidence = 0.92

observations = 24

La confianza nunca debe interpretarse como verdad técnica.

Sólo refleja consistencia de comportamiento.


==================================================
8. DECAY
==================================================

Las preferencias pueden cambiar.

Implementar arquitectura preparada para decay.

Ejemplo:

preferred_export = "xlsx"

confidence:
0.91

Si durante varios meses deja de ocurrir:

0.91
↓
0.77
↓
0.61
↓
0.43

La implementación exacta puede definirse posteriormente.

Por ahora dejar preparada la estructura para:

last_seen
confidence
observations


==================================================
9. PROJECT KNOWLEDGE
==================================================

Separar completamente el conocimiento del proyecto del comportamiento del usuario.

PROJECT KNOWLEDGE debe contener sólo información:

- validada,
- configurada,
- proveniente de fuente verificable,
- confirmada explícitamente por usuario autorizado.

Ejemplos:

N2 = Piso 2

Subespecialidad = Subdisciplina

Modelo de referencia = ARQ

Tolerancia de niveles = 5 mm

Reglas activas = AUD-001, AUD-002


==================================================
10. ESTADOS DE CONOCIMIENTO
==================================================

Todo conocimiento del proyecto debe tener estado.

Usar:

DETECTED
SUGGESTED
VALIDATED
REJECTED
OBSOLETE

Ejemplo:

{
  "knowledge_type": "level_mapping",
  "project_id": "...",
  "value": {
    "N2": "Piso 2"
  },
  "status": "VALIDATED",
  "source": "user_confirmation",
  "validated_by": "...",
  "validated_at": "..."
}


==================================================
11. FLUJO DE APRENDIZAJE TÉCNICO
==================================================

Nunca guardar directamente una inferencia técnica como verdad.

Flujo obligatorio:

DETECT
  ↓
SUGGEST
  ↓
CONFIRM
  ↓
VALIDATE
  ↓
STORE
  ↓
REUSE

Nunca:

DETECT
  ↓
STORE AS TRUE


==================================================
12. EJEMPLO DE APRENDIZAJE DE NIVELES
==================================================

El sistema detecta:

ARQ:
N2
Elevation = 3.000

EST:
Piso 2
Elevation = 3.000

SAN:
L2
Elevation = 3.000

La plataforma puede sugerir:

"Estos niveles tienen la misma elevación.
¿Desea tratarlos como equivalentes?"

Si usuario autorizado confirma:

crear:

LEVEL_GROUP_02

members:
N2
Piso 2
L2

status:
VALIDATED

Este conocimiento pertenece al proyecto.

No pertenece al perfil del usuario.


==================================================
13. EJEMPLO DE MAPEO DE PARÁMETROS
==================================================

Regla estándar:

Subespecialidad

Cliente utiliza:

Subdisciplina

Usuario confirma equivalencia.

Guardar:

standard_parameter:
Subespecialidad

client_parameter:
Subdisciplina

project_id:
...

status:
VALIDATED

source:
user_confirmation


==================================================
14. PLATFORM INTELLIGENCE
==================================================

Crear arquitectura para aprendizaje agregado de cómo se utiliza el producto.

NO utilizar conversaciones completas.

Guardar eventos estructurados.

Ejemplos de eventos:

module_opened
audit_started
audit_completed
tool_called
tool_failed
document_opened
model_opened
issue_created
search_executed
export_created
ai_intent_detected
ai_intent_corrected


==================================================
15. EVENT MODEL
==================================================

Modelo conceptual:

{
  "event_type": "audit_completed",
  "user_id": "...",
  "organization_id": "...",
  "project_id": "...",
  "module": "audit",
  "action": "run_audit",
  "result": "success",
  "duration_ms": 8400,
  "timestamp": "..."
}

Evitar guardar contenido sensible si no es necesario.


==================================================
16. APRENDIZAJE GLOBAL
==================================================

Platform Intelligence debe permitir calcular patrones agregados.

Ejemplos:

qué módulos se usan más,

qué herramientas se usan más,

qué flujos son más frecuentes,

dónde abandonan los usuarios,

qué acciones suelen seguir a una auditoría,

qué intents fallan con mayor frecuencia,

qué tools se seleccionan incorrectamente.

Ejemplo:

Audit
  ↓
Finding
  ↓
Open model
  ↓
Create issue

Si este patrón se repite frecuentemente,
puede utilizarse para mejorar UX.


==================================================
17. APRENDIZAJE DE ERRORES DEL AGENTE
==================================================

Registrar cuando el agente interpreta mal una intención.

Ejemplo:

Usuario:
"Muéstrame las vigas del segundo piso."

Intent seleccionado:
find_documents

Usuario corrige:
"No. Elementos BIM."

Guardar señal estructurada:

expected_intent:
find_elements

selected_intent:
find_documents

correction_detected:
true

Esto debe alimentar mejora futura del routing.


==================================================
18. NO ENTRENAR CON INFORMACIÓN PRIVADA
==================================================

No asumir que datos de clientes pueden utilizarse para entrenamiento global.

Platform Intelligence debe trabajar preferentemente con:

- eventos,
- métricas,
- patrones agregados,
- señales anonimizadas,
- datos no sensibles.

Nunca mezclar conocimiento técnico privado de diferentes empresas.


==================================================
19. AISLAMIENTO DE DATOS
==================================================

Mantener aislamiento por:

organization_id
project_id
user_id

No permitir:

- User Intelligence cruzado entre usuarios,
- Project Knowledge cruzado entre proyectos sin autorización,
- conocimiento técnico cruzado entre empresas.


==================================================
20. PRIORIDAD DE FUENTES
==================================================

Definir jerarquía de verdad:

1. Fuente actual verificada
2. Resultado determinístico actual
3. Project Knowledge validado
4. Preferencia de usuario
5. Historial reciente

Nunca permitir que una conversación antigua sobreescriba un dato actual.


Ejemplo:

Historial:
"Modelo EST v31 tenía 2.850 m3"

Modelo actual:
EST v34

Resultado:

NO reutilizar 2.850 m3.

Recalcular.


==================================================
21. VERSIONADO
==================================================

Todo conocimiento técnico asociado a modelo o documento debe poder vincularse a versión.

Campos sugeridos:

model_id
version_id
document_id
document_version
valid_from
valid_until

Si una versión cambia,
el conocimiento dependiente puede requerir revalidación.


==================================================
22. EVIDENCE LAYER
==================================================

Todo aprendizaje técnico debe poder guardar evidencia.

Campos conceptuales:

source_type
source_id
source_version
project_id
model_id
element_id
document_id
rule_id
created_at
validated_by

Nunca crear aprendizaje técnico sin source o validación.


==================================================
23. PRIVACIDAD
==================================================

Diseñar arquitectura pensando en:

- mínima retención,
- minimización de datos,
- aislamiento por cliente,
- eliminación automática,
- derecho a eliminación,
- auditoría,
- seguridad enterprise.

No conservar información porque "podría servir".

Guardar sólo lo necesario.


==================================================
24. DIFERENCIA ENTRE LAS CUATRO MEMORIAS
==================================================

RECENT CONTEXT

Qué ocurrió recientemente.

Retención:
5 días.


USER INTELLIGENCE

Cómo trabaja este usuario.

Retención:
persistente con decay.


PROJECT KNOWLEDGE

Qué sabemos de este proyecto.

Retención:
vida del proyecto / hasta obsolescencia.


PLATFORM INTELLIGENCE

Cómo se utiliza el producto.

Retención:
persistente, agregada y controlada.


==================================================
25. INTERFAZ FUTURA
==================================================

Dejar preparada la arquitectura para una futura sección:

Knowledge Center

Podrá mostrar:

User Preferences

Project Knowledge

Validated Mappings

Active Rules

Learned Patterns

No desarrollar UI completa ahora,
pero diseñar las entidades para soportarla.


==================================================
26. MODELO DE DATOS SUGERIDO
==================================================

Crear o dejar preparado conceptualmente:

Conversation

Message

ToolCall

ToolResult

UserPreference

ProjectKnowledge

KnowledgeEvidence

PlatformEvent

IntentFeedback

Las relaciones deben mantenerse simples y auditables.


==================================================
27. CONVERSATIONS
==================================================

Conversation debe incluir al menos:

id
user_id
organization_id
project_id
created_at
expires_at


==================================================
28. MESSAGES
==================================================

Message debe incluir:

id
conversation_id
role
content
created_at
expires_at

El contenido debe eliminarse según TTL.


==================================================
29. TOOL CALLS
==================================================

ToolCall debe permitir registrar:

tool_name
parameters
result_status
duration
project_id
model_id
version_id
timestamp

No es obligatorio conservar payload completo indefinidamente.


==================================================
30. USER PREFERENCES
==================================================

UserPreference:

id
user_id
preference_key
value
confidence
observations
first_seen
last_seen
source


==================================================
31. PROJECT KNOWLEDGE
==================================================

ProjectKnowledge:

id
project_id
knowledge_type
value
status
source
created_by
validated_by
created_at
validated_at
valid_from
valid_until


==================================================
32. KNOWLEDGE EVIDENCE
==================================================

KnowledgeEvidence:

id
project_knowledge_id
source_type
source_id
source_version
model_id
element_id
document_id
rule_id
created_at


==================================================
33. PLATFORM EVENTS
==================================================

PlatformEvent:

id
organization_id
user_id
project_id
module
event_type
action
result
duration_ms
timestamp

Evitar guardar texto libre salvo necesidad justificada.


==================================================
34. INTENT FEEDBACK
==================================================

IntentFeedback:

id
user_id
project_id
original_intent
corrected_intent
tool_selected
tool_expected
created_at

Preparado para mejorar routing futuro.


==================================================
35. PROCESO NOCTURNO / SCHEDULED JOB
==================================================

Dejar preparado un proceso periódico que pueda:

1. identificar historial próximo a expirar,
2. extraer señales permitidas,
3. actualizar User Intelligence,
4. actualizar métricas agregadas,
5. eliminar contenido expirado,
6. mantener logs mínimos de cumplimiento.

No es necesario implementar IA avanzada de extracción todavía.

Puede inicialmente ejecutarse con reglas simples.


==================================================
36. NO IMPLEMENTAR TODAVÍA
==================================================

No desarrollar todavía:

- entrenamiento de modelos,
- fine-tuning,
- embeddings complejos,
- aprendizaje automático autónomo,
- clustering,
- recommender systems,
- Knowledge Center completo,
- memoria semántica avanzada,
- cross-company learning,
- entrenamiento con chats completos.


==================================================
37. MVP DE ESTA ARQUITECTURA
==================================================

Para una primera versión funcional implementar sólo:

1. historial reciente de 5 días,
2. TTL y eliminación automática,
3. UserPreference,
4. ProjectKnowledge,
5. PlatformEvent,
6. Evidence metadata,
7. separación estricta entre behavioral learning y technical knowledge.


==================================================
38. REGLA DE SEGURIDAD
==================================================

No permitir que una preferencia de usuario altere reglas técnicas.

Ejemplo:

UserPreference:
preferred_grouping = "level"

OK.

UserPreference:
level_tolerance = 25 mm

NO OK como regla técnica.

La tolerancia debe existir en:

ProjectKnowledge
o
RuleConfiguration

y debe estar validada.


==================================================
39. REGLA DE CONFIANZA
==================================================

La confianza de User Intelligence no sustituye validación técnica.

confidence = 0.99

NO significa:

"es verdad técnicamente".

Sólo significa:

"este comportamiento se observa frecuentemente".


==================================================
40. CRITERIOS DE ACEPTACIÓN
==================================================

[ ] Existe separación entre Recent Context, User Intelligence,
    Project Knowledge y Platform Intelligence.

[ ] El historial completo tiene TTL de 5 días.

[ ] Las conversaciones expiradas pueden eliminarse automáticamente.

[ ] Las preferencias de usuario persisten separadamente.

[ ] El conocimiento técnico requiere validación/evidencia.

[ ] Existe trazabilidad de origen.

[ ] Existe arquitectura para eventos de uso.

[ ] No existen aprendizajes técnicos automáticos sin validación.

[ ] Los datos están aislados por organización/proyecto/usuario.

[ ] Las preferencias tienen confidence y observations.

[ ] Existe soporte conceptual para decay.

[ ] Existe soporte para versionado y obsolescencia.

[ ] No se usan conversaciones antiguas como fuente de verdad.

[ ] No se guardan datos mock como aprendizaje real.

[ ] NO HALLUCINATIONS se mantiene como principio transversal.


==================================================
41. PRINCIPIO FINAL
==================================================

La plataforma puede olvidar conversaciones.

La plataforma puede aprender cómo trabajan los usuarios.

La plataforma puede aprender cómo se usa el producto.

La plataforma puede conservar conocimiento técnico validado.

Pero la plataforma nunca debe transformar una inferencia no validada
en una verdad técnica.


BEHAVIOR CAN BE LEARNED.

TECHNICAL TRUTH MUST BE VERIFIED.

NO EVIDENCE → NO CLAIM.

Mi recomendación es que esto quede como un documento propio dentro del repositorio, por ejemplo:

docs/
   memory-architecture.md

y que en AGENTS.md dejes una regla corta que obligue a Codex a respetarlo:

Memory and learning must follow docs/memory-architecture.md.

Recent conversation history expires after 5 days.

Behavioral learning may be automatic.

Technical knowledge requires validated evidence.

Never promote inferred technical information to truth.

NO EVIDENCE → NO CLAIM.

Eso deja bien separadas desde ahora las cuatro capas: historial temporal, aprendizaje del usuario, conocimiento del proyecto y aprendizaje global de la plataforma.