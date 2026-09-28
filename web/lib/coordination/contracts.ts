import {z} from 'zod';
import {sourceSchema,type QuantitySource} from '../quantities/contracts.ts';
import {systems} from './catalog.ts';
import {ridaaRules,ridaaSource} from './ridaa.ts';
const text=z.string().trim().min(1).max(1000);
export const systemId=z.string().refine(id=>systems.some(s=>s.id===id));
export const states=['PASS','WARNING','FAIL','NOT EVALUATED','N/A'] as const;
export type State=typeof states[number];
export const criterionSchema=z.object({
 ruleId:z.string().refine(id=>ridaaRules.some(r=>r.id===id&&r.check)),property:text,unit:z.enum(['mm','m','%','l/s','m/s','kPa','mca','UEH','un']),
 operator:z.enum(['>=','<=','>','<','=']),value:z.number().finite(),categories:z.array(text).min(1).max(30),
 kind:z.literal('NORMATIVE'),source:text,article:z.string().max(1000),sourceVersion:text,confirmed:z.literal(true),
 applicationEvidence:text,filter:z.object({property:z.string().max(1000),value:z.string().max(1000)}).strict(),
}).strict().superRefine((v,c)=>{const r=ridaaRules.find(r=>r.id===v.ruleId);if(!r?.check||v.value!==r.check.value||v.operator!==r.check.operator||v.unit!==r.check.unit||v.source!==ridaaSource.url||v.article!==r.article||v.sourceVersion!==ridaaSource.version||Boolean(v.filter.property)!==Boolean(v.filter.value))c.addIssue({code:'custom',message:'El criterio debe conservar el requisito y la fuente controlada'});});
export type Criterion=z.infer<typeof criterionSchema>;
export const configurationSchema=z.object({systemId,source:sourceSchema.nullable(),scope:z.object({mode:z.enum(['VIEW','PROPERTY']),property:z.string().max(1000),value:z.string().max(1000),confirmed:z.boolean()}).strict(),criteria:z.array(criterionSchema).max(60)}).strict().superRefine((c,ctx)=>{
 if(new Set(c.criteria.map(r=>r.ruleId)).size!==c.criteria.length||c.criteria.some(r=>!ridaaRules.some(t=>t.id===r.ruleId&&t.systems.includes(c.systemId))))ctx.addIssue({code:'custom',message:'Reglas fuera del sistema o duplicadas'});
 if(c.scope.mode==='PROPERTY'&&(!c.scope.property.trim()||!c.scope.value.trim()))ctx.addIssue({code:'custom',message:'Define parámetro y valor del sistema'});
});
export type Configuration=z.infer<typeof configurationSchema>;
export const emptyConfiguration=(id:string):Configuration=>({systemId:id,source:null,scope:{mode:'VIEW',property:'',value:'',confirmed:false},criteria:[]});
export type Element={dbId:number;uniqueId:string|null;elementId:string|null;name:string;category:string|null;categorySource:'property'|'tree'|null;categoryPath:string[];system:string|null;subspecialty:string|null;level:string|null;building:string|null;zone:string|null;values:Record<string,unknown>};
export type NetworkElement={id:string;system:string|null;type:string|null;startNode:string|null;endNode:string|null;upstream:string[]|null;downstream:string[]|null;diameter:number|null;length:number|null;startElevation:number|null;endElevation:number|null;level:string|null;building:string|null;zone:string|null;connectionState:'NOT AVAILABLE'|'VERIFIED';upstreamUEH:number|null;downstreamUEH:number|null;slope:number|null;flowDirection:string|null;qi:number|null;qmp:number|null;flow:number|null;velocity:number|null;pressureLoss:number|null;availablePressure:number|null};
export type NetworkGraph={state:'NOT AVAILABLE'|'VERIFIED';reason:string;elements:NetworkElement[]};
export type Evidence={endpoint:string;treeEndpoint:string;fetchedAt:string;projectId:string;modelId:string;versionId:string;viewId:string;dbId:number|null;uniqueId:string|null;property:string|null;raw:unknown;unit:string|null;method:string};
export type Finding={id:string;ruleId:string;systemId:string;group:string;title:string;state:State;kind:'NORMATIVE FAIL'|'COORDINATION ISSUE'|'WARNING'|'INFORMATION'|'NOT EVALUATED'|'N/A';element:Element|null;observed:number|null;required:number|null;difference:number|null;description:string;criterion:Criterion|null;confidence:null;evidence:Evidence};
export type Run={id:string;systemId:string;source:QuantitySource;configuration:Configuration;configurationRevision:number;createdBy:string;createdAt:string;engineVersion:string;population:string;readCount:number;excludedCount:number;missingCount:number;rulesExecuted:number;findings:Finding[];graph:NetworkGraph;status:'COMPLETED'|'PARTIAL'};
export type RunSummary={id:string;systemId:string;label:string;createdAt:string};
export type Annotation={id:string;runId:string;findingId:string;kind:'comment'|'reviewed'|'issue';text:string;createdAt:string;createdBy:string;systemId:string};
export type Workspace={configurations:{configuration:Configuration;revision:number}[];runs:RunSummary[];annotations:Annotation[];historyPartial:boolean};
export type Report=Omit<Run,'findings'|'graph'> & {counts:Record<State,number>;findingCount:number;graph:Omit<NetworkGraph,'elements'>};
export type Results={rows:Finding[];total:number;facets:Record<string,string[]>;offset:number};
