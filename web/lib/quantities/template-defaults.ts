import { quantityMetrics } from "./presentation.ts";

// Product structure supplied by the user. This does not define Revit parameters
// or calculation rules and must never be passed off as a verified engine.
export const structureTemplateDefinition = {
  code: "structure-base" as const,
  version: 1 as const,
  metrics: quantityMetrics.map(({ key, name, unit }) => ({ key, name, unit })),
  groupings: ["Subespecialidad", "Nombre de Tipo", "Piso"],
};
export const mepTemplateDefinition = {
  code: "mep-base" as const, version: 1 as const,
  metrics: [{key:"length",name:"Largo",unit:"ml"},{key:"count",name:"Cantidad",unit:"un"},{key:"surface",name:"Superficie de ductos",unit:"m²"}],
  groupings: ["Especialidad", "Piso", "Sistema", "Categoría Revit", "Familia", "Tipo", "Material", "Dimensión"],
};
