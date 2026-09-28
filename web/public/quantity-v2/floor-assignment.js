// Assign complete element quantities to a user-confirmed floor. No splitting,
// recalculation of lengths, or implicit propagation to another view/version.
export function assignFloors(settings,binding,records,ids,label){
 if(!binding?.urn||!binding?.viewId||!Array.isArray(ids)||!ids.length)throw Error('Selecciona elementos de una vista cargada');
 const selected=new Set(ids),known=new Set(records.filter(e=>e.source.urn===binding.urn&&e.source.viewId===binding.viewId&&e.source.versionId===binding.versionId).map(e=>e.dbId));
 if(ids.some(id=>!Number.isSafeInteger(id)||!known.has(id)))throw Error('La selección no corresponde a la versión y vista actuales');
 const name=label===null?null:typeof label==='string'?label.trim():'';
 if(name!==null&&(!name||name.length>500||['MULTILEVEL','Piso no resuelto'].includes(name)))throw Error('Indica un nombre de piso válido');
 if(settings.levelBinding&&(settings.levelBinding.urn!==binding.urn||settings.levelBinding.viewId!==binding.viewId))throw Error('Los criterios guardados pertenecen a otra vista o versión');
 const manualFloors=[...settings.manualFloors.filter(r=>!selected.has(r.dbId)),...(name===null?[]:[...selected].map(dbId=>({dbId,label:name})))];
 if(manualFloors.length>10000)throw Error('Se supera el límite de 10.000 asignaciones por vista');
 return {...settings,levelBinding:{urn:binding.urn,viewId:binding.viewId},manualFloors};
}
