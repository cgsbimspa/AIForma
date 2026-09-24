import type { SearchHit, SearchMatch } from "./contracts.ts";

// Results from page batches belong to the same verified Autodesk version.
// A later batch updates coverage without erasing excerpts from earlier pages.
export function mergeSearchHits(previous: SearchHit[], incoming: SearchHit[]): SearchHit[] {
  const hits = new Map(previous.map(hit => [hit.key, hit]));
  for (const hit of incoming) {
    const old = hits.get(hit.key);
    if (!old || old.versionId !== hit.versionId) { hits.set(hit.key, hit); continue; }
    const matches = new Map<string, SearchMatch>();
    for (const match of [...old.matches, ...hit.matches]) matches.set(JSON.stringify([match.kind, match.location, match.start, match.excerpt]), match);
    hits.set(hit.key, { ...old, ...hit, matches: [...matches.values()].slice(0, 40), matchesTruncated: old.matchesTruncated || hit.matchesTruncated || matches.size > 40 });
  }
  return [...hits.values()].slice(0, 500);
}
