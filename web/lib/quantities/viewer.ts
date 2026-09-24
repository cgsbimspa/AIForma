import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { DataError } from "../autodesk/data.ts";

// Autodesk's published 7.119.0 CDN channel currently serves build 7.119.5.
export const viewerSdkVersion = "7.119.0";
const aad = Buffer.from("ai-forma-viewer-v1");
const grantSchema = z.object({
  owner: z.string(), urn: z.string().regex(/^[\w=-]+$/), viewId: z.string().min(1), geometryId: z.string().min(1).optional(),
  roots: z.array(z.string().min(1)).min(1).max(100), expiresAt: z.number(),
});
export type ViewerGrant = z.infer<typeof grantSchema>;
export const viewerOwner = (sessionId: string) => createHash("sha256").update(sessionId).digest("hex");

function geometryNodes(manifest: unknown): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  function walk(value: unknown, depth = 0) {
    if (!value || typeof value !== "object" || depth > 30) return;
    if (Array.isArray(value)) { value.forEach(v => walk(v, depth + 1)); return; }
    const node = value as Record<string, unknown>;
    if (node.type === "geometry") nodes.push(node);
    for (const value of Object.values(node)) if (typeof value === "object") walk(value, depth + 1);
  }
  walk(manifest); return nodes;
}
// Metadata (SVF2) and the SVF viewer may assign different derivative GUIDs.
// Only an explicit shared Revit viewableID establishes correspondence.
export function resolveViewerGeometry(viewId: string, viewerManifest: unknown, metadataManifest: unknown): string {
  const viewerNodes = geometryNodes(viewerManifest);
  const direct = viewerNodes.filter(n => n.guid === viewId);
  if (direct.length === 1) return viewId;
  const source = geometryNodes(metadataManifest).filter(n => n.guid === viewId);
  const ids = [...new Set(source.map(n => n.viewableID).filter(id => typeof id === "string" && id.length))];
  if (ids.length !== 1) throw new DataError("view_unavailable", 409);
  const matches = viewerNodes.filter(n => n.viewableID === ids[0] && source.some(s => s.role === n.role));
  if (matches.length !== 1 || typeof matches[0].guid !== "string") throw new DataError("view_unavailable", 409);
  return matches[0].guid;
}

// The manifest is fetched server-side from the already verified model version.
// Only resource namespaces actually present in this manifest are authorized.
export function manifestRoots(manifest: unknown): string[] {
  const roots = new Set<string>();
  function walk(value: unknown, depth = 0) {
    if (depth > 30 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(v => walk(v, depth + 1)); return; }
    for (const [key, item] of Object.entries(value)) {
      if (key === "urn" && typeof item === "string") {
        const match = /^(urn:adsk\.viewing:fs\.file:[\w=-]+\/)/.exec(item);
        if (match) roots.add(match[1]);
      } else if (typeof item === "object") walk(item, depth + 1);
    }
  }
  walk(manifest);
  if (!roots.size || roots.size > 100) throw new DataError("viewer_derivative_unavailable", 422);
  return [...roots];
}
export function packViewerGrant(value: ViewerGrant, key: Buffer): string {
  const data = grantSchema.parse(value), iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const ticket = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  if (ticket.length > 12000) throw new DataError("viewer_derivative_unavailable", 422);
  return ticket;
}
export function readViewerGrant(ticket: string, key: Buffer, sessionId: string, now = Date.now()): ViewerGrant {
  try {
    if (ticket.length > 12000 || !/^[\w-]+$/.test(ticket)) throw Error();
    const bytes = Buffer.from(ticket, "base64url"), decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(aad); decipher.setAuthTag(bytes.subarray(12, 28));
    const grant = grantSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()));
    if (grant.owner !== viewerOwner(sessionId) || grant.expiresAt <= now) throw Error();
    return grant;
  } catch { throw new DataError("viewer_expired", 401); }
}
export function viewerResource(grant: ViewerGrant, segments: string[], query: URLSearchParams) {
  // Next supplies decoded segments. Reject traversal, nested escapes and all
  // arbitrary hosts/endpoints before attaching the server's Autodesk token.
  const path = segments.join("/");
  if (path.length > 16000 || /[\\\x00-\x1f?#]/.test(path) || /%(?:2e|2f|5c|25)/i.test(path) || path.split("/").some(p => p === "." || p === "..")) throw new DataError("forbidden", 403);
  const match = /^derivativeservice\/v2\/(?:regions\/([a-z0-9-]{1,20})\/)?(manifest|derivatives|thumbnails|endpoints)\/(.+)$/.exec(path);
  if (!match) throw new DataError("forbidden", 403);
  const [, region, kind, resource] = match;
  if (kind === "derivatives" ? !grant.roots.some(root => resource.startsWith(root)) : resource !== grant.urn) throw new DataError("forbidden", 403);
  const url = new URL(`https://developer.api.autodesk.com/derivativeservice/v2/${region ? `regions/${region}/` : ""}${kind}/${encodeURIComponent(resource)}`);
  for (const key of ["guid", "role", "width", "height", "acmsession", "domain"]) {
    const value = query.get(key);
    if (value && value.length < 4096) url.searchParams.set(key, value);
  }
  return url;
}
