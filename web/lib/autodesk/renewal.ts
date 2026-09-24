import { createHash } from "node:crypto";
import { renew, type Config, type Renewal } from "./oauth.ts";

// Same-process deduplication complements the browser's cross-tab Web Lock.
// Only encrypted cookies persist credentials; this bounded cache lasts one minute.
const pending = new Map<string, { until: number; promise: ReturnType<typeof renew> }>();
export function renewOnce(config: Config, renewal: Renewal, fetcher: typeof fetch = fetch) {
  const now = Date.now();
  for (const [key, entry] of pending) if (entry.until <= now) pending.delete(key);
  const key = createHash("sha256").update(config.clientId + renewal.refreshToken).digest("hex");
  const existing = pending.get(key);
  if (existing) return existing.promise;
  if (pending.size >= 100) pending.delete(pending.keys().next().value!);
  const promise = renew(config, renewal, fetcher);
  pending.set(key, { until: now + 60_000, promise });
  void promise.catch(() => pending.delete(key));
  return promise;
}
