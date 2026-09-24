import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Adapted from Nexo AI's confidential APS Authorization Code flow.
// Read-only access to the signed-in user's Forma Data Management projects.
export const SCOPE = "user-profile:read data:read";
export const AUTHORIZE_URL = "https://developer.api.autodesk.com/authentication/v2/authorize";
export const TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
export const PROFILE_URL = "https://api.userprofile.autodesk.com/userinfo";
export const ATTEMPT_TTL = 600;
export const MAX_SESSION_SECONDS = 3600;

export type Config = { clientId: string; clientSecret: string; callbackUrl: string; key: Buffer; origin: string; secure: boolean };
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const clientId = env.APS_CLIENT_ID?.trim(), clientSecret = env.APS_CLIENT_SECRET?.trim();
  const secret = env.AUTODESK_SESSION_SECRET?.trim();
  if (!clientId || !clientSecret || !secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("NOT_CONFIGURED");
  const callback = new URL(env.APS_CALLBACK_URL ?? "");
  const local = callback.protocol === "http:" && ["localhost", "127.0.0.1"].includes(callback.hostname);
  if ((!local && callback.protocol !== "https:") || callback.username || callback.password || callback.search || callback.hash || callback.pathname !== "/api/autodesk/callback") throw new Error("NOT_CONFIGURED");
  if (env.VERCEL_ENV === "production" && callback.protocol !== "https:") throw new Error("NOT_CONFIGURED");
  return { clientId, clientSecret, callbackUrl: callback.href, key: Buffer.from(secret, "hex"), origin: callback.origin, secure: !local };
}

const attemptSchema = z.object({ kind: z.literal("attempt"), state: z.string().regex(/^[\w-]{43}$/), expiresAt: z.number().finite(), returnTo: z.enum(["/", "/asistente"]).default("/") });
const sessionSchema = z.object({ kind: z.literal("session"), accessToken: z.string().min(1).max(6000), expiresAt: z.number().finite(), scopes: z.array(z.string()).optional() });
export type Session = z.infer<typeof sessionSchema>;
type Payload = z.infer<typeof attemptSchema> | Session;

// Authenticated encryption: cookies are opaque to the browser and bound to their purpose.
export function seal(payload: Payload, key: Buffer): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("ai-forma-autodesk-v1"));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  if (value.length > 3800) throw new Error("SESSION_TOO_LARGE");
  return value;
}
export function unseal(value: string | undefined, key: Buffer, kind: "attempt", now?: number): z.infer<typeof attemptSchema> | null;
export function unseal(value: string | undefined, key: Buffer, kind: "session", now?: number): Session | null;
export function unseal(value: string | undefined, key: Buffer, kind: Payload["kind"], now = Date.now()): Payload | null {
  if (!value || value.length > 3800 || !/^[\w-]+$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from("ai-forma-autodesk-v1"));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
    const parsed = (kind === "attempt" ? attemptSchema : sessionSchema).safeParse(data);
    return parsed.success && parsed.data.expiresAt > now ? parsed.data : null;
  } catch { return null; }
}
export function begin(config: Config, now = Date.now(), returnTo: "/" | "/asistente" = "/") {
  const state = randomBytes(32).toString("base64url");
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.callbackUrl, scope: SCOPE, state }).toString();
  return { url: url.href, cookie: seal({ kind: "attempt", state, expiresAt: now + ATTEMPT_TTL * 1000, returnTo }, config.key) };
}
export function validState(cookie: string | undefined, state: string | null, config: Config): boolean {
  const pending = unseal(cookie, config.key, "attempt");
  return Boolean(pending && state && /^[\w-]{43}$/.test(state) && timingSafeEqual(Buffer.from(pending.state), Buffer.from(state)));
}
export function trustedMutation(request: Request, config: Config): boolean {
  return request.method === "POST" && request.headers.get("origin") === config.origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
export class AutodeskError extends Error {
  readonly reason: "rejected" | "unavailable" | "invalid_response";
  constructor(reason: "rejected" | "unavailable" | "invalid_response") { super(reason); this.reason = reason; }
}
async function requestJson(url: string, init: RequestInit, fetcher: typeof fetch): Promise<unknown> {
  try {
    const response = await fetcher(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new AutodeskError([400, 401, 403].includes(response.status) ? "rejected" : "unavailable");
    return await response.json();
  } catch (error) {
    if (error instanceof AutodeskError) throw error;
    throw new AutodeskError("unavailable");
  }
}
export async function exchange(config: Config, code: string, fetcher: typeof fetch = fetch): Promise<Session> {
  if (!code || code.length > 4096) throw new AutodeskError("rejected");
  const startedAt = Date.now();
  const result = await requestJson(TOKEN_URL, {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.callbackUrl }).toString(),
  }, fetcher);
  const parsed = z.object({ access_token: z.string().min(1).max(6000), token_type: z.string().regex(/^bearer$/i), expires_in: z.number().finite().positive(), scope: z.string().optional() }).safeParse(result);
  if (!parsed.success || (parsed.data.scope && !SCOPE.split(" ").every(scope => parsed.data.scope!.split(" ").includes(scope)))) throw new AutodeskError("invalid_response");
  // Do not persist refresh tokens. Reconnect after the short-lived APS token expires.
  return { kind: "session", accessToken: parsed.data.access_token, scopes: (parsed.data.scope ?? SCOPE).split(" "), expiresAt: startedAt + Math.min(parsed.data.expires_in, MAX_SESSION_SECONDS) * 1000 - 5000 };
}
export function hasDataAccess(session: Session) { return session.scopes?.includes("data:read") === true; }
export async function profile(accessToken: string, fetcher: typeof fetch = fetch) {
  const result = await requestJson(PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }, fetcher);
  const parsed = z.object({ sub: z.string().trim().min(1).max(256), name: z.string().trim().min(1).max(256) }).safeParse(result);
  if (!parsed.success) throw new AutodeskError("invalid_response");
  return { id: parsed.data.sub, name: parsed.data.name };
}
