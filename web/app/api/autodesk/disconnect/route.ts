import { NextRequest, NextResponse } from "next/server";
import { readConfig, trustedMutation } from "@/lib/autodesk/oauth";
import { home, privateHeaders, setCookie } from "@/lib/autodesk/http";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let config;
  try { config = readConfig(); } catch { return new NextResponse(null, { status: 503, headers: privateHeaders }); }
  if (!trustedMutation(request, config)) return new NextResponse(null, { status: 403, headers: privateHeaders });
  const response = home(config);
  setCookie(response, config, "session", "", 0);
  setCookie(response, config, "attempt", "", 0);
  return response;
}
