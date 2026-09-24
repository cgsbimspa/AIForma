import { NextRequest,NextResponse } from "next/server";
import { apiError,authorizeData } from "@/lib/autodesk/authorize";
import { DataError,scopeSchema } from "@/lib/autodesk/data";
import { trustedMutation } from "@/lib/autodesk/oauth";
import { privateHeaders } from "@/lib/autodesk/http";
import { memoryActor,memoryStore } from "@/lib/memory/server";
export const runtime="nodejs";
export async function GET(request:NextRequest) {
 try {
  const scope=scopeSchema.parse(JSON.parse(request.nextUrl.searchParams.get("scope")??"null"));
  const values=await memoryStore().preferences(await memoryActor(request,scope));
  return NextResponse.json({preferences:values.map(v=>({...v,active:Number(v.observations)>=5,technicalAuthority:false}))},{headers:privateHeaders});
 }catch(error){return apiError(error);}
}
export async function POST(request:NextRequest) {
 try {
  const {config}=authorizeData(request);if(!trustedMutation(request,config))throw new DataError("forbidden",403);
  const scope=scopeSchema.parse(JSON.parse(request.nextUrl.searchParams.get("scope")??"null"));
  await memoryStore().resetPreferences(await memoryActor(request,scope));
  return NextResponse.json({reset:true},{headers:privateHeaders});
 }catch(error){return apiError(error);}
}
