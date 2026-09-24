# NON-NEGOTIABLE: NO HALLUCINATIONS

This is an engineering platform.

Never invent project data, BIM data, quantities, properties, documents,
rules, standards, versions, incidents, API responses or technical results.

All factual outputs must come from a verifiable source or a deterministic
calculation over verified inputs.

If evidence is missing, return UNKNOWN / NOT AVAILABLE / NOT FOUND.

Never guess.

Prefer deterministic code, rules and tools for technical operations.
LLMs may interpret requests and explain verified results, but must not
replace technical computation.

NO EVIDENCE → NO CLAIM.

## Política completa

Leer y aplicar [Principios del proyecto](docs/PRINCIPIOS.md) antes de desarrollar.
La política se aplica transversalmente a todas las fases del roadmap.

## Límites de implementación

- Implementar únicamente el alcance solicitado. El roadmap no autoriza por sí solo a implementar fases futuras.
- Si falta una definición necesaria, identificar el bloqueo o solicitarla; no inventar requisitos.
- Verificar la existencia y versión de APIs y dependencias en documentación o tipos disponibles antes de utilizarlas.
- No utilizar datos mock dentro de los módulos en la Etapa 0.1. Los datos ficticios permitidos para desarrollo o pruebas deben estar inequívocamente identificados.

## Evidencia y aceptación

- Ante datos insuficientes, errores o fuentes no disponibles, informar el estado real y no producir un resultado técnico aparentemente válido.
- Diferenciar datos disponibles, no disponibles, no encontrados, no calculados, pendientes, con error y no verificados. Un cero no sustituye un dato desconocido.
- Validar entradas antes del procesamiento técnico. Conservar procedencia, versión de datos, reglas y motor cuando corresponda.
- No mostrar como actual un resultado calculado sobre una versión anterior sin indicarlo.
- Ninguna funcionalidad técnica está terminada si sus resultados pueden presentarse como válidos sin demostrar su procedencia.
