import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { hasDataAccess, readConfig, unseal } from "./oauth";
import { cookieName, privateHeaders } from "./http";
import { DataError } from "./data";

export function authorizeData(request: NextRequest) {
  let config;
  try { config = readConfig(); } catch { throw new DataError("not_configured", 503); }
  const session = unseal(request.cookies.get(cookieName(config, "session"))?.value, config.key, "session");
  if (!session) throw new DataError("expired", 401);
  if (!hasDataAccess(session)) throw new DataError("consent_required", 403);
  return { config, session };
}
export function apiError(error: unknown) {
  const code = error instanceof DataError ? error.code : "unavailable";
  // Only stable codes are logged; provider responses, tokens and project names are excluded.
  console.warn("[forma]", code);
  return NextResponse.json({ error: code }, { status: error instanceof DataError ? error.status : 502, headers: privateHeaders });
}
