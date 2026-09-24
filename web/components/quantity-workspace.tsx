"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Plus, ArrowLeft, ArrowRight, Box, ShieldCheck, RefreshCw, Settings2, Search, Bell, Save } from "lucide-react";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { QuantityTopbar, QuantityFilters, QuantitySummaryCards, QuantityTable } from "./quantity-panels";
import { matchingRun, projectQuantityRows, filterQuantityRows, quantityTotals, type QuantityFiltersValue } from "@/lib/quantities/presentation";
import { AutodeskConnection } from "./autodesk-connection";
import { QuantitySourcePicker } from "./quantity-source-picker";
import { QuantityResults } from "./quantity-results";
import { QuantityViewer } from "./quantity-viewer";
import { quantitySpecialties, specialtyName } from "@/lib/quantities/catalog";
import { classificationRule } from "@/public/quantity-classification.js";
import { quantityState, processingBlocker } from "@/lib/quantities/engine";
import { quantityBrowse, quantityCommand, quantityResponse } from "@/lib/quantities/client";
import type { Entry } from "@/lib/autodesk/data";
import type { ModelVersion, ModelView, QuantityComparison, QuantityConfiguration, QuantityProject, QuantitySource, QuantityTemplateVersion, QuantityWorkspace as Workspace } from "@/lib/quantities/contracts";

