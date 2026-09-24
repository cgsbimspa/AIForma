// Session-only navigation state. Never persisted as technical knowledge.
export const navigationRetentionMs = 5 * 24 * 60 * 60 * 1000;
export type ConversationSnapshot<T> = { data:T; expiresAt:number };
export function rememberConversation<T>(store:Map<string,ConversationSnapshot<T>>,key:string,data:T,expiresAt:number,now=Date.now()) {
  for(const [id,snapshot] of store)if(snapshot.expiresAt<=now)store.delete(id);
  if(Number.isFinite(expiresAt)&&expiresAt>now)store.set(key,{data,expiresAt:Math.min(expiresAt,now+navigationRetentionMs)});
  else store.delete(key);
}
export function recallConversation<T>(store:Map<string,ConversationSnapshot<T>>,key:string,now=Date.now()) {
  const snapshot=store.get(key);
  if(!snapshot||snapshot.expiresAt<=now){store.delete(key);return undefined;}
  return snapshot;
}
