import { normalizeText } from "../search/contracts.ts";

export const generalSummaryQuestion = "Entrega un resumen general del contenido de la selección: explica de qué trata, su propósito y sus puntos principales. Incluye conclusiones, condiciones y pendientes sólo si aparecen en el documento. Redacta una síntesis clara con referencias a los fragmentos leídos, sin conocimiento externo ni suposiciones. Si la lectura es parcial, indícalo.";
export function isGeneralSummaryRequest(text: string) {
  const value=normalizeText(text).replace(/^[¿¡\s]+/, "");
  return /^(?:(?:por favor|puedes|podrias)\s+)?(?:resume(?:me)?|resumir|resumen(?:\s+general)?\b|(?:haz(?:me)?|dame|genera|entrega|prepara)\s+(?:un\s+)?resumen)\b/.test(value);
}

// Only routes the request; never supplies document facts or widens its scope.
export function isDocumentQuestion(text: string) {
  const value = normalizeText(text).replace(/^[¿¡\s]+/, "");
  if (/\b(?:en|dentro de|segun) (?:el |este |los |estos )?(?:contenido|texto|plano|documento|pdf)\b/.test(value)) return true;
  if (/\b(?:carpetas?|archivos?|proyectos?)\b/.test(value) && /\b(?:nombres?|busca|buscar|encuentra|donde|muestrame|lista|hay|tengo)\b/.test(value)) return false;
  return /^(?:que|cual(?:es)?|cuanto[sa]?|como|por que|a que|en que|indicame|explica(?:me)?|dime)\b/.test(value) || /\b(?:que dice|que indica|que muestra|que aparece|que contiene|segun el documento)\b/.test(value);
}
export function needsPlanReading(question: string) {
  return /\b(?:calles?|avenidas?|pasajes?|emplazamiento|loteo|rotulos?|plano|lamina|imagen|escaneo|deslindes?|colindantes?|aledan[oa]s?)\b/.test(normalizeText(question));
}
