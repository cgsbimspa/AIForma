import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeData, apiError } from "@/lib/autodesk/authorize";
import { DataError, get, scopeSchema, verifyLocation } from "@/lib/autodesk/data";
import { privateHeaders } from "@/lib/autodesk/http";
import { trustedMutation } from "@/lib/autodesk/oauth";
import { memoryActor, memoryInput } from "@/lib/memory/server";
import { memoryConfigured, quantityTransaction, storageKey } from "@/lib/memory/database";
import { projectScope, specialtyCode } from "@/lib/quantities/contracts";
import { createQuantityStore } from "@/lib/quantities/store";
import { modelVersion, modelVersions, modelViews, verifiedSource } from "@/lib/quantities/autodesk";
import { compareRuns, processingBlocker } from "@/lib/quantities/engine";
import { manifestRoots, packViewerGrant, viewerOwner, resolveViewerGeometry } from "@/lib/quantities/viewer";
import { settingsSchema } from '@/lib/quantities-v2/contracts';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const fileScope = scopeSchema.options[3];
const sourceInput = z.object({ scope: fileScope, versionId: z.string().min(1).max(2000), viewId: z.string().min(1).max(2000).nullable() }).strict();
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare-templates") }).strict(),
  z.object({ action: z.literal("add"), specialtyCode }).strict(),
  z.object({ action: z.literal("save"), id: z.string().uuid(), revision: z.number().int().nonnegative(), source: sourceInput.nullable(), templateVersionId: z.string().uuid().nullable(), calculationSettings:settingsSchema.optional() }).strict(),
  z.object({ action: z.literal("template"), configurationId: z.string().uuid(), name: z.string().trim().min(1).max(200), templateId: z.string().uuid().optional() }).strict(),
  z.object({ action: z.literal("versions"), file: fileScope, page: z.number().int().min(0).max(10000).default(0) }).strict(),
  z.object({ action: z.literal("views"), file: fileScope, versionId: z.string().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("viewer"), file: fileScope, versionId: z.string().min(1).max(2000), viewId: z.string().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("latest"), configurationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("process"), configurationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("compare"), previousRunId: z.string().uuid(), currentRunId: z.string().uuid() }).strict(),
]);
const schema = z.object({ scope: projectScope, command: action }).strict();
const store = () => {
  if (!memoryConfigured()) throw new DataError("quantity_storage_unavailable", 503);
  return createQuantityStore(quantityTransaction, storageKey());
};
const response = (data: unknown) => NextResponse.json(data, { headers: privateHeaders });
export async function GET(request: NextRequest) {
  try {
    let scope; try { scope = projectScope.parse(JSON.parse(request.nextUrl.searchParams.get("scope") ?? "null")); } catch { throw new DataError("invalid_query", 400); }
    const actor = await memoryActor(request, scope);
    return response(await store().workspace(actor));
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { config, session } = authorizeData(request);
    if (!trustedMutation(request, config)) throw new DataError("forbidden", 403);
    const parsed = schema.safeParse(await memoryInput(request));
    if (!parsed.success) throw new DataError("invalid_query", 400);
    const { scope, command } = parsed.data;
    const actor = await memoryActor(request, scope);
    const token = session.accessToken;
    const selectedFile = "file" in command ? command.file : command.action === "save" ? command.source?.scope : null;
    if (selectedFile && (selectedFile.hubId !== scope.hubId || selectedFile.projectId !== scope.projectId)) throw new DataError("out_of_scope", 403);
    if (command.action === "versions") return response(await modelVersions(token, command.file, command.page, fetch, request.signal));
    if (command.action === "viewer") {
      const source = await verifiedSource(token, command.file, command.versionId, command.viewId, request.signal);
      if (!source.version.modelId || !source.view) throw new DataError("viewer_derivative_unavailable", 422);
      const urn = source.version.modelId;
      const manifest = await get(token, new URL(`https://developer.api.autodesk.com/derivativeservice/v2/manifest/${encodeURIComponent(urn)}`), fetch, request.signal);
      const metadataManifest = await get(token, new URL(`https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodeURIComponent(urn)}/manifest`), fetch, request.signal);
      const geometryId = resolveViewerGeometry(source.view.id, manifest, metadataManifest);
      const ticket = packViewerGrant({ owner: viewerOwner(session.id ?? token), urn, viewId: source.view.id, geometryId, roots: manifestRoots(manifest), expiresAt: Date.now() + 60 * 60_000 }, config.key);
      return response({ frameUrl: `/api/quantities/viewer-frame?ticket=${ticket}`, versionId: source.version.id, viewId: source.view.id });
    }
    if (command.action === "views") {
      await verifyLocation(token, command.file, fetch, request.signal);
      const version = await modelVersion(token, command.file, command.versionId, fetch, request.signal);
      return response(await modelViews(token, version, fetch, request.signal));
    }
    const db = store();
    if (command.action === "prepare-templates") {
      await db.prepareTemplates(actor);
      return response(await db.workspace(actor));
    }
    if (command.action === "add") return response(await db.add(actor, command.specialtyCode));
    if (command.action === "template") return response(await db.template(actor, command));
    if (command.action === "save") {
      const source = command.source ? await verifiedSource(token, command.source.scope, command.source.versionId, command.source.viewId, request.signal) : null;
      return response(await db.save(actor, { ...command, source }));
    }
    const workspace = await db.workspace(actor);
    if (command.action === "compare") {
      const previous = workspace.runs.find(r => r.id === command.previousRunId), current = workspace.runs.find(r => r.id === command.currentRunId);
      if (!previous || !current) throw new DataError("no_previous_run", 422);
      return response(compareRuns(previous, current));
    }
    const configuration = workspace.configurations.find(c => c.id === command.configurationId);
    if (!configuration) throw new DataError("not_found", 404);
    if (command.action === "latest") {
      if (!configuration.source) throw new DataError("source_not_configured", 422);
      await verifyLocation(token, configuration.source.scope, fetch, request.signal);
      return response({ latest: await modelVersion(token, configuration.source.scope, undefined, fetch, request.signal) });
    }
    // Guard exists on the server, not only on the disabled UI button.
    const reason = processingBlocker(configuration, workspace.templates.find(t => t.id === configuration.templateVersionId));
    return NextResponse.json({ error: "quantity_rules_required", message: reason }, { status: 422, headers: privateHeaders });
  } catch (error) { return apiError(error); }
}
