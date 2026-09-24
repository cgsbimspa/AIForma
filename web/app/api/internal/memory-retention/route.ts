import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { cleanupExpired } from "@/lib/memory/store";
import { maintenance } from "@/lib/memory/database";
import { privateHeaders } from "@/lib/autodesk/http";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:NextRequest) {
 const secret=process.env.CRON_SECRET,provided=request.headers.get("authorization")??"";
 const expected=secret?`Bearer ${secret}`:"";
 if(!secret||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return NextResponse.json({error:"forbidden"},{status:403,headers:privateHeaders});
 try{return NextResponse.json(await maintenance(cleanupExpired),{headers:privateHeaders});}
 catch {console.warn("[memory] retention_failed");return NextResponse.json({error:"retention_failed"},{status:503,headers:privateHeaders});}
}
