import { NextRequest } from "next/server";
import { authorizeData, apiError } from "@/lib/autodesk/authorize";
import { privateHeaders } from "@/lib/autodesk/http";
import { readViewerGrant, viewerSdkVersion } from "@/lib/quantities/viewer";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { config, session } = authorizeData(request);
    const ticket = request.nextUrl.searchParams.get("ticket") ?? "";
    const grant = readViewerGrant(ticket, config.key, session.id ?? session.accessToken);
    const bootstrap = JSON.stringify({ urn: grant.urn, viewId: grant.viewId, endpoint: `${config.origin}/api/quantities/viewer/${ticket}` }).replace(/</g, "\\u003c");
    const cdn = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${viewerSdkVersion}`;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vista BIM seleccionada</title><link rel="stylesheet" href="${cdn}/style.min.css"><style>html,body,#model{margin:0;width:100%;height:100%;overflow:hidden;background:#f6f9fd;font-family:Arial,sans-serif}#model{position:absolute;inset:0}#status{position:absolute;z-index:5;top:12px;left:12px;right:12px;background:#fffffff2;border:1px solid #d6e4f3;border-radius:7px;padding:12px;font-size:12px;color:#426486;pointer-events:none}#status.error{color:#933c30;background:#fff0ee}#status[hidden]{display:none}</style></head><body><div id="model"></div><div id="status" role="status">Cargando Autodesk Viewer…</div><script id="viewer-data" type="application/json">${bootstrap}</script><script src="${cdn}/viewer3D.min.js"></script><script src="/quantity-viewer.js"></script></body></html>`;
    return new Response(html, { headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'; object-src 'none'; base-uri 'none'" } });
  } catch (error) { return apiError(error); }
}
