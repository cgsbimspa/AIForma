import {NextRequest,NextResponse} from 'next/server';
import {gunzipSync} from 'node:zlib';
import {z} from 'zod';
import {authorizeData,apiError} from '@/lib/autodesk/authorize';
import {trustedMutation} from '@/lib/autodesk/oauth';
import {privateHeaders} from '@/lib/autodesk/http';
import {DataError} from '@/lib/autodesk/data';
import {memoryActor} from '@/lib/memory/server';
import {projectTransaction,quantityTransaction,storageKey} from '@/lib/memory/database';
import {projectScope} from '@/lib/quantities/contracts';
import {verifiedSource} from '@/lib/quantities/autodesk';
import {createQuantityStore} from '@/lib/quantities/store';
import {createSnapshotStore,validateCapture} from '@/lib/projects/snapshots';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
const reply=(v:unknown)=>NextResponse.json(v,{headers:privateHeaders});
const input=z.object({scope:projectScope,configurationId:z.string().uuid(),revision:z.number().int().positive(),compressed:z.string().max(3800000)}).strict();
export async function GET(request:NextRequest){try{const scope=projectScope.parse(JSON.parse(request.nextUrl.searchParams.get('scope')??'null')),actor=await memoryActor(request,scope),store=createSnapshotStore(projectTransaction,storageKey()),id=request.nextUrl.searchParams.get('id');if(id){const run=await store.read(actor,z.string().uuid().parse(id));if(!run)throw new DataError('not_found',404);return reply(run);}return reply(await store.list(actor));}catch(e){return apiError(e);}}
export async function POST(request:NextRequest){try{
 const {config,session}=authorizeData(request);if(!trustedMutation(request,config))throw new DataError('forbidden',403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new DataError('invalid_query',400);
 const reader=request.body?.getReader();if(!reader)throw new DataError('invalid_query',400);const chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3900000){await reader.cancel();throw new DataError('too_large',413);}chunks.push(value);}
 const body=input.parse(JSON.parse(Buffer.concat(chunks).toString())),actor=await memoryActor(request,body.scope),key=storageKey(),db=createQuantityStore(quantityTransaction,key),w=await db.workspace(actor),c=w.configurations.find(c=>c.id===body.configurationId);
 if(!c?.source?.view||c.revision!==body.revision)throw new DataError('configuration_conflict',409);
 const source=await verifiedSource(session.accessToken,c.source.scope,c.source.version.id,c.source.view.id,request.signal);
 const data=validateCapture(JSON.parse(gunzipSync(Buffer.from(body.compressed,'base64'),{maxOutputLength:100000000}).toString()),source);
 if((data.mepScope?.key??(data.engine.startsWith('mep-')?'mep':'structure'))!==c.specialtyCode)throw new DataError('out_of_scope',422);
 if(c.calculationSettings&&JSON.stringify(data.settings)!==JSON.stringify(c.calculationSettings))throw new DataError('configuration_conflict',409);
 // Captured deterministic viewer evidence, not an independent server-side model inspection.
 return reply(await createSnapshotStore(projectTransaction,key).save(actor,source,c.specialtyCode,c.revision,data,body.compressed));
 }catch(e){return apiError(e);}}
