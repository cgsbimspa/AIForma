import { NextRequest, NextResponse } from "next/server";
import { ATTEMPT_TTL, begin, readConfig, trustedMutation } from "@/lib/autodesk/oauth";
import { privateHeaders, setCookie } from "@/lib/autodesk/http";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let config;
  try { config = readConfig(); } catch { return NextResponse.json({ error: "Conexión Autodesk no configurada." }, { status: 503, headers: privateHeaders }); }
  if (!trustedMutation(request, config)) return new NextResponse(null, { status: 403, headers: privateHeaders });
  const attempt = begin(config, Date.now(), request.nextUrl.searchParams.get("returnTo") === "/asistente" ? "/asistente" : "/");
  const response = NextResponse.redirect(attempt.url, { status: 303, headers: privateHeaders });
  setCookie(response, config, "attempt", attempt.cookie, ATTEMPT_TTL);
  setCookie(response, config, "session", "", 0);
  setCookie(response, config, "renewal", "", 0);
  return response;
}
