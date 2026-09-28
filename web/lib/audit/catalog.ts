import type { AuditRule, AuditTolerance, AuditConfiguration, VerticalReferenceCatalog } from './contracts.ts';

// Controlled source: user specification, 2026-09-27, docs/auditoria-especificacion.txt.
export const chapterNames:Record<string,string>={G01:'Identificación',G02:'Coordenadas',G03:'Niveles',G04:'Grillas',G05:'Categorías',G06:'Familias y tipos',G07:'Geometría',G08:'Salud técnica'};
const toleranceDefinitions = [
 ['Niveles','Diferencia de elevación entre niveles equivalentes','mm'],['Niveles','Separación mínima entre niveles','mm'],['Niveles','Offset vertical permitido','mm'],
 ['Grillas','Desviación angular','grados'],['Grillas','Diferencia de posición de ejes','mm'],['Grillas','Separación entre ejes casi coincidentes','mm'],
 ['Elemento / grilla','Excentricidad','mm'],['Geometría','Gap entre elementos consecutivos','mm'],['Geometría','Solape permitido','mm'],['Geometría','Distancia para elemento aislado','mm'],
 ['Geometría','Diferencia de alineación por cara','mm'],['Geometría','Diferencia de alineación por eje','mm'],['Geometría','Variación dimensional de elementos comparables','%'],
 ['Coordenadas','Diferencia X','mm'],['Coordenadas','Diferencia Y','mm'],['Coordenadas','Diferencia Z','mm'],['Coordenadas','Diferencia de rotación','grados'],
 ['Familias','Similitud para candidatos duplicados','%'],['Datos','Diferencia entre dato y geometría','%'],['Otros','Tolerancia adicional','Por Configurar'],
];
export const globalTolerances:AuditTolerance[]=toleranceDefinitions.map(([area,control,unit],i)=>({id:`TOL-${String(i+1).padStart(3,'0')}`,area,control,unit,value:0,origin:'GLOBAL',status:'Por Configurar',evidence:''}));
export function effectiveTolerances(company:AuditTolerance[],project:AuditTolerance[]) {
 return [...new Map([...globalTolerances,...company,...project].map(t=>[t.id,t])).values()];
}
export const verticalReferences:VerticalReferenceCatalog[] = [
 ['Structural Columns','Base Level','Top Level'],['Structural Framing','Reference Level',''],['Structural Foundations','Level',''],['Floors','Level',''],['Walls','Base Constraint','Top Constraint'],['Structural Rebar','',''],['Generic Models','',''],
].map(([category,baseReference,topReference])=>({discipline:'ESTRUCTURA',category,baseReference,topReference,classificationReference:'',status:baseReference?'Confirmada':'Por Configurar'}));
export const defaultConfiguration:AuditConfiguration={source:null,discipline:'ESTRUCTURA',ruleSetId:'audit-master-v1',disabledRules:[],verticalReferences};

