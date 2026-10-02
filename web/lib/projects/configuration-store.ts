import {randomUUID} from 'node:crypto';
import {encryptHistory,decryptHistory,type Actor} from '../memory/domain.ts';
import type {Transaction} from '../memory/database.ts';
import {DataError} from '../autodesk/data.ts';
import {configurationSchema,assertConfigurationScope,type ProjectConfiguration,type ProjectDiscipline} from './configuration.ts';
export function createConfigurationStore(transaction:Transaction,key:Buffer){
 const binding=(a:Actor,id:string)=>JSON.stringify(['project-configuration-v1',a.organizationId,a.projectId,id]);
 return {
  read:(a:Actor)=>transaction(a,async q=>{const [r]=await q('SELECT id,payload FROM project_configuration WHERE organization_id=$1 AND project_id=$2 ORDER BY revision DESC LIMIT 1',[a.organizationId,a.projectId]);if(!r)return null;const c=assertConfigurationScope(configurationSchema.parse(decryptHistory(String(r.payload),key,binding(a,String(r.id)))));if(c.companyId!==a.organizationId||c.projectId!==a.projectId)throw new DataError('out_of_scope',403);return c;}),
  save:(a:Actor,input:{revision:number;projectName:string;disciplines:ProjectDiscipline[]})=>transaction(a,async q=>{
   await q('SELECT pg_advisory_xact_lock(hashtext($1))',[JSON.stringify(['project-configuration',a.organizationId,a.projectId])]);
   const [r]=await q('SELECT revision,created_at FROM project_configuration WHERE organization_id=$1 AND project_id=$2 ORDER BY revision DESC LIMIT 1',[a.organizationId,a.projectId]);
   if(Number(r?.revision??0)!==input.revision)throw new DataError('configuration_conflict',409);
   const now=new Date().toISOString(),id=randomUUID();
   const c:ProjectConfiguration=assertConfigurationScope(configurationSchema.parse({...input,revision:input.revision+1,companyId:a.organizationId,projectId:a.projectId,configuredAt:r?(r.created_at instanceof Date?r.created_at:new Date(String(r.created_at))).toISOString():now,updatedAt:now,updatedBy:a.userId}));
   await q('INSERT INTO project_configuration(id,organization_id,project_id,revision,payload,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,a.organizationId,a.projectId,c.revision,encryptHistory(c,key,binding(a,id)),a.userId,c.configuredAt]);return c;
  })
 };
}
