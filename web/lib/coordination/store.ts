import {randomUUID} from 'node:crypto';
import {DataError} from '../autodesk/data.ts';
import {encryptHistory,decryptHistory,type Actor} from '../memory/domain.ts';
import type {Transaction,Query} from '../memory/database.ts';
import {configurationSchema,type Configuration,type Run,type Workspace,type Annotation} from './contracts.ts';
export function createCoordinationStore(transaction:Transaction,key:Buffer){
 const bind=(a:Actor,id:string)=>JSON.stringify(['coordination-v1',a.organizationId,a.projectId,id]);
 const decode=(a:Actor,row:Record<string,unknown>)=>decryptHistory(String(row.payload),key,bind(a,String(row.id)));
 async function insert(q:Query,a:Actor,kind:string,system:string,revision:number,value:unknown,label:string,id:string=randomUUID()){
  await q('INSERT INTO coordination_record(id,organization_id,project_id,system_id,kind,revision,payload,label,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,a.organizationId,a.projectId,system,kind,revision,encryptHistory(value,key,bind(a,id)),encryptHistory(label,key,bind(a,`${id}:label`)),a.userId]);return id;
 }
 return {
  async workspace(a:Actor):Promise<Workspace>{return transaction(a,async q=>{
   const configs=await q("SELECT DISTINCT ON(system_id) * FROM coordination_record WHERE project_id=$1 AND kind='configuration' ORDER BY system_id,revision DESC",[a.projectId]);
   const runs=await q("SELECT id,system_id,label,created_at FROM coordination_record WHERE project_id=$1 AND kind='run' ORDER BY created_at DESC LIMIT 101",[a.projectId]);
   const annotations=await q("SELECT * FROM coordination_record WHERE project_id=$1 AND kind IN ('comment','reviewed','issue') ORDER BY created_at DESC LIMIT 501",[a.projectId]);
   return {configurations:configs.map(r=>({configuration:configurationSchema.parse(decode(a,r)),revision:Number(r.revision)})),runs:runs.slice(0,100).map(r=>({id:String(r.id),systemId:String(r.system_id),label:String(decryptHistory(String(r.label),key,bind(a,`${r.id}:label`))),createdAt:new Date(String(r.created_at)).toISOString()})),annotations:annotations.slice(0,500).map(r=>decode(a,r) as Annotation),historyPartial:runs.length>100||annotations.length>500};
  });},
  async save(a:Actor,revision:number,input:Configuration){const c=configurationSchema.parse(input);if(c.source&&(c.source.scope.hubId!==a.organizationId||c.source.scope.projectId!==a.projectId))throw new DataError('out_of_scope',403);return transaction(a,async q=>{await q('SELECT pg_advisory_xact_lock(hashtext($1))',[bind(a,c.systemId)]);const rows=await q("SELECT revision FROM coordination_record WHERE kind='configuration' AND project_id=$1 AND system_id=$2 ORDER BY revision DESC LIMIT 1",[a.projectId,c.systemId]);if(Number(rows[0]?.revision??0)!==revision)throw new DataError('configuration_conflict',409);return insert(q,a,'configuration',c.systemId,revision+1,c,'Configuración sanitaria');});},
  async append(a:Actor,run:Run){if(run.source.scope.hubId!==a.organizationId||run.source.scope.projectId!==a.projectId||run.createdBy!==a.userId)throw new DataError('out_of_scope',403);return transaction(a,q=>insert(q,a,'run',run.systemId,1,run,`${run.source.fileName} · V${run.source.version.number} · ${run.systemId}`,run.id));},
  async run(a:Actor,id:string):Promise<Run>{return transaction(a,async q=>{const rows=await q("SELECT * FROM coordination_record WHERE id=$1 AND project_id=$2 AND kind='run'",[id,a.projectId]);if(!rows[0])throw new DataError('not_found',404);return decode(a,rows[0]) as Run;});},
  async annotate(a:Actor,run:Run,findingId:string,kind:Annotation['kind'],text:string){if(!run.findings.some(f=>f.id===findingId))throw new DataError('not_found',404);const data:Annotation={id:randomUUID(),runId:run.id,findingId,systemId:run.systemId,kind,text,createdAt:new Date().toISOString(),createdBy:a.userId};return transaction(a,async q=>{await insert(q,a,kind,run.systemId,1,data,kind,data.id);return data;});},
 };
}
