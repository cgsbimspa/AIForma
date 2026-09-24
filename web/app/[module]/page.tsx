import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getModule } from "@/lib/modules";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

type Props = {params: Promise<{module: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const module = getModule((await params).module);
  return {title: module ? `${module.name} | BIM + IA` : "Página no encontrada | BIM + IA"};
}

export default async function ModulePage({params}: Props) {
  const module = getModule((await params).module);
  if (!module) notFound();
  const Icon = module.icon;
  return <div className="page-content module-page"><div className="page-heading"><div><p className="eyebrow">{module.phase} <span className="eyebrow-separator">/</span> {module.period}</p><h1>{module.name}</h1><p className="page-description">{module.description}</p></div></div><Empty className="module-empty"><EmptyHeader><EmptyMedia className="empty-module-icon"><Icon size={36} strokeWidth={1.4}/></EmptyMedia><EmptyTitle className="empty-heading">Módulo aún no implementado</EmptyTitle><EmptyDescription className="empty-copy">Este espacio está reservado para el desarrollo de {module.name}. Sus funciones todavía no están disponibles.</EmptyDescription></EmptyHeader></Empty></div>;
}
