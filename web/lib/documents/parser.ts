import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { z } from "zod";
import { DataError } from "../autodesk/data.ts";
export const parsedSchema = z.object({ status: z.enum(["parsed", "ocr_required", "no_text"]), nextPage: z.number().int().positive().optional(), pageStart: z.number().int().positive().optional(), pageEnd: z.number().int().nonnegative().optional(), partial: z.boolean().optional(), warnings: z.array(z.string()).optional(), pages: z.number().int().positive().optional(), textlessPages: z.number().int().nonnegative(), segments: z.array(z.object({ text: z.string().max(2000000), location: z.string(), page: z.number().optional(), paragraph: z.number().optional(), line: z.number().optional(), sheet: z.string().optional(), row: z.number().optional(), slide: z.number().optional(), method: z.literal("ocr").optional(), confidence: z.number().min(0).max(100).optional() })).max(20000) });
export type ParsedDocument = z.infer<typeof parsedSchema>;
export async function parseDocument(bytes: Buffer, name: string, signal?: AbortSignal, options: { startPage?: number; detail?: "plan" } = {}): Promise<ParsedDocument> {
  signal?.throwIfAborted();
  const startPage = options.startPage ?? 1;
  if (!Number.isInteger(startPage) || startPage < 1 || startPage > 1000) throw new DataError("invalid_query", 400);
  const directory = await mkdtemp(join(tmpdir(), "aiforma-doc-"));
  if (!/^aiforma-doc-[^/\\]+$/.test(relative(resolve(tmpdir()), resolve(directory)))) throw new DataError("parse_failed");
  try {
    const file = join(directory, "document"); await writeFile(file, bytes, { mode: 0o600 });
    return await new Promise((accept, reject) => {
      const child = spawn(process.execPath, ["--max-old-space-size=512", resolve("worker/document-worker.mjs"), file, name, String(startPage), options.detail ?? "standard"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
      let output = "", diagnostic = "", settled = false;
      child.stderr.on("data", chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-3000); });
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
      const fail = (code: string) => { if (settled) return; settled = true; child.kill(); cleanup(); reject(new DataError(code, 422)); };
      const abort = () => fail("parse_cancelled"), timer = setTimeout(() => fail("parse_timeout"), 145_000);
      signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
      child.stdout.on("data", chunk => { output += chunk.toString(); if (output.length > 12_000_000) fail("parse_limit"); });
      child.on("error", () => fail("parse_failed"));
      child.on("exit", code => { if (settled) return; if (code !== 0) { console.warn("[document-parser]", code, diagnostic); return fail("parse_failed"); } try { const result = parsedSchema.parse(JSON.parse(output)); settled = true; cleanup(); accept(result); } catch { fail("parse_failed"); } });
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
