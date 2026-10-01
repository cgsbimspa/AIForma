import {NextRequest,NextResponse} from 'next/server';
import {apiError} from '@/lib/autodesk/authorize';
import {privateHeaders} from '@/lib/autodesk/http';
import {memoryActor} from '@/lib/memory/server';
import {memoryConfigured,storageKey,auditTransaction,quantityTransaction} from '@/lib/memory/database';
import {projectScope} from '@/lib/quantities/contracts';
import {createProjectReader} from '@/lib/projects/store';
import {summarizeProject,type SummaryInput} from '@/lib/projects/summary';
import {logProjectRead} from '@/lib/activity/logger';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

export async function GET(request:NextRequest){
  try{
    const scope=projectScope.parse(JSON.parse(request.nextUrl.searchParams.get('scope')??'null'));
    const actor=await memoryActor(request,scope),started=Date.now();
    const modules=['audit','coordination','quantities'] as const;
    const reader=memoryConfigured()?createProjectReader({audit:auditTransaction,coordination:auditTransaction,quantities:quantityTransaction},storageKey()):null;
    const inputs:SummaryInput[]=await Promise.all(modules.map(async module=>{
      try{return reader?{module,state:'AVAILABLE' as const,data:await reader(actor,module)}:{module,state:'NOT_AVAILABLE' as const};}
      catch{return {module,state:'NOT_AVAILABLE' as const};}
    }));
    const summary=summarizeProject(scope,inputs,new Date().toISOString());
    logProjectRead(actor,started,summary.state==='AVAILABLE'?'success':'partial');
    return NextResponse.json(summary,{headers:privateHeaders});
  }catch(error){return apiError(error);}
}
