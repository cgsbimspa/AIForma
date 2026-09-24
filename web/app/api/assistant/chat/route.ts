import { NextRequest, NextResponse } from "next/server";
import { authorizeData } from "@/lib/autodesk/authorize";
import { DataError } from "@/lib/autodesk/data";
import { privateHeaders } from "@/lib/autodesk/http";
import { trustedMutation } from "@/lib/autodesk/oauth";
import { chatSchema, runChat } from "@/lib/assistant/chat";
import { planSearch } from "@/lib/search/plan";

import { remember, rememberFailure, type PendingCapture } from "@/lib/memory/server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const started = Date.now();
  let pending:PendingCapture|undefined;
  try {
    const { config, session } = authorizeData(request);
    if (!trustedMutation(request, config)) throw new DataError("forbidden", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new DataError("invalid_query", 400);
    // Read with a byte limit, even for chunked requests lacking Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new DataError("invalid_query", 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 64_000) { await reader.cancel(); throw new DataError("too_large", 413); } chunks.push(value); }
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new DataError("invalid_query", 400); }
    const body = chatSchema.safeParse(raw);
    if (!body.success) throw new DataError("invalid_query", 400);
    pending={...body.data,prompt:body.data.messages.at(-1)!.content,tool:"plan_search",parameters:{scope:body.data.scope},action:"search"};
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new DataError("ai_not_configured", 503);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(Math.min(270_000, Math.max(1, session.expiresAt - Date.now())))]);
    const plan = await planSearch(body.data.messages, key, process.env.OPENAI_MODEL || "gpt-5-mini", signal);
    if (plan.mode === "search") {
      const result = { kind: "search", terms: plan.terms };
      const memory = await remember(request, body.data.scope, { ...body.data, prompt: body.data.messages.at(-1)!.content, response: "Búsqueda preparada: " + plan.terms.map(t=>t.join(" + ")).join(" / "), tool: "plan_search", parameters: { scope: body.data.scope }, result, status: "success", action: "search", duration: Date.now()-started });
      return NextResponse.json({ ...result, memory }, { headers: privateHeaders });
    }
    pending={...pending,tool:"browse",action:"browse"};
    const answer = await runChat(session.accessToken, body.data, { key, model: process.env.OPENAI_MODEL || "gpt-5-mini" }, fetch, signal);
    if (session.expiresAt <= Date.now()) throw new DataError("expired", 401);
    const memory = await remember(request, body.data.scope, { ...body.data, prompt: body.data.messages.at(-1)!.content, response: answer.text, tool: "browse", parameters: { scope: body.data.scope }, result: answer, status: "success", action: "browse", duration: Date.now()-started });
    return NextResponse.json({ ...answer, memory }, { headers: privateHeaders });
  } catch (error) { return rememberFailure(request,error,pending,started); }
}
