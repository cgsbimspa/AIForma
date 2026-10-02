import {createHash,randomUUID} from 'node:crypto';
import {encryptHistory,decryptHistory,type Actor} from '../memory/domain.ts';
import type {Transaction} from '../memory/database.ts';
import {sourceIdentity} from './configuration.ts';
import type {QuantitySource} from '../quantities/contracts.ts';
import {calculationSchema,type ViewCalculation,blankFilters} from '../quantities-v2/contracts.ts';
import {presentQuantities} from '../../public/quantity-v2/quantity-service.js';
import {presentMEP} from '../../public/quantity-v2/mep-service.js';
export type QuantitySnapshot={id:string;source:QuantitySource;specialtyCode:string;engine:string;calculatedAt:string;savedAt:string;origin:'VIEWER_CAPTURE';coverage:ViewCalculation['coverage'];totals:unknown;configurationRevision:number;digest:string};
export function validateCapture(value:unknown,source:QuantitySource){const data=calculationSchema.parse(value),b=data.binding;if(b.projectId!==source.scope.projectId||b.itemId!==source.scope.itemId||b.versionId!==source.version.id||b.urn!==source.version.modelId||b.viewId!==source.view?.id)throw Error('capture_source_mismatch');return data;}
export function snapshotState(snapshot:QuantitySnapshot,active:QuantitySource|null,latestVersionId?:string){if(sourceIdentity(snapshot.source)!==sourceIdentity(active))return 'OUTDATED';if(!latestVersionId)return 'NOT_VERIFIED';return snapshot.source.version.id===latestVersionId?'CURRENT':'OUTDATED';}
export function createSnapshotStore(transaction:Transaction,key:Buffer){
 const aad=(a:Actor,id:string)=>JSON.stringify(['quantity-capture-v1',a.organizationId,a.projectId,id]);
 return {
  save:(a:Actor,source:QuantitySource,specialtyCode:string,configurationRevision:number,data:ViewCalculation,compressed:string)=>transaction(a,async q=>{
   if(source.scope.hubId!==a.organizationId||source.scope.projectId!==a.projectId)throw Error('out_of_scope');validateCapture(data,source);
   const digest=createHash('sha256').update(JSON.stringify({source:sourceIdentity(source),specialtyCode,configurationRevision,data})).digest('hex');
   const [existing]=await q('SELECT id,metadata FROM project_quantity_capture WHERE organization_id=$1 AND project_id=$2 AND digest=$3',[a.organizationId,a.projectId,digest]);
   if(existing)return decryptHistory(String(existing.metadata),key,aad(a,String(existing.id))) as QuantitySnapshot;
   const id=randomUUID(),summary:QuantitySnapshot={id,source,specialtyCode,configurationRevision,engine:data.engine,calculatedAt:data.calculatedAt,savedAt:new Date().toISOString(),origin:'VIEWER_CAPTURE',coverage:data.coverage,totals:data.engine.startsWith('mep-')?presentMEP(data,blankFilters).cards.map((c:{metric:string;label:string;unit:string;coverage:unknown})=>({metric:c.metric,label:c.label,unit:c.unit,coverage:c.coverage})):presentQuantities(data,blankFilters).coverage,digest};
   await q('INSERT INTO project_quantity_capture(id,organization_id,project_id,metadata,payload,digest,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,a.organizationId,a.projectId,encryptHistory(summary,key,aad(a,id)),encryptHistory({compressed},key,aad(a,id)+':data'),digest,a.userId]);return summary;
  }),
  list:(a:Actor)=>transaction(a,async q=>{const rows=await q('SELECT id,metadata FROM project_quantity_capture WHERE organization_id=$1 AND project_id=$2 ORDER BY created_at DESC LIMIT 51',[a.organizationId,a.projectId]);return {partial:rows.length>50,runs:rows.slice(0,50).map(r=>decryptHistory(String(r.metadata),key,aad(a,String(r.id))) as QuantitySnapshot)};}),
  read:(a:Actor,id:string)=>transaction(a,async q=>{const [r]=await q('SELECT id,metadata,payload FROM project_quantity_capture WHERE organization_id=$1 AND project_id=$2 AND id=$3',[a.organizationId,a.projectId,id]);return r?{summary:decryptHistory(String(r.metadata),key,aad(a,id)) as QuantitySnapshot,...decryptHistory(String(r.payload),key,aad(a,id)+':data') as {compressed:string}}:null;})
 };
}
