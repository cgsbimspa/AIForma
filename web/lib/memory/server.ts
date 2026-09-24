import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeData, apiError } from "../autodesk/authorize";
import { profile } from "../autodesk/oauth";
import { DataError, verifyProject, type DataScope } from "../autodesk/data";
import { createMemoryStore, type Capture } from "./store";
import { memoryConfigured, storageKey, transaction } from "./database";

export function memoryStore() { return createMemoryStore(transaction,storageKey()); }
export async function memoryInput(request:NextRequest) {
  if(!request.headers.get("content-type")?.startsWith("application/json"))throw new DataError("invalid_query",400);
  const reader=request.body?.getReader();if(!reader)throw new DataError("invalid_query",400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>64000){await reader.cancel();throw new DataError("too_large",413);}chunks.push(value);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new DataError("invalid_query",400);}
}
export async function memoryActor(request:NextRequest,scope:DataScope) {
  if(scope.kind==="all")throw new DataError("memory_project_required",422);
  const {session}=authorizeData(request);
  const [user]=await Promise.all([profile(session.accessToken),verifyProject(session.accessToken,scope.hubId,scope.projectId,fetch,request.signal)]);
  // Autodesk hub ID is the organization namespace. It is not an inferred company name.
  return {organizationId:scope.hubId,projectId:scope.projectId,userId:user.id};
}
export async function remember(request:NextRequest,scope:DataScope,input:Capture) {
  if(!memoryConfigured())return {status:"not_configured" as const};
  if(scope.kind==="all")return {status:"project_required" as const};
  try {
    const actor=await memoryActor(request,scope);
    const saved=await memoryStore().capture(actor,input);
    return {status:"saved" as const,...saved};
  } catch {
    // The result remains usable, but do not claim that history was saved.
    console.warn("[memory] capture_failed");
    return {status:"unavailable" as const};
  }
}

export type PendingCapture = Omit<Capture,"response"|"result"|"status"|"duration"> & {scope:DataScope};
export async function rememberFailure(request:NextRequest,error:unknown,input:PendingCapture|undefined,started:number) {
  const response=apiError(error);
  if(!input)return response;
  const code=error instanceof DataError?error.code:"unavailable";
  const memory=await remember(request,input.scope,{...input,response:"La consulta no se completó. Estado: "+code,result:{error:code},status:"error",duration:Date.now()-started});
  return NextResponse.json({error:code,memory},{status:response.status,headers:response.headers});
}
