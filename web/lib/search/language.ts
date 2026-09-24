import { normalizeText, termsSchema, type SearchTerms, type SearchBatch } from "./contracts.ts";

// Retrieval vocabulary only. These variants never establish a document's type
// or a technical equivalence; every hit still points to its original source.
const singular: Record<string, string> = {
  ordenes: "orden", compras: "compra", documentos: "documento", archivos: "archivo",
  carpetas: "carpeta", planos: "plano", informes: "informe", contratos: "contrato",
  facturas: "factura", presupuestos: "presupuesto", cotizaciones: "cotizacion",
  suelos: "suelo", estudios: "estudio", especificaciones: "especificacion",
};
const stopWords = new Set(["de", "del", "la", "las", "el", "los", "en"]);
export function expandSearchTerms(terms: SearchTerms): SearchTerms {
  const groups = terms.map(group => {
    const words = [...new Set(group.flatMap(term =>
    (/\d/.test(term) ? [normalizeText(term)] : normalizeText(term).split(/\s+/)).filter(word => !stopWords.has(word)).map(word => singular[word] ?? word)
    ))];
    return words.length <= 6 ? words : group.map(normalizeText);
  }).filter(group => group.length);
  const expanded: string[][] = [];
  for (const group of groups) {
    expanded.push(group);
    if (group.includes("orden") && group.includes("compra")) {
      const qualifiers = group.filter(word => word !== "orden" && word !== "compra");
      expanded.push(["oc", ...qualifiers], ["purchase", "order", ...qualifiers]);
    } else if (group.includes("oc")) {
      const qualifiers = group.filter(word => word !== "oc");
      expanded.push(["orden", "compra", ...qualifiers], ["purchase", "order", ...qualifiers]);
    }
  }
  const unique = [...new Map(expanded.map(group => [[...group].sort().join("|"), group])).values()];
  // Preserve every original alternative before adding aliases within the budget.
  const prioritized = [...groups, ...unique];
  const bounded = [...new Map(prioritized.map(group => [[...group].sort().join("|"), group])).values()].filter(group => group.length <= 6).slice(0, 4);
  return termsSchema.parse(bounded.length ? bounded : terms);
}

export function searchConversation(result: Pick<SearchBatch, "stage"|"done"|"warnings"|"hits">, busy: boolean) {
  const complete = result.done && !result.warnings.length;
  const where = result.stage === "folders" ? "los nombres de las carpetas" : result.stage === "files" ? "los nombres de los archivos" : "el contenido de los archivos";
  const intro = result.hits.length
    ? `Encontré coincidencias en ${where}. Te dejo las ubicaciones para que podamos revisar cuál corresponde a lo que necesitas.`
    : busy ? `Estoy revisando ${where} dentro de tu selección…`
    : complete ? `No encontré coincidencias en ${where} de esta selección.`
    : `Por ahora no encontré coincidencias en ${where} que pude revisar. Hay contenido pendiente o no disponible, así que todavía no puedo descartar que esté allí.`;
  const next = result.stage === "folders"
    ? "¿Quieres que ampliemos la búsqueda a los nombres de los archivos? Mantendré la misma selección."
    : "¿Quieres que busque también dentro de los documentos? Revisaré el texto disponible, incluidos escaneos e imágenes, y te indicaré dónde aparece.";
  return { intro, question: !complete && !busy ? `Esta revisión quedó incompleta. ${next}` : next };
}

export function acceptsNextSearchStage(text: string) {
  return /^(?:si(?: por favor)?|dale|adelante|continuar|continua|sigamos|amplia(?: la busqueda)?|busca (?:tambien )?(?:en (?:los )?nombres de archivos|en (?:los )?archivos|dentro de (?:los )?archivos|en (?:el )?contenido)|si[, ]+(?:busca|buscar|continua|continuar|amplia)(?: (?:tambien|en archivos|en los archivos|en nombres de archivos|dentro de los archivos|la busqueda|por favor))*)[.!?]*$/.test(normalizeText(text));
}
