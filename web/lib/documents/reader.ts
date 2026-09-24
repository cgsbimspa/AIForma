import { createHash } from "node:crypto";
import { downloadDocument, type DocumentVersion } from "./download.ts";
import { parseDocument, type ParsedDocument } from "./parser.ts";

// Memory only, bounded per warm server instance. Callers MUST obtain itemTip live
// for this access token before reading. Never cache permissions or current tips.
class MemoryCache<T> {
  private entries = new Map<string, { value: T; size: number; until: number }>();
  private size = 0;
  private limit: number; private ttl: number; private now: () => number;
  constructor(limit: number, ttl: number, now: () => number) { this.limit = limit; this.ttl = ttl; this.now = now; }
  private remove(key: string) { const entry = this.entries.get(key); if (entry) { this.size -= entry.size; this.entries.delete(key); } }
  get(key: string): T | undefined {
    for (const [k, entry] of this.entries) if (entry.until <= this.now()) this.remove(k);
    const entry = this.entries.get(key);
    if (entry) { this.entries.delete(key); this.entries.set(key, entry); }
    return entry?.value;
  }
  set(key: string, value: T, size: number) {
    this.get(key); this.remove(key);
    if (size > this.limit) return;
    while (this.size + size > this.limit || this.entries.size >= 128) this.remove(this.entries.keys().next().value!);
    this.entries.set(key, { value, size, until: this.now() + this.ttl }); this.size += size;
  }
}
export function createDocumentReader(options: { fetcher?: typeof fetch; parser?: typeof parseDocument; ttl?: number; byteLimit?: number; textLimit?: number; now?: () => number } = {}) {
  const now = options.now ?? Date.now, ttl = options.ttl ?? 5 * 60_000;
  const bytes = new MemoryCache<Buffer>(options.byteLimit ?? 32 * 1024 * 1024, ttl, now);
  const text = new MemoryCache<ParsedDocument>(options.textLimit ?? 16 * 1024 * 1024, ttl, now);
  return async (token: string, version: DocumentVersion, startPage = 1, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    // Endpoint binds project/item; version+storage+name bind the actual parse input.
    const key = createHash("sha256").update(JSON.stringify([token, version.endpoint, version.id, version.storage, version.name])).digest("hex");
    const pageKey = `${key}:${startPage}`;
    const previous = text.get(pageKey);
    if (previous) return structuredClone(previous);
    let buffer = bytes.get(key);
    if (!buffer) {
      buffer = await downloadDocument(token, version, options.fetcher ?? fetch, signal);
      signal?.throwIfAborted(); bytes.set(key, buffer, buffer.length);
    }
    const parsed = await (options.parser ?? parseDocument)(buffer, version.name, signal, { startPage });
    signal?.throwIfAborted();
    if (parsed.status === "parsed" && !parsed.partial && !parsed.warnings?.length) text.set(pageKey, structuredClone(parsed), JSON.stringify(parsed).length * 2);
    return parsed;
  };
}
export const readDocument = createDocumentReader();
