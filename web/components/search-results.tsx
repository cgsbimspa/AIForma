"use client";
import { ExternalLink, FileText, Folder, Search } from "lucide-react";
import type { SearchBatch } from "@/lib/search/contracts";
export const searchStatus: Record<string, string> = { pending: "Lectura del texto pendiente", read: "Texto revisado", partial_text: "Algunas páginas no tienen texto extraíble", ocr_required: "PDF sin texto extraíble; requiere OCR", no_text: "No se encontró texto extraíble", unsupported_document: "Formato no disponible para lectura de texto", document_too_large: "Supera el límite de lectura de 25 MB", storage_unavailable: "Original no disponible para descarga", parse_failed: "No se pudo extraer el texto", parse_timeout: "La lectura superó el tiempo permitido", parse_limit: "Documento fuera de los límites de extracción", parse_cancelled: "Lectura interrumpida", document_unavailable: "No se pudo leer el documento", download_failed: "Falló la descarga del original", forbidden: "Sin permiso de acceso", not_found: "Recurso no disponible", unavailable: "Autodesk no respondió", invalid_response: "Respuesta de Autodesk no verificable", rate_limited: "Autodesk limitó las consultas", autodesk_partial: "Autodesk devolvió información parcial", search_limit: "Se alcanzó el límite de recorrido; acota la búsqueda a un proyecto" };
export function SearchResults({ result, busy, resume }: { result: SearchBatch; busy: boolean; resume: () => void }) {
  const complete = result.done && !result.warnings.length;
  return <div className="document-search-results">
    <div className="search-progress"><Search size={16}/><strong>{busy && !result.done ? "Buscando en carpetas y documentos…" : complete ? "Búsqueda terminada" : result.done ? "Recorrido terminado con cobertura parcial" : "Búsqueda parcial"}</strong></div>
    <p className="search-terms">Términos: {result.terms.map(t => t.join(" + ")).join(" · o · ")}</p>
    <p className="search-counts">{result.stats.folders} carpetas · {result.stats.files} archivos encontrados · {result.stats.documentsRead} documentos con texto revisado · {result.stats.matched} {result.stats.matched === 1 ? "recurso con coincidencias" : "recursos con coincidencias"}</p>
    {result.stats.unread > 0 && <p className="search-coverage">{result.stats.unread} archivos con lectura incompleta o no disponible. No se puede descartar que contengan otras coincidencias.</p>}
    {!result.hits.length && <p className="search-coverage">{complete ? "Sin coincidencias para estos términos en los nombres, rutas y textos revisados." : "Todavía no hay coincidencias verificadas. La búsqueda no demuestra su ausencia en los archivos pendientes o no legibles."}</p>}
    {result.hits.map(hit => <div className="search-hit" key={hit.key}>
      <div className="search-hit-title">{hit.type === "folders" ? <Folder size={17}/> : <FileText size={17}/>}<strong>{hit.name}</strong></div>
      <p className="search-hit-path"><span>Ruta</span>{hit.path}</p>
      {hit.matches.map((match, i) => <div className="search-excerpt" key={i}><span className={`match-label match-${match.kind}`}>{match.kind === "text" ? `Texto encontrado · ${match.location}` : match.kind === "name" ? "Coincidencia en el nombre" : "Coincidencia en la ruta"}</span>{match.excerpt && <blockquote>{match.excerpt}</blockquote>}</div>)}
      <div className="search-hit-actions">{hit.webUrl ? <a href={hit.webUrl} target="_blank" rel="noopener noreferrer">Abrir en Autodesk <ExternalLink size={13}/></a> : <span>Autodesk no proporcionó un enlace web para este recurso.</span>}{hit.version !== undefined && <span>Versión {hit.version}</span>}</div>
      {hit.contentStatus && <p className="search-read-status">{searchStatus[hit.contentStatus] ?? "Lectura no disponible"}</p>}
      <details className="search-source"><summary>Fuente y fecha de consulta</summary><p>{new Date(hit.fetchedAt).toLocaleString("es-CL")}</p><code>{hit.endpoint}</code>{hit.versionId && <code>Versión: {hit.versionId}</code>}</details>
    </div>)}
    {result.stats.matched > result.hits.length && <p className="search-coverage">Se muestran las primeras {result.hits.length} coincidencias. Acota los términos para reducir los resultados.</p>}
    {!!result.warnings.length && <details className="search-limitations"><summary>Alcance de lectura y archivos no revisados</summary>{result.warnings.map(code => <p key={code}>{searchStatus[code] ?? "Una ubicación no pudo revisarse"}</p>)}{result.issues.map((issue, i) => <p key={i}><strong>{issue.path}</strong><br/>{searchStatus[issue.code] ?? "Lectura no disponible"}</p>)}</details>}
    {result.cursor && !busy && <button type="button" className="assistant-primary continue-search" onClick={resume}>Continuar búsqueda · {result.pending} tareas pendientes</button>}
    <p className="search-snapshot">Versiones disponibles al momento de cada lectura. Los fragmentos provienen del texto extraído; las coincidencias no son conclusiones técnicas.</p>
  </div>;
}
