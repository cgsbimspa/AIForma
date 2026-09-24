import { createHash } from "node:crypto";
import { browse, DataError, querySchema, verifyProject, verifyLocation } from "../autodesk/data.ts";
import type { DataScope, Entry } from "../autodesk/data.ts";
import { downloadDocument, itemTip, supportedDocument } from "../documents/download.ts";
import { parseDocument } from "../documents/parser.ts";
import type { ParsedDocument } from "../documents/parser.ts";
import { matchesTerms } from "./contracts.ts";
import type { FileTask, SearchHit, SearchIssue, SearchMatch, SearchState, SearchTerms } from "./contracts.ts";
import { ownerOf } from "./cursor.ts";

export function findExcerpts(document: ParsedDocument, terms: SearchTerms): SearchMatch[] {
  const result: SearchMatch[] = [];
  for (const segment of document.segments) {
    for (let start = 0; start < segment.text.length; start += 450) {
      const excerpt = segment.text.slice(start, start + 900);
      if (matchesTerms(excerpt, terms)) { result.push({ kind: "text", location: segment.location, excerpt, ...(segment.page ? { page: segment.page } : {}), start }); break; }
      if (start + 900 >= segment.text.length) break;
    }
    if (result.length === 4) break;
  }
  return result;
}
export async function startSearch(token: string, scope: DataScope, terms: SearchTerms, expiresAt: number, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<SearchState> {
  if (scope.kind === "folder" || scope.kind === "file") {
    const location = await verifyLocation(token, scope, fetcher, signal);
    const queue: SearchState["queue"] = scope.kind === "folder"
      ? [{ kind: "list", query: location.query, path: location.path, project: location.project.name }]
      : [{ kind: "file", hubId: scope.hubId, projectId: scope.projectId, project: location.project.name, entry: location.entry, path: location.path, endpoint: location.evidence.endpoint, fetchedAt: location.evidence.fetchedAt, nameHit: false }];
    return { schema: 1, owner: ownerOf(token), expiresAt: Math.min(expiresAt, Date.now() + 3_600_000), scope, terms, queue, seen: [], warnings: [], stats: { folders: 0, files: scope.kind === "file" ? 1 : 0, documentsRead: 0, unread: 0, matched: 0, requests: 0 }, startedAt: new Date().toISOString() };
  }
  const project = scope.kind === "project" ? await verifyProject(token, scope.hubId, scope.projectId, fetcher, signal) : null;
  const q = querySchema.parse(scope.kind === "project" ? { operation: "roots", hubId: scope.hubId, projectId: scope.projectId } : { operation: "hubs" });
  return { schema: 1, owner: ownerOf(token), expiresAt: Math.min(expiresAt, Date.now() + 3_600_000), scope, terms, queue: [{ kind: "list", query: q, path: project?.name ?? "", project: project?.name ?? "" }], seen: [], warnings: [], stats: { folders: 0, files: 0, documentsRead: 0, unread: 0, matched: 0, requests: 0 }, startedAt: new Date().toISOString() };
}
function hitFor(task: FileTask, matches: SearchMatch[]): SearchHit {
  return { key: `${task.projectId}:${task.entry.id}`, id: task.entry.id, name: task.entry.name, type: "items", project: task.project, projectId: task.projectId, path: task.path, webUrl: task.entry.webUrl, endpoint: task.endpoint, fetchedAt: task.fetchedAt, matches };
}
function metadataMatches(entry: Entry, path: string, terms: SearchTerms): SearchMatch[] {
  return matchesTerms(entry.name, terms) ? [{ kind: "name", location: "Nombre del archivo o carpeta" }] : matchesTerms(path, terms) ? [{ kind: "path", location: "Ruta de carpetas" }] : [];
}
export async function advanceSearch(state: SearchState, token: string, signal?: AbortSignal, options: { fetcher?: typeof fetch; parser?: typeof parseDocument; milliseconds?: number; steps?: number } = {}) {
  const fetcher = options.fetcher ?? fetch, parser = options.parser ?? parseDocument, started = Date.now();
  const hits: SearchHit[] = [], issues: SearchIssue[] = [], seen = new Set(state.seen);
  const warning = (code: string) => { if (!state.warnings.includes(code)) state.warnings.push(code); };
  for (let steps = 0; state.queue.length && steps < (options.steps ?? 12) && Date.now() - started < (options.milliseconds ?? 8_000); steps++) {
    signal?.throwIfAborted();
    if (Date.now() >= state.expiresAt) throw new DataError("expired", 401);
    // Prefer paths that match the request, but continue traversing all other paths.
    const best = state.queue.findIndex(t => matchesTerms(t.path, state.terms));
    const [task] = state.queue.splice(best >= 0 ? best : 0, 1);
    try {
      if (task.kind === "list") {
        // Queue descendants originate exclusively from verified listings and the authenticated cursor.
        const page = await browse(token, task.query, state.scope, fetcher, signal, task.query.folderId ? [task.query.folderId] : []); state.stats.requests++;
        if (page.evidence.partial) warning("autodesk_partial");
        if (page.evidence.nextPage !== null) state.queue.push({ ...task, query: { ...task.query, page: page.evidence.nextPage } });
        for (const entry of page.entries) {
          const identity = createHash("sha256").update(`${task.query.projectId ?? task.query.hubId ?? ""}:${entry.type}:${entry.id}`).digest("hex").slice(0, 32);
          if (seen.has(identity)) continue;
          if (seen.size >= 20000 || state.queue.length >= 6000) { warning("search_limit"); continue; }
          seen.add(identity);
          const path = [task.path, entry.name].filter(Boolean).join(" / ");
          if (entry.type === "hubs") { state.queue.push({ kind: "list", query: querySchema.parse({ operation: "projects", hubId: entry.id }), path, project: "" }); continue; }
          if (entry.type === "projects") { state.queue.push({ kind: "list", query: querySchema.parse({ operation: "roots", hubId: task.query.hubId, projectId: entry.id }), path, project: entry.name }); continue; }
          const matches = metadataMatches(entry, path, state.terms);
          if (entry.type === "folders") {
            state.stats.folders++;
            if (matches.length) { state.stats.matched++; hits.push({ key: `${task.query.projectId}:${entry.id}`, id: entry.id, name: entry.name, type: "folders", project: task.project, projectId: task.query.projectId!, path, webUrl: entry.webUrl, matches, endpoint: page.evidence.endpoint, fetchedAt: page.evidence.fetchedAt }); }
            if (path.length > 12000) { warning("search_limit"); continue; }
            state.queue.push({ kind: "list", query: querySchema.parse({ operation: "contents", hubId: task.query.hubId, projectId: task.query.projectId, folderId: entry.id }), path, project: task.project });
          } else {
            state.stats.files++;
            const file: FileTask = { kind: "file", hubId: task.query.hubId!, projectId: task.query.projectId!, project: task.project, entry, path, nameHit: Boolean(matches.length), endpoint: page.evidence.endpoint, fetchedAt: page.evidence.fetchedAt };
            if (matches.length) { state.stats.matched++; hits.push({ ...hitFor(file, matches), contentStatus: supportedDocument.test(entry.name) ? "pending" : "unsupported_document" }); }
            if (supportedDocument.test(entry.name) || matches.length) state.queue.push(file);
            else { state.stats.unread++; warning("unsupported_document"); if (issues.length < 30) issues.push({ path, code: "unsupported_document" }); }
          }
        }
      } else {
        const matches = metadataMatches(task.entry, task.path, state.terms);
        const hit = hitFor(task, matches);
        try {
          const version = await itemTip(token, task.projectId, task.entry.id, fetcher, signal);
          Object.assign(hit, { version: version.number, versionId: version.id, webUrl: version.webUrl ?? hit.webUrl, endpoint: version.endpoint, fetchedAt: version.fetchedAt });
          const bytes = await downloadDocument(token, version, fetcher, signal);
          const parsed = await parser(bytes, version.name, signal);
          hit.matches.push(...findExcerpts(parsed, state.terms));
          hit.contentStatus = parsed.status === "parsed" ? parsed.textlessPages ? "partial_text" : "read" : parsed.status;
          if (parsed.status === "parsed") state.stats.documentsRead++;
          if (hit.contentStatus !== "read") { state.stats.unread++; warning(hit.contentStatus); issues.push({ path: task.path, code: hit.contentStatus }); }
        } catch (error) {
          signal?.throwIfAborted();
          if (error instanceof DataError && error.status === 401) throw error;
          hit.contentStatus = error instanceof DataError ? error.code : "document_unavailable";
          state.stats.unread++; warning(hit.contentStatus); issues.push({ path: task.path, code: hit.contentStatus });
        }
        if (hit.matches.length) { if (!task.nameHit) state.stats.matched++; hits.push(hit); }
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof DataError && error.status === 401) throw error;
      const code = error instanceof DataError ? error.code : "unavailable";
      warning(code); issues.push({ path: task.path || "Cuentas Autodesk", code });
    }
  }
  state.seen = [...seen];
  return { hits, issues, stats: state.stats, warnings: state.warnings, pending: state.queue.length, done: state.queue.length === 0, terms: state.terms, startedAt: state.startedAt };
}
