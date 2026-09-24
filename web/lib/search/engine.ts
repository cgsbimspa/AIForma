import { createHash } from "node:crypto";
import { browse, DataError, querySchema, verifyProject, verifyLocation } from "../autodesk/data.ts";
import type { DataScope, Entry } from "../autodesk/data.ts";
import { itemTip, supportedDocument } from "../documents/download.ts";
import { createDocumentReader, readDocument } from "../documents/reader.ts";
import { parseDocument } from "../documents/parser.ts";
import type { ParsedDocument } from "../documents/parser.ts";
import { matchesTerms } from "./contracts.ts";
import type { FileTask, SearchHit, SearchIssue, SearchMatch, SearchState, SearchTerms, SearchStage, PageProgress } from "./contracts.ts";
import { ownerOf } from "./cursor.ts";

export function findExcerpts(document: ParsedDocument, terms: SearchTerms): SearchMatch[] {
  const result: SearchMatch[] = [];
  for (const segment of document.segments) {
    for (let start = 0; start < segment.text.length; start += 450) {
      const excerpt = segment.text.slice(start, start + 900);
      if (matchesTerms(excerpt, terms)) { result.push({ kind: "text", location: segment.location, excerpt, ...(segment.page ? { page: segment.page } : {}), start, ...(segment.method ? { method: segment.method, confidence: segment.confidence } : {}) }); break; }
      if (start + 900 >= segment.text.length) break;
    }
    if (result.length === 4) break;
  }
  return result;
}
export async function startSearch(token: string, scope: DataScope, terms: SearchTerms, expiresAt: number, fetcher: typeof fetch = fetch, signal?: AbortSignal, stage: SearchStage = "content"): Promise<SearchState> {
  if (scope.kind === "folder" || scope.kind === "file") {
    const location = await verifyLocation(token, scope, fetcher, signal);
    const queue: SearchState["queue"] = scope.kind === "folder"
      ? [{ kind: "list", folderIds: scope.folderIds, query: location.query, path: location.path, project: location.project.name }]
      : [{ kind: "file", folderIds: scope.folderIds, hubId: scope.hubId, projectId: scope.projectId, project: location.project.name, entry: location.entry, path: location.path, endpoint: location.evidence.endpoint, fetchedAt: location.evidence.fetchedAt, nameHit: false }];
    return { schema: 1, stage, owner: ownerOf(token), expiresAt: Math.min(expiresAt, Date.now() + 3_600_000), scope, terms, queue, seen: [], warnings: [], stats: { folders: 0, files: scope.kind === "file" ? 1 : 0, documentsRead: 0, unread: 0, matched: 0, requests: 0 }, startedAt: new Date().toISOString() };
  }
  const project = scope.kind === "project" ? await verifyProject(token, scope.hubId, scope.projectId, fetcher, signal) : null;
  const q = querySchema.parse(scope.kind === "project" ? { operation: "roots", hubId: scope.hubId, projectId: scope.projectId } : { operation: "hubs" });
  return { schema: 1, stage, owner: ownerOf(token), expiresAt: Math.min(expiresAt, Date.now() + 3_600_000), scope, terms, queue: [{ kind: "list", query: q, path: project?.name ?? "", project: project?.name ?? "" }], seen: [], warnings: [], stats: { folders: 0, files: 0, documentsRead: 0, unread: 0, matched: 0, requests: 0 }, startedAt: new Date().toISOString() };
}
function hitFor(task: FileTask, matches: SearchMatch[]): SearchHit {
  return { nextPage: undefined, throughPage: task.startPage ? task.startPage - 1 : undefined, totalPages: task.totalPages, scope: { kind: "file", hubId: task.hubId, projectId: task.projectId, folderIds: task.folderIds ?? [], itemId: task.entry.id }, key: `${task.projectId}:${task.entry.id}`, id: task.entry.id, name: task.entry.name, type: "items", project: task.project, projectId: task.projectId, path: task.path, webUrl: task.entry.webUrl, versionId: task.version?.id, version: task.version?.number, endpoint: task.endpoint, fetchedAt: task.fetchedAt, matches };
}
function metadataMatches(entry: Entry, terms: SearchTerms): SearchMatch[] {
  return matchesTerms(entry.name, terms) ? [{ kind: "name", location: "Nombre del archivo o carpeta" }] : [];
}
export async function advanceSearch(state: SearchState, token: string, signal?: AbortSignal, options: { fetcher?: typeof fetch; parser?: typeof parseDocument; milliseconds?: number; steps?: number } = {}) {
  const fetcher = options.fetcher ?? fetch, parser = options.parser ?? parseDocument, started = Date.now();
  const read = options.fetcher || options.parser ? createDocumentReader({ fetcher, parser }) : readDocument;
  const pageProgress: PageProgress[] = [];
  const hits: SearchHit[] = [], issues: SearchIssue[] = [], seen = new Set(state.seen);
  const warning = (code: string) => { if (!state.warnings.includes(code)) state.warnings.push(code); };
  let steps = 0, stop = false;
  while (!stop && state.queue.length && steps < (options.steps ?? 32) && Date.now() - started < (options.milliseconds ?? 2500)) {
    signal?.throwIfAborted();
    if (Date.now() >= state.expiresAt) throw new DataError("expired", 401);
    // Prefer paths that match the request, but continue traversing all other paths.
    const best = state.queue.findIndex(t => matchesTerms(t.path, state.terms));
    const [first] = state.queue.splice(best >= 0 ? best : 0, 1);
    const tasks = [first];
    // Only independent metadata calls run concurrently. OCR remains sequential
    // to avoid multiplying 512 MB workers and starving other requests.
    if (first.kind === "list") while (tasks.length < 4 && steps + tasks.length < (options.steps ?? 32)) {
      let index = state.queue.findIndex(t => t.kind === "list" && matchesTerms(t.path, state.terms));
      if (index < 0) index = state.queue.findIndex(t => t.kind === "list");
      if (index < 0) break;
      tasks.push(state.queue.splice(index, 1)[0]);
    }
    const pages = await Promise.allSettled(tasks.map(task => task.kind === "list" ? browse(token, task.query, state.scope, fetcher, signal, task.query.folderId ? [task.query.folderId] : []) : Promise.resolve(null)));
    for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index]; steps++;
    try {
      if (task.kind === "list") {
        // Queue descendants originate exclusively from verified listings and the authenticated cursor.
        state.stats.requests++;
        const outcome = pages[index];
        if (outcome.status === "rejected") throw outcome.reason;
        const page = outcome.value!;
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
          const matches = metadataMatches(entry, state.terms);
          if (entry.type === "folders") {
            state.stats.folders++;
            if (state.stage === "folders" && matches.length) { state.stats.matched++; hits.push({ scope: { kind: "folder", hubId: task.query.hubId!, projectId: task.query.projectId!, folderIds: [...(task.folderIds ?? []), entry.id] }, key: `${task.query.projectId}:${entry.id}`, id: entry.id, name: entry.name, type: "folders", project: task.project, projectId: task.query.projectId!, path, webUrl: entry.webUrl, matches, endpoint: page.evidence.endpoint, fetchedAt: page.evidence.fetchedAt }); }
            if (path.length > 12000) { warning("search_limit"); continue; }
            state.queue.push({ kind: "list", query: querySchema.parse({ operation: "contents", hubId: task.query.hubId, projectId: task.query.projectId, folderId: entry.id }), path, project: task.project, folderIds: [...(task.folderIds ?? []), entry.id] });
          } else {
            state.stats.files++;
            const file: FileTask = { kind: "file", folderIds: task.folderIds ?? [], hubId: task.query.hubId!, projectId: task.query.projectId!, project: task.project, entry, path, nameHit: state.stage === "files" && Boolean(matches.length), endpoint: page.evidence.endpoint, fetchedAt: page.evidence.fetchedAt };
            if (state.stage === "files" && matches.length) { state.stats.matched++; hits.push(hitFor(file, matches)); if (!entry.webUrl) state.queue.push(file); }
            if (state.stage !== "content") continue;
            if (supportedDocument.test(entry.name)) state.queue.push(file);
            else { state.stats.unread++; warning("unsupported_document"); if (issues.length < 30) issues.push({ path, code: "unsupported_document" }); }
          }
        }
      } else {
        if (state.stage === "folders") continue;
        const matches = state.stage === "files" ? metadataMatches(task.entry, state.terms) : [];
        if (state.stage === "files" && !matches.length) continue;
        const hit = hitFor(task, matches);
        try {
          const version = await itemTip(token, task.projectId, task.entry.id, fetcher, signal);
          if (task.version && task.version.id !== version.id) throw new DataError("document_changed", 409);
          Object.assign(hit, { version: version.number, versionId: version.id, webUrl: version.webUrl ?? hit.webUrl, endpoint: version.endpoint, fetchedAt: version.fetchedAt });
          if (state.stage === "files") { if (!task.nameHit) state.stats.matched++; hits.push(hit); continue; }
          const parsed = await read(token, version, task.startPage ?? 1, signal);
          if (parsed.nextPage && (parsed.nextPage <= (task.startPage ?? 1) || parsed.nextPage > (parsed.pages ?? 0) || parsed.pageEnd !== parsed.nextPage - 1)) throw new DataError("invalid_response");
          hit.throughPage = parsed.pageEnd; hit.totalPages = parsed.pages; hit.nextPage = parsed.nextPage;
          hit.matches.push(...findExcerpts(parsed, state.terms));
          const hasIssue = Boolean(task.hadIssues || parsed.textlessPages || parsed.partial || (parsed.status !== "parsed" && !parsed.nextPage));
          hit.contentStatus = parsed.nextPage ? "reading_pages" : hasIssue ? "partial_text" : "read";
          for (const code of parsed.warnings ?? []) { warning(code); issues.push({ path: task.path, code }); }
          if (parsed.status === "parsed" && !task.readCounted) { state.stats.documentsRead++; task.readCounted = true; }
          if (hasIssue && !task.unreadCounted) { state.stats.unread++; task.unreadCounted = true; warning("partial_text"); issues.push({ path: task.path, code: "partial_text" }); }
          if (parsed.pages && parsed.pageEnd !== undefined) pageProgress.push({ key: hit.key, path: hit.path, throughPage: parsed.pageEnd, totalPages: parsed.pages, nextPage: parsed.nextPage, status: hit.contentStatus });
          if (parsed.nextPage) state.queue.unshift({ ...task, startPage: parsed.nextPage, totalPages: parsed.pages, version: { id: version.id, number: version.number }, entry: { ...task.entry, webUrl: hit.webUrl }, hadIssues: hasIssue, nameHit: task.nameHit || hit.matches.length > 0 });
        } catch (error) {
          signal?.throwIfAborted();
          if (error instanceof DataError && error.status === 401) throw error;
          hit.contentStatus = error instanceof DataError ? error.code : "document_unavailable";
          if (hit.contentStatus === "rate_limited") { state.queue.push(task); stop = true; warning("rate_limited"); issues.push({ path: task.path, code: "rate_limited" }); continue; }
          if (task.startPage && task.totalPages) pageProgress.push({ key: hit.key, path: hit.path, throughPage: task.startPage - 1, totalPages: task.totalPages, status: hit.contentStatus });
          if (!task.unreadCounted) state.stats.unread++; warning(hit.contentStatus); issues.push({ path: task.path, code: hit.contentStatus });
        }
        if (hit.matches.length || task.nameHit) { if (!task.nameHit && hit.matches.length) state.stats.matched++; hits.push(hit); }
        // Return the completed page batch immediately: the next request resumes safely.
        if (hit.nextPage) stop = true;
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof DataError && error.status === 401) throw error;
      const code = error instanceof DataError ? error.code : "unavailable";
      if (code === "rate_limited") { state.queue.push(task); stop = true; }
      warning(code); issues.push({ path: task.path || "Cuentas Autodesk", code });
    }
  }
  }
  state.seen = [...seen];
  return { stage: state.stage, pageProgress, hits, issues, stats: state.stats, warnings: state.warnings, pending: state.queue.length, done: state.queue.length === 0, terms: state.terms, startedAt: state.startedAt };
}
