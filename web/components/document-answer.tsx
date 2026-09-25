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
  unverified: "No pude confirmar ese dato con suficiente respaldo en el documento. Si me indicas el apartado o el concepto exacto, puedo volver a revisarlo.",
};
export function DocumentAnswer({ answer }: { answer: Answer }) {
  const literal = answer.mode === "extract";
  return <div className="document-answer">
    {answer.mode !== "ask" && <strong className="document-answer-title"><FileText size={16}/>{literal ? "Datos extraídos del documento" : answer.partial ? "Resumen del contenido leído · Lectura parcial" : answer.sources.length === 1 ? "Resumen general del documento" : "Resumen general de la selección"}</strong>}
    {answer.mode === "summary" && <p className="document-answer-note">{answer.partial ? "Este resumen sólo cubre el contenido que se pudo leer; quedan partes sin revisar. Consulta la cobertura al final." : "Síntesis del contenido leído. Cada apartado incluye su fuente y ubicación para que puedas verificarlo."}</p>}
    {answer.mode === "summary" && answer.status !== "answered" && <p className="message-body"><strong>{answer.status === "unsupported" ? messages.unsupported : answer.status === "unverified" ? "No pude verificar un resumen suficientemente respaldado. Puedes reintentar o seleccionar una parte más concreta del documento." : "No hay suficiente contenido legible y verificable para entregar el resumen solicitado."}</strong></p>}
    {answer.mode !== "summary" && answer.status !== "answered" && <p className="message-body"><strong>{answer.status === "not_available" && answer.sources.length > 0 && answer.sources.every(s => !["read", "partial_text", "context_limit", "reading_pages"].includes(s.status)) ? "No pude leer el contenido de los archivos seleccionados. Esto no significa que el dato no esté en el documento. Abre el detalle de cobertura para ver el motivo." : messages[answer.status]}</strong></p>}
    {answer.blocks.map((block, index) => <section className="document-answer-block" key={index}>
      {block.label && answer.mode !== "ask" && <h4>{block.label}</h4>}<p className="message-body">{block.text}</p>
      <p className="document-inline-source">De acuerdo con {block.citations.map((citation, i) => <span key={citation.segmentId + i}>{i > 0 && "; "}{citation.source.webUrl ? <a href={citation.source.webUrl} target="_blank" rel="noopener noreferrer">{citation.source.name} <ExternalLink size={12}/></a> : <strong>{citation.source.name}</strong>}, {citation.location}{citation.method === "ocr" && " (lectura por OCR)"}</span>)}.</p>
      <details className="document-citations" open={literal}><summary>Ver el fragmento que respalda esta respuesta</summary>
        {block.citations.map((citation, i) => <div className="document-citation" key={i}>
          <strong>{citation.source.name}</strong><span>{citation.location} · Versión {citation.source.version}</span>
          <blockquote>{citation.quote}</blockquote>{citation.method === "ocr" && <small>Texto reconocido por OCR; verifica la lectura en el original.</small>}<small>{citation.source.path}</small>
          {citation.source.webUrl && <a href={citation.source.webUrl} target="_blank" rel="noopener noreferrer">Abrir en Autodesk <ExternalLink size={13}/></a>}
        </div>)}
      </details>
    </section>)}
    {!answer.partial && answer.warnings.map(w => <p className="search-coverage" key={w}>{w}</p>)}
    {answer.partial && <div className="document-coverage-warning" role="status"><strong>Lectura parcial de la selección</strong><p>La respuesta sólo cubre el texto que se pudo leer. No equivale a una revisión completa.</p>{answer.warnings.map(w => <p key={w}>{w}</p>)}{answer.pending > 0 && <p>{answer.pending} tareas pendientes. Selecciona una ubicación más pequeña para continuar con esos documentos.</p>}</div>}
    <details className="document-coverage"><summary>Documentos y cobertura · {answer.sources.filter(s => ["read", "partial_text", "context_limit"].includes(s.status)).length} con texto leído de {answer.sources.length} procesados</summary>
      <p>Alcance: {answer.scopePath}</p>
      {answer.sources.map(source => <div className="document-source" key={source.id}><strong>{source.id} · {source.name}</strong><span>{statuses[source.status] ?? searchStatus[source.status] ?? "Lectura no disponible (" + source.status + ")"}</span><small>{source.path}</small>{source.totalPages !== undefined && <small>Páginas procesadas: {source.throughPage ?? 0} de {source.totalPages}{source.nextPage ? ` · Pendiente desde la página ${source.nextPage}` : ""}</small>}{source.warnings?.map(w => <small key={w}>{searchStatus[w] ?? "Hay contenido que no se pudo revisar"}</small>)}{source.version && <span>Versión {source.version}</span>}<time dateTime={source.fetchedAt}>{new Date(source.fetchedAt).toLocaleString("es-CL")}</time><code>{source.endpoint}</code>{source.webUrl && <a href={source.webUrl} target="_blank" rel="noopener noreferrer">Abrir documento en Autodesk</a>}</div>)}
    </details>
    <p className="document-answer-note">Puedes abrir las fuentes para comprobar el dato y su contexto.</p>
  </div>;
}
