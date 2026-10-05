import {moduleIdSchema} from '@/lib/projects/modules';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorizeData,apiError} from '@/lib/autodesk/authorize';
import {trustedMutation} from '@/lib/autodesk/oauth';
import {privateHeaders} from '@/lib/autodesk/http';
import {DataError,verifyLocation} from '@/lib/autodesk/data';
import {memoryActor,memoryInput} from '@/lib/memory/server';
import {projectTransaction,auditTransaction,quantityTransaction,storageKey} from '@/lib/memory/database';
import {projectScope,sourceSchema} from '@/lib/quantities/contracts';
import {verifiedSource,modelVersion} from '@/lib/quantities/autodesk';
import {createConfigurationStore} from '@/lib/projects/configuration-store';
import {configurationInput,sourceIdentity,auditDiscipline,regulatoryDisciplines} from '@/lib/projects/configuration';
import {createAuditStore} from '@/lib/audit/store';
import {defaultConfiguration} from '@/lib/audit/catalog';
import {createQuantityStore} from '@/lib/quantities/store';
import {quantitySpecialties} from '@/lib/quantities/catalog';
import {createCoordinationStore} from '@/lib/coordination/store';
import {emptyConfiguration} from '@/lib/coordination/contracts';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
const reply=(value:unknown)=>NextResponse.json(value,{headers:privateHeaders});
const schema=z.object({scope:projectScope,moduleId:moduleIdSchema,command:z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),configuration:configurationInput}).strict(),
 z.object({action:z.literal('validate'),source:sourceSchema}).strict(),
 z.object({action:z.literal('activate'),disciplineId:z.string().uuid(),revision:z.number().int().positive(),module:z.enum(['audit','quantities','coordination']),systemId:z.string().max(50).optional()}).strict(),
])}).strict();
export async function GET(request:NextRequest){try{const scope=projectScope.parse(JSON.parse(request.nextUrl.searchParams.get('scope')??'null')),actor=await memoryActor(request,scope);const moduleId=moduleIdSchema.parse(request.nextUrl.searchParams.get('module'));return reply({configuration:await createConfigurationStore(projectTransaction,storageKey(),moduleId).read(actor),legacy:await createConfigurationStore(projectTransaction,storageKey()).read(actor)});}catch(e){return apiError(e);}}
export async function POST(request:NextRequest){try{
 const {config,session}=authorizeData(request);if(!trustedMutation(request,config))throw new DataError('forbidden',403);
 const {scope,moduleId,command}=schema.parse(await memoryInput(request)),actor=await memoryActor(request,scope),key=storageKey(),store=createConfigurationStore(projectTransaction,key,moduleId);
 async function verify(s:z.infer<typeof sourceSchema>){if(s.scope.hubId!==scope.hubId||s.scope.projectId!==scope.projectId)throw new DataError('out_of_scope',403);return verifiedSource(session.accessToken,s.scope,s.version.id,s.view?.id??null,request.signal);}
 if(command.action==='validate'){const source=await verify(command.source),latest=await modelVersion(session.accessToken,source.scope,undefined,fetch,request.signal);return reply({source,latest,validatedAt:new Date().toISOString()});}
 if(command.action==='save'){
  const documents=[];
  for(const d of command.configuration.documents){if((d.scope.kind!=='folder'&&d.scope.kind!=='file')||d.scope.hubId!==scope.hubId||d.scope.projectId!==scope.projectId)throw new DataError('out_of_scope',403);const verified=await verifyLocation(session.accessToken,d.scope,fetch,request.signal);documents.push({...d,label:verified.path});}
  const disciplines=[];
  // Draft disciplines can be saved; execution still requires a verified 3D view below.
  for(const d of command.configuration.disciplines){const source=d.source?await verify(d.source):null;if(source?.view&&source.view.role!=='3d')throw new DataError('audit_view_required',422);disciplines.push({...d,source,lastValidatedAt:source?new Date().toISOString():null});}
  return reply({configuration:await store.save(actor,{...command.configuration,disciplines,documents})});
 }
 if(moduleId!==command.module)throw new DataError('out_of_scope',403);
 const central=await store.read(actor);if(!central||central.revision!==command.revision)throw new DataError('configuration_conflict',409);
 const discipline=central.disciplines.find(d=>d.id===command.disciplineId&&d.enabled);
 if(!discipline?.source?.view)throw new DataError('source_not_configured',422);
 const activationScope=[actor.organizationId,actor.projectId,moduleId,command.systemId??''];
 const applied=await projectTransaction(actor,async q=>{const [r]=await q('SELECT discipline_id,revision FROM project_module_activation WHERE organization_id=$1 AND project_id=$2 AND module_id=$3 AND system_id=$4',activationScope);return r?.discipline_id===discipline.id&&Number(r.revision)===central.revision;});
 async function activated(value:unknown){await projectTransaction(actor,q=>q('INSERT INTO project_module_activation(organization_id,project_id,module_id,system_id,discipline_id,revision) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,project_id,module_id,system_id) DO UPDATE SET discipline_id=EXCLUDED.discipline_id,revision=EXCLUDED.revision',[...activationScope,discipline!.id,central!.revision]));return reply(value);}
 const source=await verify(discipline.source);
 if((await store.read(actor))?.revision!==central.revision)throw new DataError('configuration_conflict',409);
 if(command.module==='audit'){
  const family=auditDiscipline(discipline.code);if(!family)throw new DataError('audit_discipline_required',422);
  const db=createAuditStore(auditTransaction,key),w=await db.workspace(actor),c=w.configuration??structuredClone(defaultConfiguration);
  if(!applied&&(sourceIdentity(c.source)!==sourceIdentity(source)||c.discipline!==family))await db.save(actor,w.revision,{...c,source,discipline:family,verticalReferences:sourceIdentity(c.source)===sourceIdentity(source)?c.verticalReferences:[]});
  return activated(await db.workspace(actor));
 }
 if(command.module==='coordination'){
  if(!command.systemId||!regulatoryDisciplines[command.systemId]?.includes(discipline.code))throw new DataError('out_of_scope',422);
  const db=createCoordinationStore(auditTransaction,key),w=await db.workspace(actor),saved=w.configurations.find(c=>c.configuration.systemId===command.systemId),c=saved?.configuration??emptyConfiguration(command.systemId);
  if(!applied&&sourceIdentity(c.source)!==sourceIdentity(source))await db.save(actor,saved?.revision??0,{...c,source,scope:{...c.scope,confirmed:false}});
  return activated(await db.workspace(actor));
 }
 if(!quantitySpecialties.some(s=>s.code===discipline.code))throw new DataError('quantity_rules_required',422);
 const db=createQuantityStore(quantityTransaction,key);await db.prepareTemplates(actor);let w=await db.workspace(actor),c=w.configurations.find(c=>c.specialtyCode===discipline.code);
 if(!c)c=await db.add(actor,discipline.code);
 if(sourceIdentity(c.source)!==sourceIdentity(source)){
  const settings=c.calculationSettings?{...c.calculationSettings,levelBinding:null,levelReferences:[],manualFloors:[],slabRoles:[],foundationFaces:[]}:undefined;
  await db.save(actor,{id:c.id,revision:c.revision,templateVersionId:c.templateVersionId,source,calculationSettings:settings});
 }
 w=await db.workspace(actor);return activated(w);
}catch(e){return apiError(e);}}
