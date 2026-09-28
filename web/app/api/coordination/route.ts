import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorizeData,apiError} from '@/lib/autodesk/authorize';
import {trustedMutation} from '@/lib/autodesk/oauth';
import {privateHeaders} from '@/lib/autodesk/http';
import {DataError} from '@/lib/autodesk/data';
import {memoryActor,memoryInput} from '@/lib/memory/server';
import {memoryConfigured,auditTransaction,storageKey} from '@/lib/memory/database';
import {projectScope,sourceSchema} from '@/lib/quantities/contracts';
import {verifiedSource} from '@/lib/quantities/autodesk';
import {readAuditView} from '@/lib/audit/provider';
import {configurationSchema,systemId} from '@/lib/coordination/contracts';
import {createCoordinationStore} from '@/lib/coordination/store';
import {executeReview,report,results,propertyCatalog,compareRuns} from '@/lib/coordination/engine';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
const schema=z.object({scope:projectScope,command:z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),revision:z.number().int().nonnegative(),configuration:configurationSchema}).strict(),
 z.object({action:z.literal('inspect'),source:sourceSchema}).strict(),
 z.object({action:z.literal('run'),systemId,revision:z.number().int().nonnegative()}).strict(),
 z.object({action:z.literal('annotate'),runId:z.string().uuid(),findingId:z.string().uuid(),kind:z.enum(['issue','comment','reviewed']),text:z.string().trim().min(1).max(3000)}).strict(),
 z.object({action:z.literal('compare'),previous:z.string().uuid(),current:z.string().uuid()}).strict(),
])}).strict();
const response=(v:unknown)=>NextResponse.json(v,{headers:privateHeaders});
const store=()=>{if(!memoryConfigured())throw new DataError('coordination_storage_unavailable',503);return createCoordinationStore(auditTransaction,storageKey());};
export async function GET(request:NextRequest){try{
 const params=request.nextUrl.searchParams,scope=projectScope.parse(JSON.parse(params.get('scope')??'null')),actor=await memoryActor(request,scope),db=store(),id=params.get('run');
 if(!id)return response(await db.workspace(actor));
 const run=await db.run(actor,z.string().uuid().parse(id));
 if(params.has('results')){const filters=Object.fromEntries(['state','group','rule','system','subspecialty','building','level','origin','pending','comparison'].map(k=>[k,params.get(k)??'']));return response(results(run,filters,z.coerce.number().int().min(0).max(100000).parse(params.get('offset')??0)));}
 if(params.has('colors'))return response({groups:run.findings.filter(f=>f.element?.uniqueId).map(f=>({id:f.element!.uniqueId!,state:f.state}))});
 return response(report(run));
}catch(e){return apiError(e);}}
export async function POST(request:NextRequest){try{
 const {config,session}=authorizeData(request);if(!trustedMutation(request,config))throw new DataError('forbidden',403);
 const input=schema.safeParse(await memoryInput(request));if(!input.success)throw new DataError('invalid_query',400);
 const {scope,command}=input.data,actor=await memoryActor(request,scope),db=store();
 if(command.action==='annotate'){const run=await db.run(actor,command.runId);await db.annotate(actor,run,command.findingId,command.kind,command.text);return response(await db.workspace(actor));}
 if(command.action==='compare')return response(compareRuns(await db.run(actor,command.previous),await db.run(actor,command.current)));
 if(command.action==='save'||command.action==='inspect'){
  const s=command.action==='save'?command.configuration.source:command.source;
  if(s&&(s.scope.hubId!==scope.hubId||s.scope.projectId!==scope.projectId))throw new DataError('out_of_scope',403);
  const source=s?await verifiedSource(session.accessToken,s.scope,s.version.id,s.view?.id??null,request.signal):null;
  if(source?.view&&source.view.role!=='3d')throw new DataError('coordination_view_required',422);
  if(command.action==='inspect'){if(!source?.view)throw new DataError('coordination_view_required',422);return response(propertyCatalog(await readAuditView(session.accessToken,source,request.signal)));}
  await db.save(actor,command.revision,{...command.configuration,source});return response(await db.workspace(actor));
 }
 const workspace=await db.workspace(actor),saved=workspace.configurations.find(c=>c.configuration.systemId===command.systemId);
 if(!saved?.configuration.source?.view)throw new DataError('coordination_view_required',422);
 if(saved.revision!==command.revision)throw new DataError('configuration_conflict',409);
 const c=saved.configuration,s=c.source!,source=await verifiedSource(session.accessToken,s.scope,s.version.id,s.view!.id,request.signal);
 const run=executeReview({...c,source},await readAuditView(session.accessToken,source,request.signal),actor.userId,saved.revision);
 await db.append(actor,run);return response(report(run));
}catch(e){return apiError(e);}}
