import { browse, DataError, querySchema } from "../autodesk/data.ts";
import type { DataScope } from "../autodesk/data.ts";
import { startSearch } from "../search/engine.ts";
import { itemTip, supportedDocument } from "../documents/download.ts";
import { createDocumentReader, readDocument } from "../documents/reader.ts";
import { parseDocument } from "../documents/parser.ts";
import type { DocumentEvidence, DocumentSource } from "./document-contracts.ts";

// This collector has no global/project fallback. Every task descends from the verified selection.
export async function collectDocumentEvidence(token: string, scope: DataScope, expiresAt: number, signal?: AbortSignal, options: { fetcher?: typeof fetch; parser?: typeof parseDocument; maxDocuments?: number; maxCharacters?: number; milliseconds?: number; detail?: "plan" } = {}): Promise<DocumentEvidence> {
  if (scope.kind !== "file" && scope.kind !== "folder") throw new DataError("document_selection_required", 400);
  const fetcher = options.fetcher ?? fetch, parser = options.parser ?? parseDocument;
  const read = options.fetcher || options.parser ? createDocumentReader({ fetcher, parser }) : readDocument;
  const started = Date.now(), state = await startSearch(token, scope, [["documentos"]], expiresAt, fetcher, signal);
  const result: DocumentEvidence = { sources: [], passages: [], partial: false, warnings: [], pending: 0, scopePath: state.queue[0].path };
  const warn = (message: string) => { result.partial = true; if (!result.warnings.includes(message)) result.warnings.push(message); };
  const seen = new Set<string>(); let listings = 0, documents = 0, characters = 0, pageTasksPending = 0;
  const characterLimit = options.maxCharacters ?? 120000;
  while (state.queue.length) {
    signal?.throwIfAborted();
    if (Date.now() >= expiresAt) throw new DataError("expired", 401);
    if (Date.now() - started > (options.milliseconds ?? 85000) || listings >= 40 || documents >= (options.maxDocuments ?? 8) || characters >= characterLimit || result.passages.length >= 1500 || result.sources.length >= 500) {
      warn("Se alcanzó el límite de lectura de esta consulta. Selecciona una subcarpeta o un archivo para revisar lo pendiente."); break;
    }
    const task = state.queue.shift()!;
    try {
      if (task.kind === "list") {
        const page = await browse(token, task.query, scope, fetcher, signal, [task.query.folderId!]); listings++;
        if (page.evidence.partial) warn("Autodesk indicó un listado parcial dentro de la selección.");
        if (page.evidence.nextPage !== null) state.queue.push({ ...task, query: { ...task.query, page: page.evidence.nextPage } });
        for (const entry of page.entries) {
          if (seen.has(entry.id)) continue; seen.add(entry.id);
          const path = `${task.path} / ${entry.name}`;
          if (path.length > 12000 || state.queue.length >= 2000) { warn("El recorrido excedió el límite de carpetas o archivos de esta consulta."); continue; }
          if (entry.type === "folders") state.queue.push({ kind: "list", query: querySchema.parse({ operation: "contents", hubId: scope.hubId, projectId: scope.projectId, folderId: entry.id }), path, project: task.project });
          else if (entry.type === "items") state.queue.push({ kind: "file", hubId: scope.hubId, projectId: scope.projectId, project: task.project, entry, path, endpoint: page.evidence.endpoint, fetchedAt: page.evidence.fetchedAt, nameHit: false });
        }
      } else {
        const source: DocumentSource = { id: `D${result.sources.length + 1}`, name: task.entry.name, path: task.path, itemId: task.entry.id, projectId: task.projectId, webUrl: task.entry.webUrl, endpoint: task.endpoint, fetchedAt: task.fetchedAt, status: "pending" };
        result.sources.push(source);
        try {
          if (!supportedDocument.test(task.entry.name)) throw new DataError("unsupported_document", 422);
          documents++;
          const version = await itemTip(token, task.projectId, task.entry.id, fetcher, signal);
          Object.assign(source, { version: version.number, versionId: version.id, webUrl: version.webUrl ?? source.webUrl, endpoint: version.endpoint, fetchedAt: version.fetchedAt });
          let startPage = 1, hadIssues = false;
          do {
          const parsed = await read(token, version, startPage, signal, options.detail);
          if (parsed.nextPage && (parsed.nextPage <= startPage || parsed.nextPage > (parsed.pages ?? 0) || parsed.pageEnd !== parsed.nextPage - 1)) throw new DataError("invalid_response");
          source.nextPage = parsed.nextPage; source.throughPage = parsed.pageEnd; source.totalPages = parsed.pages;
          hadIssues ||= Boolean(parsed.textlessPages || parsed.partial || (parsed.status !== "parsed" && !parsed.nextPage));
          source.warnings = [...new Set([...(source.warnings ?? []), ...(parsed.warnings ?? [])])];
          source.status = hadIssues ? "partial_text" : "read";
          if (parsed.segments.some(s => s.method === "ocr")) { result.warnings.push("Se utilizó OCR: el texto reconocido puede contener errores. Comprueba las citas en el original."); }
          for (const segment of parsed.segments) {
            // Bounded passages preserve the parser's page/paragraph/worksheet location.
            for (let offset = 0; offset < segment.text.length; offset += 4000) {
              const text = segment.text.slice(offset, Math.min(offset + 4000, offset + characterLimit - characters));
              if (!text || result.passages.length >= 1500) { source.status = "context_limit"; break; }
              result.passages.push({ id: `S${result.passages.length + 1}`, documentId: source.id, location: segment.location, method: segment.method, confidence: segment.confidence, text }); characters += text.length;
              if (text.length < Math.min(4000, segment.text.length - offset)) source.status = "context_limit";
            }
            if (characters >= characterLimit || result.passages.length >= 1500) { source.status = "context_limit"; break; }
          }
          if (!parsed.nextPage) break;
          if (Date.now() - started > (options.milliseconds ?? 85000) || source.status === "context_limit" || characters >= characterLimit || result.passages.length >= 1500) {
            source.status = source.status === "context_limit" ? "context_limit" : "reading_pages"; pageTasksPending++;
            warn("Quedan páginas de un documento por leer. La búsqueda de contenido permite continuarlas en lotes; esta respuesta sólo usa los pasajes leídos."); break;
          }
          startPage = parsed.nextPage;
          } while (startPage <= 1000);
          if (source.status !== "read") warn("Hay documentos con texto incompleto o no disponible; la respuesta sólo cubre el texto leído.");
        } catch (error) {
          signal?.throwIfAborted();
          if (error instanceof DataError && error.status === 401) throw error;
          source.status = error instanceof DataError ? error.code : "document_unavailable";
          warn("Hay archivos que no se pudieron leer. Consulta el detalle de cobertura.");
        }
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof DataError && error.status === 401) throw error;
      warn(`No se pudo consultar la carpeta: ${task.path}.`);
    }
  }
  result.pending = state.queue.length + pageTasksPending;
  return result;
}
