// Credentials stay in HttpOnly cookies. Serialize rotations across tabs, then
// release the lock before long document requests so browsing remains responsive.
import { createSessionRefresh } from './session-refresh.ts';
const refresh = createSessionRefresh(async force => {
  const run = () => fetch(`/api/autodesk/refresh${force ? "?force=1" : ""}`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("ai-forma-autodesk-session", run);
  return run();
});
export async function autodeskStatus(signal?: AbortSignal) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
  const renewal = await refresh();
  if (renewal.status >= 500) throw new Error("unavailable");
  let response = await fetch("/api/autodesk/status", { cache: "no-store", signal });
  const data = await response.clone().json();
  if (data.error === "expired" && renewal.ok) {
    const retry = await refresh(true);
    if (retry.status >= 500) throw new Error("unavailable");
    response = await fetch("/api/autodesk/status", { cache: "no-store", signal });
  }
  if (!response.ok) throw new Error("unavailable");
  return response;
}
export async function autodeskFetch(url: string, init: RequestInit = {}) {
  init.signal?.throwIfAborted();
  const renewal = await refresh();
  if (!renewal.ok) return renewal;
  init.signal?.throwIfAborted();
  const response = await fetch(url, init);
  // Only retry an explicit authentication failure, never a timed-out AI request.
  if (response.status !== 401) return response;
  const retry = await refresh(true);
  if (!retry.ok) return retry;
  init.signal?.throwIfAborted();
  return fetch(url, init);
}
