import {z} from 'zod';

export const moduleIdSchema=z.enum(['audit','quantities','coordination','assistant','documents']);
export type ProjectModuleId=z.infer<typeof moduleIdSchema>;
export const projectModules=[
 {id:'audit',name:'Auditoría BIM',href:'/auditoria-bim'},
 {id:'quantities',name:'Cubicaciones',href:'/cubicaciones'},
 {id:'coordination',name:'Coordinación Normativa',href:'/coordinacion-normativa'},
 {id:'documents',name:'Control Documental',href:'/control-documental'},
 {id:'assistant',name:'Asistente IA',href:'/consultar-ia'},
] as const;
export function moduleForPath(path:string):ProjectModuleId|null{
 if(path.startsWith('/configuracion/')){const result=moduleIdSchema.safeParse(path.split('/')[2]);return result.success?result.data:null;}
 if(path.startsWith('/auditoria-bim'))return 'audit';
 if(path.startsWith('/control-documental'))return 'documents';
 if(path.startsWith('/cubicaciones'))return 'quantities';
 if(path.startsWith('/coordinacion-normativa'))return 'coordination';
 if(['/asistente','/chat-bim','/consultar-ia'].some(p=>path.startsWith(p)))return 'assistant';
 return null;
}
