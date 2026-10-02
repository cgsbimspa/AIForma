"use client";
import { useProjectContext, useProjectState } from "./project-context";
import {activateProjectModule} from '@/lib/projects/client';
import {specialtyState,type ProcessReceipt} from "@/lib/quantities/specialty-state";
import {projectSessionKey} from "@/lib/project-session";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Boxes, Plus, ArrowLeft, ArrowRight, Box, ShieldCheck, RefreshCw, Settings2, Save } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { QuantityTopbar, QuantityFilters, QuantitySummaryCards, QuantityTable } from "./quantity-panels";
import { matchingRun, projectQuantityRows, filterQuantityRows, quantityTotals, type QuantityFiltersValue } from "@/lib/quantities/presentation";
import { QuantitySourcePicker } from "./quantity-source-picker";
import { QuantityResults } from "./quantity-results";
import { liveCalculationSchema, presentLiveCalculation, type ClassificationInventory, type CalculationEvent, type LiveCalculation } from "@/lib/quantities/live";
import { QuantityLiveEvidence } from "./quantity-live-evidence";
import { QuantityHeaderContext, QuantityFilterSlotContext } from './quantity-header';
import { QuantityModelDesk } from './quantity-model-desk';
import { QuantityViewer } from "./quantity-viewer";
import { isMEPTemplate } from '@/public/quantity-v2/mep-templates.js';
import { quantitySpecialties, specialtyName } from "@/lib/quantities/catalog";
import { classificationFacets, classificationRule, subspecialtyCriteria } from "@/public/quantity-classification.js";
import { quantityState, processingBlocker } from "@/lib/quantities/engine";
import { quantityCommand, quantityResponse } from "@/lib/quantities/client";
import type { ModelVersion, ModelView, QuantityComparison, QuantityConfiguration, QuantityProject, QuantitySource, QuantityTemplateVersion, QuantityWorkspace as Workspace } from "@/lib/quantities/contracts";

const stateLabels = { NOT_CONFIGURED: "Sin configurar", READY: "Configurada · sin procesar", PROCESSING: "Procesando", CURRENT: "Actualizada", STALE: "Nueva versión disponible", ERROR: "Por verificar" };
export function QuantityWorkspace() {
  const headerSlot=useContext(QuantityHeaderContext);
  const {hubId,projectId,projects,project:projectScope,error,selectedDiscipline,configuration}=useProjectContext();
  const project = projects.find(p => p.id === projectId);
  return <QuantityHeaderContext.Provider value={headerSlot}><div className="page-content quantity-page">
    {error && <p role="alert" className="quantity-error">{error}</p>}
    {project ? <ProjectQuantities key={`${hubId}:${projectId}:${selectedDiscipline?.id}:${configuration?.revision}`} project={projectScope} name={project.name}/> : <section className="quantity-welcome quantity-panel"><div className="quantity-welcome-icon"><Boxes size={32}/></div><h2>Configuración de Cubicaciones</h2><p>Selecciona un proyecto de Autodesk para acceder a sus especialidades y configurar las fuentes BIM.</p><div className="quantity-flow"><span>Especialidad</span><ArrowRight/><span>Plantilla</span><ArrowRight/><span>RVT + versión + vista</span><ArrowRight/><span>Cubicación</span></div><p className="quantity-help">Se mostrarán únicamente los proyectos y archivos accesibles para tu cuenta.</p></section>}
  </div></QuantityHeaderContext.Provider>;
}

