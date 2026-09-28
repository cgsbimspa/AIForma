// Product templates. A template selects verified classifications; it never
// assigns an element's specialty from the chosen file or the template name.
export const mepTemplates = [
 {key:'cold-water',code:'APF',name:'Agua Potable Fría'},
 {key:'hot-water',code:'APC',name:'Agua Potable Caliente'},
 {key:'sewer',code:'ALC',name:'Alcantarillado'},
 {key:'gas',code:'GAS',name:'Gas'},
 {key:'fire-protection',code:'PCI',name:'Protección Contra Incendio'},
 {key:'ventilation',code:'VNT',name:'Ventilación'},
 {key:'electricity',code:'ELE',name:'Electricidad'},
 {key:'hvac',code:'HVAC',name:'HVAC'},
 {key:'telecommunications',code:'TEL',name:'Telecomunicaciones'},
 {key:'external-water',code:'AP_EXT',name:'Agua Potable Exterior'},
 {key:'external-sewer',code:'ALC_EXT',name:'Alcantarillado Exterior'},
 {key:'external-electricity',code:'ELE_EXT',name:'Electricidad Exterior'},
];
export const mepTemplateFor = key => mepTemplates.find(t=>t.key===key)??null;
export const isMEPTemplate = key => key==='mep'||Boolean(mepTemplateFor(key));

export function scopeMEPCalculation(data,key='mep') {
 if(key==='mep')return data;
 const template=mepTemplateFor(key);
 if(!template||data.engine!=='mep-quantities-v1.0'||data.mepScope)throw Error('Alcance de plantilla MEP no válido');
 const records=data.records.filter(e=>e.specialty===template.code);
 const contextRecords=data.records.filter(e=>e.specialty!==template.code);
 return {...data,records,mepContextRecords:contextRecords,
  mepScope:{key,code:template.code,name:template.name,inspected:data.records.length,excluded:contextRecords.length,unclassified:contextRecords.filter(e=>!e.specialty).length},
  coverage:{...data.coverage,inspected:records.length,unclassified:0,
   geometryUnavailable:records.filter(e=>!e.geometry?.available).length,
   unresolvedFloors:records.filter(e=>e.floor.resolvedBuildingLevel==='Piso no resuelto').length}};
}
