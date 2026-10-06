import {property} from './provider.ts';
import {defaultConfiguration} from './catalog.ts';
import {auditDiscipline,sourceIdentity,type ProjectDiscipline} from '../projects/configuration.ts';
import {coordinateExtraction} from './coordinates.ts';
import {score} from './engine.ts';
import type {AuditConfiguration,AuditRun} from './contracts.ts';
export function projectAuditConfiguration(row:ProjectDiscipline,settings:AuditConfiguration|null):AuditConfiguration|null{
 const discipline=auditDiscipline(row.code);
 if(!row.enabled||!discipline||!row.source?.view||row.source.view.role!=='3d')return null;
 return {...(settings??structuredClone(defaultConfiguration)),source:row.source,discipline};
}
export function projectAuditResult(run:AuditRun){
 const categories=new Map<string,number>();for(const e of run.inventory.elements){const name=e.category??'Categoría no disponible';categories.set(name,(categories.get(name)??0)+1);}
 return {id:run.id,completedAt:run.completedAt,status:run.status,source:run.source,engineVersion:run.engineVersion,ruleSetVersion:run.ruleSetVersion,
 sourceIdentity:sourceIdentity(run.source),metrics:score(run.findings),elementCount:run.scope.elementCount,
 coordinates:coordinateExtraction(run.inventory),levels:run.inventory.levels.map(e=>({name:e.name,level:e.level,id:e.elementId,elevation:property(e,['Elevation','Elevación'])?.value??null})),
 aecLevels:run.inventory.aec?.files.map(f=>({documentId:f.documentId,levels:f.levels}))??[],
 grids:run.inventory.grids.map(e=>({name:e.name,id:e.elementId})),aecGrids:run.inventory.aec?.files.map(f=>({documentId:f.documentId,available:f.gridsFieldAvailable,grids:f.grids}))??[],
 categories:[...categories].map(([name,count])=>({name,count})),missing:run.inventory.missing};
}
export type ProjectAuditResult=ReturnType<typeof projectAuditResult>;
export type ProjectAuditRow={id:string;name:string;ready:boolean;reason:string|null;source:ProjectDiscipline['source'];result:ProjectAuditResult|null};
export type ProjectAuditOverview={revision:number;rows:ProjectAuditRow[]};
