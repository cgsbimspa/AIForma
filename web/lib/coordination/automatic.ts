import type {Element,PendingReason} from './contracts.ts';
import {matchesParameter} from './inspection.ts';
import {measurement} from './measurement.ts';

type Reading={property:string|null;raw:unknown;value:number|null;reason?:PendingReason;details:string};
const pipes=new Set(['Pipes','Tuberías','Tuberias']);
// These are candidates for a reference comparison, NOT an assertion that the
// article applies. In particular a pipe is not automatically a main vent.
export function automaticCandidates(ruleId:string,elements:Element[]):Element[]{
 return elements.filter(e=>ruleId==='RIDAA-89'
  ?Object.keys(e.values).some(p=>matchesParameter(ruleId,p))
  :pipes.has(e.category??''));
}
export function automaticReading(ruleId:string,e:Element,unit:string):Reading {
 const entries=Object.entries(e.values).filter(([path])=>matchesParameter(ruleId,path));
 if(!entries.length)return {property:null,raw:null,value:null,reason:'PARAMETER_NOT_FOUND',details:'No se encontró un parámetro publicado con el nombre reconocido para esta comprobación.'};
 const values=entries.map(([property,raw])=>({property,raw,value:measurement(raw,unit)}));
 const readable=values.filter(v=>v.value!==null);
 // Do not silently pick the first alias or ignore a second ambiguous field.
 if(readable.length!==values.length)return {property:entries.map(([p])=>p).join(' | '),raw:Object.fromEntries(entries),value:null,reason:'VALUE_UNAVAILABLE',details:'El parámetro candidato está vacío o su unidad no puede interpretarse. Conserva el valor y la unidad publicados; no se asignan unidades a números sin etiqueta.'};
 if(new Set(readable.map(v=>v.value)).size>1)return {property:entries.map(([p])=>p).join(' | '),raw:Object.fromEntries(entries),value:null,reason:'AMBIGUOUS_PARAMETER',details:'Hay parámetros candidatos con valores distintos. Se requiere elegir el parámetro correcto; no se selecciona uno por semejanza.'};
 return {...readable[0],details:'Parámetro identificado por nombre exacto normalizado y unidad explícita. Todas las alternativas publicadas coinciden.'};
}
