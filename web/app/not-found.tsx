import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <div className="page-content"><Empty className="module-empty"><EmptyHeader><EmptyMedia className="empty-module-icon"><FileQuestion size={36}/></EmptyMedia><EmptyTitle className="empty-heading"><h1>Página no encontrada</h1></EmptyTitle><EmptyDescription className="empty-copy">La dirección que abriste no corresponde a una página de la plataforma.</EmptyDescription></EmptyHeader><Button asChild><Link href="/"><ArrowLeft/>Volver al inicio</Link></Button></Empty></div>;
}
