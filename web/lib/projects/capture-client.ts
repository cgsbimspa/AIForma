import {quantityResponse} from '../quantities/client';
import type {QuantityProject,QuantityConfiguration} from '../quantities/contracts';
import {calculationSchema,type ViewCalculation} from '../quantities-v2/contracts';
import type {QuantitySnapshot} from './snapshots';
export async function saveQuantityCapture(scope:QuantityProject,configuration:QuantityConfiguration,data:ViewCalculation){
 const zipped=await new Response(new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),bytes=new Uint8Array(zipped);if(bytes.length>2800000)throw Error('La evidencia supera el tamaño del historial. Acota la vista antes de guardarla; el resultado continúa disponible en esta sesión.');
 let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
 return quantityResponse<QuantitySnapshot>('/api/projects/quantity-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,configurationId:configuration.id,revision:configuration.revision,compressed:btoa(binary)})});
}
export async function openQuantityCapture(scope:QuantityProject,id:string){const r=await quantityResponse<{compressed:string;summary:QuantitySnapshot}>(`/api/projects/quantity-history?scope=${encodeURIComponent(JSON.stringify(scope))}&id=${encodeURIComponent(id)}`);const bytes=Uint8Array.from(atob(r.compressed),v=>v.charCodeAt(0));const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();return {summary:r.summary,data:calculationSchema.parse(JSON.parse(text))};}
