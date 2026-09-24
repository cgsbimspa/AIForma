import { NextRequest, NextResponse } from "next/server";
import { AutodeskError, readConfig, RENEW_BEFORE_MS, seal, trustedMutation, unseal } from "@/lib/autodesk/oauth";
import { renewOnce } from "@/lib/autodesk/renewal";
import { cookieName, privateHeaders, setCookie } from "@/lib/autodesk/http";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let config;
  try { config = readConfig(); } catch { return NextResponse.json({ error: "not_configured" }, { status: 503, headers: privateHeaders }); }
  if (!trustedMutation(request, config)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: privateHeaders });
  const session = unseal(request.cookies.get(cookieName(config, "session"))?.value, config.key, "session");
  const renewal = unseal(request.cookies.get(cookieName(config, "renewal"))?.value, config.key, "renewal");
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && session && (session.expiresAt - Date.now() > RENEW_BEFORE_MS || !renewal)) {
    return NextResponse.json({ available: true }, { headers: privateHeaders });
  }
  if (!renewal || (session?.id && session.id !== renewal.id)) return NextResponse.json({ error: "expired" }, { status: 401, headers: privateHeaders });
  try {
    const next = await renewOnce(config, renewal);
    // Seal both before setting either cookie; never publish half a rotation.
    const access = seal(next.session, config.key), refresh = seal(next.renewal, config.key);
    const response = NextResponse.json({ available: true }, { headers: privateHeaders });
    setCookie(response, config, "session", access, Math.max(0, Math.floor((next.session.expiresAt - Date.now()) / 1000)));
    setCookie(response, config, "renewal", refresh, Math.max(0, Math.floor((next.renewal.expiresAt - Date.now()) / 1000)));
    return response;
  } catch (error) {
    const rejected = error instanceof AutodeskError && error.reason === "rejected";
    // A timeout/5xx must not remove a still recoverable session.
    const response = NextResponse.json({ error: rejected ? "expired" : "unavailable" }, { status: rejected ? 401 : 503, headers: privateHeaders });
    if (rejected) { setCookie(response, config, "session", "", 0); setCookie(response, config, "renewal", "", 0); }
    return response;
  }
}
