import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { apiError,authorizeData } from "@/lib/autodesk/authorize";
import { DataError,scopeSchema } from "@/lib/autodesk/data";
import { trustedMutation } from "@/lib/autodesk/oauth";
import { privateHeaders } from "@/lib/autodesk/http";
import { memoryActor,memoryStore,memoryInput } from "@/lib/memory/server";
import { knowledgeSchema } from "@/lib/memory/domain";
export const runtime="nodejs";
const inputSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("propose"),scope:scopeSchema,knowledge:knowledgeSchema}).strict(),
 z.object({action:z.literal("transition"),scope:scopeSchema,id:z.string().uuid(),status:z.enum(["SUGGESTED","VALIDATED","REJECTED","OBSOLETE"]),confirm:z.literal(true)}).strict(),
]);
export async function GET(request:NextRequest) {
 try {
  const scope=scopeSchema.parse(JSON.parse(request.nextUrl.searchParams.get("scope")??"null"));
  return NextResponse.json({knowledge:await memoryStore().listKnowledge(await memoryActor(request,scope)),notice:"Registro de conocimiento. La reutilización requiere comprobar vigencia, evidencia y versión actual."},{headers:privateHeaders});
 }catch(error){return apiError(error);}
}
export async function POST(request:NextRequest) {
 try {
  const {config}=authorizeData(request);if(!trustedMutation(request,config))throw new DataError("forbidden",403);
  const raw=await memoryInput(request);
  const input=inputSchema.parse(raw),actor=await memoryActor(request,input.scope),store=memoryStore();
  const result=input.action==="propose"?await store.proposeKnowledge(actor,input.knowledge):await store.transitionKnowledge(actor,input.id,input.status);
  return NextResponse.json({knowledge:result},{headers:privateHeaders});
 }catch(error){return apiError(error);}
}
