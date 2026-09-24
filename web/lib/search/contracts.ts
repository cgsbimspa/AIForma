import { z } from "zod";
import type { DataScope, DataQuery, Entry } from "../autodesk/data.ts";
export const termsSchema = z.array(z.array(z.string().trim().min(2).max(80)).min(1).max(6)).min(1).max(4);
export type SearchTerms = z.infer<typeof termsSchema>;
export type SearchMatch = { kind: "name" | "path" | "text"; location: string; excerpt?: string; page?: number; start?: number };
export type SearchHit = { key: string; id: string; name: string; type: "folders" | "items"; project: string; projectId: string; path: string; webUrl?: string; version?: number; versionId?: string; matches: SearchMatch[]; contentStatus?: string; endpoint: string; fetchedAt: string };
export type SearchStats = { folders: number; files: number; documentsRead: number; unread: number; matched: number; requests: number };
export type SearchIssue = { path: string; code: string };
export type SearchBatch = { kind: "search"; terms: SearchTerms; hits: SearchHit[]; issues: SearchIssue[]; warnings: string[]; stats: SearchStats; pending: number; cursor: string | null; done: boolean; startedAt: string };
export type ListingTask = { kind: "list"; query: DataQuery; path: string; project: string };
export type FileTask = { kind: "file"; hubId: string; projectId: string; project: string; entry: Entry; path: string; endpoint: string; fetchedAt: string; nameHit: boolean };
export type SearchState = { schema: 1; owner: string; expiresAt: number; scope: DataScope; terms: SearchTerms; queue: (ListingTask | FileTask)[]; seen: string[]; warnings: string[]; stats: SearchStats; startedAt: string };
export const normalizeText = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").replace(/[_\-\s]+/g, " ").trim();
export function matchesTerms(text: string, terms: SearchTerms) { const normalized = normalizeText(text); return terms.some(group => group.every(term => normalized.includes(normalizeText(term)))); }
