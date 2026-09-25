"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Box, House, ChevronRight, PanelLeft, X, ShieldCheck } from "lucide-react";
import { modules } from "@/lib/modules";
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { HeaderStatusContext } from "./workspace-header";

function WorkspaceContent({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const { setOpenMobile, toggleSidebar, openMobile, open, isMobile } = useSidebar();
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  const current = modules.find((module) => `/${module.slug}` === pathname);
  const isAssistant = pathname === "/asistente";
  const [headerStatus, setHeaderStatus] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      setOpenMobile(false);
      mainRef.current?.focus();
      previousPath.current = pathname;
    }
  }, [pathname, setOpenMobile]);
  function navigation(items: readonly typeof modules[number][]) {
    return <SidebarMenu>{items.map((module) => <SidebarMenuItem key={module.slug}><SidebarMenuButton asChild isActive={pathname === `/${module.slug}`} className="nav-link"><Link href={`/${module.slug}`} aria-current={pathname === `/${module.slug}` ? "page" : undefined} onClick={() => setOpenMobile(false)}><module.icon aria-hidden="true"/><span>{module.name}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>;
  }
  if (pathname === "/cubicaciones") return <div className="quantity-shell"><a className="skip-link" href="#main-content">Saltar al contenido</a><main id="main-content" ref={mainRef} tabIndex={-1}>{children}</main></div>;
  return <>
    <a className="skip-link" href="#main-content">Saltar al contenido</a>
    <Sidebar className="workspace-sidebar">
      <SidebarHeader className="brand-header"><Link href="/" className="brand" aria-label="BIM + IA — Inicio" onClick={() => setOpenMobile(false)}><span className="brand-symbol"><Box size={25} strokeWidth={1.5}/></span><span><strong>BIM<span className="brand-plus"> + </span>IA</strong><small>PLATAFORMA DE PROYECTOS</small></span></Link><Button variant="ghost" size="icon" className="mobile-close" aria-label="Cerrar navegación" onClick={() => setOpenMobile(false)}><X/></Button></SidebarHeader>
      <SidebarContent><nav aria-label="Navegación principal"><SidebarGroup><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === "/"} className="nav-link"><Link href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={() => setOpenMobile(false)}><House/><span>Inicio</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>
      <SidebarGroup><SidebarGroupLabel className="nav-label">MÓDULOS TÉCNICOS</SidebarGroupLabel>{navigation(modules.slice(0,7))}</SidebarGroup>
      <SidebarGroup><SidebarGroupLabel className="nav-label">GESTIÓN</SidebarGroupLabel>{navigation(modules.slice(7))}</SidebarGroup></nav></SidebarContent>
      <SidebarFooter className="sidebar-footer"><div className="principle"><ShieldCheck size={18}/><div><strong>Información con evidencia</strong><p>Cada resultado, una fuente.</p></div></div><div className="sidebar-version"><span>Etapa 0.1</span><span>En desarrollo</span></div></SidebarFooter>
    </Sidebar>
    <div className="workspace-main"><header className={`topbar${isAssistant ? " assistant-topbar" : ""}`}><div className="breadcrumbs"><Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Alternar navegación" aria-expanded={isMobile ? openMobile : open}><PanelLeft size={18}/></Button><span className="breadcrumb-divider"/><Link href="/">Plataforma</Link><ChevronRight size={14}/><span>{pathname === "/" ? "Inicio" : current?.name ?? "Página no encontrada"}</span></div>{isAssistant && <><div className="assistant-header-title"><p className="eyebrow">FORMA + INTELIGENCIA ARTIFICIAL</p><h1 id="assistant-title">Asistente IA</h1><p className="page-description">Explora tu información. Elige el alcance. Consulta con evidencia.</p></div><div className="assistant-header-status" ref={setHeaderStatus}/></>}<span className="environment-label">ENTORNO DE DESARROLLO</span></header><main id="main-content" ref={mainRef} tabIndex={-1} aria-labelledby={isAssistant ? "assistant-title" : undefined}><HeaderStatusContext.Provider value={headerStatus}>{children}</HeaderStatusContext.Provider></main></div>
  </>;
}

export function WorkspaceShell({children}: {children: React.ReactNode}) {
  return <SidebarProvider style={{"--sidebar-width": "17rem"} as React.CSSProperties}><WorkspaceContent>{children}</WorkspaceContent></SidebarProvider>;
}
