// Product categories and formulas supplied in the MEP specification (2026-09-25).
// Add categories/specialties here without changing the quantity algorithms.
export const mepSpecialties = [
 {code:'APF',name:'Agua Potable Fría'}, {code:'APC',name:'Agua Potable Caliente'},
 {code:'ALC',name:'Alcantarillado'}, {code:'GAS',name:'Gas'},
 {code:'PCI',name:'Protección Contra Incendio'}, {code:'VNT',name:'Ventilación / Climatización'},
 {code:'ELE',name:'Electricidad'},
];
export const mepCategories = [
 {category:'Pipes',aliases:['Tuberías','OST_PipeCurves'],service:'pipe',metric:'pipes',label:'Tuberías',unit:'ml'},
 {category:'Pipe Fittings',aliases:['Uniones de tubería','Accesorios de unión de tuberías','OST_PipeFitting'],service:'equipment',metric:'pipeFittings',label:'Uniones de tubería',unit:'un'},
 {category:'Pipe Accessories',aliases:['Accesorios de tuberías','Accesorios de tubería','OST_PipeAccessory'],service:'equipment',metric:'pipeAccessories',label:'Accesorios de tubería',unit:'un'},
 {category:'Plumbing Fixtures',aliases:['Aparatos sanitarios','Artefactos sanitarios','OST_PlumbingFixtures'],service:'equipment',metric:'fixtures',label:'Artefactos',unit:'un'},
 {category:'Ducts',aliases:['Conductos','Ductos','OST_DuctCurves'],service:'duct',metric:'ducts',label:'Ductos',unit:'ml',specialty:'VNT'},
 {category:'Duct Fittings',aliases:['Uniones de conducto','Uniones de conductos','OST_DuctFitting'],service:'equipment',metric:'ductFittings',label:'Uniones de ducto',unit:'un',specialty:'VNT'},
 {category:'Duct Accessories',aliases:['Accesorios de conductos','OST_DuctAccessory'],service:'equipment',metric:'ductAccessories',label:'Accesorios de ducto',unit:'un',specialty:'VNT'},
 {category:'Air Terminals',aliases:['Terminales de aire','OST_DuctTerminal'],service:'equipment',metric:'terminals',label:'Terminales',unit:'un',specialty:'VNT'},
 {category:'Conduits',aliases:['Conduit','Tubos','OST_Conduit'],service:'electrical',metric:'conduits',label:'Conduits',unit:'ml',specialty:'ELE'},
 {category:'Conduit Fittings',aliases:['Uniones de tubo','OST_ConduitFitting'],service:'equipment',metric:'conduitFittings',label:'Uniones de conduit',unit:'un',specialty:'ELE'},
 {category:'Cable Trays',aliases:['Bandejas de cables','OST_CableTray'],service:'electrical',metric:'trays',label:'Bandejas',unit:'ml',specialty:'ELE'},
 {category:'Cable Tray Fittings',aliases:['Uniones de bandeja de cables','OST_CableTrayFitting'],service:'equipment',metric:'trayFittings',label:'Uniones de bandeja',unit:'un',specialty:'ELE'},
 {category:'Mechanical Equipment',aliases:['Equipos mecánicos','Equipo mecánico','OST_MechanicalEquipment'],service:'equipment',metric:'equipment',label:'Equipos',unit:'un'},
 {category:'Electrical Equipment',aliases:['Equipos eléctricos','Equipo eléctrico','OST_ElectricalEquipment'],service:'equipment',metric:'equipment',label:'Equipos',unit:'un',specialty:'ELE'},
 {category:'Lighting Fixtures',aliases:['Luminarias','OST_LightingFixtures'],service:'equipment',metric:'lighting',label:'Luminarias',unit:'un',specialty:'ELE'},
 {category:'Sprinklers',aliases:['Rociadores','OST_Sprinklers'],service:'equipment',metric:'sprinklers',label:'Rociadores',unit:'un',specialty:'PCI'},
];
export const mepRule={id:'cgs-mep-quantities',version:'1',source:'Especificación MEP aportada por el usuario, 25-09-2026'};
export const systemClassificationSource='https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/43ec0d75-d6bb-2d08-a920-9715e83040e7.htm';
// Only unambiguous published classifications. OtherPipe, Vent and hydronic
// classifications need an explicit project association; never guess from Pipes.
export const systemClassifications={
 APF:['DomesticColdWater','Domestic Cold Water','Agua fría sanitaria'],
 APC:['DomesticHotWater','Domestic Hot Water','Agua caliente sanitaria'],
 ALC:['Sanitary','Sanitario'],
 PCI:['FireProtectDry','FireProtectOther','FireProtectPreaction','FireProtectWet','Fire Protection Dry','Fire Protection Wet','Fire Protection Preaction','Fire Protection Other'],
 VNT:['SupplyAir','Supply Air','ReturnAir','Return Air','ExhaustAir','Exhaust Air','OtherAir','Other Air'],
 ELE:['CableTrayConduit','PowerCircuit','PowerBalanced','PowerUnBalanced','Power','DataCircuit','Communication','Controls','FireAlarm','NurseCall','Security','Telephone'],
};
