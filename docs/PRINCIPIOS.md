# Principios del proyecto: evidencia y trazabilidad

Fuente: texto proporcionado por el usuario en esta conversación. Se conserva a continuación el contenido de las secciones 0 a 0.21. Este documento establece requisitos transversales; no define el alcance funcional de la Etapa 0.1.

==================================================
0. PRINCIPIO CRÍTICO DEL PROYECTO
NO HALLUCINATIONS / ZERO UNSUPPORTED CLAIMS
==================================================

Este principio aplica a TODO el proyecto y a TODAS las futuras fases.

Es un requisito de arquitectura, desarrollo, procesamiento de datos,
inteligencia artificial, experiencia de usuario y control de calidad.

REGLA FUNDAMENTAL:

EL SISTEMA NUNCA DEBE INVENTAR INFORMACIÓN.

Ningún dato, resultado, propiedad BIM, cantidad, documento, regla,
incidencia, estado, versión, usuario, proyecto, conclusión técnica
o respuesta de IA puede presentarse como verdadero si no existe una
fuente verificable que lo respalde.

Cuando el sistema no dispone de información suficiente debe responder,
según corresponda:

- Información no disponible.
- Dato no encontrado.
- No existe evidencia suficiente.
- No se puede determinar con los datos disponibles.
- Fuente no disponible.
- Análisis no ejecutado.

Nunca completar información faltante mediante suposición.


==================================================
0.1 FUENTES DE VERDAD
==================================================

Todo dato factual presentado por la plataforma debe poder asociarse
a una fuente de verdad identificable.

Ejemplos de fuentes válidas futuras:

- Autodesk ACC
- Autodesk Forma
- Autodesk APS
- AEC Data Model
- Model Derivative
- modelos BIM
- documentos almacenados
- base de datos interna
- reglas configuradas
- resultados de motores determinísticos
- APIs externas autorizadas
- información ingresada explícitamente por el usuario

Cada resultado técnico debe mantener, cuando corresponda, trazabilidad
hacia:

source
project
model
document
version
element
rule
timestamp

No crear datos ficticios para llenar espacios visuales.


==================================================
0.2 IA NO ES FUENTE DE VERDAD
==================================================

Un LLM nunca debe considerarse una fuente de verdad del proyecto.

La IA puede utilizarse para:

- interpretar lenguaje natural
- identificar intención
- seleccionar herramientas
- resumir información disponible
- explicar resultados
- organizar información
- facilitar navegación
- generar texto basado en evidencia
- ayudar al usuario a consultar información

La IA NO debe utilizarse directamente para:

- inventar cantidades
- inventar parámetros
- inventar propiedades BIM
- inventar elementos
- inventar versiones
- inventar documentos
- inventar normativa
- inventar resultados de auditoría
- inventar incidencias
- inventar cálculos
- inventar cumplimiento técnico
- asumir datos faltantes


==================================================
0.3 SEPARACIÓN ENTRE IA Y CÁLCULO
==================================================

Los procesos técnicos deben ejecutarse mediante lógica determinística.

Ejemplo:

INCORRECTO:

Usuario:
"¿Cuántos m3 de hormigón tiene el nivel 2?"

LLM:
"El nivel tiene aproximadamente 350 m3."


CORRECTO:

Usuario
   ↓
LLM interpreta intención
   ↓
Quantity Engine
   ↓
Consulta datos reales
   ↓
Calcula
   ↓
Resultado verificable
   ↓
LLM presenta o explica el resultado


La IA puede explicar un cálculo.

La IA no debe reemplazar el cálculo.


==================================================
0.4 FAIL CLOSED
==================================================

Ante incertidumbre, error, dato faltante, fallo de API o ausencia de
fuente verificable:

EL SISTEMA DEBE FALLAR DE MANERA SEGURA.

Es preferible entregar:

"No es posible determinarlo"

antes que entregar un resultado potencialmente incorrecto.

