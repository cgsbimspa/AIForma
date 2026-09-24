import { z } from "zod";
import { scopeSchema } from "../autodesk/data.ts";
import { quantitySpecialties } from "./catalog.ts";

const text = z.string().min(1).max(2000);
const date = z.string().datetime({ offset: true });
export const specialtyCode = z.string().refine(code => quantitySpecialties.some(s => s.code === code));
export const projectScope = scopeSchema.options[1];
export type QuantityProject = z.infer<typeof projectScope>;
export const modelVersionSchema = z.object({
  id: text, number: z.number().int().positive(), name: text, createdAt: date.nullable(),
  modelId: text.nullable(), webUrl: z.string().url().nullable(), endpoint: z.string().url(), fetchedAt: date,
});
export type ModelVersion = z.infer<typeof modelVersionSchema>;
export const modelViewSchema = z.object({ id: text, name: text, role: z.enum(["2d", "3d"]), endpoint: z.string().url(), fetchedAt: date });
export type ModelView = z.infer<typeof modelViewSchema>;
export const sourceSchema = z.object({
  scope: scopeSchema.options[3], projectName: text, fileName: text, path: z.string().min(1).max(12000),
  version: modelVersionSchema, view: modelViewSchema.nullable(), versionPolicy: z.literal("manual"),
});
export type QuantitySource = z.infer<typeof sourceSchema>;
export const templateVersionSchema = z.object({
  id: z.string().uuid(), templateId: z.string().uuid(), specialtyCode, name: text,
  version: z.number().int().positive(), configuration: z.record(z.unknown()).nullable(),
  createdAt: date, createdBy: text,
});
export type QuantityTemplateVersion = z.infer<typeof templateVersionSchema>;
export type QuantityTemplate = { id: string; specialtyCode: string; name: string; currentVersion: number; active: boolean };
export const configurationSchema = z.object({
  id: z.string().uuid(), specialtyCode, source: sourceSchema.nullable(), templateVersionId: z.string().uuid().nullable(),
  revision: z.number().int().nonnegative(), createdAt: date, updatedAt: date, updatedBy: text,
});
export type QuantityConfiguration = z.infer<typeof configurationSchema>;
export type QuantitySpecialty = { id: string; code: string; name: string; active: boolean; createdAt: string; updatedAt: string };
export const resultSchema = z.object({
  id: text, itemCode: text, itemName: text, description: z.string().max(4000),
  quantity: z.number().finite().nonnegative(), unit: text, elementCount: z.number().int().nonnegative(),
  elementIds: z.array(text), groupingData: z.record(z.string()),
  sourceMetadata: z.object({ endpoint: z.string().url(), fetchedAt: date, ruleId: text, ruleVersion: text }),
}).superRefine((value, ctx) => {
  if (new Set(value.elementIds).size !== value.elementIds.length || value.elementCount !== value.elementIds.length)
    ctx.addIssue({ code: "custom", message: "Element identifiers must uniquely support the count" });
  if (value.quantity !== 0 && value.elementCount === 0) ctx.addIssue({ code: "custom", message: "No elements support this quantity" });
});
export type QuantityResult = z.infer<typeof resultSchema>;
export const runSchema = z.object({
  id: z.string().uuid(), organizationId: text, projectId: text, specialtyCode, quantitySourceId: z.string().uuid(),
  source: sourceSchema, template: templateVersionSchema,
  status: z.literal("COMPLETED"), coverage: z.literal("complete"),
  engine: z.object({ name: text, version: text }), startedAt: date, completedAt: date, createdBy: text,
  results: z.array(resultSchema),
}).superRefine((run, ctx) => {
  if (!run.source.view || !run.template.configuration || !Object.keys(run.template.configuration).length ||
      run.template.specialtyCode !== run.specialtyCode || run.source.scope.hubId !== run.organizationId ||
      run.source.scope.projectId !== run.projectId || Date.parse(run.completedAt) < Date.parse(run.startedAt))
    ctx.addIssue({ code: "custom", message: "Incomplete run provenance" });
});
export type QuantityRun = z.infer<typeof runSchema>;
export type QuantityState = "NOT_CONFIGURED" | "READY" | "PROCESSING" | "CURRENT" | "STALE" | "ERROR";
export type ChangeType = "ADDED" | "REMOVED" | "INCREASED" | "DECREASED" | "UNCHANGED";
export type QuantityComparisonItem = {
  itemCode: string; itemName: string; unit: string; groupingData: Record<string, string>;
  previousQuantity: number | null; currentQuantity: number | null;
  absoluteDifference: number; percentageDifference: number | null; changeType: ChangeType;
};
export type QuantityComparison = {
  previousRunId: string; currentRunId: string; createdAt: string; templateChanged: boolean;
  warning: string | null; items: QuantityComparisonItem[]; summary: Record<ChangeType, number>;
  previous: QuantityRun; current: QuantityRun;
  // No cross-version element correspondence is inferred from dbIds or names.
  elements: { status: "NOT_CALCULATED"; addedElementIds: null; removedElementIds: null; modifiedElementIds: null; unchangedElementIds: null };
};
export type QuantityWorkspace = { configurations: QuantityConfiguration[]; templates: QuantityTemplateVersion[]; runs: QuantityRun[]; historyPartial: boolean };
export type ViewerBinding = { source: QuantitySource; onSelectElements?: (ids: string[]) => void; highlightedElementIds?: string[] };
