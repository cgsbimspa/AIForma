"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Plus, ArrowLeft, ArrowRight, Box, ShieldCheck, RefreshCw, PanelLeftClose, PanelLeftOpen, Save, ExternalLink } from "lucide-react";
import { AutodeskConnection } from "./autodesk-connection";
import { QuantitySourcePicker } from "./quantity-source-picker";
import { QuantityResults } from "./quantity-results";
import { quantitySpecialties, specialtyName } from "@/lib/quantities/catalog";
import { quantityState, processingBlocker } from "@/lib/quantities/engine";
import { quantityBrowse, quantityCommand, quantityResponse } from "@/lib/quantities/client";
import type { Entry } from "@/lib/autodesk/data";
import type { ModelVersion, ModelView, QuantityConfiguration, QuantityProject, QuantitySource, QuantityTemplateVersion, QuantityWorkspace as Workspace } from "@/lib/quantities/contracts";

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
    <div className="quantity-heading"><div><p className="eyebrow">MODELO + REGLAS + TRAZABILIDAD</p><h1>Cubicaciones</h1><p className="page-description">Configura la fuente. Conserva cada versión. Compara con evidencia.</p></div><AutodeskConnection/></div>
    <div className="quantity-project-bar"><label>Cuenta Autodesk<select value={hubId} disabled={busy} onChange={e => { setHubId(e.target.value); setProjectId(""); setProjects([]); setNextPage(null); }}><option value="">Seleccionar cuenta</option>{hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Proyecto<select value={projectId} disabled={!hubId || busy} onChange={e => setProjectId(e.target.value)}><option value="">Seleccionar proyecto</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{nextPage !== null && <button className="quantity-secondary" disabled={busy} onClick={() => void moreProjects()}>Más proyectos</button>}<button className="quantity-icon-button" aria-label="Volver a consultar proyectos de Autodesk" disabled={busy} onClick={() => setRetry(n => n + 1)}><RefreshCw size={17}/></button>{busy && <span role="status">Consultando Autodesk…</span>}</div>
    {error && <p role="alert" className="quantity-error">{error}</p>}
    {project ? <ProjectQuantities key={`${hubId}:${projectId}`} project={projectScope} name={project.name}/> : <section className="quantity-welcome quantity-panel"><div className="quantity-welcome-icon"><Boxes size={32}/></div><h2>Configuración de Cubicaciones</h2><p>Selecciona un proyecto de Autodesk para agregar sus especialidades y configurar las fuentes BIM.</p><div className="quantity-flow"><span>Especialidad</span><ArrowRight/><span>Plantilla</span><ArrowRight/><span>RVT + versión + vista</span><ArrowRight/><span>Cubicación</span></div><p className="quantity-help">Se mostrarán únicamente los proyectos y archivos accesibles para tu cuenta.</p></section>}
  </div>;
}

