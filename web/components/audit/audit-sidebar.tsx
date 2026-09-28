'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { auditHref,auditNavigation } from '@/lib/audit/navigation';
export function AuditSidebar(){
 const path=usePathname();
 return <div className="audit-subnav" aria-label="Submenús de Auditoría">{auditNavigation.map(group=>group.label==='AUDITORÍA'?<Link key={group.label} href={auditHref('')} aria-current={path===auditHref('')?'page':undefined}>Resumen</Link>:<details key={`${group.label}:${group.items.some(([s])=>path===auditHref(s))}`} open={group.items.some(([s])=>path===auditHref(s))||group.label==='Configuración'}><summary>{group.label}</summary><div>{group.items.map(([slug,label])=><Link key={slug} href={auditHref(slug)} aria-current={path===auditHref(slug)?'page':undefined}>{label}</Link>)}</div></details>)}</div>;
}
