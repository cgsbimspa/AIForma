import "server-only";
import { NextResponse } from "next/server";
import type { Config } from "./oauth";

export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
export const cookieName = (config: Config, kind: "session" | "attempt") => `${config.secure ? "__Host-" : ""}ai-forma-aps-${kind}`;
export function setCookie(response: NextResponse, config: Config, kind: "session" | "attempt", value: string, maxAge: number) {
  response.cookies.set(cookieName(config, kind), value, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge });
}
export function home(config: Config, error?: string, returnTo: "/" | "/asistente" = "/") {
  const url = new URL(returnTo, config.origin);
  if (error) url.searchParams.set("autodesk_error", error);
  return NextResponse.redirect(url, { status: 303, headers: privateHeaders });
}
