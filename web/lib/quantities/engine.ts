import { DataError } from "../autodesk/data.ts";
import { runSchema, type ChangeType, type ModelVersion, type QuantityConfiguration, type QuantityComparison, type QuantityResult, type QuantityRun, type QuantityState, type QuantityTemplateVersion } from "./contracts.ts";

export function quantityState(config: QuantityConfiguration, template: QuantityTemplateVersion | undefined, run: QuantityRun | undefined, latest: ModelVersion | undefined): { state: QuantityState; reason: string } {
  if (!config.source || !config.source.view || !template) return { state: "NOT_CONFIGURED", reason: "Selecciona archivo RVT, versión, vista y plantilla." };
  if (!run) return { state: "READY", reason: template.configuration ? "Configuración completa. Cubicación no procesada." : "Configuración de fuente completa. Faltan las reglas de la plantilla para procesar." };
  if (!latest) return { state: "ERROR", reason: "No fue posible verificar la última versión en Autodesk. La ejecución histórica se conserva." };
  if (run.source.scope.itemId !== config.source.scope.itemId || run.source.version.id !== config.source.version.id || run.source.view?.id !== config.source.view.id || run.template.id !== config.templateVersionId)
    return { state: "READY", reason: "La configuración cambió; los resultados corresponden a la fuente histórica." };
  if (latest.id === run.source.version.id) return { state: "CURRENT", reason: "La versión cubicada coincide con la última publicación verificada." };
  if (latest.number > run.source.version.number) return { state: "STALE", reason: "Nueva versión disponible" };
  return { state: "ERROR", reason: "No se pudo establecer la vigencia de esta ejecución." };
}

// No specialty rules have been supplied. An implementation must be registered
// server-side with reviewed rules and a verified model adapter before executing.
export function processingBlocker(config: QuantityConfiguration, template?: QuantityTemplateVersion) {
  if (!config.source || !config.source.view || !template) return "Completa la selección de archivo, versión, vista y plantilla.";
  if (!template.configuration || !Object.keys(template.configuration).length) return "La plantilla no tiene reglas de cubicación definidas. No se calcularán cantidades hasta configurar y validar esas reglas.";
  return "El motor de extracción y cálculo de esta plantilla aún no está habilitado.";
}
export interface QuantityEngineAdapter {
  readonly name: string;
  readonly version: string;
  execute(input: { source: NonNullable<QuantityConfiguration["source"]>; template: QuantityTemplateVersion }): Promise<{ coverage: "complete"; results: QuantityResult[] }>;
}

const key = (row: QuantityResult) => JSON.stringify([row.itemCode, row.unit, Object.entries(row.groupingData).sort(([a], [b]) => a.localeCompare(b))]);
function rows(run: QuantityRun) {
  const result = new Map<string, QuantityResult>();
  for (const row of run.results) {
    const id = key(row);
    if (result.has(id)) throw new DataError("ambiguous_results", 422);
    result.set(id, row);
  }
  return result;
}
export function compareRuns(previousInput: QuantityRun, currentInput: QuantityRun, now = new Date().toISOString()): QuantityComparison {
  const previous = runSchema.parse(previousInput), current = runSchema.parse(currentInput);
  if (previous.id === current.id || previous.organizationId !== current.organizationId || previous.projectId !== current.projectId ||
      previous.specialtyCode !== current.specialtyCode || previous.source.scope.itemId !== current.source.scope.itemId ||
      previous.source.view?.id !== current.source.view?.id || previous.source.version.number > current.source.version.number)
    throw new DataError("incompatible_runs", 422);
  const before = rows(previous), after = rows(current);
  // Same partida/group with different units cannot be subtracted or silently converted.
  const priorUnits = new Map(previous.results.map(row => [key({ ...row, unit: "" }), row.unit]));
  for (const b of current.results) {
    const priorUnit = priorUnits.get(key({ ...b, unit: "" }));
    if (priorUnit !== undefined && priorUnit !== b.unit)
      throw new DataError("incompatible_units", 422);
  }
  const summary: QuantityComparison["summary"] = { ADDED: 0, REMOVED: 0, INCREASED: 0, DECREASED: 0, UNCHANGED: 0 };
  const items = [...new Set([...before.keys(), ...after.keys()])].map(id => {
    const a = before.get(id), b = after.get(id), row = b ?? a!;
    // Absence is zero ONLY in two validated, complete runs. Display keeps absence null.
    const difference = (b?.quantity ?? 0) - (a?.quantity ?? 0);
    const changeType: ChangeType = !a ? "ADDED" : !b ? "REMOVED" : difference > 0 ? "INCREASED" : difference < 0 ? "DECREASED" : "UNCHANGED";
    const percentage = a && a.quantity !== 0 ? difference / a.quantity * 100 : null;
    if (!Number.isFinite(difference) || percentage !== null && !Number.isFinite(percentage)) throw new DataError("numeric_overflow", 422);
    summary[changeType]++;
    return { itemCode: row.itemCode, itemName: row.itemName, unit: row.unit, groupingData: row.groupingData, previousQuantity: a?.quantity ?? null, currentQuantity: b?.quantity ?? null, absoluteDifference: difference, percentageDifference: percentage, changeType };
  });
  const templateChanged = previous.template.id !== current.template.id;
  return { previousRunId: previous.id, currentRunId: current.id, createdAt: now, templateChanged,
    warning: templateChanged ? "Las cubicaciones utilizaron diferentes versiones de plantilla. Las variaciones pueden deberse al modelo y a cambios de configuración." : null,
    items, summary, previous, current, elements: { status: "NOT_CALCULATED", addedElementIds: null, removedElementIds: null, modifiedElementIds: null, unchangedElementIds: null } };
}
