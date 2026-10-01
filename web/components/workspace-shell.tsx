"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Box, House, ChevronRight, PanelLeft, X, ShieldCheck } from "lucide-react";
import { AutodeskConnection } from "./autodesk-connection";
import { QuantityHeaderContext } from "./quantity-header";
import { modules } from "@/lib/modules";
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { HeaderStatusContext } from "./workspace-header";
import { AuditSidebar } from './audit/audit-sidebar';
import { CoordinationSidebar } from './coordination/sidebar';
import { ProjectProvider, ProjectPicker, ModelContext, useProjectContext } from './project-context';
import { CoordinationProvider } from './coordination/context';
import { ProjectHome } from './project-home';

function WorkspaceContent({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const project = useProjectContext();
  const needsProject = !project.owner || !project.hubId || !project.projectId;
  const { setOpenMobile, toggleSidebar, openMobile, open, isMobile } = useSidebar();
  const headerRef=useRef<HTMLElement>(null);
  useEffect(()=>{const el=headerRef.current;if(!el)return;const observer=new ResizeObserver(()=>el.parentElement?.style.setProperty('--workspace-header',el.getBoundingClientRect().height+'px'));observer.observe(el);return()=>observer.disconnect();},[]);
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  const current = modules.find((module) => `/${module.slug}` === pathname || pathname.startsWith(`/${module.slug}/`));
  const isAssistant = pathname === "/asistente" && !needsProject;
  const [quantityHeader,setQuantityHeader]=useState<HTMLElement|null>(null);
  const [headerStatus, setHeaderStatus] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      setOpenMobile(false);
      mainRef.current?.focus();
      previousPath.current = pathname;
    }
  }, [pathname, setOpenMobile]);
  function navigation(items: readonly typeof modules[number][]) {
    return <SidebarMenu>{items.map((module) => <SidebarMenuItem key={module.slug}>{module.slug==='coordinacion-normativa'?<CoordinationSidebar/>:<><SidebarMenuButton asChild isActive={pathname === `/${module.slug}` || pathname.startsWith(`/${module.slug}/`)} className="nav-link" tooltip={module.name}><Link href={`/${module.slug}`} aria-current={pathname === `/${module.slug}` ? "page" : undefined} onClick={() => setOpenMobile(false)}><module.icon aria-hidden="true"/><span>{module.name}</span></Link></SidebarMenuButton>{module.slug==='auditoria-bim'&&pathname.startsWith('/auditoria-bim')&&<AuditSidebar/>}</>}</SidebarMenuItem>)}</SidebarMenu>;
  }
  return <>
    <a className="skip-link" href="#main-content">Saltar al contenido</a>
    <Sidebar className="workspace-sidebar" collapsible="icon">
      <SidebarHeader className="brand-header"><Link href="/" className="brand" aria-label="BIM + IA — Inicio" onClick={() => setOpenMobile(false)}><span className="brand-symbol"><Box size={25} strokeWidth={1.5}/></span><span><strong>BIM<span className="brand-plus"> + </span>IA</strong><small>PLATAFORMA DE PROYECTOS</small></span></Link><Button variant="ghost" size="icon" className="mobile-close" aria-label="Cerrar navegación" onClick={() => setOpenMobile(false)}><X/></Button></SidebarHeader>
      <SidebarContent><nav aria-label="Navegación principal"><SidebarGroup><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === "/"} className="nav-link" tooltip="Inicio"><Link href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={() => setOpenMobile(false)}><House/><span>Inicio</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>
      <SidebarGroup><SidebarGroupLabel className="nav-label">MÓDULOS TÉCNICOS</SidebarGroupLabel>{navigation(modules.slice(0,7))}</SidebarGroup>
      <SidebarGroup><SidebarGroupLabel className="nav-label">GESTIÓN</SidebarGroupLabel>{navigation(modules.slice(7))}</SidebarGroup></nav></SidebarContent>
      <SidebarFooter className="sidebar-footer"><div className="principle"><ShieldCheck size={18}/><div><strong>Información con evidencia</strong><p>Cada resultado, una fuente.</p></div></div><div className="sidebar-version"><span>Etapa 0.1</span><span>En desarrollo</span></div></SidebarFooter>
    </Sidebar>
    <div className="workspace-main"><header ref={headerRef} className={`topbar${isAssistant ? " assistant-topbar" : ""}`}><div className="breadcrumbs"><Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Alternar navegación" aria-expanded={isMobile ? openMobile : open}><PanelLeft size={18}/></Button><span className="breadcrumb-divider"/><Link href="/">Plataforma</Link><ChevronRight size={14}/><span>{pathname === "/" ? "Inicio" : current?.name ?? "Página no encontrada"}</span></div><ProjectPicker/>{pathname==="/cubicaciones"?<div className="quantity-header-slot" ref={setQuantityHeader}/>:!isAssistant&&pathname!=="/"&&!needsProject&&<ModelContext/>}{isAssistant && <><div className="assistant-header-title"><p className="eyebrow">FORMA + INTELIGENCIA ARTIFICIAL</p><h1 id="assistant-title">Asistente IA</h1><p className="page-description">Explora tu información. Elige el alcance. Consulta con evidencia.</p></div><div className="assistant-header-status" ref={setHeaderStatus}/></>}{!isAssistant&&<AutodeskConnection/>}</header><main id="main-content" ref={mainRef} tabIndex={-1} aria-labelledby={isAssistant ? "assistant-title" : undefined}><HeaderStatusContext.Provider value={headerStatus}><QuantityHeaderContext.Provider value={quantityHeader}>{pathname!=="/"&&needsProject?<ProjectHome/>:children}</QuantityHeaderContext.Provider></HeaderStatusContext.Provider></main></div>
  </>;
}

export function WorkspaceShell({children}: {children: React.ReactNode}) {
  return <SidebarProvider defaultOpen={false} style={{"--sidebar-width": "17rem"} as React.CSSProperties}><ProjectProvider><ProjectModules>{children}</ProjectModules></ProjectProvider></SidebarProvider>;
}

function ProjectModules({children}:{children:React.ReactNode}){const p=useProjectContext();return <CoordinationProvider key={`${p.owner}:${p.hubId}:${p.projectId}`}><WorkspaceContent>{children}</WorkspaceContent></CoordinationProvider>;}
