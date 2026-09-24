"use client";
import { useEffect, useState } from "react";
import { ChevronRight, FileBox, Folder, ArrowLeft, RefreshCw } from "lucide-react";
import type { DataPage, Entry } from "@/lib/autodesk/data";
import type { ModelVersion, ModelView, QuantityProject, QuantitySource } from "@/lib/quantities/contracts";
import { quantityBrowse, quantityCommand } from "@/lib/quantities/client";

type Versions = { versions: ModelVersion[]; latest: ModelVersion; nextPage: number | null; fileName: string; path: string; projectName: string };
export function QuantitySourcePicker({ project, source, onChange, disabled }: { project: QuantityProject; source: QuantitySource | null; onChange: (source: QuantitySource | null) => void; disabled: boolean }) {
  const [browsing, setBrowsing] = useState(!source);
  const [folders, setFolders] = useState<Entry[]>([]);
  const [page, setPage] = useState<DataPage | null>(null);
  const [pageNumber, setPageNumber] = useState(0);
  const [versions, setVersions] = useState<ModelVersion[]>(source ? [source.version] : []);
  const [nextVersionPage, setNextVersionPage] = useState<number | null>(null);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  const [views, setViews] = useState<ModelView[]>(source?.view ? [source.view] : []);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!browsing) return;
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError(""); setPage(null);
      try { setPage(await quantityBrowse({ operation: folders.length ? "contents" : "roots", hubId: project.hubId, projectId: project.projectId, folderId: folders.at(-1)?.id, page: pageNumber }, controller.signal)); }
      catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load(); return () => controller.abort();
  }, [project.hubId, project.projectId, folders, pageNumber, browsing]);
  async function pickFile(entry: Entry) {
    setBusy(true); setError(""); setNotice("");
    try {
      const scope = { ...project, kind: "file" as const, folderIds: folders.map(f => f.id), itemId: entry.id };
      const data = await quantityCommand<Versions>(project, { action: "versions", file: scope });
      setVersions(data.versions); setNextVersionPage(data.nextPage); setVersionsLoaded(true); setViews([]);
      onChange({ scope, fileName: data.fileName, projectName: data.projectName, path: data.path, version: data.latest, view: null, versionPolicy: "manual" });
      setBrowsing(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function loadVersions(append = false) {
    if (!source) return;
    setBusy(true); setError("");
    try {
      const data = await quantityCommand<Versions>(project, { action: "versions", file: source.scope, page: append ? nextVersionPage : 0 });
      setVersions(previous => Array.from(new Map([...(append ? previous : [source.version]), ...data.versions].map(v => [v.id, v])).values()));
      setNextVersionPage(data.nextPage); setVersionsLoaded(true);
      setNotice(`Última publicación verificada: V${data.latest.number}. La selección actual se conserva.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function loadViews() {
    if (!source) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await quantityCommand<{ views: ModelView[]; unavailable: boolean }>(project, { action: "views", file: source.scope, versionId: source.version.id });
      setViews(data.views);
      if (source.view && !data.views.some(v => v.id === source.view!.id)) onChange({ ...source, view: null });
      setNotice(data.unavailable ? "Esta versión no tiene un derivado disponible para consultar sus vistas." : data.views.length ? "Vistas publicadas consultadas en Autodesk. Selecciona la vista a utilizar." : "Autodesk no devolvió vistas disponibles para esta versión.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="quantity-source-picker">
    <label>Archivo RVT</label>
    <div className="quantity-selected-file"><FileBox size={16}/><span>{source?.fileName ?? "Fuente BIM no configurada"}</span></div>
    <button className="quantity-text-button" disabled={disabled || busy} onClick={() => { setBrowsing(v => !v); setError(""); }}>{browsing ? "Cerrar explorador" : "Seleccionar archivo en Autodesk"}</button>
    {browsing && <div className="quantity-file-browser" aria-label="Archivos RVT de Autodesk">
      <div className="quantity-folder-nav"><button aria-label="Volver a la carpeta superior" disabled={busy || !folders.length} onClick={() => { setFolders(f => f.slice(0, -1)); setPageNumber(0); }}><ArrowLeft size={15}/></button><span>{folders.at(-1)?.name ?? "Carpetas del proyecto"}</span></div>
      {page?.entries.filter(entry => entry.type === "folders" || /\.rvt$/i.test(entry.name)).map(entry => <button key={entry.id} disabled={busy || disabled} className="quantity-file-entry" onClick={() => entry.type === "folders" ? (setFolders(f => [...f, entry]), setPageNumber(0)) : void pickFile(entry)}>{entry.type === "folders" ? <Folder size={15}/> : <FileBox size={15}/>}<span>{entry.name}</span>{entry.type === "folders" && <ChevronRight size={13}/>}</button>)}
      {page && !page.entries.some(e => e.type === "folders" || /\.rvt$/i.test(e.name)) && <p>No hay carpetas ni archivos RVT en esta página.</p>}
      {page?.evidence.partial && <p role="status">Autodesk informó una lectura parcial de esta carpeta.</p>}
      <div className="quantity-inline-actions">{pageNumber > 0 && <button disabled={busy} onClick={() => setPageNumber(n => n - 1)}>Anterior</button>}{page?.evidence.nextPage != null && <button disabled={busy} onClick={() => setPageNumber(page.evidence.nextPage!)}>Más archivos</button>}</div>
    </div>}
    <label htmlFor="quantity-model-version">Versión del modelo</label>
    <select id="quantity-model-version" disabled={!source || busy || disabled} value={source?.version.id ?? ""} onChange={e => {
      const version = versions.find(v => v.id === e.target.value); if (source && version) { onChange({ ...source, version, view: null }); setViews([]); setNotice("Consulta las vistas de la versión seleccionada."); }
    }}><option value="" disabled>Selecciona un RVT</option>{versions.map(v => <option key={v.id} value={v.id}>V{v.number}{v.createdAt ? ` · ${new Date(v.createdAt).toLocaleDateString("es-CL")}` : " · Fecha no disponible"}</option>)}</select>
    {source && <button className="quantity-text-button" disabled={busy || disabled} onClick={() => void loadVersions(versionsLoaded && nextVersionPage !== null)}><RefreshCw size={12}/>{versionsLoaded && nextVersionPage !== null ? "Cargar más versiones" : "Consultar versiones publicadas"}</button>}
    <label htmlFor="quantity-model-view">Vista publicada</label>
    <select id="quantity-model-view" disabled={!source || !views.length || busy || disabled} value={source?.view?.id ?? ""} onChange={e => source && onChange({ ...source, view: views.find(v => v.id === e.target.value) ?? null })}><option value="">Selecciona una vista</option>{views.map(v => <option key={v.id} value={v.id}>{v.name} · {v.role.toUpperCase()}</option>)}</select>
    {source && <button className="quantity-text-button" disabled={busy || disabled} onClick={() => void loadViews()}>Consultar vistas de V{source.version.number}</button>}
    {busy && <p role="status">Consultando Autodesk…</p>}{notice && <p className="quantity-help" role="status">{notice}</p>}{error && <p className="quantity-error" role="alert">{error}</p>}
  </div>;
}
