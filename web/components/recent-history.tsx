"use client";
import { useEffect,useState } from "react";
import type { DataScope } from "@/lib/autodesk/data";
import { autodeskFetch } from "@/lib/autodesk/client";
export type HistoricalMessage={role:"user"|"assistant";content:string;historical:true;expires_at:string};
type Conversation={id:string;created_at:string;expires_at:string};
export function RecentHistory({scope,busy,onRestore,onNew}:{scope:DataScope;busy:boolean;onRestore:(id:string,messages:HistoricalMessage[])=>void;onNew:()=>void}) {
 const [open,setOpen]=useState(false),[items,setItems]=useState<Conversation[]>([]),[notice,setNotice]=useState(""),[loading,setLoading]=useState(false);
 const scoped=JSON.stringify(scope);
 async function load(){
  setLoading(true);setNotice("");
  try {const response=await autodeskFetch(`/api/memory/history?scope=${encodeURIComponent(scoped)}`);const data=await response.json();if(!response.ok)throw Error();if(!data.configured){setNotice("Historial persistente pendiente de conectar a la base de datos.");setItems([]);}else setItems(data.conversations);}
  catch{setNotice("No se pudo consultar el historial. Tu conversación abierta se conserva.");}finally{setLoading(false);}
 }
 useEffect(()=>{if(!open)return;const timer=setInterval(()=>setItems(rows=>rows.filter(row=>Date.parse(row.expires_at)>Date.now())),1000);return()=>clearInterval(timer);},[open]);
 async function restore(id:string){
  setLoading(true);
  try{const response=await autodeskFetch(`/api/memory/history?scope=${encodeURIComponent(scoped)}&conversationId=${encodeURIComponent(id)}`);const data=await response.json();if(!response.ok)throw Error();onRestore(id,data.messages);setNotice(data.truncated?"Se muestra una parte del historial. Las respuestas antiguas deben verificarse de nuevo.":"Historial recuperado. Sus respuestas no son evidencia actual.");}
  catch{setNotice("El historial venció o ya no está disponible para tu selección.");}finally{setLoading(false);}
 }
 async function remove(id:string){
  setLoading(true);
  try{const response=await autodeskFetch('/api/memory/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,conversationId:id})});if(!response.ok)throw Error();onNew();await load();setNotice("Conversación eliminada del historial.");}
  catch{setNotice("No fue posible eliminar el historial. Inténtalo nuevamente.");}finally{setLoading(false);}
 }
 return <div className="recent-history"><button type="button" className="assistant-link" disabled={busy||scope.kind==="all"} onClick={()=>{setOpen(!open);if(!open)void load();}}>{open?"Ocultar historial":"Historial · 5 días"}</button><button type="button" className="assistant-link" disabled={busy} onClick={onNew}>Nueva conversación</button>{scope.kind==="all"&&<small>Selecciona un proyecto para guardar historial.</small>}{open&&<div className="recent-history-list"><p>Recent Context · Disponible durante cinco días desde su creación. Las preferencias operativas se guardan por separado.</p>{loading&&<p role="status">Consultando historial…</p>}{notice&&<p role="status">{notice}</p>}{!loading&&!notice&&!items.length&&<p>No hay conversaciones recientes en esta selección.</p>}{items.map(item=><div key={item.id}><button type="button" className="assistant-link" disabled={busy||loading} onClick={()=>void restore(item.id)}>Conversación del {new Date(item.created_at).toLocaleString("es-CL")}</button><small>Vence {new Date(item.expires_at).toLocaleString("es-CL")}</small><button type="button" className="assistant-link" disabled={busy||loading} onClick={()=>void remove(item.id)}>Eliminar</button></div>)}<button type="button" className="assistant-link" disabled={busy||loading} onClick={async()=>{try{const r=await autodeskFetch(`/api/memory/preferences?scope=${encodeURIComponent(scoped)}`,{method:'POST'});setNotice(r.ok?"Preferencias aprendidas eliminadas.":"No fue posible eliminar las preferencias.");}catch{setNotice("No fue posible eliminar las preferencias.");}}}>Olvidar mis preferencias aprendidas</button></div>}</div>;
}
