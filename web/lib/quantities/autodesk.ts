import { z } from "zod";
import { DataError, get, nextPage, officialWebUrl, verifyLocation, type DataScope } from "../autodesk/data.ts";
import type { ModelVersion, ModelView, QuantitySource } from "./contracts.ts";

const base = "https://developer.api.autodesk.com";
const enc = encodeURIComponent;
const version = z.object({
  id: z.string().min(1).max(2000), type: z.literal("versions"),
  attributes: z.object({ name: z.string().min(1), versionNumber: z.number().int().positive(), createTime: z.string().optional() }),
  relationships: z.object({
    item: z.object({ data: z.object({ id: z.string(), type: z.literal("items") }) }),
    derivatives: z.object({ data: z.object({ id: z.string().regex(/^[A-Za-z0-9_=-]+$/), type: z.literal("derivatives") }).nullable().optional() }).optional(),
  }),
  links: z.object({ webView: z.object({ href: z.string() }).optional() }).optional(),
});
function mapped(raw: z.infer<typeof version>, itemId: string, endpoint: string): ModelVersion {
  if (raw.relationships.item.data.id !== itemId || !/\.rvt$/i.test(raw.attributes.name)) throw new DataError("invalid_model", 422);
  const created = raw.attributes.createTime;
  if (created && !Number.isFinite(Date.parse(created))) throw new DataError("invalid_response");
  return { id: raw.id, number: raw.attributes.versionNumber, name: raw.attributes.name,
    createdAt: created ? new Date(created).toISOString() : null, modelId: raw.relationships.derivatives?.data?.id ?? null,
    webUrl: officialWebUrl(raw.links?.webView?.href) ?? null, endpoint, fetchedAt: new Date().toISOString() };
}
export async function modelVersions(token: string, scope: Extract<DataScope, { kind: "file" }>, page = 0, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
  const location = await verifyLocation(token, scope, fetcher, signal);
  if (!/\.rvt$/i.test(location.entry.name)) throw new DataError("invalid_model", 422);
  const url = new URL(`${base}/data/v1/projects/${enc(scope.projectId)}/items/${enc(scope.itemId)}/versions`);
  url.searchParams.set("page[number]", String(page)); url.searchParams.set("page[limit]", "100");
  const raw = z.object({ data: z.array(version), links: z.object({ next: z.union([z.object({ href: z.string().url() }), z.string().url()]).nullish() }).optional() }).parse(await get(token, url, fetcher, signal));
  const link = raw.links?.next;
  const latest = await modelVersion(token, scope, undefined, fetcher, signal);
  return { versions: raw.data.map(v => mapped(v, scope.itemId, url.href)), latest,
    nextPage: nextPage(typeof link === "string" ? link : link?.href, url, page),
    fileName: location.entry.name, path: location.path, projectName: location.project.name };
}
export async function modelVersion(token: string, scope: Extract<DataScope, { kind: "file" }>, versionId?: string, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
  const path = versionId ? `versions/${enc(versionId)}` : `items/${enc(scope.itemId)}/tip`;
  const endpoint = `${base}/data/v1/projects/${enc(scope.projectId)}/${path}`;
  const raw = z.object({ data: version }).parse(await get(token, new URL(endpoint), fetcher, signal));
  const result = mapped(raw.data, scope.itemId, endpoint);
  if (versionId && result.id !== versionId) throw new DataError("invalid_response");
  return result;
}
export async function modelViews(token: string, version: ModelVersion, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<{ views: ModelView[]; unavailable: boolean }> {
  if (!version.modelId) return { views: [], unavailable: true };
  const endpoint = `${base}/modelderivative/v2/designdata/${enc(version.modelId)}/metadata`;
  const raw = z.object({ data: z.object({ type: z.literal("metadata"), metadata: z.array(z.object({ guid: z.string().min(1), name: z.string().min(1), role: z.enum(["2d", "3d"]) })) }) }).parse(await get(token, new URL(endpoint), fetcher, signal));
  const fetchedAt = new Date().toISOString();
  return { views: raw.data.metadata.map(view => ({ id: view.guid, name: view.name, role: view.role, endpoint, fetchedAt })), unavailable: false };
}
export async function verifiedSource(token: string, scope: Extract<DataScope, { kind: "file" }>, versionId: string, viewId: string | null, signal?: AbortSignal): Promise<QuantitySource> {
  const location = await verifyLocation(token, scope, fetch, signal);
  const version = await modelVersion(token, scope, versionId, fetch, signal);
  const view = viewId ? (await modelViews(token, version, fetch, signal)).views.find(v => v.id === viewId) : null;
  if (viewId && !view) throw new DataError("view_unavailable", 409);
  return { scope, projectName: location.project.name, fileName: location.entry.name, path: location.path, version, view: view ?? null, versionPolicy: "manual" };
}