function ProjectQuantities({ project, name }: { project: QuantityProject; name: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [specialty, setSpecialty] = useState("");
  const [adding, setAdding] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [latest, setLatest] = useState<Record<string, ModelVersion | undefined>>({});
  const [versionErrors, setVersionErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError("");
      try { setWorkspace(await quantityResponse<Workspace>(`/api/quantities?scope=${encodeURIComponent(JSON.stringify(project))}`, { signal: controller.signal })); }
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
    try { const created = await quantityCommand<QuantityConfiguration>(project, { action: "add", specialtyCode: specialty }); setWorkspace({ ...workspace, configurations: [...workspace.configurations, created] }); setAdding(false); setSpecialty(""); setSelected(created.id); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const configuration = workspace?.configurations.find(c => c.id === selected);
  return <>
    <div className="quantity-section-title"><div>{configuration ? <button className="quantity-text-button" onClick={() => setSelected(null)}><ArrowLeft size={15}/>Volver a especialidades</button> : <h2>Configuración de Cubicaciones</h2>}<p>{configuration ? `${specialtyName(configuration.specialtyCode)} · Mesa de trabajo` : name}</p></div><div className="quantity-inline-actions"><button className="quantity-secondary" disabled={busy} onClick={() => { setSelected(null); setLatest({}); setRetry(n => n + 1); }}><RefreshCw size={15}/>Recargar configuración</button>{!configuration && <button className="quantity-primary" disabled={!workspace || busy} onClick={() => setAdding(v => !v)}><Plus size={16}/>Agregar especialidad</button>}</div></div>
    {error && <p className="quantity-error" role="alert">{error}</p>}{busy && <p role="status">Cargando configuración…</p>}
    {adding && <form className="quantity-add-specialty" onSubmit={e => { e.preventDefault(); void add(); }}><label htmlFor="quantity-specialty">Especialidad</label><select id="quantity-specialty" value={specialty} onChange={e => setSpecialty(e.target.value)}><option value="">Seleccionar especialidad</option>{quantitySpecialties.filter(s => !workspace?.configurations.some(c => c.specialtyCode === s.code)).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select><button className="quantity-primary" disabled={!specialty || busy}>Agregar al proyecto</button><button type="button" className="quantity-secondary" onClick={() => setAdding(false)}>Cancelar</button></form>}
    {configuration && workspace ? <QuantityDesk key={`${configuration.id}:${configuration.revision}`} project={project} configuration={configuration} templates={workspace.templates.filter(t => t.specialtyCode === configuration.specialtyCode)} runs={workspace.runs.filter(r => r.specialtyCode === configuration.specialtyCode)} historyPartial={workspace.historyPartial} latest={latest[configuration.id]} versionError={versionErrors[configuration.id]} checkVersion={checkVersion} onSave={value => setWorkspace(old => old && { ...old, configurations: old.configurations.map(c => c.id === value.id ? value : c) })} onTemplate={value => setWorkspace(old => old && { ...old, templates: [value, ...old.templates] })}/> : workspace && <>
      {!workspace.configurations.length ? <div className="quantity-empty quantity-panel"><Boxes size={34}/><h3>Este proyecto aún no tiene especialidades configuradas</h3><p>Agrega una especialidad para elegir su plantilla, archivo RVT, versión y vista.</p></div> : <div className="quantity-cards">{workspace.configurations.map(c => {
        const template = workspace.templates.find(t => t.id === c.templateVersionId), run = workspace.runs.find(r => r.specialtyCode === c.specialtyCode);
        const status = quantityState(c, template, run, latest[c.id]);
        return <article className="quantity-specialty-card quantity-panel" key={c.id}><div className="quantity-card-heading"><span className="quantity-card-icon"><Boxes size={22}/></span><h3>{specialtyName(c.specialtyCode)}</h3></div><span className={`quantity-status state-${status.state.toLowerCase()}`}>{stateLabels[status.state]}</span><dl><dt>Plantilla</dt><dd>{template ? `${template.name} · v${template.version}` : "Sin configurar"}</dd><dt>Archivo RVT</dt><dd>{c.source?.fileName ?? "Fuente BIM no configurada"}</dd><dt>Vista específica</dt><dd>{c.source?.view?.name ?? "No seleccionada"}</dd><dt>Versión seleccionada</dt><dd>{c.source ? `V${c.source.version.number}` : "No seleccionada"}</dd><dt>Versión cubicada</dt><dd>{run ? `V${run.source.version.number}` : "No procesada"}</dd><dt>Última publicación</dt><dd>{latest[c.id] ? `V${latest[c.id]!.number}` : "Por verificar"}</dd></dl><p className="quantity-help">{status.reason}</p>{versionErrors[c.id] && <p className="quantity-error">{versionErrors[c.id]}</p>}<div className="quantity-inline-actions"><button className="quantity-primary" onClick={() => setSelected(c.id)}>Abrir mesa de trabajo<ArrowRight size={14}/></button>{c.source && <button className="quantity-icon-button" aria-label={`Verificar última versión de ${specialtyName(c.specialtyCode)}`} onClick={() => void checkVersion(c.id)}><RefreshCw size={15}/></button>}</div></article>;
      })}</div>}
    </>}
  </>;
}

function QuantityDesk({ project, configuration, templates, runs, historyPartial, latest, versionError, checkVersion, onSave, onTemplate }: {
  project: QuantityProject; configuration: QuantityConfiguration; templates: QuantityTemplateVersion[];
  runs: Workspace["runs"]; historyPartial: boolean; latest?: ModelVersion; versionError?: string;
  checkVersion: (id: string, signal?: AbortSignal) => Promise<void>; onSave: (config: QuantityConfiguration) => void; onTemplate: (template: QuantityTemplateVersion) => void;
}) {
  const [source, setSource] = useState<QuantitySource | null>(configuration.source);
  const [templateId, setTemplateId] = useState(configuration.templateVersionId ?? "");
  const [templateName, setTemplateName] = useState("");
  const [createTemplate, setCreateTemplate] = useState(false), [collapsed, setCollapsed] = useState(false);
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
  async function save() {
    setBusy(true); setError("");
    try { const saved = await quantityCommand<QuantityConfiguration>(project, { action: "save", id: configuration.id, revision: configuration.revision, templateVersionId: templateId || null, source: source ? { scope: source.scope, versionId: source.version.id, viewId: source.view?.id ?? null } : null }); onSave(saved); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
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
      setSource({ ...source, version: latest, view: available.views.find(v => v.id === source.view?.id) ?? null });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <>
    <div className="quantity-desk-toolbar"><span className={`quantity-status state-${status.state.toLowerCase()}`}>{stateLabels[status.state]}</span><span>{changed ? "Cambios sin guardar" : "Configuración guardada en el proyecto"}</span><button className="quantity-text-button" onClick={() => setCollapsed(v => !v)}>{collapsed ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>} {collapsed ? "Mostrar configuración" : "Ocultar configuración"}</button></div>
    {error && <p className="quantity-error" role="alert">{error}</p>}
    <div className={`quantity-desk${collapsed ? " config-collapsed" : ""}`}>
      {!collapsed && <section className="quantity-settings quantity-panel" aria-label="Configuración de la fuente BIM"><div className="quantity-panel-heading"><Boxes size={18}/><h2>Configuración</h2></div><div className="quantity-panel-body">
        <span className="quantity-field-label">Especialidad</span><h3>{specialtyName(configuration.specialtyCode)}</h3>
        <label htmlFor="quantity-template">Plantilla y versión</label><select id="quantity-template" value={templateId} disabled={busy} onChange={e => setTemplateId(e.target.value)}><option value="">Sin plantilla</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name} · v{t.version}{t.configuration ? "" : " · Sin reglas"}</option>)}</select>
        <button className="quantity-text-button" disabled={busy} onClick={() => { setCreateTemplate(v => !v); setTemplateName(template?.name ?? ""); }}><Plus size={13}/>Crear plantilla / versión</button>
        {createTemplate && <div className="quantity-template-form"><label htmlFor="quantity-template-name">Nombre de la plantilla</label><input id="quantity-template-name" value={templateName} maxLength={200} onChange={e => setTemplateName(e.target.value)} placeholder="Nombre definido por tu equipo"/><p className="quantity-help">Se crea sin reglas. Los parámetros y fórmulas se definirán antes de habilitar el cálculo.</p><div className="quantity-inline-actions"><button className="quantity-secondary" disabled={busy || !templateName.trim()} onClick={() => void addTemplate(false)}>Nueva plantilla</button>{template && <button className="quantity-secondary" disabled={busy || !templateName.trim()} onClick={() => void addTemplate(true)}>Nueva versión</button>}</div></div>}
        <QuantitySourcePicker key={`${source?.scope.itemId ?? "empty"}:${source?.version.id ?? "empty"}`} project={project} source={source} onChange={setSource} disabled={busy}/>
        <button className="quantity-primary quantity-save" disabled={busy || !changed} onClick={() => void save()}><Save size={15}/>{busy ? "Guardando…" : "Guardar configuración"}</button>
        <div className="quantity-process"><button className="quantity-primary" disabled title={blocker}>{status.state === "STALE" ? "Actualizar Cubicación" : "Procesar Cubicación"}</button><p className="quantity-help">{blocker}</p>{runs[0] && <p className="quantity-help">Último procesamiento: {new Date(runs[0].completedAt).toLocaleString("es-CL")}</p>}</div>
      </div></section>}
      <section className="quantity-model quantity-panel" aria-label="Modelo BIM"><div className="quantity-panel-heading"><Box size={19}/><h2>Modelo BIM</h2><span className="quantity-model-version">{source ? `V${source.version.number}` : "Sin fuente"}</span></div>
        <div className="quantity-model-context"><strong>{source?.fileName ?? "Archivo RVT no seleccionado"}</strong><span>{source?.view ? `Vista: ${source.view.name}` : "Vista no seleccionada"}</span>{source && <span>{source.path}</span>}</div>
        <div className="quantity-viewer-empty"><div><Box size={46} strokeWidth={1}/></div><h3>Modelo BIM no cargado</h3><p>El visor integrado está preparado para conectarse a la versión y vista seleccionadas.</p><p className="quantity-help">La visualización dentro de la plataforma aún no está habilitada.</p>{source?.version.webUrl && <a className="quantity-secondary" href={source.version.webUrl} target="_blank" rel="noopener noreferrer">Abrir versión en Autodesk <ExternalLink size={14}/></a>}</div>
        <div className="quantity-version-panel"><div><span>Versión seleccionada</span><strong>{source ? `V${source.version.number}` : "No seleccionada"}</strong></div><div><span>Versión cubicada</span><strong>{runs[0] ? `V${runs[0].source.version.number}` : "No procesada"}</strong></div><div><span>Última publicación</span><strong>{latest ? `V${latest.number}` : "Por verificar"}</strong></div></div>
        <div className="quantity-model-footer">{versionError && <p className="quantity-error" role="alert">{versionError}</p>}{latest && <p className="quantity-help">Verificado: {new Date(latest.fetchedAt).toLocaleString("es-CL")}. Las publicaciones se revisan al abrir la mesa o al pulsar verificar.</p>}<div className="quantity-inline-actions">{configuration.source && <button className="quantity-text-button" disabled={busy} onClick={() => void checkVersion(configuration.id)}><RefreshCw size={13}/>Verificar nueva versión</button>}{source && latest && latest.number > source.version.number && source.scope.itemId === configuration.source?.scope.itemId && <button className="quantity-secondary" disabled={busy} onClick={() => void selectLatest()}>Usar V{latest.number}</button>}</div><details className="quantity-provenance"><summary>Identificadores de la fuente seleccionada</summary>{source ? <><p>Proyecto: {source.scope.projectId}</p><p>Archivo: {source.scope.itemId}</p><p>Modelo derivado: {source.version.modelId ?? "No disponible"}</p><p>Versión: {source.version.id}</p><p>Publicada: {source.version.createdAt ? new Date(source.version.createdAt).toLocaleString("es-CL") : "Fecha no disponible"}</p><p>Vista: {source.view?.id ?? "No seleccionada"}</p><p>Plantilla: {template?.id ?? "No seleccionada"}</p><p>Fuente: {source.version.endpoint}</p></> : <p>Fuente BIM no configurada.</p>}</details></div>
      </section>
      <QuantityResults project={project} runs={runs} partial={historyPartial}/>
    </div><p className="quantity-evidence-note"><ShieldCheck size={15}/>Las cantidades requieren datos del modelo y reglas verificadas. Las actualizaciones siempre son manuales.</p>
  </>;
}
