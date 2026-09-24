import { z } from "zod";
import { scopeSchema } from "../autodesk/data.ts";

export const documentQuestionSchema = z.object({
  scope: scopeSchema.refine(s => s.kind === "file" || s.kind === "folder", "Selecciona un archivo o carpeta"),
  mode: z.enum(["ask", "summary", "extract"]),
  question: z.string().trim().min(1).max(2000),
}).strict();
export type DocumentMode = z.infer<typeof documentQuestionSchema>["mode"];
export type DocumentSource = { id: string; name: string; path: string; itemId: string; projectId: string; version?: number; versionId?: string; webUrl?: string; endpoint: string; fetchedAt: string; status: string; warnings?: string[] };
export type Passage = { id: string; documentId: string; location: string; method?: "ocr"; confidence?: number; text: string };
export type DocumentEvidence = { sources: DocumentSource[]; passages: Passage[]; partial: boolean; warnings: string[]; pending: number; scopePath: string };
export type Citation = { segmentId: string; quote: string; location: string; method?: "ocr"; confidence?: number; source: DocumentSource };
export type DocumentAnswer = {
  kind: "document_answer"; mode: DocumentMode; status: "answered" | "not_available" | "unsupported" | "unverified";
  blocks: { label: string; text: string; citations: Citation[] }[];
  sources: DocumentSource[]; partial: boolean; warnings: string[]; pending: number; scopePath: string;
};

export const draftSchema = z.object({
  status: z.enum(["answered", "not_available", "unsupported"]),
  blocks: z.array(z.object({ label: z.string().max(120), text: z.string().min(1).max(1400), citations: z.array(z.object({ segmentId: z.string(), quote: z.string().min(1).max(2400) }).strict()).min(1).max(4) }).strict()).max(12),
}).strict();
export const draftFormat = { type: "json_schema", name: "document_answer", strict: true, schema: {
  type: "object", properties: { status: { type: "string", enum: ["answered", "not_available", "unsupported"] }, blocks: { type: "array", maxItems: 12, items: { type: "object", properties: { label: { type: "string" }, text: { type: "string" }, citations: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", properties: { segmentId: { type: "string" }, quote: { type: "string" } }, required: ["segmentId", "quote"], additionalProperties: false } } }, required: ["label", "text", "citations"], additionalProperties: false } } }, required: ["status", "blocks"], additionalProperties: false,
} };
