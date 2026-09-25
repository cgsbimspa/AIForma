// Cache only complete property rows from this exact in-memory APS Model.
// A different view/version/model object gets a separate cache; nothing is persisted.
const snapshots = new WeakMap();
function snapshot(model) {
  let value = snapshots.get(model);
  if (!value) { value = new Map(); snapshots.set(model, value); }
  return value;
}
export function publishedCall(run, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('classification_timeout')), timeoutMs);
    const ok = value => { clearTimeout(timer); resolve(value); };
    const fail = () => { clearTimeout(timer); reject(Error('classification_unavailable')); };
    try { run(ok, fail); } catch { fail(); }
  });
}
export async function readPublishedBatch(model, ids, timeoutMs = 30000) {
  const cache = snapshot(model), missing = ids.filter(id => !cache.has(id));
  if (missing.length) {
    const expected = new Set(missing);
    const rows = await publishedCall((ok, fail) => model.getBulkProperties2(missing, { ignoreHidden: false, needsExternalId: true }, ok, fail), timeoutMs);
    if (!Array.isArray(rows) || rows.length !== missing.length || new Set(rows.map(r => r?.dbId)).size !== missing.length || rows.some(r => !expected.has(r?.dbId) || !Array.isArray(r.properties))) throw Error('incomplete_classification');
    for (const row of rows) cache.set(row.dbId, row);
  }
  // Preserve the view's order even if worker batches resolve out of order.
  return ids.map(id => cache.get(id));
}
