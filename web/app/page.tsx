import Link from "next/link";
import { ArrowUpRight, Layers3 } from "lucide-react";
import { AutodeskConnection } from "@/components/autodesk-connection";
import { modules } from "@/lib/modules";

export default function Home() {
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">PLATAFORMA AUTODESK + IA</p><h1>Espacio de trabajo</h1><p className="page-description">Un punto de partida para trabajar en cada módulo de tu plataforma.</p></div><span className="stage-label">Etapa 0.1 <span>Base navegable</span></span></div>
    <section className="workspace-banner" aria-label="Estado de la plataforma"><div className="banner-icon"><Layers3 size={27}/></div><div><h2>De modelos a mayores posibilidades.</h2><p>Selecciona un módulo para abrir su espacio de trabajo.</p></div><AutodeskConnection/></section>
    <section aria-labelledby="modules-title"><div className="section-heading"><div><h2 id="modules-title">Módulos de la plataforma</h2><p>Organizados según el roadmap de desarrollo.</p></div><span className="secondary-label">Oct 2026 — Abr 2027</span></div>
    <div className="module-grid">{modules.map((module) => <Link className={`module-card ${module.slug === "incidencias" ? "transversal-card" : ""}`} href={`/${module.slug}`} key={module.slug}><div className="card-top"><span className="module-icon"><module.icon size={23} strokeWidth={1.7}/></span><span className="phase-label">{module.phase}</span><ArrowUpRight className="card-arrow" size={19}/></div><h3>{module.name}</h3><p>{module.description}</p><div className="card-bottom"><span className="pending-mark"/>{module.slug === "asistente" ? "Explorador Forma + Asistente IA" : "Pendiente de implementación"}</div></Link>)}</div></section>
    <footer className="workspace-footer"><span>Precisión. Trazabilidad. Confiabilidad.</span><span>Autodesk Forma + IA · Datos según acceso del usuario</span></footer>
  </div>;
}
