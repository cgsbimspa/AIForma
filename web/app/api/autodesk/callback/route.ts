import { NextRequest, NextResponse } from "next/server";
import { exchange, profile, readConfig, seal, unseal, validState } from "@/lib/autodesk/oauth";
import { cookieName, home, privateHeaders, setCookie } from "@/lib/autodesk/http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let config;
  try { config = readConfig(); } catch { return NextResponse.json({ error: "Conexión Autodesk no configurada." }, { status: 503, headers: privateHeaders }); }
  const query = request.nextUrl.searchParams;
  const pending = unseal(request.cookies.get(cookieName(config, "attempt"))?.value, config.key, "attempt");
  const finish = (error?: string) => {
    const response = home(config, error, pending?.returnTo);
    setCookie(response, config, "attempt", "", 0);
    if (error) setCookie(response, config, "session", "", 0);
    return response;
  };
  if (!validState(request.cookies.get(cookieName(config, "attempt"))?.value, query.get("state"), config)) return finish("invalid_state");
  if (query.has("error")) return finish("cancelled");
  try {
    const session = await exchange(config, query.get("code") ?? "");
    await profile(session.accessToken);
    const response = finish();
    setCookie(response, config, "session", seal(session, config.key), Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)));
    return response;
  } catch { return finish("connection_failed"); }
}
