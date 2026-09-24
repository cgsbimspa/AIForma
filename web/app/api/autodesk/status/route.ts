import { NextRequest, NextResponse } from "next/server";
import { AutodeskError, hasDataAccess, profile, readConfig, unseal } from "@/lib/autodesk/oauth";
import { cookieName, privateHeaders } from "@/lib/autodesk/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  let config;
  try { config = readConfig(); } catch { return NextResponse.json({ connected: false, configured: false }, { headers: privateHeaders }); }
  const cookie = request.cookies.get(cookieName(config, "session"))?.value;
  const session = unseal(cookie, config.key, "session");
  if (!session) {
    const response = NextResponse.json({ connected: false, configured: true }, { headers: privateHeaders });
    return response;
  }
  try {
    const user = await profile(session.accessToken);
    if (session.expiresAt <= Date.now()) throw new AutodeskError("rejected");
    return NextResponse.json({ connected: true, configured: true, user, dataAccess: hasDataAccess(session), aiConfigured: Boolean(process.env.OPENAI_API_KEY), expiresAt: session.expiresAt, verifiedAt: Date.now() }, { headers: privateHeaders });
  } catch (error) {
    const rejected = error instanceof AutodeskError && error.reason === "rejected";
    const response = NextResponse.json({ connected: false, configured: true, error: rejected ? "expired" : "unavailable" }, { status: rejected ? 200 : 503, headers: privateHeaders });
    return response;
  }
}
