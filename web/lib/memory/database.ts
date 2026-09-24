import postgres from "postgres";
import type { Actor } from "./domain.ts";
export type Query = (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
export type Transaction = <T>(actor: Actor, fn: (query: Query) => Promise<T>) => Promise<T>;
let connection: ReturnType<typeof postgres> | undefined;
export function memoryConfigured() { return Boolean(process.env.MEMORY_DATABASE_URL && /^[a-f0-9]{64}$/i.test(process.env.MEMORY_ENCRYPTION_KEY ?? "")); }
export function storageKey() {
  if (!memoryConfigured()) throw new Error("memory_not_configured");
  return Buffer.from(process.env.MEMORY_ENCRYPTION_KEY!,"hex");
}
function database() {
  if (!memoryConfigured()) throw new Error("memory_not_configured");
  if (!connection) connection=postgres(process.env.MEMORY_DATABASE_URL!, { max: 3, idle_timeout: 20, connect_timeout: 10, prepare: false, ssl: ["localhost","127.0.0.1"].includes(new URL(process.env.MEMORY_DATABASE_URL!).hostname) ? false : "verify-full", onnotice: () => {} });
  return connection;
}
export const transaction: Transaction = async (actor,fn) => {
  return await database().begin(async sql => {
    await sql.unsafe("SET LOCAL ROLE ai_forma_memory");
    await sql.unsafe("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[actor.organizationId,actor.projectId,actor.userId]);
    await sql.unsafe("SET LOCAL statement_timeout='10000ms'");
    const query: Query = async (text,values=[]) => [...await sql.unsafe(text,values as never[])];
    return fn(query);
  }) as Awaited<ReturnType<typeof fn>>;
};
// Separate least-privilege role and tables; quantity records have no chat TTL.
export const quantityTransaction: Transaction = async (actor, fn) => {
  return await database().begin(async sql => {
    await sql.unsafe("SET LOCAL ROLE ai_forma_quantities");
    await sql.unsafe("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)", [actor.organizationId, actor.projectId, actor.userId]);
    await sql.unsafe("SET LOCAL statement_timeout='10000ms'");
    return fn(async (text, values = []) => [...await sql.unsafe(text, values as never[])]);
  }) as Awaited<ReturnType<typeof fn>>;
};
export async function maintenance<T>(fn: (query:Query)=>Promise<T>):Promise<T> {
  return await database().begin(async sql=>{
    await sql.unsafe("SET LOCAL ROLE ai_forma_retention");
    await sql.unsafe("SET LOCAL statement_timeout='25000ms'");
    return fn(async(text,values=[])=>[...await sql.unsafe(text,values as never[])]);
  }) as T;
}
