'use client';
import Link from 'next/link';
import {projectModules} from '@/lib/projects/modules';
import {useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import {Settings2,ArrowRight,Building2,FolderOpen,Box,ScanSearch,Boxes,BrainCircuit,RefreshCw,FileText,ShieldCheck,MessageSquare} from 'lucide-react';
import {useProjectContext} from './project-context';
import {quantityResponse} from '@/lib/quantities/client';
import type {ProjectSummary,SummaryModule} from '@/lib/projects/summary';

const destinations:Record<SummaryModule,{name:string;href:string}>={audit:{name:'Auditoría BIM',href:'/auditoria-bim'},coordination:{name:'Auditoría normativa',href:'/coordinacion-normativa'},quantities:{name:'Cubicaciones',href:'/cubicaciones'}};
const formatDate=(date:string|null)=>date?new Date(date).toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'short'}):'Sin registros';
const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');

export function ProjectHome(){
  const p=useProjectContext(),router=useRouter();
  const [search,setSearch]=useState(''),[summary,setSummary]=useState<ProjectSummary|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0);
  const project=p.projects.find(e=>e.id===p.projectId),company=p.hubs.find(e=>e.id===p.hubId);
  useEffect(()=>{
    if(!p.owner||!p.hubId||!p.projectId)return;
    const abort=new AbortController();
    queueMicrotask(()=>{if(!abort.signal.aborted){setSummary(null);setError('');setLoading(true);}});
    void quantityResponse<ProjectSummary>(`/api/projects/summary?scope=${encodeURIComponent(JSON.stringify(p.project))}`,{signal:abort.signal})
      .then(result=>{if(!abort.signal.aborted&&result.scope.hubId===p.hubId&&result.scope.projectId===p.projectId)setSummary(result);})
      .catch(e=>{if(!abort.signal.aborted)setError(e.message);})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[p.owner,p.hubId,p.projectId,p.project,refresh]);
  const data=summary?.scope.hubId===p.hubId&&summary.scope.projectId===p.projectId?summary:null;
  const value=(module:SummaryModule)=>{const m=data?.modules.find(s=>s.module===module);return m?.state==='AVAILABLE'?m.runs?.toLocaleString('es-CL'):'No disponible';};
  const chooseAnother=()=>{p.setProject('');setSearch('');router.push('/');};
  const title=!p.projectId?'Mis proyectos':p.appProject?.name??project?.name??'Proyecto por verificar';
  return <div className="project-home">
    <nav className="project-steps" aria-label="Contexto del proyecto"><button onClick={()=>p.setHub('')} disabled={!p.hubId}>1 · Empresa</button><ArrowRight size={13}/><button onClick={chooseAnother} disabled={!p.projectId}>2 · Proyecto</button><ArrowRight size={13}/><span aria-current={p.projectId?'page':undefined}>3 · Inicio del proyecto</span></nav>
    <div className="project-home-heading"><div><p className="eyebrow">{company?.name??'AUTODESK · ESPACIO DE TRABAJO'}</p><h1>{title}</h1><p>{p.projectId?'Modelos, documentación y herramientas del proyecto, en un solo lugar.':'Primero selecciona el contexto. Trabajarás con la información a la que tu cuenta tiene acceso.'}</p></div>{p.projectId&&<button className="project-secondary" onClick={chooseAnother}><FolderOpen size={16}/>Cambiar proyecto</button>}</div>
    {p.connection==='checking'&&<p role="status">Verificando tu conexión con Autodesk…</p>}
    {p.connection==='unavailable'&&<div className="project-notice" role="alert">No fue posible verificar la conexión. <button onClick={p.refresh}>Reintentar</button></div>}
    {p.connection==='disconnected'&&<section className="project-entry"><Building2 size={30}/><h2>Conecta Autodesk para ver tus empresas y proyectos</h2><p>Usa el botón de conexión del encabezado. Los proyectos se consultan con tus permisos reales.</p></section>}
    {p.registryError&&<div className="project-notice" role="alert">No se pudo registrar el espacio del proyecto. {p.registryError} <button onClick={p.refresh}>Reintentar</button></div>}{p.error&&<div className="project-notice" role="alert">{p.error} <button onClick={p.refresh}>Reintentar listado</button></div>}
    {p.owner&&!p.hubId&&<section aria-label="Empresas disponibles" className="project-choice-grid">{p.hubs.map(h=><button className="project-choice" key={h.id} onClick={()=>p.setHub(h.id)}><Building2/><strong>{h.name}</strong><span>Cuenta Autodesk <ArrowRight size={15}/></span></button>)}{p.busy?<p role="status">Consultando empresas…</p>:!p.error&&!p.hubs.length&&<p>No se encontraron cuentas disponibles.</p>}</section>}
    {p.owner&&p.hubId&&!p.projectId&&<section aria-label="Proyectos disponibles"><div className="project-list-tools"><label>Buscar proyecto<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre del proyecto…"/></label><span>Proyectos cargados desde Autodesk{p.nextPage!==null?' · Hay más por cargar':''}</span></div><div className="project-choice-grid">{p.projects.filter(v=>normalize(v.name).includes(normalize(search))).map(v=><button className="project-choice" key={v.id} onClick={()=>{p.setProject(v.id);router.push('/');}}><FolderOpen/><strong>{v.name}</strong><span>Entrar al proyecto <ArrowRight size={15}/></span></button>)}</div>{p.busy?<p role="status">Consultando proyectos…</p>:!p.error&&!p.projects.some(v=>normalize(v.name).includes(normalize(search)))&&<p>No se encontraron coincidencias entre los proyectos cargados.</p>}{p.nextPage!==null&&<button className="project-secondary" disabled={p.busy} onClick={()=>void p.moreProjects()}>Cargar más proyectos</button>}</section>}
    {p.owner&&p.hubId&&p.projectId&&<>
      <section className="project-choice-grid" aria-label="Módulos del proyecto">{projectModules.map(m=>{const config=data?.moduleConfiguration?.find(c=>c.module===m.id),native=data?.modules.find(c=>c.module===m.id);const label=config?.state==='CONFIGURED'?'Configurado':config?.state==='INCOMPLETE'?'Configuración incompleta':config?.state==='NOT_AVAILABLE'?'Estado no disponible':native?.state==='AVAILABLE'&&native.configurations?'Configuración anterior disponible':m.id==='assistant'?'Disponible':config?'No configurado':'Consultando…';return <article className="project-choice" key={m.id}><strong>{m.name}</strong><span>{label}</span>{native&&<small>Último registro: {formatDate(native.latestAt)}</small>}<Link href={m.href}>Abrir módulo →</Link><Link href={'/configuracion/'+m.id}>Configuración</Link></article>;})}</section>
      <section className="project-actions" aria-label="Herramientas del proyecto">{[{href:'/configuracion',name:'Configurar',detail:'Configuración independiente por módulo',icon:Settings2},{href:'/auditoria-bim',name:'Auditar',detail:'BIM y evidencia',icon:ScanSearch},{href:'/cubicaciones',name:'Cubicar',detail:'Cantidades del modelo',icon:Boxes},{href:'/consultar-ia',name:'Consultar IA',detail:'Documentos, datos y modelo',icon:BrainCircuit}].map(a=><Link key={a.href} href={a.href}><a.icon size={23}/><div><strong>{a.name}</strong><span>{a.detail}</span></div><ArrowRight size={16}/></Link>)}</section>
      <section aria-labelledby="project-summary-title"><div className="project-section-heading"><h2 id="project-summary-title">Estado del proyecto</h2><button className="project-secondary" disabled={loading} onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={14}/>{loading?'Consultando…':'Actualizar resumen'}</button></div>
        {error&&<div className="project-notice" role="alert">{error} No se pudo leer el resumen; los módulos siguen disponibles.</div>}
        {data?.state==='PARTIAL'&&<p className="project-notice">Resumen parcial. Algunas fuentes no respondieron; sus valores no se sustituyen por cero.</p>}
        <div className="project-metrics" aria-busy={loading}>
          <Metric title="Modelos configurados" value={p.configuration?new Set(p.configuration.disciplines.filter(d=>d.enabled&&d.source).map(d=>d.source!.scope.itemId)).size.toLocaleString('es-CL'):loading?'Consultando…':data?.modelCount?.toLocaleString('es-CL')??'No disponible'} detail="Archivos distintos de especialidades activas"/>
          <Metric title="Auditorías BIM" value={loading?'Consultando…':value('audit')??'No disponible'} detail="Ejecuciones guardadas"/>
          <Metric title="Revisiones normativas" value={loading?'Consultando…':value('coordination')??'No disponible'} detail="Ejecuciones guardadas"/>
          <Metric title="Cubicaciones guardadas" value={loading?'Consultando…':value('quantities')??'No disponible'} detail="No incluye cálculos temporales del visor"/>
        </div>
        <p className="project-footnote">Último registro guardado: {data?formatDate(data.latestRecordAt):'No disponible'}{data?.state==='PARTIAL'?' · Entre las fuentes disponibles':''}. Esta fecha no confirma la última publicación de Autodesk.</p>
      </section>
      <div className="project-home-columns"><section className="project-sources" aria-labelledby="project-models-title"><div className="project-section-heading"><h2 id="project-models-title">Archivos y vistas configurados</h2><Box size={18}/></div><p className="project-footnote">Referencias guardadas en las herramientas. Verifica la publicación al abrir el modelo.</p>
        {loading?<p role="status">Consultando fuentes guardadas…</p>:!data?<p>Referencias no disponibles.</p>:data.models.length===0?<p>{data.state==='PARTIAL'?'No se recuperaron referencias de las fuentes disponibles.':'Todavía no hay modelos configurados en estas herramientas. Abre Configuración para elegir un archivo y su vista.'}</p>:data.models.map(model=><article className="project-source" key={model.itemId}><h3>{model.name}</h3>{model.references.map(ref=><div className="project-source-ref" key={`${ref.module}:${ref.versionId}:${ref.viewId}`}><div><strong>V{ref.version} · {ref.viewName??'Vista pendiente'}</strong><small title={ref.path}>{ref.path}</small></div><Link href={destinations[ref.module].href}>Abrir {destinations[ref.module].name}<ArrowRight size={13}/></Link></div>)}</article>)}
      </section><section className="project-resources"><h2>Trabajar en este proyecto</h2><Link href="/consultar-ia"><FileText size={19}/><span>Explorar documentación</span><ArrowRight size={14}/></Link><Link href="/coordinacion-normativa"><ShieldCheck size={19}/><span>Auditoría normativa</span><ArrowRight size={14}/></Link><Link href="/consultar-ia"><MessageSquare size={19}/><span>Conversar con el modelo</span><ArrowRight size={14}/></Link><p>El proyecto se conserva al cambiar de herramienta. Cada herramienta conserva su propia configuración de archivos, vistas y reglas.</p><details><summary>Fuente y alcance del resumen</summary><p>Autodesk determina las cuentas y proyectos accesibles. Los recuentos provienen de ejecuciones guardadas en esta plataforma. No representan un inventario de todos los archivos de la nube ni una certificación técnica.</p><p>Consulta: {data?formatDate(data.checkedAt):'No disponible'}</p><p>Etapa del proyecto: no definida. Roles de la plataforma: no configurados.</p></details></section></div>
    </>}
  </div>;
}
function Metric({title,value,detail}:{title:string;value:string;detail:string}){return <article><h3>{title}</h3><strong>{value}</strong><p>{detail}</p></article>;}
