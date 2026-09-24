import { z } from "zod";

const id = z.string().min(1).max(512).refine(value => !/[\x00-\x1f/\\?#]/.test(value) && value !== "." && value !== "..", "Identificador inválido");
export const scopeSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("all") }).strict(), z.object({ kind: z.literal("project"), hubId: id, projectId: id }).strict()]);
export type DataScope = z.infer<typeof scopeSchema>;
export const querySchema = z.object({ operation: z.enum(["hubs", "projects", "roots", "contents"]), hubId: id.nullable().default(null), projectId: id.nullable().default(null), folderId: id.nullable().default(null), page: z.number().int().min(0).max(10000).default(0) }).strict();
export type DataQuery = z.infer<typeof querySchema>;
export type Entry = { id: string; name: string; type: "hubs" | "projects" | "folders" | "items" };
export type Evidence = { endpoint: string; fetchedAt: string; projectId: string | null; page: number; returnedCount: number; nextPage: number | null; partial: boolean };
export type DataPage = { entries: Entry[]; evidence: Evidence };
export class DataError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, status = 502) { super(code); this.code = code; this.status = status; }
}
const entrySchema = z.object({ id, type: z.enum(["hubs", "projects", "folders", "items"]), attributes: z.object({ name: z.string().min(1).max(2000).optional(), displayName: z.string().min(1).max(2000).optional() }) });
const pageSchema = z.object({ data: z.array(entrySchema).max(2000), links: z.object({ next: z.union([z.object({ href: z.string().url() }), z.string().url()]).nullish() }).optional(), meta: z.object({ warnings: z.array(z.unknown()).optional() }).optional() });
const base = "https://developer.api.autodesk.com";
const enc = encodeURIComponent;

// Validate pagination; never follow a provider-supplied URL with the bearer token.
export function nextPage(href: string | undefined, endpoint: URL, page: number): number | null {
  if (!href) return null;
  const next = new URL(href);
  if (next.origin !== base || next.username || next.password || next.hash || decodeURIComponent(next.pathname) !== decodeURIComponent(endpoint.pathname)) throw new DataError("invalid_response");
  if ([...next.searchParams.keys()].some(k => !["page[number]", "page[limit]"].includes(k))) throw new DataError("invalid_response");
  const numbers = next.searchParams.getAll("page[number]"), limits = next.searchParams.getAll("page[limit]");
  if (numbers.length !== 1 || !/^\d+$/.test(numbers[0]) || Number(numbers[0]) !== page + 1 || Number(numbers[0]) > 10000 || limits.length > 1 || (limits.length === 1 && limits[0] !== "100")) throw new DataError("invalid_response");
  return Number(numbers[0]);
}
async function get(token: string, url: URL, fetcher: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  try {
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
    if (!response.ok) throw new DataError(response.status === 401 ? "expired" : response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : response.status === 429 ? "rate_limited" : "unavailable", [401,403,404,429].includes(response.status) ? response.status : 502);
    return await response.json();
  } catch (error) { if (error instanceof DataError) throw error; throw new DataError("unavailable"); }
}
export async function verifyProject(token: string, hubId: string, projectId: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<Entry> {
  id.parse(hubId); id.parse(projectId);
  const raw = await get(token, new URL(`${base}/project/v1/hubs/${enc(hubId)}/projects/${enc(projectId)}`), fetcher, signal);
  const parsed = z.object({ data: entrySchema }).safeParse(raw);
  if (!parsed.success || parsed.data.data.type !== "projects" || parsed.data.data.id !== projectId || !parsed.data.data.attributes.name) throw new DataError("invalid_response");
  return { id: projectId, type: "projects", name: parsed.data.data.attributes.name };
}
export async function browse(token: string, input: DataQuery, scope: DataScope = { kind: "all" }, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<DataPage> {
  const q = querySchema.parse(input);
  // Enforce the selected project on the server, independently of model arguments.
  if (scope.kind === "project" && (q.operation === "hubs" || q.operation === "projects" || q.hubId !== scope.hubId || q.projectId !== scope.projectId)) throw new DataError("out_of_scope", 403);
  if (q.operation !== "hubs" && !q.hubId || ["roots", "contents"].includes(q.operation) && !q.projectId || q.operation === "contents" && !q.folderId) throw new DataError("invalid_query", 400);
  if (["hubs", "roots"].includes(q.operation) && q.page !== 0) throw new DataError("invalid_query", 400);
  const path = q.operation === "hubs" ? "/project/v1/hubs" : q.operation === "projects" ? `/project/v1/hubs/${enc(q.hubId!)}/projects` : q.operation === "roots" ? `/project/v1/hubs/${enc(q.hubId!)}/projects/${enc(q.projectId!)}/topFolders` : `/data/v1/projects/${enc(q.projectId!)}/folders/${enc(q.folderId!)}/contents`;
  const url = new URL(path, base);
  if (["projects", "contents"].includes(q.operation)) { url.searchParams.set("page[number]", String(q.page)); url.searchParams.set("page[limit]", "100"); }
  if (q.operation === "roots") url.searchParams.set("excludeDeleted", "true");
  const raw = await get(token, url, fetcher, signal), parsed = pageSchema.safeParse(raw);
  if (!parsed.success) throw new DataError("invalid_response");
  const data = parsed.data, next = data.links?.next, href = typeof next === "string" ? next : next?.href;
  if (href && ["hubs", "roots"].includes(q.operation)) throw new DataError("invalid_response");
  const following = nextPage(href, url, q.page);
  const expected = q.operation === "hubs" ? ["hubs"] : q.operation === "projects" ? ["projects"] : q.operation === "roots" ? ["folders"] : ["folders", "items"];
  const entries: Entry[] = data.data.map(row => {
    const name = row.type === "items" ? row.attributes.displayName ?? row.attributes.name : row.attributes.name ?? row.attributes.displayName;
    if (!name || !expected.includes(row.type)) throw new DataError("invalid_response");
    return { id: row.id, type: row.type, name };
  });
  return { entries, evidence: { endpoint: url.href, fetchedAt: new Date().toISOString(), projectId: q.projectId, page: q.page, returnedCount: entries.length, nextPage: following, partial: Boolean(data.meta?.warnings?.length) } };
}