function ProjectQuantities({ project, name }: { project: QuantityProject; name: string }) {
  const context=useProjectContext();
  const disciplineId=context.selectedDiscipline?.id,disciplineCode=context.selectedDiscipline?.code,centralRevision=context.configuration?.revision;
  const [management,setManagement]=useState(false),[showHidden,setShowHidden]=useState(false);
  const [filterSlot,setFilterSlot]=useState<HTMLElement|null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selected, setSelected] = useProjectState<string | null>("quantities.board",null);
  const [openConfiguration, setOpenConfiguration] = useState(false);
  const [savedRevision, setSavedRevision] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [latest, setLatest] = useState<Record<string, ModelVersion | undefined>>({});
  const [versionErrors, setVersionErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const [mepSetup,setMepSetup]=useState(false),[mepSource,setMepSource]=useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError("");
      try { const w=disciplineId&&centralRevision?await activateProjectModule<Workspace>(project,disciplineId,centralRevision,'quantities',controller.signal):await quantityCommand<Workspace>(project,{action:'prepare-templates'},controller.signal);if(!controller.signal.aborted){setWorkspace(w);if(disciplineCode)setSelected(w.configurations.find(c=>c.specialtyCode===disciplineCode)?.id??null);} }
      catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load(); return () => controller.abort();
  }, [project, retry,disciplineId,disciplineCode,centralRevision,setSelected]);
  const checkVersion = useCallback(async (id: string, signal?: AbortSignal) => {
    setLatest(old => ({ ...old, [id]: undefined })); setVersionErrors(old => ({ ...old, [id]: "" }));
    try { const result = await quantityCommand<{ latest: ModelVersion }>(project, { action: "latest", configurationId: id }, signal); setLatest(old => ({ ...old, [id]: result.latest })); }
    catch (e) { if (!signal?.aborted) setVersionErrors(old => ({ ...old, [id]: (e as Error).message })); }
  }, [project]);
  async function openSpecialty(code:string,configure:boolean){
    const active=context.configuration?.disciplines.find(d=>d.code===code&&d.enabled);if(active){context.selectDiscipline(active.id);return;}setBusy(true);setError('');try{let c=workspace?.configurations.find(c=>c.specialtyCode===code);if(!c){c=await quantityCommand<QuantityConfiguration>(project,{action:'add',specialtyCode:code});setWorkspace(await quantityResponse<Workspace>(`/api/quantities?scope=${encodeURIComponent(JSON.stringify(project))}`));}setOpenConfiguration(configure||!c.source?.view);setSelected(c.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function visibility(code:string,enabled:boolean,hidden:boolean){
    setBusy(true);setError('');try{let c=workspace?.configurations.find(c=>c.specialtyCode===code);if(!c)c=await quantityCommand<QuantityConfiguration>(project,{action:'add',specialtyCode:code});await quantityCommand(project,{action:'visibility',id:c.id,revision:c.revision,enabled,hidden});setWorkspace(await quantityResponse<Workspace>(`/api/quantities?scope=${encodeURIComponent(JSON.stringify(project))}`));}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function prepareMEP(){
    setBusy(true);setError('');
    try{setWorkspace(await quantityCommand<Workspace>(project,{action:'prepare-mep-specialties',sourceConfigurationId:mepSource||null}));setMepSetup(false);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const configuration = workspace?.configurations.find(c => c.id === selected);
  return <QuantityFilterSlotContext.Provider value={filterSlot}><div className={`quantity-project-stage${configuration ? " has-desk" : ""}${configuration&&isMEPTemplate(configuration.specialtyCode)?" has-mep-desk":""}`}>
    <div className="quantity-section-title"><div>{configuration ? <button className="quantity-text-button" onClick={() => setSelected(null)}><ArrowLeft size={15}/>Volver a especialidades</button> : <h2>Configuración de Cubicaciones</h2>}<p>{configuration ? `${specialtyName(configuration.specialtyCode)} · Tablero` : name}</p></div>{configuration&&isMEPTemplate(configuration.specialtyCode)&&<div className="quantity-filter-slot" ref={setFilterSlot}/>}<div className="quantity-inline-actions"><button className="quantity-secondary" disabled={busy} onClick={() => { setSelected(null); setLatest({}); setRetry(n => n + 1); }}><RefreshCw size={15}/>Recargar configuración</button>{!configuration && <button className="quantity-secondary" disabled={!workspace || busy} onClick={() => setManagement(true)}><Settings2 size={16}/>Gestionar especialidades</button>}</div></div>
    {error && <p className="quantity-error" role="alert">{error}</p>}{busy && <p role="status">Cargando configuración…</p>}
    <Dialog open={management} onOpenChange={setManagement}><DialogContent className="quantity-page quantity-modal"><DialogTitle>Especialidades del proyecto</DialogTitle><DialogDescription>Catálogo predefinido. Activar, desactivar u ocultar conserva las fuentes, reglas y resultados guardados.</DialogDescription><p className="quantity-help">Se aplica el mismo acceso de edición del proyecto que en las configuraciones existentes.</p><div className="specialty-management">{quantitySpecialties.map(s=>{const c=workspace?.configurations.find(c=>c.specialtyCode===s.code);return <div key={s.code}><strong>{s.name}</strong><label><input type="checkbox" checked={c?.enabled!==false} disabled={busy} onChange={e=>void visibility(s.code,e.target.checked,c?.hidden===true)}/>Activa</label><label><input type="checkbox" checked={c?.hidden===true} disabled={busy} onChange={e=>void visibility(s.code,c?.enabled!==false,e.target.checked)}/>Oculta</label></div>;})}</div><details><summary>Preparación de varias plantillas MEP</summary><p>Conserva la herramienta existente para compartir una fuente inicial verificada.</p><button className="quantity-secondary" disabled={busy} onClick={()=>{setManagement(false);setMepSetup(true);}}>Preparar plantillas MEP</button></details></DialogContent></Dialog>
    <Dialog open={mepSetup} onOpenChange={setMepSetup}><DialogContent className="quantity-page quantity-modal"><DialogTitle>Plantillas por especialidad MEP</DialogTitle><DialogDescription>Crear las especialidades MEP faltantes. Las configuraciones existentes se conservan.</DialogDescription><p>Agua fría, agua caliente, alcantarillado, electricidad, ventilación, gas, incendio, HVAC, telecomunicaciones y las tres especialidades exteriores.</p><label>Fuente inicial<select aria-label="Fuente inicial para plantillas MEP" value={mepSource} disabled={busy} onChange={e=>setMepSource(e.target.value)}><option value="">Configurar el archivo y vista de cada especialidad después</option>{workspace?.configurations.filter(c=>isMEPTemplate(c.specialtyCode)&&c.source?.view).map(c=><option key={c.id} value={c.id}>{specialtyName(c.specialtyCode)} · {c.source!.fileName} · V{c.source!.version.number} · {c.source!.view!.name}</option>)}</select></label><p className="quantity-help">Si eliges una fuente, se verifica en Autodesk y se copian su vista y criterios confirmados sólo a las nuevas especialidades. Después puedes cambiar cada archivo y vista por separado. No se asignan elementos por el nombre de la plantilla.</p><button className="quantity-primary" disabled={busy} onClick={()=>void prepareMEP()}>{busy?'Creando plantillas…':'Crear plantillas MEP'}</button></DialogContent></Dialog>
    {configuration && workspace ? <QuantityDesk key={(configuration.specialtyCode==='structure'||isMEPTemplate(configuration.specialtyCode))?`${configuration.id}:v2`:`${configuration.id}:${configuration.revision}`} project={project} configuration={configuration} savedSuccessfully={savedRevision === `${configuration.id}:${configuration.revision}`} openConfiguration={openConfiguration} projectName={name} templates={workspace.templates.filter(t => t.specialtyCode === configuration.specialtyCode)} runs={workspace.runs.filter(r => r.specialtyCode === configuration.specialtyCode)} historyPartial={workspace.historyPartial} latest={latest[configuration.id]} versionError={versionErrors[configuration.id]} checkVersion={checkVersion} onSave={value => { setSavedRevision(`${value.id}:${value.revision}`); setWorkspace(old => old && { ...old, configurations: old.configurations.map(c => c.id === value.id ? value : c) }); }} onTemplate={value => setWorkspace(old => old && { ...old, templates: [value, ...old.templates] })}/> : workspace && <>
      <div className="specialty-catalog-heading"><p>Elige una especialidad para configurar su fuente o abrir su tablero.</p><label><input type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)}/>Mostrar ocultas</label></div>
      <div className="quantity-cards specialty-catalog">{quantitySpecialties.filter(s=>(!context.configuration||context.configuration.disciplines.some(d=>d.code===s.code&&d.enabled))&&(showHidden||!workspace.configurations.find(c=>c.specialtyCode===s.code)?.hidden)).map(s=>{
        const c=workspace.configurations.find(c=>c.specialtyCode===s.code),run=workspace.runs.find(r=>r.specialtyCode===s.code);
        const receipt=c?context.session.get<ProcessReceipt|null>(projectSessionKey(context.owner,context.hubId,context.projectId,`quantity.receipt:${c.id}`),()=>null):null;
        const state=specialtyState(c,run,receipt,c?versionErrors[c.id]:undefined);
        return <article className="quantity-panel specialty-card" key={s.code}><div className="specialty-card-title"><Boxes size={20}/><h3>{s.name}</h3>{c?.hidden&&<small>Oculta</small>}</div><span className={`specialty-state is-${state.code}`}><i aria-hidden="true">{state.symbol}</i>{state.label}</span><div className="quantity-inline-actions"><button className="quantity-primary" disabled={busy||c?.enabled===false} onClick={()=>void openSpecialty(s.code,false)}>{c?.source?.view?'Abrir tablero':'Configurar'}</button>{c?.source?.view&&<button className="quantity-text-button" disabled={busy||c?.enabled===false} onClick={()=>void openSpecialty(s.code,true)}>Configuración</button>}</div></article>;
      })}</div>
    </>}
  </div></QuantityFilterSlotContext.Provider>;
}

function QuantityDesk(props:Parameters<typeof LegacyQuantityDesk>[0]) {
 return (props.configuration.specialtyCode==='structure'||isMEPTemplate(props.configuration.specialtyCode))?<QuantityModelDesk project={props.project} projectName={props.projectName} configuration={props.configuration} openConfiguration={props.openConfiguration} onSave={props.onSave}/>:<LegacyQuantityDesk {...props}/>;
}
function LegacyQuantityDesk({ project, configuration, templates, runs, historyPartial, latest, versionError, checkVersion, onSave, onTemplate, openConfiguration, projectName, savedSuccessfully }: {
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
  const sourceKey=JSON.stringify([source?.scope.itemId,source?.version.id,source?.view?.id]);
  const [calculation,setCalculation]=useState<{key:string;data:LiveCalculation}|null>(null);
  const [request,setRequest]=useState<{key:string;id:number}|null>(null);
  const [calculationState,setCalculationState]=useState<{key:string;busy:boolean;message:string}|null>(null);
  const [evidenceOpen,setEvidenceOpen]=useState(false);
  const [inventory,setInventory]=useState<{key:string;data:ClassificationInventory}|null>(null);
  const receiveInventory=useCallback((data:ClassificationInventory)=>setInventory({key:sourceKey,data}),[sourceKey]);
  const live=calculation?.key===sourceKey?calculation.data:null;
  const livePresentation=useMemo(()=>live?presentLiveCalculation(live,filters):null,[live,filters]);
  const calculating=calculationState?.key===sourceKey&&calculationState.busy;
  const receiveCalculation=useCallback((event:CalculationEvent)=>{
    if(event.state==='complete'){
      const data=liveCalculationSchema.parse(event.data);
      setCalculation({key:sourceKey,data});setCalculationState({key:sourceKey,busy:false,message:`${data.records.filter(r=>r.quantity!==null).length} de ${data.records.length} cantidades leídas. ${data.unclassified} elementos sin clasificación. Consulta cobertura y fuentes.`});
    }else {setCalculationState({key:sourceKey,busy:event.state==='loading',message:event.message});if(event.state==='error')setCalculation(null);}
  },[sourceKey]);
  function calculate(){if(!source?.view)return;setCalculation(null);setCalculationState({key:sourceKey,busy:true,message:'Preparando lectura de la vista publicada…'});setRequest(old=>({key:sourceKey,id:(old?.id??0)+1}));setSettings(false);}
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
      setFilters({specialty:"",subspecialty:"",floor:""}); setSelectedIds([]); setViews(available.views); setSource({ ...source, version: latest, view: available.views.find(v => v.id === source.view?.id) ?? null });
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
      setViews(data.views);setSource({...source,version:result.latest,view:data.views.find(v=>v.id===source.view?.id)??null});setSelectedIds([]);setFilters({specialty:"",subspecialty:"",floor:""});
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const activeRun=matchingRun(runs,source,templateId);
  const projected=useMemo(()=>projectQuantityRows(activeRun),[activeRun]);
  const filtered=useMemo(()=>filterQuantityRows(projected.rows,filters),[projected.rows,filters]);
  const totals=livePresentation?.totals??quantityTotals(filtered,projected.unavailable);
  const priorProjection=comparison&&comparison.current.id===activeRun?.id?projectQuantityRows(comparison.previous):null;
  const previousTotals=priorProjection?quantityTotals(filterQuantityRows(priorProjection.rows,filters),priorProjection.unavailable):undefined;
  const facets=useMemo(()=>classificationFacets(inventory?.key===sourceKey?inventory.data:[],filters),[inventory,sourceKey,filters]);
  const filterIds=useMemo(()=>!live&&projected.rows.length?[...new Set(filtered.flatMap(r=>r.elementIds))]:null,[projected.rows,filtered,live]);
  const availableViews=views.some(v=>v.id===source?.view?.id)?views:source?.view?[source.view,...views]:views;
  return <div className="quantity-desk-stage">
    <QuantityTopbar source={source} views={availableViews} busy={busy} status={changed?"READY":status.state} versionLabel={changed?"Cambios sin guardar":live?"Sumas de vista calculadas":stateLabels[status.state]} onView={id=>{setSource(source?{...source,view:availableViews.find(v=>v.id===id)??null}:null);setSelectedIds([]);}} onLoadViews={()=>void loadViews()} onUpdate={()=>void updateVersion()} onHistory={()=>setHistoryTab("history")} onCompare={()=>setHistoryTab("compare")} onSettings={()=>setSettings(true)}/>
    {savedSuccessfully&&!changed&&<p className="quantity-save-notice" role="status">Configuración guardada en el proyecto. El guardado no ejecuta la cubicación.</p>}
    {error&&!settings&&<p className="quantity-error" role="alert">{error}</p>}
    <div className="quantity-desk-board">
      <section className="quantity-model quantity-panel" aria-label="Modelo BIM"><div className="quantity-panel-heading"><Box size={20}/><div><h2>Modelo BIM</h2><p>Explora la vista publicada y los elementos de tu modelo.</p></div><button className="quantity-secondary" onClick={()=>setSettings(true)}><Settings2 size={16}/>Configurar archivo y vista</button></div>
        <div className="quantity-model-context" title={source?.path}><strong>{source?.fileName??"Archivo RVT no seleccionado"}</strong><span>{source?.view?.name??"Vista no seleccionada"} · {source?"V"+source.version.number:"Versión no disponible"}</span></div>
        <QuantityViewer project={project} source={source} highlightedElementIds={selectedIds} filteredElementIds={filterIds} onSelectElements={setSelectedIds} classificationFilter={configuration.specialtyCode === "structure" ? filters : undefined} calculationRequest={request?.key===sourceKey?request.id:0} onCalculation={receiveCalculation} onInventory={receiveInventory}/>
        <div className="quantity-model-bottom"><span>{live?"Sumas de vista · V"+source?.version.number:activeRun?"Ejecución: V"+activeRun.source.version.number:"Cubicación no procesada"}</span><span>{latest?"Última publicación: V"+latest.number:"Publicación por verificar"}</span><button className="quantity-text-button" disabled={!configuration.source||busy} onClick={()=>void checkVersion(configuration.id)}><RefreshCw size={12}/>Verificar versión</button></div>
      </section>
      <div className="quantity-data-column"><QuantityFilters value={filters} floors={facets.floors} specialties={facets.specialties} subspecialties={facets.subspecialties} onChange={v=>{setFilters(v);setSelectedIds([]);}}/><QuantitySummaryCards totals={totals} previousTotals={previousTotals} blocker={blocker} specialty={filters.specialty} onRequirements={()=>setSettings(true)} onProcess={configuration.specialtyCode==="structure"?calculate:undefined} processDisabled={!source?.view||Boolean(calculating)} calculating={Boolean(calculating)}/>
      {calculationState?.key===sourceKey&&<div className="quantity-live-notice"><span role="status">{calculationState.message}</span>{live&&<button className="quantity-text-button" onClick={()=>setEvidenceOpen(true)}>Ver cobertura y fuentes · Sin historial</button>}</div>}<QuantityTable specialty={filters.specialty} rows={livePresentation?.rows??filtered} totals={totals} hasRun={Boolean(live||activeRun)} unavailable={live?0:projected.unavailable} onSelect={setSelectedIds} selectedIds={selectedIds}/></div>
    </div>
    <footer className="quantity-workspace-footer"><ShieldCheck size={13}/><span>{live?"Sumas de elementos clasificados en la vista publicada. No guardadas en el historial.":projected.rows.length?"Cantidades vinculadas a la versión y vista seleccionadas.":"Clasificación por parámetros del modelo · Cantidades pendientes de reglas de cálculo."}</span><span>{changed?"Cambios sin guardar":latest?"Verificado: "+new Date(latest.fetchedAt).toLocaleString("es-CL"):"Fuente pendiente de verificación"}</span></footer>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="quantity-page quantity-modal"><DialogTitle>Configurar fuente BIM</DialogTitle><DialogDescription>{specialtyName(configuration.specialtyCode)} · {projectName}. Selecciona el archivo RVT, su versión y su vista publicada.</DialogDescription><section className="quantity-settings quantity-panel" aria-label="Configuración de la fuente BIM"><div className="quantity-panel-heading"><Boxes size={18}/><h2>Configuración</h2></div><div className="quantity-panel-body">
        <span className="quantity-field-label">Especialidad</span><h3>{specialtyName(configuration.specialtyCode)}</h3>
        <label htmlFor="quantity-template">Plantilla y versión</label><select id="quantity-template" value={templateId} disabled={busy} onChange={e => setTemplateId(e.target.value)}><option value="">Sin plantilla</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name} · v{t.version}{t.configuration ? "" : t.baseDefinition ? " · Base definida" : " · Sin reglas"}</option>)}</select>
        {template?.baseDefinition && <div className="quantity-template-definition"><strong>Plantilla base de Cálculo</strong><p>{template.baseDefinition.metrics.map(metric => `${metric.name} (${metric.unit})`).join(" · ")}</p><p>Agrupación: {template.baseDefinition.groupings.join(" · ")}</p><small>Seleccionada automáticamente para esta especialidad. Volumen de Hormigón (m³) y Longitud de Acero Galvanizado (ml) se suman desde propiedades publicadas. Moldaje y Fe siguen pendientes de reglas.</small></div>}
        {!templateId && templates.length > 1 && <p className="quantity-help">Hay varias plantillas de Cálculo disponibles. Selecciona la que corresponde a este proyecto.</p>}
        <button className="quantity-text-button" disabled={busy} onClick={() => { setCreateTemplate(v => !v); setTemplateName(template?.name ?? ""); }}><Plus size={13}/>Crear plantilla / versión</button>
        {createTemplate && <div className="quantity-template-form"><label htmlFor="quantity-template-name">Nombre de la plantilla</label><input id="quantity-template-name" value={templateName} maxLength={200} onChange={e => setTemplateName(e.target.value)} placeholder="Nombre definido por tu equipo"/><p className="quantity-help">Se crea sin reglas. Los parámetros y fórmulas se definirán antes de habilitar el cálculo.</p><div className="quantity-inline-actions"><button className="quantity-secondary" disabled={busy || !templateName.trim()} onClick={() => void addTemplate(false)}>Nueva plantilla</button>{template && <button className="quantity-secondary" disabled={busy || !templateName.trim()} onClick={() => void addTemplate(true)}>Nueva versión</button>}</div></div>}
        <QuantitySourcePicker key={`${source?.scope.itemId ?? "empty"}:${source?.version.id ?? "empty"}`} project={project} source={source} onChange={value=>{setSource(value);setViews(value?.view?[value.view]:[]);setSelectedIds([]);}} disabled={busy}/>
        <p className="quantity-help">{changed ? "Hay cambios pendientes de guardar." : "Sin cambios pendientes. Puedes guardar para volver a verificar la fuente seleccionada."}</p>
        {error&&<p className="quantity-error" role="alert">{error}</p>}
        {savedSuccessfully&&!changed&&<p className="quantity-save-notice" role="status">Configuración guardada en el proyecto.</p>}
        <button className="quantity-primary quantity-save" disabled={busy} onClick={() => void save()}><Save size={15}/>{saving ? "Guardando…" : "Guardar configuración"}</button>
        <div className="quantity-process"><button className="quantity-primary" disabled={configuration.specialtyCode!=="structure"||!source?.view||Boolean(calculating)||busy} onClick={calculate}>{calculating?"Procesando…":"Procesar Cubicación"}</button><p className="quantity-help">{configuration.specialtyCode==="structure"?"Suma Volumen (m³) de Hormigón y Longitud (ml) de Acero Galvanizado en esta vista. Valida unidades y muestra datos faltantes. Estas sumas no se guardan como ejecuciones históricas.":blocker}</p>{configuration.specialtyCode === "structure" && <div className="quantity-template-definition"><strong>Reglas de selección recibidas</strong><p>Hormigón: Especialidad = Hormigón, o Sub Especialidad = {classificationRule.concreteSubspecialties.join(", ")}.</p><p>Enfierradura: Especialidad = Enfierradura.</p><p>Metalcon / Metlcon y derivados: Cubierta → Acero Galvanizado.</p><p>Moldaje se muestra al seleccionar Hormigón.</p><details><summary>Ver asociaciones de subespecialidad · v{classificationRule.version}</summary>{subspecialtyCriteria.map(c=><p key={c.group}><strong>{c.group}:</strong> {c.aliases.join(" · ")}</p>)}<p>Se admiten mayúsculas, acentos y separadores. Se conserva el texto original; los nombres sin una asociación definida no se asignan por parecido.</p></details><p>Cubierta: tipos 40CA085, Viga Perfil y Metalcon → Acero Galvanizado; PL OSB / Placa OSB → Placas de techumbre. Estas reglas por tipo tienen prioridad.</p><strong>Pendiente</strong><p>Moldaje, peso de Fe y guardado de ejecuciones históricas. Si existen varios parámetros Nivel con valores distintos, se indica Piso no verificado.</p></div>}{runs[0] && <p className="quantity-help">Último procesamiento: {new Date(runs[0].completedAt).toLocaleString("es-CL")}</p>}</div>
      </div></section>{versionError&&<p className="quantity-error">{versionError}</p>}{source&&latest&&latest.number>source.version.number&&<button className="quantity-secondary" disabled={busy} onClick={()=>void selectLatest()}>Usar última publicación: V{latest.number}</button>}</DialogContent></Dialog>
    <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}><DialogContent className="quantity-page quantity-modal quantity-history-modal"><DialogTitle>Cobertura y fuentes de las sumas</DialogTitle><DialogDescription>{source?.fileName} · V{source?.version.number} · {source?.view?.name}. Lectura de propiedades publicadas de esta vista.</DialogDescription>{live&&<QuantityLiveEvidence calculation={live} filters={filters}/>}</DialogContent></Dialog>
    <Dialog open={historyTab!==null} onOpenChange={open=>{if(!open)setHistoryTab(null);}}><DialogContent className="quantity-page quantity-modal quantity-history-modal"><DialogTitle>{historyTab==="compare"?"Comparación de ejecuciones":"Versiones procesadas"}</DialogTitle><DialogDescription>Consulta ejecuciones reales sin modificar la configuración ni sobrescribir resultados.</DialogDescription>{historyTab&&<QuantityResults key={historyTab} project={project} runs={runs} partial={historyPartial} initialTab={historyTab} onComparison={setComparison}/>}</DialogContent></Dialog>
  </div>;
}
