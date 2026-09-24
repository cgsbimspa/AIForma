import { ExternalLink, FileText } from "lucide-react";
import { searchStatus } from "./search-results";
import type { DocumentAnswer as Answer } from "@/lib/assistant/document-contracts";

const statuses: Record<string, string> = {
  read: "Texto leído", partial_text: "Lectura parcial: hay contenido sin revisar", context_limit: "Texto leído parcialmente por límite de contexto",
  unsupported_document: "Formato no compatible", ocr_required: "Requiere OCR", no_text: "Sin texto extraíble",
  document_too_large: "Supera 25 MB", forbidden: "Sin permiso", not_found: "No disponible",
  parse_failed: "No se pudo extraer texto", parse_timeout: "Se agotó el tiempo de extracción", expired: "Sesión vencida",
};
const messages = {
  not_available: "No encontré lo solicitado en el texto que pude leer. Si hay lectura parcial, todavía puede estar en contenido no revisado. Usa Buscar para localizar primero la carpeta o el archivo.",
  unsupported: "Esta solicitud requiere cálculos o una validación técnica que no están implementados. Puedes pedir que extraiga lo que los documentos dicen explícitamente.",
  unverified: "No fue posible respaldar la respuesta con las citas y su contexto. No se mostrará una conclusión sin soporte. Prueba una pregunta más específica.",
};
export function DocumentAnswer({ answer }: { answer: Answer }) {
  const literal = answer.mode === "extract";
  return <div className="document-answer">
    <strong className="document-answer-title"><FileText size={16}/>{literal ? "Datos extraídos del documento" : answer.mode === "summary" ? "Resumen de los documentos" : "Respuesta sobre los documentos"}</strong>
    <p className="document-answer-note">{literal ? "Valores literales · Citas comprobadas en el texto extraído." : "Síntesis de IA · Consulta las citas originales para comprobar su interpretación."}</p>
    {answer.status !== "answered" && <p className="message-body"><strong>{messages[answer.status]}</strong></p>}
    {!answer.partial && answer.warnings.map(w => <p className="search-coverage" key={w}>{w}</p>)}
    {answer.partial && <div className="document-coverage-warning" role="status"><strong>Lectura parcial de la selección</strong><p>La respuesta sólo cubre el texto que se pudo leer. No equivale a una revisión completa.</p>{answer.warnings.map(w => <p key={w}>{w}</p>)}{answer.pending > 0 && <p>{answer.pending} tareas pendientes. Selecciona una ubicación más pequeña para continuar con esos documentos.</p>}</div>}
    {answer.blocks.map((block, index) => <section className="document-answer-block" key={index}>
      {block.label && <h4>{block.label}</h4>}<p className="message-body">{block.text}</p>
      <details className="document-citations" open={literal}><summary>Ver evidencia · {block.citations.map(c => c.source.id + " · " + c.location).join(" / ")}</summary>
        {block.citations.map((citation, i) => <div className="document-citation" key={i}>
          <strong>{citation.source.name}</strong><span>{citation.location} · Versión {citation.source.version}</span>
          <blockquote>{citation.quote}</blockquote>{citation.method === "ocr" && <small>Texto reconocido por OCR; verifica la lectura en el original.</small>}<small>{citation.source.path}</small>
          {citation.source.webUrl && <a href={citation.source.webUrl} target="_blank" rel="noopener noreferrer">Abrir en Autodesk <ExternalLink size={13}/></a>}
        </div>)}
      </details>
    </section>)}
    <details className="document-coverage"><summary>Documentos y cobertura · {answer.sources.filter(s => ["read", "partial_text", "context_limit"].includes(s.status)).length} con texto leído de {answer.sources.length} procesados</summary>
      <p>Alcance: {answer.scopePath}</p>
      {answer.sources.map(source => <div className="document-source" key={source.id}><strong>{source.id} · {source.name}</strong><span>{statuses[source.status] ?? searchStatus[source.status] ?? "Lectura no disponible (" + source.status + ")"}</span><small>{source.path}</small>{source.warnings?.map(w => <small key={w}>{searchStatus[w] ?? "Hay contenido que no se pudo revisar"}</small>)}{source.version && <span>Versión {source.version}</span>}<time dateTime={source.fetchedAt}>{new Date(source.fetchedAt).toLocaleString("es-CL")}</time><code>{source.endpoint}</code>{source.webUrl && <a href={source.webUrl} target="_blank" rel="noopener noreferrer">Abrir documento en Autodesk</a>}</div>)}
    </details>
    <p className="document-answer-note">Fuentes consultadas para esta pregunta. No se certifica cumplimiento ni se calculan resultados técnicos.</p>
  </div>;
}
