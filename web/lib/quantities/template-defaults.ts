import { quantityMetrics } from "./presentation.ts";

// Product structure supplied by the user. This does not define Revit parameters
// or calculation rules and must never be passed off as a verified engine.
export const structureTemplateDefinition = {
  code: "structure-base" as const,
  version: 1 as const,
  metrics: quantityMetrics.map(({ key, name, unit }) => ({ key, name, unit })),
  groupings: ["Subespecialidad", "Nombre de Tipo", "Piso"],
};
