import { AuditProvider } from '@/components/audit/audit-context';
import './audit.css';
export const metadata={title:'AUDITORÍA | BIM + IA'};
export default function AuditLayout({children}:{children:React.ReactNode}){return <AuditProvider>{children}</AuditProvider>;}
