// Review topics supplied by the project owner. These are NOT legal thresholds.
export const root = '/coordinacion-normativa';
export const groups = ['GEOMETRÍA','CONECTIVIDAD','HIDRÁULICA','NORMATIVA'] as const;
export const systems = [
 {id:'SAN-01',slug:'alcantarillado-interior',name:'Alcantarillado Interior',topics:[['CONECTIVIDAD','Conectividad de red|Continuidad|Artefactos desconectados|Tuberías desconectadas|Dirección del flujo|Ventilaciones|Redes huérfanas'],['GEOMETRÍA','Pendientes|Contrapendientes|Cambios de dirección'],['HIDRÁULICA','Diámetros|Estrangulamientos aguas abajo|Capacidad hidráulica|UEH'],['NORMATIVA','Registros|Cámaras|Accesibilidad de registros']]},
 {id:'SAN-02',slug:'alcantarillado-exterior',name:'Alcantarillado Exterior',topics:[['CONECTIVIDAD','Continuidad entre edificios y red exterior|Conexión al punto de descarga|Redes desconectadas'],['GEOMETRÍA','Pendientes|Contrapendientes|Cotas|Separación entre cámaras|Cambios de dirección|Cambios de pendiente'],['HIDRÁULICA','Diámetros|Estrangulamientos|Capacidad|UEH acumuladas'],['NORMATIVA','Cámaras|Última cámara']]},
 {id:'SAN-03',slug:'agua-fria-interior',name:'Agua Potable Fría Interior',topics:[['CONECTIVIDAD','Continuidad|Alimentación desde medidor o punto de suministro|Artefactos sin conexión|Redes abiertas|Alimentación de equipos'],['HIDRÁULICA','Caudal instalado|QI|QMP|Diámetro|Velocidad|Pérdidas de carga|Presión|Punto hidráulicamente más desfavorable'],['NORMATIVA','Válvulas|Sectorización']]},
 {id:'SAN-04',slug:'agua-fria-exterior',name:'Agua Potable Fría Exterior',topics:[['CONECTIVIDAD','Continuidad de red|Alimentación de edificios|Conexiones|Tramos sin continuidad'],['HIDRÁULICA','Diámetros|Caudales acumulados|Velocidades|Pérdidas de carga|Presiones'],['NORMATIVA','Válvulas|Sectorización|Medidores|Remarcadores']]},
 {id:'SAN-05',slug:'agua-caliente',name:'Agua Potable Caliente',topics:[['CONECTIVIDAD','Alimentación desde agua potable fría|Conexión al equipo productor de ACS|Continuidad|Artefactos conectados|Artefactos sin ACS|Recorrido hidráulico'],['HIDRÁULICA','QI|QMP|Diámetros|Velocidades|Pérdidas de carga|Presión'],['NORMATIVA','Válvulas|Equipo productor']]},
] as const;
export const specialties = [
 {id:'SANITARY',slug:'sanitario',name:'Sanitario',enabled:true},
 ...[['ARCHITECTURE','arquitectura','Arquitectura'],['STRUCTURE','estructuras','Estructuras'],['ELECTRICAL','electricidad','Electricidad'],['HVAC','climatizacion','Climatización'],['GAS','gas','Gas'],['PCI','pci','PCI'],['TELECOM','telecomunicaciones','Telecomunicaciones'],['CROSS','entre-especialidades','Coordinación entre Especialidades']].map(([id,slug,name])=>({id,slug,name,enabled:false})),
];
export const futureCoordination = ['Sanitario + Arquitectura','Sanitario + Estructura','Sanitario + Electricidad','Sanitario + Climatización','Sanitario + PCI','Revisión Multidisciplinaria'];
export const hotWaterFuture = ['Recirculación de agua caliente','Bombas','Acumuladores','Sistemas centralizados'];
export const href=(slug='')=>`${root}${slug?`/${slug}`:''}`;
export const systemHref=(id:string)=>href(`sanitario/${systems.find(s=>s.id===id)?.slug??''}`);
export const reviewTopics=systems.flatMap(s=>s.topics.flatMap(([group,names],g)=>names.split('|').map((name,i)=>({id:`${s.id}-${g+1}${String(i+1).padStart(2,'0')}`,systemId:s.id,name,group:group as typeof groups[number]}))));
export const engineVersion='coordination-1.1';
