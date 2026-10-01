import type {Actor} from '../memory/domain.ts';

// Operational structured log. Not a persistent project activity history.
// Accept only controlled fields; never arbitrary prompts, tokens, documents or provider errors.
export function logProjectRead(actor:Actor,started:number,result:'success'|'partial'|'error'){
  console.info(JSON.stringify({event:'ActivityLogger',userId:actor.userId,companyId:actor.organizationId,projectId:actor.projectId,action:'project_home_read',module:'project',timestamp:new Date().toISOString(),duration:Math.max(0,Date.now()-started),success:result==='success',error:result==='success'?null:result==='partial'?'SOURCE_PARTIAL':'SOURCE_UNAVAILABLE',metadata:{result}}));
}
