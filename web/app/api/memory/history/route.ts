import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorizeData,apiError } from "@/lib/autodesk/authorize";
import { DataError,scopeSchema } from "@/lib/autodesk/data";
import { privateHeaders } from "@/lib/autodesk/http";
import { trustedMutation } from "@/lib/autodesk/oauth";
import { memoryConfigured } from "@/lib/memory/database";
import { memoryActor,memoryStore,memoryInput } from "@/lib/memory/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const schema=z.object({scope:scopeSchema,conversationId:z.string().uuid().optional()}).strict();
export async function GET(request:NextRequest) {
 try {
  authorizeData(request);
  if(!memoryConfigured())return NextResponse.json({configured:false,conversations:[]},{headers:privateHeaders});
  let input;try{input=schema.parse({scope:JSON.parse(request.nextUrl.searchParams.get("scope")??"null"),conversationId:request.nextUrl.searchParams.get("conversationId")??undefined});}catch{throw new DataError("invalid_query",400);}
  const actor=await memoryActor(request,input.scope),store=memoryStore();
  const result=input.conversationId?await store.messages(actor,input.scope,input.conversationId):{conversations:await store.listProject(actor)};
  return NextResponse.json({configured:true,...result},{headers:privateHeaders});
 }catch(error){if(error instanceof Error&&error.message==="history_expired_or_out_of_scope")return NextResponse.json({error:"history_not_found"},{status:404,headers:privateHeaders});return apiError(error);}
}
export async function POST(request:NextRequest) {
 try {
  const {config}=authorizeData(request);if(!trustedMutation(request,config))throw new DataError("forbidden",403);
  if(!memoryConfigured())throw new DataError("memory_not_configured",503);
  const raw=await memoryInput(request);
  let input;try{input=schema.extend({conversationId:z.string().uuid()}).parse(raw);}catch{throw new DataError("invalid_query",400);}
  await memoryStore().deleteConversation(await memoryActor(request,input.scope),input.scope,input.conversationId);
  return NextResponse.json({deleted:true},{headers:privateHeaders});
 }catch(error){return apiError(error);}
}
