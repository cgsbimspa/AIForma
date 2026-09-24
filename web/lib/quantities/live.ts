import { z } from 'zod';
import { associateSubspecialty } from '../../public/quantity-classification.js';
import { sumVerified } from '../../public/quantity-calculation.js';
import type { Metric, QuantityFiltersValue, QuantityTableRow } from './presentation.ts';

export const inventorySchema=z.array(z.object({dbId:z.number().int().nonnegative(),specialties:z.array(z.string()),subspecialty:z.string(),floor:z.string()}));
export type ClassificationInventory=z.infer<typeof inventorySchema>;

export const liveCalculationSchema = z.object({
  urn:z.string().min(1), viewId:z.string().min(1), calculatedAt:z.string().datetime(),
  engine:z.literal('published-view-quantities-v1'),ruleId:z.literal('cgs-structure-classification'),ruleVersion:z.string(),
  inspected:z.number().int().nonnegative(),unclassified:z.number().int().nonnegative(),
  records:z.array(z.object({
    metric:z.enum(['concrete_volume_m3','galvanized_steel_length_ml']),
    dbId:z.number().int().nonnegative(),externalId:z.string().nullable(),
    specialty:z.string(),subspecialty:z.string(),typeName:z.string(),floor:z.string(),unit:z.enum(['m³','ml']),
    quantity:z.number().finite().nonnegative().nullable(),issue:z.string().nullable(),
    property:z.string(),category:z.string(),rawValue:z.string(),rawUnit:z.string(),
  })),
}).superRefine((data,ctx)=>{
  if(data.unclassified>data.inspected||new Set(data.records.map(r=>`${r.metric}:${r.dbId}`)).size!==data.records.length||data.records.some(r=>(r.quantity===null)!==(r.issue!==null)||(r.metric==='concrete_volume_m3'?r.unit!=='m³':r.unit!=='ml')))ctx.addIssue({code:'custom',message:'Invalid quantity evidence'});
  try { for(const metric of ['concrete_volume_m3','galvanized_steel_length_ml'])sumVerified(data.records.filter(r=>r.metric===metric&&r.quantity!==null).map(r=>r.quantity!)); } catch {ctx.addIssue({code:'custom',message:'Quantity overflow'});}
});
export type LiveCalculation = z.infer<typeof liveCalculationSchema>;
export type CalculationEvent = {state:'loading'|'error';message:string} | {state:'complete';data:LiveCalculation};
export function presentLiveCalculation(data:LiveCalculation,filter:QuantityFiltersValue) {
  const sub=associateSubspecialty(filter.subspecialty).group;
  const records=data.records.filter(r=>(!filter.specialty||r.specialty===filter.specialty)&&(!filter.subspecialty||r.subspecialty===filter.subspecialty||sub!==null&&associateSubspecialty(r.subspecialty).group===sub)&&(!filter.floor||r.floor===filter.floor));
  const totals:Record<Metric,number|null>={concrete_volume_m3:null,galvanized_steel_length_ml:null,formwork_area_m2:null,reinforcement_weight_kg:null};
  const coverage=(['concrete_volume_m3','galvanized_steel_length_ml'] as const).map(metric=>{
    const selected=records.filter(r=>r.metric===metric),read=selected.filter(r=>r.quantity!==null);
    const subtotal=read.length?sumVerified(read.map(r=>r.quantity!)):null;
    if(selected.length&&read.length===selected.length)totals[metric]=subtotal;
    return {metric,eligible:selected.length,read:read.length,missing:selected.length-read.length,subtotal};
  });
  const groups=new Map<string,typeof records>();
  for(const r of records){const key=JSON.stringify([r.specialty,r.subspecialty,r.typeName,r.floor]);const group=groups.get(key)??[];group.push(r);groups.set(key,group);}
  const rows:QuantityTableRow[]=[...groups].map(([id,group])=>{
    const values:Partial<Record<Metric,number>>={};
    for(const metric of ['concrete_volume_m3','galvanized_steel_length_ml'] as const){const part=group.filter(r=>r.metric===metric);if(part.length&&part.every(r=>r.quantity!==null))values[metric]=sumVerified(part.map(r=>r.quantity!));}
    return {id,specialty:group[0].specialty,subspecialty:group[0].subspecialty,typeName:group[0].typeName,floor:group[0].floor,values,elementIds:[...new Set(group.flatMap(r=>r.externalId?[r.externalId]:[]))]};
  });
  return {records,totals,rows,coverage};
}
