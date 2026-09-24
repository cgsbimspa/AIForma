"use client";

import { useEffect, useState } from "react";
import { autodeskStatus } from "@/lib/autodesk/client";
import { LogIn, LogOut } from "lucide-react";

type Status = { connected: boolean; configured: boolean; user?: { name: string }; expiresAt?: number; error?: string };
const messages: Record<string, string> = {
  cancelled: "La autorización fue cancelada. Puedes volver a conectar.",
  invalid_state: "La solicitud de conexión venció o no corresponde a este navegador. Intenta nuevamente.",
  connection_failed: "No se pudo completar la conexión con Autodesk. Intenta nuevamente.",
  expired: "Tu sesión venció. Vuelve a conectar Autodesk.",
  unavailable: "No se pudo verificar la conexión con Autodesk. Vuelve a intentarlo.",
};

export function AutodeskConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    let disposed = false, inFlight = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const url = new URL(window.location.href);
    const error = url.searchParams.get("autodesk_error");
    if (error) {
      queueMicrotask(() => { if (!disposed) setNotice(messages[error] ?? messages.connection_failed); });
      url.searchParams.delete("autodesk_error");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    async function check() {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        const response = await autodeskStatus(AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]));
        const data: Status = await response.json();
        if (disposed) return;
        if (response.ok && data.connected === true && data.user?.name && data.expiresAt && data.expiresAt > Date.now()) {
          setStatus(data); setNotice("");
          clearTimeout(expiry);
          expiry = setTimeout(() => { void check(); }, Math.max(30_000, data.expiresAt - Date.now() - 300_000));
        } else {
          setStatus({ connected: false, configured: data.configured === true });
          if (data.error) setNotice(messages[data.error] ?? messages.unavailable);
          else if (data.configured === false) setNotice("La conexión con Autodesk aún no está configurada.");
        }
      } catch {
        if (!disposed) { setStatus(previous => ({ ...(previous ?? { connected: false, configured: true }), error: "unavailable" })); setNotice("Conexión por verificar. Reintentando automáticamente; tu sesión se conserva."); }
      } finally { inFlight = false; }
    }
    const onFocus = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    const interval = setInterval(onFocus, 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const onPageShow = () => { setSubmitting(false); void check(); };
    window.addEventListener("pageshow", onPageShow);
    return () => { disposed = true; controller.abort(); clearInterval(interval); clearTimeout(expiry); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("pageshow", onPageShow); };
  }, []);

  return <div className="autodesk-connection">
    <div className={`connection-state ${status?.connected && !status.error ? "is-connected" : ""}`} role="status" aria-live="polite">
      <span className={status?.connected && !status.error ? "connected-dot" : "disconnected-dot"} aria-hidden="true"/>
      <span>{status?.error === "unavailable" ? "Conexión por verificar" : status?.connected ? <>Conectado con usuario <strong>{status.user?.name}</strong></> : "Autodesk sin conectar"}</span>
    </div>
    <form method="post" action={status?.connected ? "/api/autodesk/disconnect" : "/api/autodesk/connect"} onSubmit={() => setSubmitting(true)}>
      <button className={`autodesk-button ${status?.connected ? "disconnect" : ""}`} disabled={!status || !status.configured || submitting}>
        {status?.connected ? <LogOut size={16} aria-hidden="true"/> : <LogIn size={16} aria-hidden="true"/>}
        {submitting ? status?.connected ? "Desconectando…" : "Conectando…" : status?.connected ? "Desconectar" : "Conectar Autodesk"}
      </button>
    </form>
    {notice && <p className="connection-notice" role="alert">{notice}</p>}
  </div>;
}
