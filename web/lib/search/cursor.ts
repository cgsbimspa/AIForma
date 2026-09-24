import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { DataError } from "../autodesk/data.ts";
import type { SearchState } from "./contracts.ts";
const aad = Buffer.from("aiforma-document-search-v1");
export const ownerOf = (token: string) => createHash("sha256").update(token).digest("hex");
export function packCursor(state: SearchState, key: Buffer) {
  const bytes = Buffer.from(JSON.stringify(state));
  if (bytes.length > 4_000_000) throw new DataError("search_limit", 422);
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(deflateSync(bytes)), cipher.final()]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  if (value.length > 1_500_000) throw new DataError("search_limit", 422);
  return value;
}
export function unpackCursor(value: string, key: Buffer, token: string, now = Date.now()): SearchState {
  try {
    if (value.length > 1_500_000 || !/^[\w-]+$/.test(value)) throw new Error();
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12)); decipher.setAAD(aad); decipher.setAuthTag(bytes.subarray(12, 28));
    const state = JSON.parse(inflateSync(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]), { maxOutputLength: 4_000_000 }).toString()) as SearchState;
    if (state.schema !== 1 || state.owner !== ownerOf(token) || state.expiresAt <= now) throw new Error();
    return state;
  } catch { throw new DataError("search_expired", 409); }
}
