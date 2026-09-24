import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getModule } from "@/lib/modules";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

type Props = {params: Promise<{module: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const definition = getModule((await params).module);
  return {title: definition ? `${definition.name} | BIM + IA` : "Página no encontrada | BIM + IA"};
}

export default async function ModulePage({params}: Props) {
  const definition = getModule((await params).module);
  if (!definition) notFound();
  const Icon = definition.icon;
  return <div className="page-content module-page"><div className="page-heading"><div><p className="eyebrow">{definition.phase} <span className="eyebrow-separator">/</span> {definition.period}</p><h1>{definition.name}</h1><p className="page-description">{definition.description}</p></div></div><Empty className="module-empty"><EmptyHeader><EmptyMedia className="empty-module-icon"><Icon size={36} strokeWidth={1.4}/></EmptyMedia><EmptyTitle className="empty-heading">Módulo aún no implementado</EmptyTitle><EmptyDescription className="empty-copy">Este espacio está reservado para el desarrollo de {definition.name}. Sus funciones todavía no están disponibles.</EmptyDescription></EmptyHeader></Empty></div>;
}
