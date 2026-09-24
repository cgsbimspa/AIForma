"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, BrainCircuit, Building2, ChevronDown, ChevronRight, CircleCheck, Database, File, Folder, FolderOpen, Globe2, LoaderCircle, MessageSquare, RefreshCw, Search, ShieldCheck, Square, Trash2, Unplug } from "lucide-react";
import type { DataPage, DataQuery, DataScope, Entry } from "@/lib/autodesk/data";
import type { Source } from "@/lib/assistant/chat";
import type { SearchBatch, SearchTerms, SearchStage, SearchHit } from "@/lib/search/contracts";
import { mergeSearchHits } from "@/lib/search/merge";
import { SearchResults } from "./search-results";
import { DocumentAnswer } from "./document-answer";
import type { DocumentAnswer as DocumentAnswerData, DocumentMode } from "@/lib/assistant/document-contracts";

type Auth = { connected: boolean; configured?: boolean; dataAccess?: boolean; aiConfigured?: boolean; user?: { id: string; name: string }; expiresAt?: number; error?: string };
const errors: Record<string, string> = {
  selection_unavailable: "La ubicación seleccionada cambió o ya no está disponible. Actualiza el explorador y vuelve a seleccionarla.",
  search_expired: "La búsqueda guardada venció o pertenece a otra sesión. Inicia una nueva consulta.", search_limit: "La búsqueda superó el límite de recorrido. Selecciona un proyecto o usa términos más precisos.",
  expired: "La sesión de Autodesk venció. Vuelve a conectar tu cuenta.", consent_required: "Autoriza la lectura de proyectos y carpetas para continuar.", forbidden: "Autodesk no permitió acceder a estos datos. Revisa tus permisos y la integración de la cuenta en Forma.", not_found: "Autodesk no encontró este recurso o ya no está disponible.", unavailable: "No fue posible consultar Autodesk. Inténtalo nuevamente.", invalid_response: "Autodesk devolvió información que no pudimos verificar.", rate_limited: "Autodesk está limitando las consultas. Espera un momento y vuelve a intentar.", ai_not_configured: "La conexión con OpenAI todavía no está configurada.", ai_unavailable: "OpenAI no pudo completar la consulta. Puedes volver a intentar.", ai_rate_limited: "OpenAI alcanzó un límite de uso. Intenta más tarde o revisa el saldo de la API.", ai_incomplete: "La consulta no se completó. Prueba con un proyecto o una carpeta más concreta.", ai_invalid_response: "La respuesta de IA no pudo vincularse a datos verificados. No se mostrará como un resultado válido.", out_of_scope: "La consulta intentó salir del alcance seleccionado. Elige el proyecto correspondiente o toda tu base.", invalid_query: "La consulta no es válida. Actualiza la página e inténtalo nuevamente.", too_large: "La conversación es demasiado extensa. Inicia una nueva consulta.", not_configured: "La conexión Autodesk no está configurada.",
};
function errorText(code: string) { return errors[code] ?? "No se pudo completar la operación. Inténtalo nuevamente."; }
function connectForm(label: string) { return <form action="/api/autodesk/connect?returnTo=/asistente" method="post"><button className="assistant-primary" type="submit"><Unplug size={16}/>{label}</button></form>; }

