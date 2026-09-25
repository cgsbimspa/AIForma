import type { ModelElement, ViewCalculation, ViewFilters } from './contracts';
import { presentQuantities, quantityFacets } from '../../public/quantity-v2/quantity-service.js';
export type Metric = 'concrete'|'formwork'|'rebar';
export type Coverage = {eligible:number;read:number;missing:number;subtotal:number|null;total:number|null;status:string};
export type QuantityGroup = {id:string;specialty:string;category:string;floor:string;diameterMm:number|null;dbIds:number[];count:number;elements:ModelElement[];quantities:Record<Metric,Coverage>;totalLengthM:number|null;unitWeightKgM:number|null};
export function presentation(data:ViewCalculation,filters:ViewFilters){return presentQuantities(data,filters) as {records:ModelElement[];coverage:Record<Metric,Coverage>;rows:QuantityGroup[]};}
export function facets(data:ViewCalculation,filters:ViewFilters){return quantityFacets(data.records,filters) as {specialties:string[];categories:string[];floors:string[]};}
export const numberText=(value:number|null|undefined,digits=3)=>value==null?'No disponible':value.toLocaleString('es-CL',{maximumFractionDigits:digits});
export function coverageText(c?:Coverage){return !c?'No calculado':c.status==='NOT_APPLICABLE'?'Sin elementos':c.total!==null?numberText(c.total):c.subtotal!==null?`${numberText(c.subtotal)} · parcial`:'Pendiente';}
export const metricLabels:Record<Metric,string>={concrete:'Hormigón',formwork:'Moldaje',rebar:'Enfierradura'};
export const metricUnits:Record<Metric,string>={concrete:'m³',formwork:'m²',rebar:'kg'};
