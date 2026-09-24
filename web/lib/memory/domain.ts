import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
export const HISTORY_DAYS = 5;
export const historyRequestSchema = z.object({ conversationId: z.string().uuid().optional(), interactionId: z.string().uuid().optional() });
export type Actor = { organizationId: string; projectId: string; userId: string };
export const scopeKey = (scope: unknown) => createHash("sha256").update(JSON.stringify(scope)).digest("hex");
export const preferenceValues = {
  preferred_grouping: ["level", "discipline", "document"], preferred_export_format: ["xlsx", "csv", "pdf"],
  preferred_model_version: ["latest"], preferred_result_density: ["brief", "detailed"],
  preferred_language_style: ["plain", "technical"], preferred_view_mode: ["table", "list"], frequent_module: ["assistant"],
} as const;
export type PreferenceKey = keyof typeof preferenceValues;
export type Signal = { key: PreferenceKey; value: string };
export function behavioralSignals(prompt: string): Signal[] {
  // Deliberately conservative: whole explicit commands, never quoted document text,
  // negations, LLM inferences, quantities, tolerances or parameter equivalences.
  const text = prompt.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase().replace(/[.!]$/, "");
  const rules: [RegExp, PreferenceKey, string][] = [
    [/^(?:ordena|ordenalo|agrupa|agrupalo|muestra|muestralo) por nivel$/, "preferred_grouping", "level"],
    [/^(?:agrupa|agrupalo) por disciplina$/, "preferred_grouping", "discipline"],
    [/^(?:usa|utiliza|trabajemos con) la ultima version$/, "preferred_model_version", "latest"],
    [/^(?:exporta|exportalo) (?:a|en) (?:excel|xlsx)$/, "preferred_export_format", "xlsx"],
    [/^(?:exporta|exportalo) (?:a|en) csv$/, "preferred_export_format", "csv"],
    [/^(?:muestra|muestralo) en tabla$/, "preferred_view_mode", "table"],
    [/^(?:responde|responder) de forma breve$/, "preferred_result_density", "brief"],
  ];
  return rules.filter(([pattern]) => pattern.test(text)).map(([,key,value]) => ({ key, value }));
}
export function preferenceConfidence(observations: number, total: number) {
  if (observations < 1 || total < observations) return 0;
  return Math.min(1, observations / total) * Math.min(1, total / 20);
}
export const knowledgeSchema = z.object({
  knowledge_type: z.enum(["level_mapping","parameter_mapping","reference_model","technical_tolerance","active_rule"]),
  value: z.record(z.unknown()).refine(v => JSON.stringify(v).length<=16000),
  model_id: z.string().min(1).max(512).nullable().default(null), document_id: z.string().min(1).max(512).nullable().default(null),
  source_version: z.string().min(1).max(1024).nullable().default(null),
}).strict().refine(v => !(v.model_id || v.document_id) || Boolean(v.source_version), "Version required");
export type KnowledgeStatus = "DETECTED" | "SUGGESTED" | "VALIDATED" | "REJECTED" | "OBSOLETE";
export function transitionAllowed(from: KnowledgeStatus, to: KnowledgeStatus) {
  return ({ DETECTED: ["SUGGESTED","REJECTED"], SUGGESTED: ["VALIDATED","REJECTED"], VALIDATED: ["OBSOLETE"], REJECTED: [], OBSOLETE: [] } as Record<KnowledgeStatus,KnowledgeStatus[]>)[from].includes(to);
}
export function reusableKnowledge(record: { status: string; source_version?: string | null; valid_from?: string | null; valid_until?: string | null }, evidenceCount: number, currentVersion?: string, now=Date.now()) {
  return record.status==="VALIDATED" && evidenceCount>0 && (!record.valid_from || Date.parse(record.valid_from)<=now) && (!record.valid_until || Date.parse(record.valid_until)>now) && (!record.source_version || record.source_version===currentVersion);
}
// Separate storage key; never use OAuth tokens as encryption keys.
export function encryptHistory(value: unknown, key: Buffer, binding: string) {
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(binding));
  return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString("base64");
}
export function decryptHistory(value: string, key: Buffer, binding: string): unknown {
  const bytes=Buffer.from(value,"base64"),decipher=createDecipheriv("aes-256-gcm",key,bytes.subarray(0,12));
  decipher.setAAD(Buffer.from(binding));decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString());
}
