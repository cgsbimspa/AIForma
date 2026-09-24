import { NextRequest } from "next/server";
import { authorizeData, apiError } from "@/lib/autodesk/authorize";
import { DataError } from "@/lib/autodesk/data";
import { privateHeaders } from "@/lib/autodesk/http";
import { readViewerGrant, viewerResource } from "@/lib/quantities/viewer";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest, context: { params: Promise<{ ticket: string; path: string[] }> }) {
  try {
    const { config, session } = authorizeData(request), { ticket, path } = await context.params;
    const grant = readViewerGrant(ticket, config.key, session.id ?? session.accessToken);
    const url = viewerResource(grant, path, request.nextUrl.searchParams);
    const headers: Record<string, string> = { Authorization: `Bearer ${session.accessToken}` };
    const region = request.headers.get("region");
    if (region && /^[a-zA-Z0-9_-]{1,32}$/.test(region)) headers.Region = region;
    const range = request.headers.get("range");
    if (range && /^bytes=\d*-\d*$/.test(range) && range.length < 80) headers.Range = range;
    const upstream = await fetch(url, { headers, redirect: "error", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]) });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw new DataError(upstream.status === 401 ? "expired" : upstream.status === 403 ? "forbidden" : "viewer_resource_unavailable", [401, 403, 404, 429].includes(upstream.status) ? upstream.status : 502);
    }
    const responseHeaders = new Headers(privateHeaders);
    responseHeaders.set("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
    for (const key of ["content-range", "accept-ranges"]) { const value = upstream.headers.get(key); if (value) responseHeaders.set(key, value); }
    // Stream large SVF resources; fetch already decodes HTTP compression.
    // Never forward cookies, redirects, content-encoding or stale content-length.
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) { return apiError(error); }
}