// One central matrix. UI, execution and traceability use these exact records.
const definitions = `
G01-001|Proyecto identificado|I
G01-002|Código de proyecto|I
G01-003|Nombre del archivo|I
G01-004|Especialidad declarada|I
G01-005|Autor|I
G01-006|Organización|I
G01-007|Versión|I
G01-008|Fecha de publicación|I
G01-009|Estado|I
G01-010|Unidades|I
G02-001|Internal Origin|I
G02-002|Project Base Point|I
G02-003|Survey Point|I
G02-004|Shared Coordinates|I
G02-005|Project North|I
G02-006|True North|I
G02-007|Transformación|I
G02-008|Extensión XYZ|I
G03-A01|Inventario de niveles|I
G03-B01|Nombres de niveles duplicados|D
G03-B02|Nomenclatura de niveles|D
G03-B03|Niveles coincidentes|C|TOL-001
G03-B04|Niveles cercanos|C|TOL-002
G03-B05|Niveles potencialmente redundantes|C
G03-B06|Niveles ajenos a la especialidad|D
G03-B07|Niveles sin utilización en el alcance|D
G03-C01|Referencia vertical disponible|D
G03-C02|Referencia vertical válida|D
G03-C03|Referencia a nivel inexistente|D
G03-C04|Categoría sin mapeo vertical|D
G03-C05|Referencia incoherente con posición geométrica|C
G03-D01|Offset distinto de cero|I
G03-D02|Offset potencialmente atípico|C|TOL-003
G03-D03|Nivel distante compensado mediante offset|C
G03-E01|Elementos por nivel|I
G03-E02|Categorías por nivel|I
G03-E03|Familias por nivel|I
G03-E04|Tipos por nivel|I
G04-A01|Identificadores de grillas|I
G04-A02|Nombres de grillas|I
G04-A03|Tipo geométrico recto o curvo|I
G04-A04|Orientación de grillas|I
G04-A05|Posición de grillas|I
G04-B01|Nombres de grillas duplicados|D
G04-B02|Secuencia de grillas|D
G04-B03|Nomenclatura corporativa|D
G04-C01|Paralelismo esperado|C|TOL-004
G04-C02|Ortogonalidad esperada|C|TOL-004
G04-C03|Pequeñas desviaciones angulares|C|TOL-004
G04-C04|Separaciones anómalas|C|TOL-006
G04-D01|Grillas coincidentes|C|TOL-005
G04-D02|Grillas casi coincidentes|C|TOL-006
G04-D03|Sistemas potencialmente superpuestos|C
G04-E01|Elemento relevante sin relación razonable con eje|C
G04-E02|Excentricidad elemento / eje|C|TOL-007
G04-E03|Eje respecto de centro geométrico|C
G04-E04|Eje respecto de cara de referencia|C
G05-A01|Inventario de categorías|I
G05-A02|Inventario de elementos constructivos|I
G05-A03|Inventario de elementos auxiliares|I
G05-C01|Categoría nativa para elementos principales|D
G05-C02|Generic Models en componentes especiales|D
G05-C03|Posible categoría incorrecta|S
G05-D01|Contenido ajeno a especialidad|D
G05-E01|Coherencia categoría / clasificación|D
G06-A01|Familias en uso|I
G06-A02|Familias disponibles sin instancias|I
G06-A03|Tipos en uso|I
G06-A04|Tipos disponibles sin instancias|I
G06-B01|Familias potencialmente redundantes|C
G06-B02|Tipos potencialmente duplicados|C|TOL-018
G06-B03|Nombres semánticamente equivalentes|S
G06-C01|Contenido cargado y no utilizado|D
G06-C02|Familias in situ repetitivas|D
G06-C03|Complejidad de familia|C
G07-A01|Cobertura de geometría recuperable|I
G07-A02|Bounding Box disponible|I
G07-A03|Sólidos disponibles|I
G07-B01|Candidatos duplicados geométricos|C
G07-B02|Solapes no esperados|C|TOL-009
G07-C01|Continuidad vertical|C
G07-C02|Gaps entre elementos|C|TOL-008
G07-C03|Continuidad entre niveles|C
G07-C04|Piso potencialmente ausente entre elementos verticales|C
G07-C05|Alineación por eje|C|TOL-012
G07-C06|Alineación por cara|C|TOL-011
G07-C07|Cambio de sección|C
G07-D01|Dimensión potencialmente atípica|C|TOL-013
G07-E01|Elemento potencialmente aislado|C|TOL-010
G07-F01|Geometría no recuperable|I
G08-A01|Ficha técnica del modelo|I
G08-B01|Inventario de warnings|I
G08-B02|Warnings recurrentes|D
G08-B03|Clasificación de severidad|D
G08-C01|RVT Links|I
G08-C02|CAD Links|I
G08-C03|CAD importado|I
G08-C04|Vínculos descargados|I
G08-D01|Worksets|D
G08-E01|Inventario de vistas|I
G08-E02|Inventario de planos|I
G08-E03|View Templates|I
G08-E04|Posibles vistas residuales|D
G08-F01|Complejidad y rendimiento|I
G08-G01|Contenido residual|D
G08-G02|Contenido obsoleto|D
`;
const methods:Record<string,string>={
 'G01-001':'Identidad del proyecto consultada en Autodesk','G01-003':'Nombre de archivo consultado en Autodesk','G01-004':'Especialidad declarada explícitamente en la configuración','G01-006':'Identificador de cuenta Autodesk del proyecto','G01-007':'Versión verificada en Autodesk','G01-008':'Fecha de publicación devuelta por Autodesk',
 'G03-A01':'Inventario de objetos Levels presentes en la vista; no equivale al inventario completo del RVT',
 'G03-B01':'Comparación exacta de nombres de niveles identificados por objetos distintos en la vista',
 'G03-B03':'Diferencia absoluta de elevaciones publicadas en unidades explícitas, menor o igual a TOL-001 confirmada',
 'G03-B04':'Diferencia absoluta de elevaciones mayor que cero y menor que TOL-002 confirmada',
 'G03-C01':'Lectura del parámetro exacto definido en VerticalReferenceCatalog',
 'G03-C02':'Referencia publicada coincide exactamente con ID o nombre único de nivel inventariado en la vista',
 'G03-C04':'Identificación de categorías sin mapeo vertical confirmado',
 'G03-D01':'Inventario de offsets publicados; un valor distinto de cero no es un incumplimiento',
 'G03-E01':'Agrupar referencias verticales publicadas por texto exacto','G03-E02':'Agrupar categorías por referencia publicada','G03-E03':'Agrupar familias por referencia publicada','G03-E04':'Agrupar tipos por referencia publicada',
 'G04-A01':'Identificadores de objetos Grids presentes en la vista','G04-A02':'Nombres publicados de objetos Grids presentes en la vista',
 'G04-B01':'Comparación exacta de nombres de grillas identificadas por objetos distintos en la vista',
};
export const auditRules:AuditRule[]=definitions.trim().split('\n').map(line=>{
 const [ruleId,name,type,tolerance]=line.split('|'), chapter=ruleId.slice(0,3), controlType=({I:'INFORMATION',D:'DETERMINISTIC',C:'CALCULATED',S:'SEMANTIC_AI'} as const)[type as 'I'|'D'|'C'|'S'];
 return {ruleId,chapter,group:ruleId.split('-')[1].slice(0,1),name,description:name,specialty:ruleId.startsWith('G04-E')?'ESTRUCTURA':'Todas',category:ruleId.startsWith('G03-C')?'Según catálogo vertical':'Todas',controlType,scope:'VIEW',dataSource:'Autodesk Model Derivative · vista publicada',property:'Según evidencia de la ejecución',method:methods[ruleId]??'Por definir',tolerance:tolerance??null,possibleResults:controlType==='INFORMATION'?['INFORMATION','NOT EVALUATED']:controlType==='SEMANTIC_AI'?['WARNING','NOT EVALUATED','N/A']:['PASS','WARNING','FAIL','NOT EVALUATED','N/A'],severity:controlType==='INFORMATION'?'Informativa':'Por Configurar',evidenceRequired:'Fuente, versión, vista, propiedad, valor e identificadores afectados',goodPractice:'Por Configurar',catalog:'GLOBAL → COMPANY → PROJECT',configurationStatus:methods[ruleId]&&!tolerance?'Disponible':'Por Configurar',version:'1.0.0',active:true};
});