No utilizar valores aproximados salvo que:

1. el usuario haya solicitado explícitamente una estimación,
2. el sistema indique claramente que se trata de una estimación,
3. se indique la metodología utilizada,
4. los datos de entrada sean conocidos.


==================================================
0.5 NO INFERIR INFORMACIÓN BIM INEXISTENTE
==================================================

Nunca asumir que un modelo contiene un parámetro por el solo hecho de
que normalmente debería contenerlo.

Nunca asumir:

- niveles
- coordenadas
- materiales
- códigos
- familias
- tipos
- cantidades
- ubicaciones
- estados
- clasificaciones
- especialidades
- parámetros compartidos
- unidades

El sistema debe consultar primero la información disponible.


==================================================
0.6 NO INVENTAR EQUIVALENCIAS
==================================================

No asumir automáticamente que términos diferentes representan lo mismo.

Ejemplo:

"N2"
"Nivel 2"
"Piso 2"
"Segundo Piso"

pueden o no representar el mismo nivel.

La equivalencia debe ser:

- definida mediante reglas,
- configurada por el proyecto,
- validada por un usuario,
- o demostrada mediante información objetiva como elevación y contexto.

Una similitud semántica del LLM no es suficiente para modificar
información técnica.


==================================================
0.7 NORMATIVA
==================================================

Nunca generar requisitos normativos basándose únicamente en memoria
del modelo de lenguaje.

Toda regla normativa debe provenir de una fuente controlada.

Preferentemente:

Normativa
   ↓
regla normalizada
   ↓
JSON / base de reglas
   ↓
Rules Engine
   ↓
validación determinística


Ejemplo conceptual:

{
  "rule_id": "RULE-001",
  "source": "...",
  "parameter": "...",
  "operator": "<=",
  "value": 200,
  "unit": "mm"
}

El LLM puede explicar la regla.

El LLM no puede inventarla.


==================================================
0.8 DOCUMENTOS
==================================================

Cuando posteriormente se analicen documentos:

No afirmar que un documento contiene determinada información si esa
información no fue efectivamente encontrada.

Toda respuesta deberá diferenciar entre:

- contenido encontrado explícitamente,
- resultado calculado,
- interpretación,
- información no encontrada.

No rellenar silenciosamente campos ausentes.


==================================================
0.9 PROVENANCE / TRAZABILIDAD
==================================================

Preparar la arquitectura para que cualquier resultado importante pueda
guardar metadata de procedencia.

Ejemplo conceptual:

{
  "value": 234.52,
  "unit": "m3",
  "source": "Autodesk",
  "project_id": "...",
  "model_id": "...",
  "version_id": "...",
  "calculated_at": "...",
  "engine": "quantity-engine",
  "rule_version": "..."
}

El usuario debe poder saber de dónde provino un resultado.


==================================================
0.10 DETERMINISMO
==================================================

Siempre que una tarea pueda resolverse mediante:

- código
- reglas
- consultas
- filtros
- operaciones matemáticas
- algoritmos
- comparación de valores

debe preferirse un mecanismo determinístico por sobre generación libre
del LLM.

Principio:

DATA + RULES + CODE → RESULT

LLM → INTERACTION / EXPLANATION


==================================================
0.11 CONTROL DE ERRORES
==================================================

Nunca transformar un error de sistema en una respuesta ficticia.

Ejemplo:

Si Autodesk API no responde:

INCORRECTO:
"El proyecto contiene 7 modelos."

CORRECTO:
"No fue posible consultar Autodesk. No se puede determinar actualmente
la cantidad de modelos."

Registrar técnicamente el error para diagnóstico.


==================================================
0.12 DATOS MOCK
==================================================

Los datos ficticios sólo podrán existir cuando sean necesarios
explícitamente para:

- desarrollo
- tests
- Storybook
- prototipos identificados

Todo dato ficticio debe estar inequívocamente marcado como MOCK,
DEMO o TEST.

