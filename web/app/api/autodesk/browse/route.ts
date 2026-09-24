import { NextRequest, NextResponse } from "next/server";
import { authorizeData, apiError } from "@/lib/autodesk/authorize";
import { browse, DataError, querySchema } from "@/lib/autodesk/data";
import { privateHeaders } from "@/lib/autodesk/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { session } = authorizeData(request);
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = querySchema.safeParse({ ...params, page: params.page === undefined ? 0 : Number(params.page) });
    if (!query.success) throw new DataError("invalid_query", 400);
    const result = await browse(session.accessToken, query.data, { kind: "all" }, fetch, request.signal);
    if (session.expiresAt <= Date.now()) throw new DataError("expired", 401);
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) { return apiError(error); }
}
