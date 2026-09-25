// Explicit Autodesk/Revit labels; no semantic inference or fuzzy parameter matching.
export const normalize = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_\s]+/g,' ').trim();
export const categories = {
 'Structural Foundations':['Structural Foundations','Cimentaciones estructurales','Cimentación estructural','OST_StructuralFoundation'],
 'Structural Columns':['Structural Columns','Pilares estructurales','Columnas estructurales','OST_StructuralColumns'],
 'Structural Framing':['Structural Framing','Armazón estructural','OST_StructuralFraming'],
 'Walls':['Walls','Muros','OST_Walls'], 'Floors':['Floors','Suelos','Losas','OST_Floors'],
 'Structural Rebar':['Structural Rebar','Armadura estructural','Armaduras estructurales','OST_Rebar'],
};
export const parameterNames={
 category:['Category','Categoría','__category__'],specialty:['Especialidad','Specialty'],family:['Family','Familia'],type:['Type','Tipo','Nombre de tipo','Type Name'],material:['Material','Structural Material','Material estructural'],
 volume:['Volume','Volumen'],area:['Area','Área'],length:['Length','Longitud','Largo'],width:['Width','Anchura','Ancho','b'],depth:['Depth','Fondo'],height:['Height','Altura','Unconnected Height','Altura desconectada','h'],thickness:['Thickness','Espesor','Grosor'],perimeter:['Perimeter','Perímetro'],
 level:['Level','Nivel','Reference Level','Nivel de referencia','Schedule Level'],baseLevel:['Base Level','Nivel base','Base Constraint','Restricción de base'],topLevel:['Top Level','Nivel superior','Top Constraint','Restricción superior'],elevation:['Elevation','Elevación'],
 diameter:['Bar Diameter','Diámetro de barra','Diámetro de la barra','Diameter','Diámetro'],barLength:['Bar Length','Longitud de barra','Longitud de la barra'],count:['Quantity','Cantidad','Bar Quantity','Número de barras'],totalLength:['Total Bar Length','Longitud total de barra','Longitud total de las barras'],host:['Host','Anfitrión','Host Id','ID de anfitrión'],hostCategory:['Host Category','Categoría de anfitrión'],elementId:['ElementId','Element ID','Id de elemento'],
};
const unitRules={
 m:[['m','meters','meter',1],['mm','millimeters','millimeter',.001],['cm','centimeters','centimeter',.01],['ft','feet','foot',.3048],['in','inches','inch',.0254]],
 m2:[['m²','squareMeters','m2',1],['mm²','squareMillimeters','mm2',1e-6],['cm²','squareCentimeters','cm2',.0001],['ft²','squareFeet','ft2',.09290304]],
 m3:[['m³','cubicMeters','m3',1],['mm³','cubicMillimeters','mm3',1e-9],['cm³','cubicCentimeters','cm3',.000001],['ft³','cubicFeet','ft3',.028316846592]],
};
export function unitFactor(unit,dimension){
 const raw=String(unit??'').replace(/\^([23])/g,'$1').replace(/^autodesk\.unit\.unit:/,'').replace(/-\d+\.\d+\.\d+$/,'');
 return unitRules[dimension]?.find(row=>row.slice(0,3).some(v=>normalize(v)===normalize(raw)))?.[3]??null;
}
export const unavailable=(issue)=>({value:null,source:'NOT_AVAILABLE',issue,inputs:[]});
export function readText(properties,key){
 const matches=properties.filter(p=>parameterNames[key].some(n=>normalize(p.displayName)===normalize(n)));
 const values=[...new Set(matches.map(p=>String(p.displayValue??'').trim()).filter(Boolean))];
 return {value:values.length===1?values[0]:null,issue:values.length>1?'Parámetros con valores distintos':values.length?'':'Parámetro no disponible',inputs:matches.map(p=>({name:p.displayName,category:p.displayCategory??'',rawValue:String(p.displayValue??''),unit:String(p.units??'')}))};
}
export function readMeasure(properties,key,dimension){
 const matches=properties.filter(p=>parameterNames[key].some(n=>normalize(p.displayName)===normalize(n)));
 if(matches.length!==1)return unavailable(matches.length?'Parámetro ambiguo; seleccionar una propiedad específica':'Parámetro no disponible');
 const p=matches[0],raw=p.displayValue,number=typeof raw==='number'?raw:typeof raw==='string'&&/^[-+]?\d+(?:\.\d+)?$/.test(raw.trim())?Number(raw):NaN;
 const factor=dimension==='count'&&(!p.units||['count','unitless',''].includes(normalize(p.units)))?1:unitFactor(p.units,dimension);
 const inputs=[{name:p.displayName,category:p.displayCategory??'',rawValue:String(raw??''),unit:String(p.units??'')}];
 if(factor===null||!Number.isFinite(number)||(number<0&&key!=='elevation')||dimension==='count'&&!Number.isInteger(number))return {...unavailable('Valor o unidad no verificados'),inputs};
 return {value:number*factor,source:'REVIT_PARAMETER',issue:null,inputs};
}
export function canonicalCategory(properties){const raw=readText(properties,'category');const match=Object.entries(categories).find(([,names])=>names.some(n=>normalize(raw.value)===normalize(n)));return {value:match?.[0]??null,original:raw.value,inputs:raw.inputs};}
export function extractElement(element,binding){
 const p=element.properties,category=canonicalCategory(p),specialty=readText(p,'specialty');
 const measures=Object.fromEntries(Object.entries({volume:'m3',area:'m2',length:'m',width:'m',depth:'m',height:'m',thickness:'m',perimeter:'m',elevation:'m',diameter:'m',barLength:'m',count:'count',totalLength:'m'}).map(([k,d])=>[k,readMeasure(p,k,d)]));
 const text=Object.fromEntries(['family','type','material','level','baseLevel','topLevel','host','hostCategory','elementId'].map(k=>[k,readText(p,k)]));
 const resolvedSpecialty=normalize(specialty.value)==='hormigon'?'Hormigón':normalize(specialty.value)==='enfierradura'?'Enfierradura':null;
 return {dbId:element.dbId,externalId:element.externalId??null,name:element.name??'',elementId:text.elementId.value,category:category.value,originalCategory:category.original,specialty:resolvedSpecialty,specialtyEvidence:specialty,categoryEvidence:category,text,measures,source:binding};
}
export function sum(values){let total=0,correction=0;for(const v of values){if(!Number.isFinite(v)||v<0)throw Error('invalid_quantity');const a=v-correction,n=total+a;correction=(n-total)-a;total=n;}if(!Number.isFinite(total))throw Error('quantity_overflow');return total;}