const stateLabels = { NOT_CONFIGURED: "Sin configurar", READY: "Configurada · sin procesar", PROCESSING: "Procesando", CURRENT: "Actualizada", STALE: "Nueva versión disponible", ERROR: "Por verificar" };
export function QuantityWorkspace() {
  const [hubs, setHubs] = useState<Entry[]>([]), [hubId, setHubId] = useState("");
  const [projects, setProjects] = useState<Entry[]>([]), [projectId, setProjectId] = useState("");
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError("");
      try { const page = await quantityBrowse({ operation: "hubs" }, controller.signal); setHubs(page.entries); if (page.entries.length === 1) setHubId(page.entries[0].id); }
      catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load(); return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!hubId) return;
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError("");
      try { const page = await quantityBrowse({ operation: "projects", hubId }, controller.signal); setProjects(page.entries); setNextPage(page.evidence.nextPage); }
      catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load(); return () => controller.abort();
  }, [hubId, retry]);
  async function moreProjects() {
    if (nextPage === null) return;
    setBusy(true); setError("");
    try { const page = await quantityBrowse({ operation: "projects", hubId, page: nextPage }); setProjects(old => [...old, ...page.entries]); setNextPage(page.evidence.nextPage); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const project = projects.find(p => p.id === projectId);
  const projectScope = useMemo<QuantityProject>(() => ({ kind: "project", hubId, projectId }), [hubId, projectId]);
  return <div className="page-content quantity-page">
    <header className="quantity-app-topbar"><Link href="/" className="quantity-brand"><Box size={26}/><span><strong>BIM + IA</strong><small>Cubicaciones</small></span></Link><div className="quantity-project-bar"><label>Cuenta Autodesk<select value={hubId} disabled={busy} onChange={e => { setHubId(e.target.value); setProjectId(""); setProjects([]); setNextPage(null); }}><option value="">Seleccionar cuenta</option>{hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Proyecto<select value={projectId} disabled={!hubId || busy} onChange={e => setProjectId(e.target.value)}><option value="">Seleccionar proyecto</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{nextPage !== null && <button className="quantity-secondary" disabled={busy} onClick={() => void moreProjects()}>Más proyectos</button>}<button className="quantity-icon-button" aria-label="Volver a consultar proyectos de Autodesk" disabled={busy} onClick={() => setRetry(n => n + 1)}><RefreshCw size={17}/></button>{busy && <span role="status">Consultando Autodesk…</span>}</div><button className="quantity-icon-button" aria-label="Buscar proyecto" onClick={()=>document.querySelector<HTMLSelectElement>('.quantity-project-bar label:nth-child(2) select')?.focus()}><Search size={18}/></button><button className="quantity-icon-button" disabled title="Notificaciones no disponibles" aria-label="Notificaciones no disponibles"><Bell size={18}/></button><AutodeskConnection/></header>
    {error && <p role="alert" className="quantity-error">{error}</p>}
    {project ? <ProjectQuantities key={`${hubId}:${projectId}`} project={projectScope} name={project.name}/> : <section className="quantity-welcome quantity-panel"><div className="quantity-welcome-icon"><Boxes size={32}/></div><h2>Configuración de Cubicaciones</h2><p>Selecciona un proyecto de Autodesk para agregar sus especialidades y configurar las fuentes BIM.</p><div className="quantity-flow"><span>Especialidad</span><ArrowRight/><span>Plantilla</span><ArrowRight/><span>RVT + versión + vista</span><ArrowRight/><span>Cubicación</span></div><p className="quantity-help">Se mostrarán únicamente los proyectos y archivos accesibles para tu cuenta.</p></section>}
  </div>;
}

function ProjectQuantities({ project, name }: { project: QuantityProject; name: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [specialty, setSpecialty] = useState("");
  const [openConfiguration, setOpenConfiguration] = useState(false);
  const [savedRevision, setSavedRevision] = useState<string | null>(null);
  const [adding, setAdding] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [latest, setLatest] = useState<Record<string, ModelVersion | undefined>>({});
  const [versionErrors, setVersionErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError("");
      try { setWorkspace(await quantityCommand<Workspace>(project, { action: "prepare-templates" }, controller.signal)); }
      catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load(); return () => controller.abort();
  }, [project, retry]);
  const checkVersion = useCallback(async (id: string, signal?: AbortSignal) => {
    setLatest(old => ({ ...old, [id]: undefined })); setVersionErrors(old => ({ ...old, [id]: "" }));
    try { const result = await quantityCommand<{ latest: ModelVersion }>(project, { action: "latest", configurationId: id }, signal); setLatest(old => ({ ...old, [id]: result.latest })); }
    catch (e) { if (!signal?.aborted) setVersionErrors(old => ({ ...old, [id]: (e as Error).message })); }
  }, [project]);
  async function add() {
    if (!specialty || !workspace) return;
    setBusy(true); setError("");
    try { const created = await quantityCommand<QuantityConfiguration>(project, { action: "add", specialtyCode: specialty }); setWorkspace(await quantityResponse<Workspace>(`/api/quantities?scope=${encodeURIComponent(JSON.stringify(project))}`)); setAdding(false); setSpecialty(""); setSelected(created.id); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const configuration = workspace?.configurations.find(c => c.id === selected);
  return <div className={`quantity-project-stage${configuration ? " has-desk" : ""}`}>
    <div className="quantity-section-title"><div>{configuration ? <button className="quantity-text-button" onClick={() => setSelected(null)}><ArrowLeft size={15}/>Volver a especialidades</button> : <h2>Configuración de Cubicaciones</h2>}<p>{configuration ? `${specialtyName(configuration.specialtyCode)} · Mesa de trabajo` : name}</p></div><div className="quantity-inline-actions"><button className="quantity-secondary" disabled={busy} onClick={() => { setSelected(null); setLatest({}); setRetry(n => n + 1); }}><RefreshCw size={15}/>Recargar configuración</button>{!configuration && <button className="quantity-primary" disabled={!workspace || busy} onClick={() => setAdding(v => !v)}><Plus size={16}/>Agregar especialidad</button>}</div></div>
    {error && <p className="quantity-error" role="alert">{error}</p>}{busy && <p role="status">Cargando configuración…</p>}
    {adding && <form className="quantity-add-specialty" onSubmit={e => { e.preventDefault(); void add(); }}><label htmlFor="quantity-specialty">Especialidad</label><select id="quantity-specialty" value={specialty} onChange={e => setSpecialty(e.target.value)}><option value="">Seleccionar especialidad</option>{quantitySpecialties.filter(s => !workspace?.configurations.some(c => c.specialtyCode === s.code)).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select><button className="quantity-primary" disabled={!specialty || busy}>Agregar al proyecto</button><button type="button" className="quantity-secondary" onClick={() => setAdding(false)}>Cancelar</button></form>}
    {configuration && workspace ? <QuantityDesk key={`${configuration.id}:${configuration.revision}`} project={project} configuration={configuration} savedSuccessfully={savedRevision === `${configuration.id}:${configuration.revision}`} openConfiguration={openConfiguration} projectName={name} templates={workspace.templates.filter(t => t.specialtyCode === configuration.specialtyCode)} runs={workspace.runs.filter(r => r.specialtyCode === configuration.specialtyCode)} historyPartial={workspace.historyPartial} latest={latest[configuration.id]} versionError={versionErrors[configuration.id]} checkVersion={checkVersion} onSave={value => { setSavedRevision(`${value.id}:${value.revision}`); setWorkspace(old => old && { ...old, configurations: old.configurations.map(c => c.id === value.id ? value : c) }); }} onTemplate={value => setWorkspace(old => old && { ...old, templates: [value, ...old.templates] })}/> : workspace && <>
      {!workspace.configurations.length ? <div className="quantity-empty quantity-panel"><Boxes size={34}/><h3>Este proyecto aún no tiene especialidades configuradas</h3><p>Agrega una especialidad para elegir su plantilla, archivo RVT, versión y vista.</p></div> : <div className="quantity-cards">{workspace.configurations.map(c => {
        const template = workspace.templates.find(t => t.id === c.templateVersionId), run = workspace.runs.find(r => r.specialtyCode === c.specialtyCode);
        const status = quantityState(c, template, run, latest[c.id]);
        return <article className="quantity-specialty-card quantity-panel" key={c.id}><div className="quantity-card-heading"><span className="quantity-card-icon"><Boxes size={22}/></span><h3>{specialtyName(c.specialtyCode)}</h3></div><span className={`quantity-status state-${status.state.toLowerCase()}`}>{stateLabels[status.state]}</span><dl><dt>Plantilla</dt><dd>{template ? `${template.name} · v${template.version}` : "Sin configurar"}</dd><dt>Archivo RVT</dt><dd>{c.source?.fileName ?? "Fuente BIM no configurada"}</dd><dt>Vista específica</dt><dd>{c.source?.view?.name ?? "No seleccionada"}</dd><dt>Versión seleccionada</dt><dd>{c.source ? `V${c.source.version.number}` : "No seleccionada"}</dd><dt>Versión cubicada</dt><dd>{run ? `V${run.source.version.number}` : "No procesada"}</dd><dt>Última publicación</dt><dd>{latest[c.id] ? `V${latest[c.id]!.number}` : "Por verificar"}</dd></dl><p className="quantity-help">{status.reason}</p>{versionErrors[c.id] && <p className="quantity-error">{versionErrors[c.id]}</p>}<div className="quantity-inline-actions"><button className="quantity-primary" onClick={() => { setOpenConfiguration(true); setSelected(c.id); }}><Settings2 size={15}/>Configurar archivo y vista</button><button className="quantity-secondary" onClick={() => { setOpenConfiguration(false); setSelected(c.id); }}>Abrir mesa de trabajo<ArrowRight size={14}/></button>{c.source && <button className="quantity-icon-button" aria-label={`Verificar última versión de ${specialtyName(c.specialtyCode)}`} onClick={() => void checkVersion(c.id)}><RefreshCw size={15}/></button>}</div></article>;
      })}</div>}
    </>}
  </div>;
}

function QuantityDesk({ project, configuration, templates, runs, historyPartial, latest, versionError, checkVersion, onSave, onTemplate, openConfiguration, projectName, savedSuccessfully }: {
  openConfiguration: boolean; projectName: string; savedSuccessfully: boolean;
  project: QuantityProject; configuration: QuantityConfiguration; templates: QuantityTemplateVersion[];
  runs: Workspace["runs"]; historyPartial: boolean; latest?: ModelVersion; versionError?: string;
  checkVersion: (id: string, signal?: AbortSignal) => Promise<void>; onSave: (config: QuantityConfiguration) => void; onTemplate: (template: QuantityTemplateVersion) => void;
}) {
  const [source, setSource] = useState<QuantitySource | null>(configuration.source);
  const [templateId, setTemplateId] = useState(configuration.templateVersionId ?? "");
  const [templateName, setTemplateName] = useState("");
  const [createTemplate, setCreateTemplate] = useState(false), [settings, setSettings] = useState(openConfiguration || !configuration.source?.view);
  const [historyTab,setHistoryTab]=useState<string|null>(null);
  const [views,setViews]=useState<ModelView[]>(source?.view?[source.view]:[]);
  const [filters,setFilters]=useState<QuantityFiltersValue>({specialty:"",subspecialty:"",floor:""});
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [comparison,setComparison]=useState<QuantityComparison|null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const template = templates.find(t => t.id === templateId);
  const draft = { ...configuration, source, templateVersionId: templateId || null };
  const changed = JSON.stringify(source) !== JSON.stringify(configuration.source) || templateId !== (configuration.templateVersionId ?? "");
  const blocker = processingBlocker(draft, template);
  const status = quantityState(configuration, templates.find(t => t.id === configuration.templateVersionId), runs[0], latest);
  useEffect(() => {
    if (!configuration.source) return;
    const controller = new AbortController();
    void checkVersion(configuration.id, controller.signal); return () => controller.abort();
  }, [configuration.id, configuration.source, checkVersion]);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setBusy(true); setError("");
    try { const saved = await quantityCommand<QuantityConfiguration>(project, { action: "save", id: configuration.id, revision: configuration.revision, templateVersionId: templateId || null, source: source ? { scope: source.scope, versionId: source.version.id, viewId: source.view?.id ?? null } : null }); onSave(saved); }
    catch (e) { setError((e as Error).message); } finally { setSaving(false); setBusy(false); }
  }
  async function addTemplate(newVersion: boolean) {
    if (!templateName.trim()) return;
    setBusy(true); setError("");
    try { const created = await quantityCommand<QuantityTemplateVersion>(project, { action: "template", configurationId: configuration.id, name: templateName.trim(), ...(newVersion && template ? { templateId: template.templateId } : {}) }); onTemplate(created); setTemplateId(created.id); setCreateTemplate(false); setTemplateName(""); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function selectLatest() {
    if (!source || !latest || source.scope.itemId !== configuration.source?.scope.itemId) return;
    setBusy(true); setError("");
    try {
      const available = await quantityCommand<{ views: ModelView[] }>(project, { action: "views", file: source.scope, versionId: latest.id });
      setViews(available.views); setSource({ ...source, version: latest, view: available.views.find(v => v.id === source.view?.id) ?? null });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function loadViews() {
    if (!source) return; setBusy(true); setError("");
    try { const result=await quantityCommand<{views:ModelView[]}>(project,{action:"views",file:source.scope,versionId:source.version.id});setViews(result.views); }
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function updateVersion() {
    if(!source)return;setBusy(true);setError("");
    try {
      const result=await quantityCommand<{latest:ModelVersion}>(project,{action:"versions",file:source.scope});
      if(result.latest.id===source.version.id){setSettings(true);return;}
      const data=await quantityCommand<{views:ModelView[]}>(project,{action:"views",file:source.scope,versionId:result.latest.id});
      setViews(data.views);setSource({...source,version:result.latest,view:data.views.find(v=>v.id===source.view?.id)??null});setSelectedIds([]);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const activeRun=matchingRun(runs,source,templateId);
  const projected=useMemo(()=>projectQuantityRows(activeRun),[activeRun]);
  const filtered=useMemo(()=>filterQuantityRows(projected.rows,filters),[projected.rows,filters]);
  const totals=quantityTotals(filtered,projected.unavailable);
  const priorProjection=comparison&&comparison.current.id===activeRun?.id?projectQuantityRows(comparison.previous):null;
  const previousTotals=priorProjection?quantityTotals(filterQuantityRows(priorProjection.rows,filters),priorProjection.unavailable):undefined;
  const floors=[...new Set(projected.rows.map(r=>r.floor))];
  const filterIds=useMemo(()=>projected.rows.length?[...new Set(filtered.flatMap(r=>r.elementIds))]:null,[projected.rows,filtered]);
  const availableViews=views.some(v=>v.id===source?.view?.id)?views:source?.view?[source.view,...views]:views;
  return <div className="quantity-desk-stage">
    <QuantityTopbar source={source} views={availableViews} busy={busy} status={changed?"READY":status.state} versionLabel={changed?"Cambios sin guardar":stateLabels[status.state]} onView={id=>{setSource(source?{...source,view:availableViews.find(v=>v.id===id)??null}:null);setSelectedIds([]);}} onLoadViews={()=>void loadViews()} onUpdate={()=>void updateVersion()} onHistory={()=>setHistoryTab("history")} onCompare={()=>setHistoryTab("compare")} onSettings={()=>setSettings(true)}/>
    {savedSuccessfully&&!changed&&<p className="quantity-save-notice" role="status">Configuración guardada en el proyecto. El guardado no ejecuta la cubicación.</p>}
    {error&&!settings&&<p className="quantity-error" role="alert">{error}</p>}
    <div className="quantity-desk-board">
      <section className="quantity-model quantity-panel" aria-label="Modelo BIM"><div className="quantity-panel-heading"><Box size={20}/><div><h2>Modelo BIM</h2><p>Explora la vista publicada y los elementos de tu modelo.</p></div><button className="quantity-secondary" onClick={()=>setSettings(true)}><Settings2 size={16}/>Configurar archivo y vista</button></div>
        <div className="quantity-model-context" title={source?.path}><strong>{source?.fileName??"Archivo RVT no seleccionado"}</strong><span>{source?.view?.name??"Vista no seleccionada"} · {source?"V"+source.version.number:"Versión no disponible"}</span></div>
        <QuantityViewer project={project} source={source} highlightedElementIds={selectedIds} filteredElementIds={filterIds} onSelectElements={setSelectedIds} classificationFilter={configuration.specialtyCode === "structure" ? filters : undefined}/>
        <div className="quantity-model-bottom"><span>{activeRun?"Ejecución: V"+activeRun.source.version.number:"Cubicación no procesada"}</span><span>{latest?"Última publicación: V"+latest.number:"Publicación por verificar"}</span><button className="quantity-text-button" disabled={!configuration.source||busy} onClick={()=>void checkVersion(configuration.id)}><RefreshCw size={12}/>Verificar versión</button></div>
      </section>
      <div className="quantity-data-column"><QuantityFilters value={filters} floors={floors} onChange={v=>{setFilters(v);setSelectedIds([]);}}/><QuantitySummaryCards totals={totals} previousTotals={previousTotals} blocker={blocker} specialty={filters.specialty} onRequirements={()=>setSettings(true)}/><QuantityTable specialty={filters.specialty} rows={filtered} totals={totals} hasRun={Boolean(activeRun)} unavailable={projected.unavailable} onSelect={setSelectedIds} selectedIds={selectedIds}/></div>
    </div>
    <footer className="quantity-workspace-footer"><ShieldCheck size={13}/><span>{projected.rows.length?"Cantidades vinculadas a la versión y vista seleccionadas.":"Clasificación por parámetros del modelo · Cantidades pendientes de reglas de cálculo."}</span><span>{changed?"Cambios sin guardar":latest?"Verificado: "+new Date(latest.fetchedAt).toLocaleString("es-CL"):"Fuente pendiente de verificación"}</span></footer>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="quantity-page quantity-modal"><DialogTitle>Configurar fuente BIM</DialogTitle><DialogDescription>{specialtyName(configuration.specialtyCode)} · {projectName}. Selecciona el archivo RVT, su versión y su vista publicada.</DialogDescription><section className="quantity-settings quantity-panel" aria-label="Configuración de la fuente BIM"><div className="quantity-panel-heading"><Boxes size={18}/><h2>Configuración</h2></div><div className="quantity-panel-body">
        <span className="quantity-field-label">Especialidad</span><h3>{specialtyName(configuration.specialtyCode)}</h3>
        <label htmlFor="quantity-template">Plantilla y versión</label><select id="quantity-template" value={templateId} disabled={busy} onChange={e => setTemplateId(e.target.value)}><option value="">Sin plantilla</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name} · v{t.version}{t.configuration ? "" : t.baseDefinition ? " · Base definida" : " · Sin reglas"}</option>)}</select>
        {template?.baseDefinition && <div className="quantity-template-definition"><strong>Plantilla base de Cálculo</strong><p>{template.baseDefinition.metrics.map(metric => `${metric.name} (${metric.unit})`).join(" · ")}</p><p>Agrupación: {template.baseDefinition.groupings.join(" · ")}</p><small>Seleccionada automáticamente para esta especialidad. La estructura está definida; las reglas y los parámetros del modelo están pendientes de configurar y validar.</small></div>}
        {!templateId && templates.length > 1 && <p className="quantity-help">Hay varias plantillas de Cálculo disponibles. Selecciona la que corresponde a este proyecto.</p>}
        <button className="quantity-text-button" disabled={busy} onClick={() => { setCreateTemplate(v => !v); setTemplateName(template?.name ?? ""); }}><Plus size={13}/>Crear plantilla / versión</button>
        {createTemplate && <div className="quantity-template-form"><label htmlFor="quantity-template-name">Nombre de la plantilla</label><input id="quantity-template-name" value={templateName} maxLength={200} onChange={e => setTemplateName(e.target.value)} placeholder="Nombre definido por tu equipo"/><p className="quantity-help">Se crea sin reglas. Los parámetros y fórmulas se definirán antes de habilitar el cálculo.</p><div className="quantity-inline-actions"><button className="quantity-secondary" disabled={busy || !templateName.trim()} onClick={() => void addTemplate(false)}>Nueva plantilla</button>{template && <button className="quantity-secondary" disabled={busy || !templateName.trim()} onClick={() => void addTemplate(true)}>Nueva versión</button>}</div></div>}
        <QuantitySourcePicker key={`${source?.scope.itemId ?? "empty"}:${source?.version.id ?? "empty"}`} project={project} source={source} onChange={value=>{setSource(value);setViews(value?.view?[value.view]:[]);setSelectedIds([]);}} disabled={busy}/>
        <p className="quantity-help">{changed ? "Hay cambios pendientes de guardar." : "Sin cambios pendientes. Puedes guardar para volver a verificar la fuente seleccionada."}</p>
        {error&&<p className="quantity-error" role="alert">{error}</p>}
        {savedSuccessfully&&!changed&&<p className="quantity-save-notice" role="status">Configuración guardada en el proyecto.</p>}
        <button className="quantity-primary quantity-save" disabled={busy} onClick={() => void save()}><Save size={15}/>{saving ? "Guardando…" : "Guardar configuración"}</button>
        <div className="quantity-process"><button className="quantity-primary" disabled title={blocker}>{status.state === "STALE" ? "Actualizar Cubicación" : "Procesar Cubicación"}</button><p className="quantity-help">{blocker}</p>{configuration.specialtyCode === "structure" && <div className="quantity-template-definition"><strong>Reglas de selección recibidas</strong><p>Hormigón: Especialidad = Hormigón, o Sub Especialidad = {classificationRule.concreteSubspecialties.join(", ")}.</p><p>Enfierradura: Especialidad = Enfierradura.</p><p>Metalcon / Acero Galvanizado: Especialidad = Acero Galvanizado.</p><p>Moldaje se muestra al seleccionar Hormigón.</p><strong>Pendiente para calcular</strong><p>Definir el parámetro numérico y la unidad de Hormigón, Moldaje, Fe y Acero Galvanizado, y el parámetro de Piso. El motor de suma aún no está implementado.</p><small>Estas reglas de selección filtran el visor. No generan cantidades ni sustituyen un cálculo.</small></div>}{runs[0] && <p className="quantity-help">Último procesamiento: {new Date(runs[0].completedAt).toLocaleString("es-CL")}</p>}</div>
      </div></section>{versionError&&<p className="quantity-error">{versionError}</p>}{source&&latest&&latest.number>source.version.number&&<button className="quantity-secondary" disabled={busy} onClick={()=>void selectLatest()}>Usar última publicación: V{latest.number}</button>}</DialogContent></Dialog>
    <Dialog open={historyTab!==null} onOpenChange={open=>{if(!open)setHistoryTab(null);}}><DialogContent className="quantity-page quantity-modal quantity-history-modal"><DialogTitle>{historyTab==="compare"?"Comparación de ejecuciones":"Versiones procesadas"}</DialogTitle><DialogDescription>Consulta ejecuciones reales sin modificar la configuración ni sobrescribir resultados.</DialogDescription>{historyTab&&<QuantityResults key={historyTab} project={project} runs={runs} partial={historyPartial} initialTab={historyTab} onComparison={setComparison}/>}</DialogContent></Dialog>
  </div>;
}
