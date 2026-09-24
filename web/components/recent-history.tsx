"use client";
import { useEffect, useRef, useState } from "react";
import type { DataScope } from "@/lib/autodesk/data";
import { autodeskFetch } from "@/lib/autodesk/client";
export type HistoricalMessage={role:"user"|"assistant";content:string;historical:true;expires_at:string};
type Conversation={id:string;scope:DataScope;title:string;created_at:string;expires_at:string};
type LocalConversation={id:string;title:string;expiresAt:number};
function unexpired(value:string){return Date.parse(value)>Date.now();}
function failure(code:string) {
 if(code==="history_not_found")return "Esta conversación venció o ya no está disponible. Actualiza el historial.";
 if(code==="expired"||code==="consent_required")return "Reconecta Autodesk para consultar tu historial. El chat abierto se conserva.";
 if(code==="forbidden")return "No tienes acceso al proyecto de esta conversación.";
 return "No se pudo consultar el historial. Tu conversación abierta se conserva. Puedes reintentar.";
}
export function RecentHistory({scope,busy,revision,activeId,local,onLocal,onRestore,onNew}: {
 scope:DataScope;busy:boolean;revision:number;activeId?:string;local:LocalConversation[];onLocal:(id:string)=>void;
 onRestore:(id:string,messages:HistoricalMessage[],scope:DataScope,expiresAt:string)=>void;onNew:()=>void;
}) {
 const [open,setOpen]=useState(false),[items,setItems]=useState<Conversation[]>([]),[notice,setNotice]=useState(""),[loading,setLoading]=useState(false);
 const controller=useRef<AbortController|null>(null);
 const scoped=JSON.stringify(scope);
 const endpoint=`/api/memory/history?scope=${encodeURIComponent(scoped)}`;
 function start(){controller.current?.abort();const abort=new AbortController();controller.current=abort;setLoading(true);setNotice("");return abort;}
 async function read(url:string,abort:AbortController,init:RequestInit={}) {
  const response=await autodeskFetch(url,{...init,cache:"no-store",signal:AbortSignal.any([abort.signal,AbortSignal.timeout(45_000)])});
  const data=await response.json();abort.signal.throwIfAborted();
  if(!response.ok)throw Error(data.error??"unavailable");
  return data;
 }
 async function load(){
  if(scope.kind==="all")return;
  const abort=start();
  try{const data=await read(endpoint,abort);if(!data.configured){setItems([]);setNotice("El historial persistente no está configurado. Las conversaciones de esta sesión se conservan mientras mantengas abierto el asistente.");}else{setItems(data.conversations);}}
  catch(error){if(!abort.signal.aborted)setNotice(failure(error instanceof Error?error.message:"unavailable"));}
  finally{if(!abort.signal.aborted)setLoading(false);}
 }
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{controller.current?.abort();},[revision]);
 useEffect(()=>{if(!open)return;const timer=setInterval(()=>setItems(rows=>rows.filter(row=>Date.parse(row.expires_at)>Date.now())),1000);return()=>clearInterval(timer);},[open]);
 async function restore(item:Conversation){
  const abort=start();
  try{const data=await read(`/api/memory/history?scope=${encodeURIComponent(JSON.stringify(item.scope))}&conversationId=${encodeURIComponent(item.id)}`,abort);
   if(!data.configured)throw Error("unavailable");
   if(!Array.isArray(data.messages)||!data.messages.length||!unexpired(data.expiresAt))throw Error("history_not_found");
   onRestore(item.id,data.messages,item.scope,data.expiresAt);setOpen(false);
   setNotice(data.truncated?"Se recuperaron los primeros 200 mensajes; hay más mensajes no mostrados.":"");
  }catch(error){if(!abort.signal.aborted)setNotice(failure(error instanceof Error?error.message:"unavailable"));}
  finally{if(!abort.signal.aborted)setLoading(false);}
 }
 async function remove(item:Conversation){
  const abort=start();
  try{await read('/api/memory/history',abort,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:item.scope,conversationId:item.id})});
   setItems(rows=>rows.filter(row=>row.id!==item.id));if(activeId===item.id)onNew();setNotice("Conversación eliminada del historial.");
  }catch(error){if(!abort.signal.aborted)setNotice(failure(error instanceof Error?error.message:"unavailable"));}
  finally{if(!abort.signal.aborted)setLoading(false);}
 }
 function newChat(){controller.current?.abort();setLoading(false);setOpen(false);setNotice("");onNew();}
 return <div className="recent-history">
  <button type="button" className="assistant-link" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void load();}}>{open?"Ocultar historial":"Historial · 5 días"}</button>
  <button type="button" className="assistant-link" onClick={newChat}>Nueva conversación</button>
  {open&&<div className="recent-history-list">
   <p>Últimas 50 conversaciones de tu usuario · Vencen cinco días después de su creación.</p>
   {scope.kind==="all"?<p>Para ver el historial guardado de un proyecto, selecciónalo en el explorador y abre Historial. Las consultas sobre toda la base sólo se conservan en esta sesión.</p>:<><p>Incluye las conversaciones de este proyecto, sus carpetas y archivos. Al recuperar una consulta se seleccionará su ubicación original.</p><button className="assistant-link" disabled={loading} onClick={()=>void load()}>Actualizar / reintentar historial</button></>}
   {loading&&<p role="status">Consultando historial…</p>}{notice&&<p role="status">{notice}</p>}
   {!loading&&!notice&&!items.length&&scope.kind!=="all"&&<p>No hay conversaciones guardadas de los últimos cinco días en este proyecto.</p>}
   {items.map(item=><div key={item.id}><button type="button" className="assistant-link" disabled={busy||loading} onClick={()=>void restore(item)}>{item.title}</button><small>{item.scope.kind==="file"?"Archivo":item.scope.kind==="folder"?"Carpeta":"Proyecto"} · {new Date(item.created_at).toLocaleString("es-CL")} · Vence {new Date(item.expires_at).toLocaleString("es-CL")}</small><button type="button" className="assistant-link" disabled={busy||loading} onClick={()=>void remove(item)}>Eliminar</button></div>)}
   {!!local.length&&<p>Sin guardado en servidor · Disponibles sólo durante esta sesión:</p>}
   {local.map(item=><div key={item.id}><button className="assistant-link" disabled={busy||loading} onClick={()=>{onLocal(item.id);setOpen(false);}}>{item.title}</button><small>Vence {new Date(item.expiresAt).toLocaleString("es-CL")}</small></div>)}
   {scope.kind!=="all"&&<button type="button" className="assistant-link" disabled={busy||loading} onClick={async()=>{const abort=start();try{await read(`/api/memory/preferences?scope=${encodeURIComponent(scoped)}`,abort,{method:'POST'});setNotice("Preferencias aprendidas eliminadas.");}catch{if(!abort.signal.aborted)setNotice("No fue posible eliminar las preferencias.");}finally{if(!abort.signal.aborted)setLoading(false);}}}>Olvidar mis preferencias aprendidas</button>}
  </div>}
 </div>;
}
