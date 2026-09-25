// Share one renewal check within a tab while retaining the cross-tab rotation
// lock supplied by the caller. No token or success result is persisted here.
export function createSessionRefresh(run: (force: boolean) => Promise<Response>) {
  let pending: Promise<Response> | undefined;
  let forced = false;
  async function refresh(force = false): Promise<Response> {
    if (pending) {
      if (!force || forced) return (await pending).clone();
      await pending;
      return refresh(true);
    }
    forced = force;
    const operation = run(force);
    pending = operation;
    try { return (await operation).clone(); }
    finally { if (pending === operation) pending = undefined; }
  }
  return refresh;
}
