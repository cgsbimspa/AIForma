"use client";
import { useState } from "react";
import { FileBarChart2, History, GitCompareArrows, ExternalLink } from "lucide-react";
import { quantityCommand } from "@/lib/quantities/client";
import type { QuantityComparison, QuantityProject, QuantityRun } from "@/lib/quantities/contracts";
const date = (value: string | null) => value ? new Date(value).toLocaleString("es-CL") : "Fecha no disponible";
const amount = (value: number | null) => value === null ? "No aplicable" : new Intl.NumberFormat("es-CL", { maximumFractionDigits: 12 }).format(value);
const changes = { ADDED: "Nueva", REMOVED: "Eliminada", INCREASED: "Aumentada", DECREASED: "Disminuida", UNCHANGED: "Sin cambios" };

export function QuantityResults({ project, runs, partial }: { project: QuantityProject; runs: QuantityRun[]; partial: boolean }) {
  const [tab, setTab] = useState("results");
  const [selected, setSelected] = useState(runs[0]?.id ?? "");
  const [previous, setPrevious] = useState(runs[1]?.id ?? "");
  const [current, setCurrent] = useState(runs[0]?.id ?? "");
  const [comparison, setComparison] = useState<QuantityComparison | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = runs.find(r => r.id === selected);
  async function compare() {
    setBusy(true); setError(""); setComparison(null);
    try { setComparison(await quantityCommand<QuantityComparison>(project, { action: "compare", previousRunId: previous, currentRunId: current })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="quantity-results quantity-panel" aria-label="Resultados de cubicación">
    <div className="quantity-panel-heading"><FileBarChart2 size={19}/><h2>Cubicación</h2></div>
    <div className="quantity-tabs">{[["results", "Resultados"], ["history", "Historial"], ["compare", "Comparar"]].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    <div className="quantity-panel-body">
      {partial && <p className="quantity-warning">Se muestran las 500 ejecuciones más recientes del proyecto. El historial anterior se conserva en la base de datos.</p>}
      {tab === "results" && (!run ? <div className="quantity-empty"><FileBarChart2 size={32}/><h3>Cubicación no procesada</h3><p>Los resultados aparecerán cuando se ejecute una plantilla con reglas definidas sobre una fuente BIM verificada.</p><span>Sin datos de modelo y reglas, no hay cantidades.</span></div> : <>
        <p className="quantity-help">Resultado histórico · V{run.source.version.number} · {date(run.completedAt)}</p>
        <h3>{run.template.name} · v{run.template.version}</h3>
        <p className="quantity-help">{run.source.fileName} / {run.source.view?.name}</p>
        <div className="quantity-table-wrap"><table><thead><tr><th>Código / Partida</th><th>Cantidad</th><th>Unidad</th><th>Elementos</th></tr></thead><tbody>{run.results.map(row => <tr key={row.id}><td><strong>{row.itemCode}</strong><br/>{row.itemName}<small>{row.description}</small><details><summary>Trazabilidad</summary><p>Regla: {row.sourceMetadata.ruleId} · {row.sourceMetadata.ruleVersion}</p><p>Elementos: {row.elementIds.join(", ") || "Sin elementos"}</p><p>{row.sourceMetadata.endpoint}</p></details></td><td>{amount(row.quantity)}</td><td>{row.unit}</td><td>{row.elementCount}</td></tr>)}</tbody></table></div>
        <details className="quantity-provenance"><summary>Fuente y ejecución</summary><p>Proyecto: {run.source.projectName}</p><p>Archivo: {run.source.path}</p><p>Versión: {run.source.version.id}</p><p>Vista: {run.source.view?.id}</p><p>Plantilla: {run.template.id}</p><p>Motor: {run.engine.name} · {run.engine.version}</p><p>Ejecución: {run.id}</p>{run.source.version.webUrl && <a target="_blank" rel="noopener noreferrer" href={run.source.version.webUrl}>Abrir versión en Autodesk <ExternalLink size={12}/></a>}</details>
      </>)}
      {tab === "history" && <><h3 className="quantity-icon-title"><History size={17}/>Historial de cubicaciones</h3>{!runs.length ? <p>No hay ejecuciones guardadas para esta especialidad.</p> : runs.map(r => <button className="quantity-history-row" key={r.id} onClick={() => { setSelected(r.id); setTab("results"); }}><strong>V{r.source.version.number}</strong><span>{date(r.completedAt)}<small>{r.template.name} · v{r.template.version}</small></span><span>Ver</span></button>)}<p className="quantity-help">Cada ejecución conserva su fuente, versión, vista y plantilla. Actualizar no elimina ejecuciones anteriores.</p></>}
      {tab === "compare" && <><h3 className="quantity-icon-title"><GitCompareArrows size={17}/>Comparar versiones</h3><p className="quantity-help">Selecciona dos ejecuciones del mismo archivo y vista.</p><label htmlFor="quantity-previous">Ejecución anterior</label><select id="quantity-previous" value={previous} onChange={e => { setPrevious(e.target.value); setComparison(null); }}><option value="">Seleccionar</option>{runs.map(r => <option value={r.id} key={r.id}>V{r.source.version.number} · {date(r.completedAt)}</option>)}</select><label htmlFor="quantity-current">Ejecución actual</label><select id="quantity-current" value={current} onChange={e => { setCurrent(e.target.value); setComparison(null); }}><option value="">Seleccionar</option>{runs.map(r => <option value={r.id} key={r.id}>V{r.source.version.number} · {date(r.completedAt)}</option>)}</select><button className="quantity-primary" disabled={!previous || !current || previous === current || busy} onClick={() => void compare()}>{busy ? "Comparando…" : "Comparar versiones"}</button>{runs.length < 2 && <p className="quantity-help">Se necesitan al menos dos cubicaciones procesadas. No hay comparación sin una ejecución anterior.</p>}
        {error && <p role="alert" className="quantity-error">{error}</p>}{comparison && <><h3>Informe de diferencias</h3>{comparison.warning && <p className="quantity-warning">{comparison.warning}</p>}<p>{comparison.current.source.projectName} / {comparison.current.source.fileName}</p><p className="quantity-help">Vista: {comparison.current.source.view?.name}<br/>V{comparison.previous.source.version.number} ({date(comparison.previous.source.version.createdAt)}) → V{comparison.current.source.version.number} ({date(comparison.current.source.version.createdAt)})<br/>{comparison.previous.template.name} v{comparison.previous.template.version} → {comparison.current.template.name} v{comparison.current.template.version}<br/>Cubicaciones: {date(comparison.previous.completedAt)} → {date(comparison.current.completedAt)}</p><div className="quantity-change-summary">{Object.entries(comparison.summary).map(([kind, count]) => <span key={kind}>{changes[kind as keyof typeof changes]}: <strong>{count}</strong></span>)}</div><div className="quantity-table-wrap"><table><thead><tr><th>Partida</th><th>Anterior</th><th>Actual</th><th>Variación</th><th>%</th><th>Cambio</th></tr></thead><tbody>{comparison.items.map((row, i) => <tr key={i}><td>{row.itemCode}<br/>{row.itemName} ({row.unit})</td><td>{row.previousQuantity === null ? "Ausente" : amount(row.previousQuantity)}</td><td>{row.currentQuantity === null ? "Ausente" : amount(row.currentQuantity)}</td><td>{amount(row.absoluteDifference)}</td><td>{amount(row.percentageDifference)}</td><td>{changes[row.changeType]}</td></tr>)}</tbody></table></div><p className="quantity-help">El porcentaje no aplica cuando la cantidad anterior es cero o la partida no existía. Comparación de elementos: no calculada.</p><details className="quantity-provenance"><summary>Ejecuciones comparadas</summary><p>{comparison.previousRunId} → {comparison.currentRunId}</p><p>Informe: {date(comparison.createdAt)}</p></details></>}
      </>}
    </div>
  </section>;
}
