import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeData, apiError } from "@/lib/autodesk/authorize";
import { DataError, scopeSchema } from "@/lib/autodesk/data";
import { privateHeaders } from "@/lib/autodesk/http";
import { trustedMutation } from "@/lib/autodesk/oauth";
import { advanceSearch, startSearch } from "@/lib/search/engine";
import { ownerOf, packCursor, unpackCursor } from "@/lib/search/cursor";
import { termsSchema } from "@/lib/search/contracts";
export const runtime = "nodejs";
export const maxDuration = 120;
const schema = z.object({ scope: scopeSchema, stage: z.enum(["folders", "files", "content"]).default("folders"), terms: termsSchema, cursor: z.string().max(1_500_000).nullable() }).strict();
export async function POST(request: NextRequest) {
  try {
    const { config, session } = authorizeData(request);
    if (!trustedMutation(request, config)) throw new DataError("forbidden", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new DataError("invalid_query", 400);
    const reader = request.body?.getReader(); if (!reader) throw new DataError("invalid_query", 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 1_600_000) { await reader.cancel(); throw new DataError("too_large", 413); } chunks.push(next.value); }
    let value; try { value = schema.parse(JSON.parse(Buffer.concat(chunks).toString())); } catch { throw new DataError("invalid_query", 400); }
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(Math.min(100_000, Math.max(1, session.expiresAt - Date.now())))]);
    const state = value.cursor ? unpackCursor(value.cursor, config.key, session.id ?? session.accessToken) : await startSearch(session.accessToken, value.scope, value.terms, Date.now() + 3_600_000, fetch, signal, value.stage);
    if (!value.cursor) state.owner = ownerOf(session.id ?? session.accessToken);
    if (state.stage !== value.stage) throw new DataError("out_of_scope", 403);
    if (JSON.stringify(state.scope) !== JSON.stringify(value.scope) || JSON.stringify(state.terms) !== JSON.stringify(value.terms)) throw new DataError("out_of_scope", 403);
    const result = await advanceSearch(state, session.accessToken, signal);
    if (session.expiresAt <= Date.now()) throw new DataError("expired", 401);
    let cursor: string | null = null;
    if (!result.done) { try { cursor = packCursor(state, config.key); } catch { result.warnings.push("search_limit"); } }
    return NextResponse.json({ kind: "search", ...result, cursor }, { headers: privateHeaders });
  } catch (error) { return apiError(error); }
}
