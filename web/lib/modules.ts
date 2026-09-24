import { BrainCircuit, ScanSearch, Boxes, ShieldCheck, FileCheck2, FolderClosed, Flag, ChartNoAxesCombined, Settings2 } from "lucide-react";

// Planned capabilities from the supplied roadmap, not live results.
export const modules = [
  { slug: "asistente", name: "Asistente IA", phase: "Fase 1", period: "Octubre 2026", icon: BrainCircuit, description: "Consultas del proyecto basadas en información verificable." },
  { slug: "auditoria-bim", name: "Auditoría BIM", phase: "Fase 2", period: "Noviembre 2026", icon: ScanSearch, description: "Calidad del modelo, parámetros y detección de inconsistencias." },
  { slug: "cubicaciones", name: "Cubicaciones", phase: "Fase 3", period: "Diciembre 2026", icon: Boxes, description: "Cantidades y volúmenes del modelo, organizados por partidas." },
  { slug: "coordinacion-normativa", name: "Coordinación Normativa", phase: "Fase 4", period: "Enero 2027", icon: ShieldCheck, description: "Revisión de cumplimiento mediante reglas de fuentes controladas." },
  { slug: "revision-laminas", name: "Revisión de Láminas", phase: "Fase 5", period: "Febrero 2027", icon: FileCheck2, description: "Revisión de planos, nomenclatura y contenido de láminas." },
  { slug: "control-documental", name: "Control Documental", phase: "Fase 5", period: "Febrero 2027", icon: FolderClosed, description: "Control de documentos, versiones y trazabilidad de información." },
  { slug: "incidencias", name: "Incidencias", phase: "Transversal · 1–5", period: "Fases 1 a 5", icon: Flag, description: "Gestión de hallazgos derivados de las revisiones técnicas." },
  { slug: "actividad-consumo", name: "Actividad y Consumo", phase: "Fase 6", period: "Marzo 2027", icon: ChartNoAxesCombined, description: "Actividad, uso y adopción de la plataforma en los proyectos." },
  { slug: "administracion", name: "Administración", phase: "Fase 7", period: "Abril 2027", icon: Settings2, description: "Administración de usuarios, empresas, proyectos y permisos." },
] as const;

export function getModule(slug: string) { return modules.find((module) => module.slug === slug); }
