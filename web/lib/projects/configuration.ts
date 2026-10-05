import {scopeSchema} from '../autodesk/data.ts';
import {z} from 'zod';
import {sourceSchema,type QuantitySource} from '../quantities/contracts.ts';
import {quantitySpecialties} from '../quantities/catalog.ts';

// MEP remains an engine family for existing records, never a selectable discipline.
export const disciplineCatalog=[...quantitySpecialties.filter(s=>s.code!=='mep').map(s=>({...s,name:s.code==='structure'?'Estructura':s.name})),{code:'stormwater',name:'Aguas Lluvias'},{code:'landscape',name:'Paisajismo'},{code:'coordination',name:'Coordinación'}];
export function availableDisciplines(rows:Pick<ProjectDiscipline,'code'>[]){return disciplineCatalog.filter(d=>!rows.some(r=>r.code===d.code));}
export function selectableDiscipline(code:string,rows:Pick<ProjectDiscipline,'code'>[]){const options=availableDisciplines(rows);return code==='custom'||options.some(d=>d.code===code)?code:options[0]?.code??'custom';}
export function sourceInProject(source:QuantitySource|null|undefined,scope:{hubId:string;projectId:string}){return !!source&&source.scope.hubId===scope.hubId&&source.scope.projectId===scope.projectId;}
export const disciplineSchema=z.object({id:z.string().uuid(),code:z.string().min(1).max(80),name:z.string().trim().min(1).max(150),enabled:z.boolean(),source:sourceSchema.nullable(),lastValidatedAt:z.string().datetime({offset:true}).nullable()}).strict();
export const documentReferenceSchema=z.object({scope:scopeSchema.refine(s=>s.kind==='folder'||s.kind==='file','Selecciona carpeta o archivo'),label:z.string().min(1).max(4000)}).strict();
export const configurationSchema=z.object({companyId:z.string().min(1),projectId:z.string().min(1),projectName:z.string().min(1).max(2000),revision:z.number().int().nonnegative(),configuredAt:z.string().datetime({offset:true}),updatedAt:z.string().datetime({offset:true}),updatedBy:z.string(),documents:z.array(documentReferenceSchema).max(100).default([]),disciplines:z.array(disciplineSchema).max(40)}).strict();
export const configurationInput=z.object({revision:z.number().int().nonnegative(),projectName:z.string().min(1).max(2000),documents:z.array(documentReferenceSchema).max(100).default([]),disciplines:z.array(disciplineSchema).max(40)}).strict().superRefine((c,ctx)=>{if(new Set(c.disciplines.map(d=>d.id)).size!==c.disciplines.length||new Set(c.disciplines.map(d=>d.code)).size!==c.disciplines.length)ctx.addIssue({code:'custom',message:'Especialidades duplicadas'});});
export type ProjectConfiguration=z.infer<typeof configurationSchema>;
export type ProjectDiscipline=z.infer<typeof disciplineSchema>;
export const sourceIdentity=(s:QuantitySource|null|undefined)=>s?JSON.stringify([s.scope.hubId,s.scope.projectId,s.scope.itemId,s.version.id,s.view?.id]):'';
export function activeDiscipline(c:ProjectConfiguration|null,id:string){const rows=c?.disciplines.filter(d=>d.enabled)??[];return rows.find(d=>d.id===id)??(rows.length===1?rows[0]:null);}
export function auditDiscipline(code:string):'ESTRUCTURA'|'ARQUITECTURA'|'MEP'|null{return code==='structure'?'ESTRUCTURA':code==='architecture'?'ARQUITECTURA':['mep','gas','fire-protection','sewer','cold-water','hot-water','ventilation','electricity','hvac','telecommunications','external-water','external-sewer','external-electricity','water','stormwater'].includes(code)?'MEP':null;}
export const regulatoryDisciplines:Record<string,string[]>= {'SAN-01':['sewer'],'SAN-02':['external-sewer'],'SAN-03':['cold-water','water'],'SAN-04':['external-water'],'SAN-05':['hot-water']};
export function assertConfigurationScope(c:ProjectConfiguration){for(const d of c.documents??[])if(d.scope.hubId!==c.companyId||d.scope.projectId!==c.projectId)throw Error('out_of_scope');for(const d of c.disciplines)if(d.source&&(d.source.scope.hubId!==c.companyId||d.source.scope.projectId!==c.projectId))throw Error('out_of_scope');return c;}

// A missing source or an old check is never evidence of a verified version.
export function sourceCheckMatches(source:QuantitySource|null|undefined,checkedSource:QuantitySource|null|undefined){
 return Boolean(source&&checkedSource&&sourceIdentity(source)===sourceIdentity(checkedSource));
}
