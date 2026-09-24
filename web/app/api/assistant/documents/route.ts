import { NextRequest, NextResponse } from "next/server";
import { authorizeData } from "@/lib/autodesk/authorize";
import { DataError } from "@/lib/autodesk/data";
import { privateHeaders } from "@/lib/autodesk/http";
import { trustedMutation } from "@/lib/autodesk/oauth";
import { documentQuestionSchema } from "@/lib/assistant/document-contracts";
import { collectDocumentEvidence } from "@/lib/assistant/document-evidence";
import { answerDocuments } from "@/lib/assistant/document-answer";

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
    const reader = request.body?.getReader(); if (!reader) throw new DataError("invalid_query", 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 64000) { await reader.cancel(); throw new DataError("too_large", 413); } chunks.push(next.value); }
    let body; try { body = documentQuestionSchema.parse(JSON.parse(Buffer.concat(chunks).toString())); } catch { throw new DataError("invalid_query", 400); }
    pending={...body,prompt:body.question,tool:"document_answer",parameters:{scope:body.scope,mode:body.mode},action:body.mode};
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new DataError("ai_not_configured", 503);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(Math.min(270000, Math.max(1, session.expiresAt - Date.now())))]);
    const evidence = await collectDocumentEvidence(session.accessToken, body.scope, session.expiresAt, signal);
    const answer = await answerDocuments(evidence, body.question, body.mode, { key, model: process.env.OPENAI_MODEL || "gpt-5-mini" }, fetch, signal);
    if (session.expiresAt <= Date.now()) throw new DataError("expired", 401);
    const memory = await remember(request, body.scope, { ...body, prompt: body.question, response: answer.blocks.length ? answer.blocks.map(b=>b.label+": "+b.text).join("\n") : "No hay evidencia suficiente en los documentos leídos para responder.", tool: "document_answer", parameters: { scope: body.scope, mode: body.mode }, result: answer, status: answer.partial || answer.status!=="answered" ? "partial" : "success", action: body.mode, duration: Date.now()-started });
    return NextResponse.json({ ...answer, memory }, { headers: privateHeaders });
  } catch (error) { return rememberFailure(request,error,pending,started); }
}
