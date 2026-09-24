import { z } from "zod";
import type { DataScope, DataQuery, Entry } from "../autodesk/data.ts";
export const termsSchema = z.array(z.array(z.string().trim().min(2).max(80)).min(1).max(6)).min(1).max(4);
export type SearchStage = "folders" | "files" | "content";
export type SearchTerms = z.infer<typeof termsSchema>;
export type SearchMatch = { kind: "name" | "path" | "text"; location: string; excerpt?: string; page?: number; start?: number; method?: "ocr"; confidence?: number };
export type SearchHit = { throughPage?: number; totalPages?: number; nextPage?: number; matchesTruncated?: boolean; scope?: DataScope; key: string; id: string; name: string; type: "folders" | "items"; project: string; projectId: string; path: string; webUrl?: string; version?: number; versionId?: string; matches: SearchMatch[]; contentStatus?: string; endpoint: string; fetchedAt: string };
export type SearchStats = { folders: number; files: number; documentsRead: number; unread: number; matched: number; requests: number };
export type SearchIssue = { path: string; code: string };
export type PageProgress = { key: string; path: string; throughPage: number; totalPages: number; nextPage?: number; status: string };
export type SearchBatch = { kind: "search"; pageProgress?: PageProgress[]; stage: SearchStage; terms: SearchTerms; hits: SearchHit[]; issues: SearchIssue[]; warnings: string[]; stats: SearchStats; pending: number; cursor: string | null; done: boolean; startedAt: string };
export type ListingTask = { kind: "list"; folderIds?: string[]; query: DataQuery; path: string; project: string };
export type FileTask = { kind: "file"; startPage?: number; totalPages?: number; version?: { id: string; number?: number }; readCounted?: boolean; unreadCounted?: boolean; hadIssues?: boolean; folderIds?: string[]; hubId: string; projectId: string; project: string; entry: Entry; path: string; endpoint: string; fetchedAt: string; nameHit: boolean };
export type SearchState = { schema: 1; stage: SearchStage; owner: string; expiresAt: number; scope: DataScope; terms: SearchTerms; queue: (ListingTask | FileTask)[]; seen: string[]; warnings: string[]; stats: SearchStats; startedAt: string };
export const normalizeText = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").replace(/[_\-\s]+/g, " ").trim();
export function matchesTerms(text: string, terms: SearchTerms) {
  const normalized = normalizeText(text);
  return terms.some(group => group.every(term => {
    const value = normalizeText(term);
    // OC may be OC1, OC-001 or O.C.; never the middle of "documento" or "local".
    if (value === "oc") return /(?:^|[^\p{L}\p{N}])o\.?\s*c\.?(?=\d|[^\p{L}\p{N}]|$)/u.test(normalized);
    if (/^[a-z]{2,3}$/.test(value)) return new RegExp(`(?:^|[^\\p{L}\\p{N}])${value}(?=\\d|[^\\p{L}\\p{N}]|$)`, "u").test(normalized);
    return normalized.includes(value);
  }));
}
