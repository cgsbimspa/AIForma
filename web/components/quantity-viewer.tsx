"use client";
import { useEffect, useRef, useState } from "react";
import { Box, ExternalLink, RefreshCw } from "lucide-react";
import { quantityCommand } from "@/lib/quantities/client";
import type { QuantityProject, QuantitySource } from "@/lib/quantities/contracts";

export function QuantityViewer({ project, source }: { project: QuantityProject; source: QuantitySource | null }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const [status, setStatus] = useState(""), [error, setError] = useState("");
  const selection = source?.view ? `${source.scope.projectId}:${source.scope.itemId}:${source.version.id}:${source.view.id}` : "";
  useEffect(() => {
    if (!source?.view || !source.version.modelId) return;
    const controller = new AbortController();
    const selectedSource = source;
    async function load() {
      setStatus("Verificando acceso a la versión y vista seleccionadas…"); setError(""); setLoaded(null);
      try {
        const result = await quantityCommand<{ frameUrl: string; versionId: string; viewId: string }>(project, { action: "viewer", file: selectedSource.scope, versionId: selectedSource.version.id, viewId: selectedSource.view!.id }, controller.signal);
        if (controller.signal.aborted) return;
        if (result.versionId !== selectedSource.version.id || result.viewId !== selectedSource.view!.id || !result.frameUrl.startsWith("/api/quantities/viewer-frame?ticket=")) throw Error("La fuente del visor no coincide con la selección.");
        setLoaded({ key: selection, url: result.frameUrl }); setStatus("Cargando modelo BIM…");
      } catch (e) { if (!controller.signal.aborted) { setError((e as Error).message); setStatus(""); } }
    }
    void load();
    return () => controller.abort();
  }, [project, source, selection, retry]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== "aiforma-viewer" || event.data?.viewId !== source?.view?.id || event.data?.urn !== source?.version.modelId) return;
      if (event.data.state === "ready") { setStatus("Vista seleccionada cargada"); setError(""); }
      else if (event.data.state === "error") { setError(String(event.data.message)); setStatus(""); }
      else if (event.data.state === "loading") setStatus(String(event.data.message));
    }
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [source?.view?.id, source?.version.modelId]);
  const canLoad = Boolean(source?.view && source.version.modelId);
  return <div className="quantity-live-viewer">
    {canLoad && loaded?.key === selection ? <iframe ref={frame} src={loaded.url} title={`Modelo ${source!.fileName} · V${source!.version.number} · ${source!.view!.name}`} allow="fullscreen" allowFullScreen/> : <div className="quantity-viewer-empty"><div><Box size={46} strokeWidth={1}/></div><h3>{canLoad ? "Cargando modelo BIM" : "Modelo BIM no cargado"}</h3><p>{!source ? "Selecciona un archivo RVT y su versión." : !source.view ? "Selecciona la vista publicada que quieres visualizar." : !source.version.modelId ? "Autodesk no tiene un modelo derivado disponible para esta versión." : status}</p></div>}
    <div className="quantity-viewer-controls">{error ? <p className="quantity-error" role="alert">{error}</p> : canLoad && <p className="quantity-help" role="status">{status}</p>}<div className="quantity-inline-actions">{canLoad && <button className="quantity-text-button" onClick={() => setRetry(n => n + 1)}><RefreshCw size={13}/>Volver a cargar modelo</button>}{source?.version.webUrl && <a className="quantity-text-button" href={source.version.webUrl} target="_blank" rel="noopener noreferrer">Abrir versión en Autodesk <ExternalLink size={13}/></a>}</div></div>
  </div>;
}
