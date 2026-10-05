import {createExecutionCache,executionKey} from '@/lib/projects/execution-cache';
import {projectTransaction} from '@/lib/memory/database';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeData,apiError } from '@/lib/autodesk/authorize';
import { trustedMutation } from '@/lib/autodesk/oauth';
import { privateHeaders } from '@/lib/autodesk/http';
import { DataError } from '@/lib/autodesk/data';
import { memoryActor,memoryInput } from '@/lib/memory/server';
import { memoryConfigured,auditTransaction,storageKey } from '@/lib/memory/database';
import { projectScope } from '@/lib/quantities/contracts';
import { verifiedSource } from '@/lib/quantities/autodesk';
import { configSchema,catalogSchema,type AuditRun } from '@/lib/audit/contracts';
import { createAuditStore } from '@/lib/audit/store';
import { readAuditView,property } from '@/lib/audit/provider';
import { executeAudit,score,auditEngineVersion } from '@/lib/audit/engine';
import { auditRules,auditRuleSetVersion } from '@/lib/audit/catalog';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
const schema=z.object({scope:projectScope,command:z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),revision:z.number().int().nonnegative(),configuration:configSchema}).strict(),
 z.object({action:z.literal('catalog'),origin:z.enum(['COMPANY','PROJECT']),revision:z.number().int().nonnegative(),catalog:catalogSchema}).strict(),
 z.object({action:z.literal('run'),revision:z.number().int().nonnegative(),force:z.boolean().default(false)}).strict(),
 z.object({action:z.literal('issue'),runId:z.string().uuid(),findingId:z.string().uuid()}).strict(),
])}).strict();
const response=(value:unknown)=>NextResponse.json(value,{headers:privateHeaders});
const store=()=>{if(!memoryConfigured())throw new DataError('audit_storage_unavailable',503);return createAuditStore(auditTransaction,storageKey());};
function preview(value:unknown):unknown {return Array.isArray(value)&&value.length>50?{preview:value.slice(0,50),total:value.length,partial:true}:value;}
function report(run:AuditRun){return {...run,metrics:score(run.findings),inventory:{...run.inventory,elements:[],levels:run.inventory.levels.map(e=>{const value=property(e,['Elevation','Elevación'])?.value;return {...e,publishedElevation:typeof value==='string'||typeof value==='number'?value:null,properties:{}};}),grids:run.inventory.grids.map(e=>({...e,properties:{}}))},findings:run.findings.map(f=>({...f,affectedCount:f.affectedElements.length,facets:Object.fromEntries(['category','family','type','level'].map(key=>[key,[...new Set(f.affectedElements.map(e=>e[key as 'category']).filter(Boolean))]])),affectedElements:f.affectedElements.slice(0,50),observedValue:preview(f.observedValue),evidence:f.evidence.map(e=>({...e,observedValue:preview(e.observedValue),viewerReference:{...e.viewerReference,dbIds:e.viewerReference.dbIds.slice(0,50)}}))}))};}
export async function GET(request:NextRequest){try{
 const scope=projectScope.parse(JSON.parse(request.nextUrl.searchParams.get('scope')??'null')),actor=await memoryActor(request,scope),db=store();
 const runId=request.nextUrl.searchParams.get('run');if(!runId)return response(await db.workspace(actor));
 const run=await db.run(actor,z.string().uuid().parse(runId)),findingId=request.nextUrl.searchParams.get('finding');
 if(findingId){const f=run.findings.find(f=>f.id===findingId);if(!f)throw new DataError('not_found',404);const page=z.coerce.number().int().min(0).max(10000).parse(request.nextUrl.searchParams.get('page')??0);return response({elements:f.affectedElements.slice(page*100,(page+1)*100),total:f.affectedElements.length,ids:f.affectedElements.map(e=>({dbId:e.dbId,uniqueId:e.uniqueId})),nextPage:(page+1)*100<f.affectedElements.length?page+1:null});}
 return response(report(run));
}catch(e){return apiError(e);}}
export async function POST(request:NextRequest){try{
 const {config,session}=authorizeData(request);if(!trustedMutation(request,config))throw new DataError('forbidden',403);
 const parsed=schema.safeParse(await memoryInput(request));if(!parsed.success)throw new DataError('invalid_query',400);
 const {scope,command}=parsed.data,actor=await memoryActor(request,scope),db=store();
 if(command.action==='catalog'){await db.catalog(actor,command.origin,command.revision,command.catalog);return response(await db.workspace(actor));}
 if(command.action==='issue'){const run=await db.run(actor,command.runId);return response({id:await db.issueRequest(actor,run,command.findingId),status:'PENDING_REVIEW_INTEGRATION'});}
 if(command.action==='save'){
  const c=command.configuration,s=c.source;
  if(c.disabledRules.some(id=>!auditRules.some(r=>r.ruleId===id))||new Set(c.verticalReferences.map(m=>`${m.discipline}:${m.category}`)).size!==c.verticalReferences.length)throw new DataError('invalid_query',400);
  if(s&&(s.scope.hubId!==scope.hubId||s.scope.projectId!==scope.projectId))throw new DataError('out_of_scope',403);
  const source=s?await verifiedSource(session.accessToken,s.scope,s.version.id,s.view?.id??null,request.signal):null;
  if(source?.view&&source.view.role!=='3d')throw new DataError('audit_view_required',422);
  await db.save(actor,command.revision,{...c,source});return response(await db.workspace(actor));
 }
 const workspace=await db.workspace(actor),c=workspace.configuration;
 if(workspace.revision!==command.revision)throw new DataError('configuration_conflict',409);
 if(!c?.source?.view)throw new DataError('audit_view_required',422);
 const startedAt=new Date().toISOString();
 const source=await verifiedSource(session.accessToken,c.source.scope,c.source.version.id,c.source.view.id,request.signal);
 const cache=createExecutionCache(projectTransaction),digest=executionKey('audit',source,{...c,source:null,configurationRevision:workspace.revision},{company:workspace.companyCatalog,project:workspace.projectCatalog,rules:auditRules,version:auditRuleSetVersion},auditEngineVersion);
 if(!command.force){const previous=await cache.read(actor,'audit',digest);if(previous)return response({...report(await db.run(actor,previous)),reused:true});}
 const inventory=await readAuditView(session.accessToken,source,request.signal);
 const run=executeAudit({configuration:{...c,source},inventory,companyCatalog:workspace.companyCatalog,projectCatalog:workspace.projectCatalog,createdBy:actor.userId,startedAt});
 await db.appendRun(actor,run);if(run.status==='COMPLETED')await cache.save(actor,'audit',digest,run.id);return response({...report(run),reused:false});
}catch(e){return apiError(e);}}
