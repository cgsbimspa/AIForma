import { z } from 'zod';
export const actionSchema=z.enum(['select','isolate','attenuate','hide','color','focus','properties','showAll','resetColors','clearSelection']);
export const colorSchema=z.enum(['rojo','azul','verde','amarillo','naranja','violeta']);
export const filterSchema=z.object({field:z.string().min(1).max(500),operator:z.enum(['equals','contains','not_equals']),values:z.array(z.string().trim().min(1).max(200)).min(1).max(12)}).strict();
export const planSchema=z.object({kind:z.enum(['execute','clarify']),reason:z.enum(['none','ambiguous','unsupported','unknown_property']),action:actionSchema,target:z.enum(['model','selection']),color:colorSchema.nullable(),filters:z.array(filterSchema).max(6)}).strict();
export type BimPlan=z.infer<typeof planSchema>;
export const catalogSchema=z.object({total:z.number().int().positive(),fields:z.array(z.object({id:z.string().min(1).max(500),label:z.string().min(1).max(500),values:z.array(z.string().max(180)).max(16),partial:z.boolean()})).min(1).max(100),partial:z.boolean(),ruleVersion:z.string().min(1)});
export type BimCatalog=z.infer<typeof catalogSchema>;
export const resultSchema=z.object({count:z.number().int().nonnegative(),total:z.number().int().positive(),criteria:z.array(z.string()),sample:z.array(z.object({dbId:z.number().int(),name:z.string(),externalId:z.string().nullable(),properties:z.array(z.object({name:z.string(),value:z.string(),units:z.string().optional()})),propertyCount:z.number().int()})).max(8),samplePartial:z.boolean(),propertiesPartial:z.boolean(),ruleVersion:z.string(),readAt:z.string().datetime(),action:actionSchema,color:colorSchema.nullable(),selectionCount:z.number().int().nonnegative(),applied:z.boolean()});
export type BimResult=z.infer<typeof resultSchema>;
export function describeBimResult(result:BimResult){
  if(result.action==='showAll')return 'Volví a mostrar todos los elementos de la vista.';
  if(result.action==='resetColors')return 'Restauré los colores originales del modelo.';
  if(result.action==='clearSelection')return 'Limpié la selección. Puedes empezar otra consulta.';
  if(!result.count)return 'No encontré elementos que cumplan estos criterios en la vista publicada. Puedes revisar los parámetros disponibles o cambiar el criterio.';
  const n=result.count.toLocaleString('es-CL');
  const phrases={select:`Encontré ${n} elementos y los seleccioné en el modelo.`,isolate:`Aislé ${n} elementos para que puedas revisarlos.`,attenuate:`Dejé destacados ${n} elementos y atenué el resto.`,hide:`Oculté ${n} elementos de esta vista.`,color:`Pinté de ${result.color} los ${n} elementos encontrados.`,focus:`Encuadré los ${n} elementos de la selección.`,properties:`Leí las propiedades publicadas de ${n} elementos. Aquí puedes revisar sus valores originales.`};
  return phrases[result.action];
}
