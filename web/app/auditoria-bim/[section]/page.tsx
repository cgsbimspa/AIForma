import { notFound } from 'next/navigation';
import { AuditPage } from '@/components/audit/audit-page';
import { auditNavigation } from '@/lib/audit/navigation';
export default async function Page({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!auditNavigation.some(g=>g.items.some(([s])=>s===section)))notFound();return <AuditPage section={section}/>;}
