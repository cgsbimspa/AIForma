import { randomUUID } from 'node:crypto';
import { DataError } from '../autodesk/data.ts';
import { encryptHistory,decryptHistory,type Actor } from '../memory/domain.ts';
import type { Query,Transaction } from '../memory/database.ts';
import { catalogSchema,configSchema,type AuditConfiguration,type AuditRun,type AuditWorkspace } from './contracts.ts';

export function createAuditStore(transaction:Transaction,key:Buffer){
 const binding=(actor:Actor,projectId:string,id:string)=>JSON.stringify(['audit-v1',actor.organizationId,projectId,id]);
 const decode=(actor:Actor,row:Record<string,unknown>)=>decryptHistory(String(row.payload),key,binding(actor,String(row.project_id),String(row.id)));
 async function latest(q:Query,kind:string,project:string){return (await q('SELECT * FROM audit_record WHERE kind=$1 AND project_id=$2 ORDER BY revision DESC LIMIT 1',[kind,project]))[0];}
 async function insert(q:Query,actor:Actor,project:string,kind:string,revision:number,data:unknown,label:string,id:string=randomUUID()){
  await q('INSERT INTO audit_record(id,organization_id,project_id,kind,revision,payload,label,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,actor.organizationId,project,kind,revision,encryptHistory(data,key,binding(actor,project,id)),encryptHistory(label,key,binding(actor,project,`${id}:label`)),actor.userId]);return id;
 }
 return {
  async workspace(actor:Actor):Promise<AuditWorkspace>{return transaction(actor,async q=>{
   const config=await latest(q,'configuration',actor.projectId),company=await latest(q,'catalog',''),project=await latest(q,'catalog',actor.projectId);
   const rows=await q("SELECT id,label,created_at FROM audit_record WHERE kind='run' AND project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 101",[actor.projectId]);
   const empty={rules:[],tolerances:[],naming:{},equivalences:{},exceptions:[]};
   return {configuration:config?configSchema.parse(decode(actor,config)):null,revision:config?Number(config.revision):0,
    companyCatalog:{...(company?catalogSchema.parse(decode(actor,company)):empty),companyId:actor.organizationId,version:company?Number(company.revision):0},
    projectCatalog:{...(project?catalogSchema.parse(decode(actor,project)):empty),projectId:actor.projectId,version:project?Number(project.revision):0},
    runs:rows.slice(0,100).map(r=>({id:String(r.id),label:String(decryptHistory(String(r.label),key,binding(actor,actor.projectId,`${r.id}:label`))),createdAt:new Date(String(r.created_at)).toISOString()})),nextCursor:rows.length>100?String(rows[99].id):null};
  });},
  async save(actor:Actor,revision:number,configuration:AuditConfiguration){
   const value=configSchema.parse(configuration);if(value.source&&(value.source.scope.hubId!==actor.organizationId||value.source.scope.projectId!==actor.projectId))throw new DataError('out_of_scope',403);
   return transaction(actor,async q=>{await q('SELECT pg_advisory_xact_lock(hashtext($1))',[JSON.stringify([actor.organizationId,actor.projectId,'audit-config'])]);const current=await latest(q,'configuration',actor.projectId);if(Number(current?.revision??0)!==revision)throw new DataError('configuration_conflict',409);await insert(q,actor,actor.projectId,'configuration',revision+1,value,'Configuración de auditoría');return revision+1;});
  },
  async catalog(actor:Actor,origin:'COMPANY'|'PROJECT',revision:number,input:unknown){
   const value=catalogSchema.parse(input),project=origin==='COMPANY'?'':actor.projectId;
   if(new Set(value.tolerances.map(t=>t.id)).size!==value.tolerances.length||value.tolerances.some(t=>t.origin!==origin||t.status==='Confirmada'&&(!t.evidence.trim()||t.unit==='Por Configurar')))throw new DataError('audit_invalid_catalog',422);
   return transaction(actor,async q=>{await q('SELECT pg_advisory_xact_lock(hashtext($1))',[JSON.stringify([actor.organizationId,project,'audit-catalog'])]);const previous=await latest(q,'catalog',project);if(Number(previous?.revision??0)!==revision)throw new DataError('configuration_conflict',409);await insert(q,actor,project,'catalog',revision+1,value,'Catálogo de auditoría');return revision+1;});
  },
  async appendRun(actor:Actor,run:AuditRun){
   if(run.projectId!==actor.projectId||run.source.scope.hubId!==actor.organizationId||run.createdBy!==actor.userId)throw new DataError('out_of_scope',403);
   return transaction(actor,q=>insert(q,actor,actor.projectId,'run',1,run,`${run.source.fileName} · V${run.source.version.number} · ${run.source.view!.name}`,run.id));
  },
  async run(actor:Actor,id:string):Promise<AuditRun>{return transaction(actor,async q=>{const row=(await q("SELECT * FROM audit_record WHERE id=$1 AND kind='run' AND project_id=$2",[id,actor.projectId]))[0];if(!row)throw new DataError('not_found',404);return decode(actor,row) as AuditRun;});},
  async issueRequest(actor:Actor,run:AuditRun,findingId:string){
   if(!run.findings.some(f=>f.id===findingId))throw new DataError('not_found',404);
   return transaction(actor,q=>insert(q,actor,actor.projectId,'issue-request',1,{runId:run.id,findingId,status:'PENDING_REVIEW_INTEGRATION',requestedBy:actor.userId},'Solicitud explícita de incidencia'));
  },
 };
}
