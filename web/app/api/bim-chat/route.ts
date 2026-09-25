import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeData, apiError } from '@/lib/autodesk/authorize';
import { DataError, scopeSchema } from '@/lib/autodesk/data';
import { privateHeaders } from '@/lib/autodesk/http';
import { trustedMutation } from '@/lib/autodesk/oauth';
import { memoryInput } from '@/lib/memory/server';
import { verifiedSource } from '@/lib/quantities/autodesk';
import { catalogSchema, planSchema } from '@/lib/bim-chat/contracts';
import { planBim } from '@/lib/bim-chat/plan';
export const runtime='nodejs';
export const maxDuration=90;
const schema=z.object({file:scopeSchema.options[3],versionId:z.string().min(1).max(2000),viewId:z.string().min(1).max(2000),question:z.string().trim().min(1).max(2000),catalog:catalogSchema,previous:z.array(z.object({question:z.string().max(2000),plan:planSchema})).max(4),selectionCount:z.number().int().nonnegative()}).strict();
export async function POST(request:NextRequest){
  try {
    const {config,session}=authorizeData(request);
    if(!trustedMutation(request,config))throw new DataError('forbidden',403);
    const parsed=schema.safeParse(await memoryInput(request));if(!parsed.success)throw new DataError('invalid_query',400);
    const body=parsed.data,key=process.env.OPENAI_API_KEY;if(!key)throw new DataError('ai_not_configured',503);
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(75000)]);
    const source=await verifiedSource(session.accessToken,body.file,body.versionId,body.viewId,signal);
    const plan=await planBim(body,{key,model:process.env.OPENAI_MODEL||'gpt-5-mini'},signal);
    if(session.expiresAt<=Date.now())throw new DataError('expired',401);
    return NextResponse.json({plan,versionId:source.version.id,viewId:source.view!.id},{headers:privateHeaders});
  }catch(error){return apiError(error);}
}
