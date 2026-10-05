"use client";
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {Box,House,ChevronRight,PanelLeft,X,ShieldCheck,Settings2,Boxes,Sparkles,MoreHorizontal,ArrowLeft,Users,FolderOpen} from 'lucide-react';
import {AutodeskConnection} from './autodesk-connection';
import {QuantityHeaderContext} from './quantity-header';
import {Sidebar,SidebarProvider,SidebarContent,SidebarHeader,SidebarFooter,SidebarGroup,SidebarMenu,SidebarMenuItem,SidebarMenuButton,useSidebar} from './ui/sidebar';
import {Button} from './ui/button';
import {HeaderStatusContext} from './workspace-header';
import {AuditSidebar} from './audit/audit-sidebar';
import {ProjectProvider,ProjectPicker,ModelContext,useProjectContext} from './project-context';
import {CoordinationProvider} from './coordination/context';
import {ProjectHome} from './project-home';
import {backDestination,navigationTitle} from '@/lib/projects/navigation';

function WorkspaceContent({children}:{children:React.ReactNode}){
 const pathname=usePathname(),router=useRouter(),p=useProjectContext(),needsProject=!p.owner||!p.hubId||!p.projectId;
 const {setOpenMobile,toggleSidebar,openMobile,open,isMobile}=useSidebar();
 const headerRef=useRef<HTMLElement>(null),mainRef=useRef<HTMLElement>(null),previousPath=useRef(pathname);
 const [quantityHeader,setQuantityHeader]=useState<HTMLElement|null>(null);
 useEffect(()=>{const el=headerRef.current;if(!el)return;const observer=new ResizeObserver(()=>el.parentElement?.style.setProperty('--workspace-header',el.getBoundingClientRect().height+'px'));observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(previousPath.current!==pathname){setOpenMobile(false);mainRef.current?.focus();previousPath.current=pathname;}},[pathname,setOpenMobile]);
 const changeProject=()=>{p.setProject('');router.push('/');setOpenMobile(false);};
 const name=p.appProject?.name??p.projects.find(x=>x.id===p.projectId)?.name??p.configuration?.projectName??'Proyecto por verificar';
 const auditActive=pathname.startsWith('/auditoria-bim')||pathname.startsWith('/coordinacion-normativa');
 const more=[['/incidencias','Incidencias'],['/revision-laminas','Planos'],['/control-documental','Control Documental'],['/actividad-consumo','Actividad']];
 function item(href:string,label:string,Icon:typeof House,active=pathname===href){return <SidebarMenuItem key={href}><SidebarMenuButton asChild isActive={active} className="nav-link" tooltip={label}><Link href={href} onClick={()=>setOpenMobile(false)} aria-current={active?'page':undefined}><Icon/><span>{label}</span></Link></SidebarMenuButton></SidebarMenuItem>;}
 return <><a className="skip-link" href="#main-content">Saltar al contenido</a><Sidebar className="workspace-sidebar" collapsible="icon">
 <SidebarHeader className="brand-header"><Link href="/" className="brand" aria-label="BIM + IA — Inicio"><span className="brand-symbol"><Box size={25}/></span><span><strong>BIM<span className="brand-plus"> + </span>IA</strong><small>PLATAFORMA DE PROYECTOS</small></span></Link><Button variant="ghost" size="icon" className="mobile-close" aria-label="Cerrar navegación" onClick={()=>setOpenMobile(false)}><X/></Button></SidebarHeader>
 <SidebarContent><div className="sidebar-project"><small>PROYECTO ACTIVO</small><strong title={name}>{needsProject?'Selecciona un proyecto':name}</strong><button onClick={changeProject}><FolderOpen size={14}/>Cambiar proyecto</button></div><nav aria-label="Navegación principal"><SidebarGroup><SidebarMenu>
 {item('/','Inicio',House)}{item('/configuracion','Configuración',Settings2,pathname.startsWith('/configuracion'))}
 <SidebarMenuItem><details className="nav-disclosure" key={`audit:${auditActive}`} open={auditActive}><summary title="Auditar" onClick={()=>{if(!open&&!isMobile)toggleSidebar();}}><ShieldCheck/><span>Auditar</span><ChevronRight className="nav-chevron"/></summary><div><Link href="/auditoria-bim" aria-current={pathname.startsWith('/auditoria-bim')?'page':undefined}>Auditoría BIM</Link><Link href="/coordinacion-normativa" aria-current={pathname.startsWith('/coordinacion-normativa')?'page':undefined}>Revisión Normativa</Link>{pathname.startsWith('/auditoria-bim')&&<details className="audit-navigation-details"><summary>Secciones de auditoría</summary><AuditSidebar/></details>}</div></details></SidebarMenuItem>
 {item('/cubicaciones','Cubicar',Boxes)}{item('/consultar-ia','Consultar IA',Sparkles,['/consultar-ia','/asistente','/chat-bim'].includes(pathname))}
 <SidebarMenuItem className="nav-secondary"><details className="nav-disclosure" key={`more:${pathname}`} open={more.some(([href])=>pathname===href)}><summary title="Más herramientas" onClick={()=>{if(!open&&!isMobile)toggleSidebar();}}><MoreHorizontal/><span>Más</span><ChevronRight className="nav-chevron"/></summary><div>{more.map(([href,label])=><Link key={href} href={href} aria-current={pathname===href?'page':undefined}>{label}</Link>)}</div></details></SidebarMenuItem>
 {item('/administracion','Administración',Users)}</SidebarMenu></SidebarGroup></nav></SidebarContent><SidebarFooter className="sidebar-footer"><div className="principle"><ShieldCheck size={16}/><small>Cada resultado, una fuente.</small></div></SidebarFooter></Sidebar>
 <div className="workspace-main"><header ref={headerRef} className="topbar project-topbar"><div className="breadcrumbs"><Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Alternar navegación" aria-expanded={isMobile?openMobile:open}><PanelLeft size={18}/></Button>{pathname!=='/'&&<Link className="project-back" href={backDestination(pathname)} aria-label="Volver al contexto anterior"><ArrowLeft size={16}/><span>Volver</span></Link>}<div className="header-project"><Link href="/" title={name}>{needsProject?'Plataforma':name}</Link><small>{navigationTitle(pathname)}</small></div></div>
 {needsProject?<ProjectPicker/>:p.moduleId&&p.moduleId!=='documents'?<div className="header-discipline"><label>Especialidad<select aria-label="Especialidad activa" value={p.selectedDiscipline?.id??''} onChange={e=>p.selectDiscipline(e.target.value)}><option value="">Seleccionar especialidad</option>{p.configuration?.disciplines.filter(d=>d.enabled).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><Link href={'/configuracion/'+p.moduleId}>Configurar módulo</Link></div>:null}
 {pathname==='/cubicaciones'?<div className="quantity-header-slot" ref={setQuantityHeader}/>:!needsProject&&p.moduleId&&p.moduleId!=='documents'&&<ModelContext/>}<AutodeskConnection/></header>
 <main id="main-content" ref={mainRef} tabIndex={-1}><HeaderStatusContext.Provider value={null}><QuantityHeaderContext.Provider value={quantityHeader}>{pathname!=='/'&&needsProject?<ProjectHome/>:children}</QuantityHeaderContext.Provider></HeaderStatusContext.Provider></main></div></>;
}
export function WorkspaceShell({children}:{children:React.ReactNode}){return <SidebarProvider defaultOpen={true} style={{'--sidebar-width':'15rem'} as React.CSSProperties}><ProjectProvider><ProjectModules>{children}</ProjectModules></ProjectProvider></SidebarProvider>;}
function ProjectModules({children}:{children:React.ReactNode}){const p=useProjectContext();return <CoordinationProvider key={`${p.owner}:${p.hubId}:${p.projectId}`}><WorkspaceContent key={`${p.owner}:${p.hubId}:${p.projectId}`}>{children}</WorkspaceContent></CoordinationProvider>;}