export function AssistantWorkspace() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [revision, setRevision] = useState(0);
  const [callbackError, setCallbackError] = useState(false);
  useEffect(() => {
    let disposed = false, pending = false;
    const controller = new AbortController();
    const check = async () => {
      if (pending) return; pending = true;
      try { const res = await fetch("/api/autodesk/status", { cache: "no-store", signal: controller.signal }); const data: Auth = await res.json(); if (!disposed) { setAuth(data); setCallbackError(new URLSearchParams(window.location.search).has("autodesk_error")); } }
      catch { if (!disposed) setAuth({ connected: false, error: "unavailable" }); }
      finally { pending = false; }
    };
    void check();
    const timer = setInterval(check, 60_000);
    const visible = () => { if (!document.hidden) void check(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; controller.abort(); clearInterval(timer); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [revision]);
  useEffect(() => {
    if (!auth?.expiresAt) return;
    const timer = setTimeout(() => setAuth({ connected: false, configured: true, error: "expired" }), Math.max(0, auth.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [auth?.expiresAt]);
  const invalidate = useCallback((code: string) => { if (code === "expired" || code === "consent_required") setAuth({ connected: false, configured: true, error: code }); }, []);
  const ready = auth?.connected && auth.dataAccess && auth.user;
  return <div className="page-content assistant-page">
    <div className="page-heading"><div><p className="eyebrow">FORMA + INTELIGENCIA ARTIFICIAL</p><h1>Asistente IA</h1><p className="page-description">Explora tu información. Elige el alcance. Consulta con evidencia.</p></div><div className="assistant-identity" role="status">{auth === null ? <><LoaderCircle size={15} className="spin"/>Verificando conexión</> : auth.connected ? <><span className="connected-dot"/><span>Conectado con<br/><strong>{auth.user?.name}</strong></span></> : <><span className="disconnected-dot"/><span>Autodesk sin conectar</span></>}</div></div>
    {ready ? <ConnectedWorkspace key={`${auth.user!.id}:${auth.expiresAt}`} aiConfigured={Boolean(auth.aiConfigured)} invalidate={invalidate}/> : <div className="assistant-split assistant-locked">
      <section className="forma-panel"><PanelHeading icon={<Folder size={20}/>} title="Mi información de Forma" subtitle="Cuentas, proyectos y carpetas"/><div className="panel-empty"><Database size={38}/><h3>{auth === null ? "Comprobando tu sesión…" : auth.connected ? "Autoriza el acceso a tus proyectos" : "Conecta tu cuenta de Autodesk"}</h3><p>{auth?.connected ? "La sesión actual permite identificarte. Para ver tus carpetas necesitamos también el permiso de lectura de Forma." : "Aquí aparecerán los proyectos y las carpetas a los que tiene acceso tu usuario."}</p>{auth !== null && connectForm(auth.connected ? "Autorizar proyectos y carpetas" : "Conectar Autodesk")}{auth?.error && <p className="assistant-error" role="alert">{errorText(auth.error)}</p>}{callbackError && <p className="assistant-error">La autorización no se completó. Puedes volver a conectar.</p>}<button type="button" className="assistant-link" onClick={() => setRevision(n => n + 1)}>Volver a comprobar</button></div></section>
      <section className="chat-panel"><PanelHeading icon={<BrainCircuit size={21}/>} title="Tu asistente de proyectos" subtitle="Conexión con OpenAI"/><div className="panel-empty chat-intro"><span className="chat-orb"><BrainCircuit size={33}/></span><h3>Todo empieza con tu información</h3><p>Conecta Autodesk para elegir un proyecto o consultar toda tu base de Forma desde este espacio.</p><div className="evidence-note"><ShieldCheck size={16}/> Respuestas vinculadas a datos verificables.</div></div></section>
    </div>}
  </div>;
}
function PanelHeading({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children?: React.ReactNode }) { return <header className="assistant-panel-heading"><span className="panel-heading-icon">{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div>{children}</header>; }
type Selection = { initialMode?: DocumentMode | "search"; scope: DataScope; label: string; path?: string };
function ConnectedWorkspace({ aiConfigured, invalidate }: { aiConfigured: boolean; invalidate: (code: string) => void }) {
  const [selection, setSelection] = useState<Selection>({ scope: { kind: "all" }, label: "Toda mi base de Forma" });
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState("");
  const scopeKey = JSON.stringify(selection.scope);
  return <div className="assistant-split">
    <section className="forma-panel" aria-label="Explorador de Forma">
      <PanelHeading icon={<Folder size={20}/>} title="Mi información de Forma" subtitle="Datos de tu cuenta Autodesk"><button type="button" className="icon-button" aria-label="Actualizar explorador" title="Actualizar explorador" onClick={() => { setRevision(n => n + 1); }}><RefreshCw size={16}/></button></PanelHeading>
      <div className="scope-picker"><span className="small-label">ALCANCE DE LA CONSULTA</span><button type="button" aria-pressed={selection.scope.kind === "all"} className={`scope-all ${selection.scope.kind === "all" ? "selected" : ""}`} onClick={() => setSelection({ scope: { kind: "all" }, label: "Toda mi base de Forma" })}><Globe2 size={18}/><span><strong>Toda mi base de Forma</strong><small>Todos los proyectos accesibles</small></span>{selection.scope.kind === "all" && <CircleCheck size={18}/>}</button><p>Selecciona el círculo junto a un proyecto, carpeta o archivo. La flecha abre su contenido.</p>{selection.scope.kind !== "all" && <div className="scope-location" role="status"><strong>{selection.scope.kind === "file" ? "Sólo este archivo" : selection.scope.kind === "folder" ? "Esta carpeta y sus subcarpetas" : "Todo este proyecto"}</strong><span>{selection.path ?? selection.label}</span><small>Al cambiar el alcance se inicia una nueva conversación.</small></div>}</div>
      <label className="explorer-search"><Search size={16}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar proyectos cargados" aria-label="Filtrar proyectos cargados"/></label>
      <div className="forma-tree" key={revision}><Branch query={{ operation: "hubs", hubId: null, projectId: null, folderId: null, page: 0 }} selection={selection} select={setSelection} invalidate={invalidate} filter={filter}/></div>
      <footer className="explorer-footer"><ShieldCheck size={15}/><span>Sólo lectura · Abre las carpetas para ver su contenido. Los permisos de Autodesk se respetan.</span></footer>
    </section>
    <ChatPanel key={scopeKey} select={setSelection} selection={selection} aiConfigured={aiConfigured} invalidate={invalidate}/>
  </div>;
}
type BranchProps = { query: DataQuery; selection: Selection; select: (selection: Selection) => void; invalidate: (code: string) => void; filter: string; folderIds?: string[]; path?: string };
function Branch(props: BranchProps) {
  const { query, invalidate } = props;
  const [page, setPage] = useState<DataPage | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const serialized = JSON.stringify(query);
  const load = useCallback(async (number: number) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    try {
      const values = JSON.parse(serialized); values.page = number;
      const params = new URLSearchParams(Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)]));
      const response = await fetch(`/api/autodesk/browse?${params}`, { cache: "no-store", signal: abort.signal });
      const result = await response.json();
      if (!response.ok) { invalidate(result.error); throw new Error(result.error); }
      if (!abort.signal.aborted) setPage(previous => ({ ...result, evidence: { ...result.evidence, partial: result.evidence.partial || (number > 0 && previous?.evidence.partial) }, entries: number === 0 ? result.entries : [...new Map([...(previous?.entries ?? []), ...result.entries].map((e: Entry) => [e.id, e])).values()] }));
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "unavailable"); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }, [serialized, invalidate]);
  useEffect(() => {
    let disposed = false;
    // Begin after the mount; Strict Mode cleanup can cancel the queued request.
    queueMicrotask(() => { if (!disposed) void load(0); });
    return () => { disposed = true; controller.current?.abort(); };
  }, [load]);
  const requestPage = (number: number) => { setLoading(true); setError(""); void load(number); };
  const visible = page?.entries.filter(entry => entry.type !== "projects" || !props.filter || entry.name.toLocaleLowerCase().includes(props.filter.toLocaleLowerCase())) ?? [];
  return <div className="tree-branch">
    {visible.map(entry => <TreeRow {...props} key={entry.id} entry={entry}/>)}
    {loading && <p className="tree-notice" role="status"><LoaderCircle size={14} className="spin"/>Consultando Autodesk…</p>}
    {error && <div className="tree-notice tree-error" role="alert"><p>{errorText(error)}</p><button type="button" className="assistant-link" onClick={() => requestPage(page?.evidence.nextPage ?? 0)}>Reintentar</button></div>}
    {!loading && !error && page && !page.entries.length && <p className="tree-notice">{page.evidence.partial ? "No se recibieron elementos; Autodesk indicó resultados parciales." : query.operation === "hubs" ? "Autodesk no devolvió cuentas accesibles para este usuario." : "Autodesk no devolvió elementos en esta ubicación."}</p>}
    {!loading && !error && page && !!page.entries.length && !visible.length && <p className="tree-notice">Sin coincidencias entre los proyectos cargados.</p>}
    {page?.evidence.partial && <p className="tree-notice tree-warning">Autodesk indicó resultados parciales. Algunas ubicaciones pueden no estar disponibles.</p>}
    {page?.evidence.nextPage !== null && page?.evidence.nextPage !== undefined && <button type="button" disabled={loading} className="load-more" onClick={() => requestPage(page.evidence.nextPage!)}>Cargar más {query.operation === "projects" ? "proyectos" : "elementos"}</button>}
    {page && <p className="tree-timestamp" title={page.evidence.endpoint}>Consultado {new Date(page.evidence.fetchedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</p>}
  </div>;
}
function TreeRow(props: BranchProps & { entry: Entry }) {
  const { entry, query, selection, select } = props;
  const [open, setOpen] = useState(entry.type === "hubs");
  const leaf = entry.type === "items";
  const folderIds = props.folderIds ?? [];
  const path = entry.type === "projects" ? entry.name : [props.path, entry.name].filter(Boolean).join(" / ");
  const rowScope: DataScope | null = entry.type === "hubs" ? null : entry.type === "projects" ? { kind: "project", hubId: query.hubId!, projectId: entry.id } : entry.type === "folders" ? { kind: "folder", hubId: query.hubId!, projectId: query.projectId!, folderIds: [...folderIds, entry.id] } : { kind: "file", hubId: query.hubId!, projectId: query.projectId!, folderIds, itemId: entry.id };
  const selected = rowScope !== null && JSON.stringify(rowScope) === JSON.stringify(selection.scope);
  const selectRow = () => { if (rowScope) select({ scope: rowScope, label: entry.name, path }); };
  const kindLabel = entry.type === "projects" ? "proyecto" : leaf ? "archivo" : "carpeta";
  const next: DataQuery = entry.type === "hubs" ? { operation: "projects", hubId: entry.id, projectId: null, folderId: null, page: 0 } : entry.type === "projects" ? { operation: "roots", hubId: query.hubId, projectId: entry.id, folderId: null, page: 0 } : { operation: "contents", hubId: query.hubId, projectId: query.projectId, folderId: entry.id, page: 0 };
  const Icon = entry.type === "hubs" ? Building2 : entry.type === "projects" ? Database : leaf ? File : open ? FolderOpen : Folder;
  return <div className={`tree-node tree-${entry.type}`}><div className={`tree-row ${selected ? "is-selected" : ""}`}>
    {leaf ? <button type="button" className="tree-leaf" onClick={selectRow} title={`Buscar sólo en ${path}`}><Icon size={15}/><span>{entry.name}</span></button> : <button className="tree-expand" type="button" aria-expanded={open} onClick={() => setOpen(!open)} title={entry.name}>{open ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<Icon size={16}/><span>{entry.name}</span></button>}
    {rowScope && <button type="button" className="project-select" aria-label={`Consultar ${kindLabel} ${entry.name}`} aria-pressed={selected} title={selected ? "Alcance seleccionado" : `Buscar en este ${kindLabel}${entry.type === "folders" ? " y sus subcarpetas" : ""}`} onClick={() => { if (!leaf) setOpen(true); selectRow(); }}>{selected ? <CircleCheck size={17}/> : <span className="radio-empty"/>}</button>}
  </div>{!leaf && open && <div className="tree-children"><Branch {...props} query={next} folderIds={entry.type === "folders" ? [...folderIds, entry.id] : []} path={entry.type === "hubs" ? "" : path}/></div>}</div>;
}
type Message = { role: "user" | "assistant"; content: string; sources?: Source[]; search?: SearchBatch; answer?: DocumentAnswerData };
function ChatPanel({ selection, select, aiConfigured, invalidate }: { select: (selection: Selection) => void; selection: Selection; aiConfigured: boolean; invalidate: (code: string) => void }) {
  const documentSelection = selection.scope.kind === "file" || selection.scope.kind === "folder";
  const [mode, setMode] = useState<DocumentMode | "search">(selection.initialMode ?? "search");
  const [messages, setMessages] = useState<Message[]>([]), [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [activeSearch, setActiveSearch] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null), bottom = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [messages.length, busy, error]);
  async function search(index: number, terms: SearchTerms, abort: AbortController, previous?: SearchBatch, stage: SearchStage = previous?.stage ?? (selection.scope.kind === "file" ? "files" : "folders")) {
    setActiveSearch(index);
    let current = previous;
    for (let batch = 0; batch < 15 && !abort.signal.aborted; batch++) {
      const response = await fetch("/api/assistant/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: selection.scope, stage, terms, cursor: current?.cursor ?? null }), signal: abort.signal });
      const result = await response.json();
      if (!response.ok) { invalidate(result.error); throw new Error(result.error); }
      if (abort.signal.aborted) return;
      const next = result as SearchBatch;
      current = { ...next, hits: mergeSearchHits(current?.hits ?? [], next.hits), pageProgress: [...new Map([...(current?.pageProgress ?? []), ...(next.pageProgress ?? [])].map(p => [p.key, p])).values()].slice(-30), issues: [...(current?.issues ?? []), ...next.issues].slice(0, 100) };
      const snapshot = current;
      setMessages(existing => existing.map((m, i) => i === index ? { ...m, content: `Búsqueda ${snapshot.done && !snapshot.warnings.length ? "finalizada" : "parcial"}: ${snapshot.stats.matched} coincidencias verificadas. Términos: ${terms.map(t => t.join(" + ")).join(" / ")}.`, search: snapshot } : m));
      if (!current.cursor) return;
    }
  }
  async function resume(index: number) {
    const previous = messages[index]?.search;
    if (busy || !previous?.cursor) return;
    setBusy(true); setError(""); const abort = new AbortController(); controller.current = abort;
    try { await search(index, previous.terms, abort, previous); }
    catch (e) { if (!abort.signal.aborted) setError(errorText(e instanceof Error ? e.message : "unavailable")); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function nextStage(previous: SearchBatch, stage: SearchStage) {
    if (busy) return;
    const index = messages.length + 1;
    setMessages([...messages, { role: "user", content: stage === "files" ? "Sí, buscar también en nombres de archivos." : "Sí, buscar dentro de los archivos." }, { role: "assistant", content: stage === "files" ? "Revisando nombres de archivos…" : "Leyendo documentos y reconociendo texto en imágenes…" }]);
    setMode("search"); setBusy(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try { await search(index, previous.terms, abort, undefined, stage); }
    catch (e) { if (!abort.signal.aborted) setError(errorText(e instanceof Error ? e.message : "unavailable")); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  function selectHit(hit: SearchHit) { if (hit.type === "items" && JSON.stringify(hit.scope) === JSON.stringify(selection.scope)) { setMode("ask"); return; } if (hit.scope) select({ initialMode: hit.type === "items" ? "ask" : "search", scope: hit.scope, label: hit.name, path: hit.path }); }
  async function send(text: string, requestedMode = mode) {
    if (!text.trim() || busy || !aiConfigured) return;
    if (requestedMode !== "search" && !documentSelection) { setError("Selecciona un archivo o una carpeta para preguntar sobre sus documentos."); return; }
    const lastSearch = messages.at(-1)?.search;
    if (requestedMode === "search" && lastSearch && /^(sí|si|sí,? busca|si,? busca|continuar|sí por favor|si por favor)[.!]?$/i.test(text.trim())) {
      if (lastSearch.stage !== "content") { setDraft(""); await nextStage(lastSearch, lastSearch.stage === "folders" ? "files" : "content"); return; }
    }
    const outgoing: Message[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(outgoing); setDraft(""); setActiveSearch(null); setBusy(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch(requestedMode === "search" ? "/api/assistant/chat" : "/api/assistant/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestedMode === "search" ? { scope: selection.scope, messages: outgoing.slice(-11).map(m => ({ role: m.role, content: m.content.slice(0, 4000) })) } : { scope: selection.scope, mode: requestedMode, question: text.trim() }), signal: abort.signal });
      const result = await response.json();
      if (!response.ok) { invalidate(result.error); throw new Error(result.error); }
      if (!abort.signal.aborted) {
        if (result.kind === "search") { setMessages([...outgoing, { role: "assistant", content: selection.scope.kind === "file" ? "Revisando el nombre del archivo seleccionado…" : "Buscando primero en nombres de carpetas…" }]); await search(outgoing.length, result.terms, abort); }
        else if (result.kind === "document_answer") setMessages([...outgoing, { role: "assistant", content: "Respuesta documental con evidencia.", answer: result }]);
        else setMessages([...outgoing, { role: "assistant", content: result.text, sources: result.sources }]);
      }
    } catch (e) { if (!abort.signal.aborted) { setError(errorText(e instanceof Error ? e.message : "ai_unavailable")); setDraft(text); } }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  const suggestion = selection.scope.kind === "all" ? "Muéstrame los proyectos a los que tengo acceso." : selection.scope.kind === "folder" ? "Muéstrame el contenido de esta carpeta." : selection.scope.kind === "file" ? "Muéstrame el archivo seleccionado." : "Muéstrame las carpetas raíz de este proyecto.";
  return <section className="chat-panel" aria-label="Asistente IA con OpenAI">
    <PanelHeading icon={<BrainCircuit size={21}/>} title="Tu asistente de proyectos" subtitle="OpenAI · Consultas con fuentes"><button type="button" className="icon-button" disabled={busy || !messages.length} aria-label="Limpiar conversación" title="Limpiar conversación" onClick={() => { setMessages([]); setError(""); }}><Trash2 size={16}/></button></PanelHeading>
    <div className="chat-scope"><span className="small-label">{selection.scope.kind === "file" ? "SÓLO ESTE ARCHIVO" : selection.scope.kind === "folder" ? "CARPETA Y SUBCARPETAS" : "CONSULTANDO"}</span><span>{selection.scope.kind === "file" ? <File size={14}/> : selection.scope.kind === "folder" ? <Folder size={14}/> : <Database size={14}/>}<span>{selection.path ?? selection.label}</span></span></div>
    <div className="chat-messages" aria-live="polite" aria-relevant="additions text">
      {!messages.length && <div className="panel-empty chat-intro"><span className="chat-orb"><BrainCircuit size={33}/></span><h3>¿Qué quieres saber de tus documentos?</h3><p>Dime qué necesitas encontrar. Primero revisaré nombres de carpetas; después podrás buscar nombres de archivos y, finalmente, su contenido. Selecciona un resultado para preguntar, resumir o extraer datos con citas.</p>{documentSelection && <div className="document-suggestions"><button type="button" className="chat-suggestion" disabled={busy || !aiConfigured} onClick={() => { setMode("summary"); void send("Resume los puntos principales de los documentos seleccionados, con citas.", "summary"); }}>Resumir selección</button><button type="button" className="chat-suggestion" disabled={busy || !aiConfigured} onClick={() => { setMode("extract"); setDraft("Extrae los objetivos y responsabilidades que se indican en los documentos seleccionados."); }}>Extraer datos con citas</button></div>}<button className="chat-suggestion" type="button" disabled={!aiConfigured || busy} onClick={() => void send(suggestion, "search")}><MessageSquare size={16}/>{suggestion}<ChevronRight size={16}/></button><div className="evidence-note"><ShieldCheck size={16}/> Cada resultado conserva su fuente Autodesk.</div></div>}
      {messages.map((message, index) => <article className={`chat-message message-${message.role}`} key={index}><span className="message-author">{message.role === "user" ? "Tú" : "Asistente IA"}</span>{message.answer ? <DocumentAnswer answer={message.answer}/> : message.search ? <SearchResults result={message.search} busy={busy && activeSearch === index} disabled={busy} resume={() => void resume(index)} nextStage={stage => void nextStage(message.search!, stage)} select={selectHit}/> : <div className="message-body">{message.content}</div>}{!!message.sources?.length && <details className="message-sources"><summary>{message.sources.length} {message.sources.length === 1 ? "fuente consultada" : "fuentes consultadas"}</summary>{message.sources.map(source => <div key={source.id} className="source-detail"><strong>[{source.id}] {source.label}</strong><time dateTime={source.fetchedAt}>{new Date(source.fetchedAt).toLocaleString("es-CL")}</time><code>{source.endpoint}</code><span>{source.returnedCount} elementos en la página {source.page + 1}{source.nextPage !== null ? " · Hay más páginas" : ""}{source.partial ? " · Resultado parcial" : ""}</span></div>)}</details>}</article>)}
      {busy && <div className="chat-working" role="status"><LoaderCircle className="spin" size={17}/><span>{mode === "search" ? "Consultando Forma y preparando la respuesta…" : "Leyendo la selección y revisando la respuesta contra sus citas. Puede tardar unos minutos…"}</span></div>}
      {error && <p className="assistant-error chat-error" role="alert">{error}</p>}
      {!aiConfigured && <p className="assistant-error chat-error" role="alert">{errorText("ai_not_configured")}</p>}
      <div ref={bottom}/>
    </div>
    <div className="document-mode-picker" role="group" aria-label="Tipo de consulta">{([["search", "Buscar"], ["ask", "Preguntar"], ["summary", "Resumir"], ["extract", "Extraer datos"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} disabled={busy || (value !== "search" && !documentSelection)} onClick={() => setMode(value)}>{label}</button>)}{!documentSelection && <small>Selecciona un archivo o carpeta para preguntar, resumir o extraer datos.</small>}</div><form className="chat-composer" onSubmit={e => { e.preventDefault(); void send(draft); }}><div className="composer-input"><textarea aria-label="Tu consulta al asistente" placeholder={aiConfigured ? mode === "search" ? selection.scope.kind === "file" ? "¿Qué quieres buscar en este archivo?" : "¿Qué buscas? Primero revisaré nombres de carpetas…" : mode === "summary" ? "¿Qué aspectos quieres resumir de la selección?" : mode === "extract" ? "Indica qué campos o datos quieres extraer…" : "Escribe una pregunta completa sobre la selección…" : "OpenAI pendiente de configuración"} value={draft} onChange={e => setDraft(e.target.value)} disabled={busy || !aiConfigured} maxLength={2000} rows={2} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }}/>{busy ? <button className="send-button" type="button" aria-label="Detener consulta" title="Detener consulta" onClick={() => { controller.current?.abort(); setBusy(false); setError(mode === "search" ? "Consulta detenida. Los resultados ya recibidos son parciales; puedes continuar la búsqueda." : "Consulta documental detenida. No se generó una respuesta nueva."); }}><Square size={17}/></button> : <button className="send-button" type="submit" disabled={!draft.trim() || !aiConfigured} aria-label="Enviar consulta"><ArrowUp size={20}/></button>}</div><p>{mode === "search" ? "Búsqueda por etapas: carpetas → archivos → contenido. Texto de PDF, Word, Excel, PPT/PPTX e imágenes mediante OCR. PDF de hasta 1.000 páginas, con OCR por lotes y continuación. Máximo 25 MB por archivo. El texto OCR puede contener errores; comprueba el original." : "Sólo la selección activa. Se envía a OpenAI el texto extraído para responder con citas. Hasta 8 documentos y 120.000 caracteres por consulta; cualquier lectura incompleta se indica. Cada pregunta vuelve a consultar sus fuentes."}</p></form>
  </section>;
}
