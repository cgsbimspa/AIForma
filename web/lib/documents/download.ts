import { z } from "zod";
import { DataError, get, officialWebUrl } from "../autodesk/data.ts";

export const documentByteLimit = 25 * 1024 * 1024;
export const supportedDocument = /\.(pdf|docx|xlsx|txt|csv|md)$/i;
export const versionSchema = z.object({ data: z.object({ id: z.string().min(1).max(1024), type: z.literal("versions"), attributes: z.object({ name: z.string().min(1), versionNumber: z.number().int().positive(), storageSize: z.number().nonnegative().optional() }), relationships: z.object({ item: z.object({ data: z.object({ id: z.string(), type: z.literal("items") }) }), storage: z.object({ data: z.object({ id: z.string() }) }).optional() }), links: z.object({ webView: z.object({ href: z.string() }).optional() }).optional() }) });
export type DocumentVersion = { id: string; number: number; name: string; webUrl?: string; storage?: string; size?: number; endpoint: string; fetchedAt: string };
export async function itemTip(token: string, project: string, item: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<DocumentVersion> {
  const endpoint = `https://developer.api.autodesk.com/data/v1/projects/${encodeURIComponent(project)}/items/${encodeURIComponent(item)}/tip`;
  const parsed = versionSchema.safeParse(await get(token, new URL(endpoint), fetcher, signal));
  if (!parsed.success || parsed.data.data.relationships.item.data.id !== item) throw new DataError("invalid_response");
  const v = parsed.data.data;
  return { id: v.id, number: v.attributes.versionNumber, name: v.attributes.name, webUrl: officialWebUrl(v.links?.webView?.href), storage: v.relationships.storage?.data.id, size: v.attributes.storageSize, endpoint, fetchedAt: new Date().toISOString() };
}
export async function downloadDocument(token: string, version: DocumentVersion, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
  if (!supportedDocument.test(version.name)) throw new DataError("unsupported_document", 422);
  if ((version.size ?? 0) > documentByteLimit) throw new DataError("document_too_large", 422);
  const storage = /^urn:adsk.objects:os.object:([A-Za-z0-9_.-]+)\/(.+)$/.exec(version.storage ?? "");
  if (!storage) throw new DataError("storage_unavailable", 422);
  const endpoint = new URL(`https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(storage[1])}/objects/${encodeURIComponent(storage[2])}/signeds3download?minutesExpiration=2`);
  const signed = z.object({ status: z.literal("complete"), url: z.string().url() }).safeParse(await get(token, endpoint, fetcher, signal));
  if (!signed.success) throw new DataError("storage_unavailable", 422);
  const url = new URL(signed.data.url);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !/(?:^|\.)s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname)) throw new DataError("invalid_response");
  // No bearer on S3, no redirects, no signed URL in client results or logs.
  const response = await fetcher(url, { cache: "no-store", redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000) });
  if (!response.ok) { await response.body?.cancel(); throw new DataError("download_failed"); }
  if (Number(response.headers.get("content-length")) > documentByteLimit) { await response.body?.cancel(); throw new DataError("document_too_large", 422); }
  if (!response.body) throw new DataError("download_failed");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > documentByteLimit) { await reader.cancel(); throw new DataError("document_too_large", 422); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