Nunca presentar mock data como datos reales.

En la actual Etapa 0.1:

NO utilizar mock data dentro de los módulos.


==================================================
0.13 CODEX TAMPOCO DEBE INVENTAR
==================================================

Durante el desarrollo, Codex no debe inventar:

- APIs que no existen
- endpoints
- métodos Autodesk
- nombres de SDK
- parámetros
- estructuras existentes en el repositorio
- variables de entorno
- tablas de base de datos
- requisitos funcionales no especificados
- comportamiento de los módulos
- credenciales
- dependencias técnicas supuestamente existentes

Antes de utilizar una API o librería:

1. comprobar si existe,
2. revisar documentación o tipos disponibles,
3. comprobar la versión utilizada,
4. utilizar únicamente métodos válidos.

Si falta información para implementar correctamente una funcionalidad:

NO INVENTAR.

Dejar identificado el bloqueo o solicitar definición.


==================================================
0.14 NO INVENTAR REQUERIMIENTOS
==================================================

Codex debe implementar exactamente el alcance solicitado.

Si el requerimiento dice:

"Crear página vacía Auditoría BIM"

no debe interpretar:

"Crear dashboard de auditoría."

Si el requerimiento dice:

"Crear ruta Cubicaciones"

no debe crear:

- cálculos
- tablas
- gráficos
- filtros
- datos ficticios

No anticiparse al roadmap.


==================================================
0.15 ESTADOS DE INFORMACIÓN
==================================================

Preparar conceptualmente el sistema para diferenciar estados tales como:

AVAILABLE
NOT_AVAILABLE
NOT_FOUND
NOT_CALCULATED
PENDING
ERROR
UNVERIFIED

Evitar utilizar valores falsos como:

0
"-"
"N/A"

cuando dichos valores puedan confundirse con un resultado real.

Ejemplo:

Cantidad = 0

NO significa lo mismo que:

Cantidad = no calculada.


==================================================
0.16 VALIDACIÓN
==================================================

Todo motor técnico futuro debe incorporar:

INPUT
   ↓
VALIDATION
   ↓
PROCESSING
   ↓
RESULT
   ↓
TRACEABILITY


No procesar silenciosamente datos inválidos.


==================================================
0.17 VERSIONADO
==================================================

Los resultados técnicos deben estar vinculados a la versión de los
datos sobre la cual fueron calculados.

Nunca mostrar como actual un resultado calculado contra una versión
anterior sin informarlo.

Especialmente relevante para:

- modelos BIM
- documentos
- cubicaciones
- auditorías
- normativa
- incidencias


==================================================
0.18 RESPUESTAS DEL ASISTENTE IA
==================================================

Cuando posteriormente exista el Asistente IA, sus respuestas deben
estar basadas exclusivamente en:

1. información recuperada,
2. resultados de herramientas,
3. fuentes autorizadas,
4. contexto explícitamente proporcionado.

Cuando no encuentre respuesta:

debe decirlo.

Nunca debe completar una respuesta técnica utilizando conocimiento
probabilístico como si proviniera del proyecto.


==================================================
0.19 PRINCIPIO DE EVIDENCIA
==================================================

Para funcionalidades técnicas:

NO EVIDENCE → NO CLAIM

Sin evidencia:

no hay afirmación factual.


==================================================
0.20 PRIORIDAD DEL PROYECTO
==================================================

En caso de conflicto entre:

- experiencia visual,
- rapidez,
- automatización,
- comodidad del usuario

y

- precisión
- trazabilidad
- confiabilidad

SIEMPRE priorizar:

PRECISIÓN + TRAZABILIDAD + CONFIABILIDAD.


==================================================
0.21 CRITERIO GLOBAL DE ACEPTACIÓN
==================================================

Ninguna funcionalidad futura deberá considerarse terminada si puede
producir información técnica aparentemente válida sin poder demostrar
su procedencia.

Este criterio aplica transversalmente a toda la plataforma.
