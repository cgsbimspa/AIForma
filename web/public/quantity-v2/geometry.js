// Geometry is measured on the published tessellation, never on an AI estimate.
// Epsilon is numerical vertex welding in meters, not a floor/elevation tolerance.
const EPS=1e-6, ANGLE=1e-6;
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
const norm=a=>Math.hypot(...a);
export function inspectTriangles(triangles){
 if(!triangles.length)return {available:false,issue:'Geometría de triángulos no disponible'};
 const points=triangles.flat();
 if(points.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))return {available:false,issue:'Coordenadas no válidas'};
 const min=[0,1,2].map(i=>Math.min(...points.slice(0,1).map(p=>p[i]))),max=[...min];
 for(const p of points)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 const center=min.map((v,i)=>(v+max[i])/2),edges=new Map(),planes=new Map();
 const parents=triangles.map((_,i)=>i);const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 const key=p=>p.map(v=>Math.round(v/EPS)).join(',');
 let signedVolume=0,weighted=[0,0,0],surfaceArea=0,bottomArea=0,topArea=0,verticalArea=0,degenerate=false;
 for(const [index,[a,b,c]] of triangles.entries()){
  const cr=cross(sub(b,a),sub(c,a)),doubleArea=norm(cr);
  if(doubleArea<EPS*EPS){degenerate=true;continue;}
  const n=cr.map(v=>v/doubleArea),area=doubleArea/2;surfaceArea+=area;
  if(Math.abs(n[2])<ANGLE)verticalArea+=area;
  if(n[2]<-1+ANGLE)bottomArea+=area;if(n[2]>1-ANGLE)topArea+=area;
  const pkey=[...n, dot(n,sub(a,center))].map(v=>Math.round(v/EPS)).join(',');
  const plane=planes.get(pkey)??{normal:n,area:0};plane.area+=area;planes.set(pkey,plane);
  const aa=sub(a,center),bb=sub(b,center),cc=sub(c,center),v=dot(aa,cross(bb,cc))/6;
  signedVolume+=v;for(let i=0;i<3;i++)weighted[i]+=v*(aa[i]+bb[i]+cc[i])/4;
  for(const [p,q] of [[a,b],[b,c],[c,a]]){const x=key(p),y=key(q),k=x<y?x+'|'+y:y+'|'+x;const edge=edges.get(k)??{count:0,balance:0,index};parents[root(index)]=root(edge.index);edge.count++;edge.balance+=x<y?1:-1;edges.set(k,edge);}
 }
 const components=new Set(parents.map((_,i)=>root(i))).size;
 // Multiple shells need a boolean-union/contact analysis before net quantities.
 const closed=components===1&&!degenerate&&[...edges.values()].every(e=>e.count===2&&e.balance===0)&&Math.abs(signedVolume)>EPS**3;
 // Reversed/heterogeneous windings do not support face orientation or net volume.
 const oriented=closed&&signedVolume>0;
 const centroid=oriented?weighted.map((v,i)=>v/signedVolume+center[i]):center;
 const caps=[...planes.values()].filter(p=>Math.abs(p.normal[2])>1-ANGLE);
 const horizontalPrism=oriented&&caps.length===2&&Math.abs(topArea-bottomArea)<=EPS*Math.max(1,topArea)&&Math.abs(surfaceArea-topArea-bottomArea-verticalArea)<=EPS*Math.max(1,surfaceArea)&&topArea>0;
 let perimeter=null;
 if(horizontalPrism&&max[2]-min[2]>EPS)perimeter=verticalArea/(max[2]-min[2]);
 const verticalPlanes=[...planes.values()].filter(p=>Math.abs(p.normal[2])<ANGLE);
 const rectangular=horizontalPrism&&verticalPlanes.length===4&&[...planes.values()].length===6&&verticalPlanes.every(p=>verticalPlanes.some(q=>dot(p.normal,q.normal)<-1+ANGLE)&&verticalPlanes.every(q=>Math.abs(dot(p.normal,q.normal))<ANGLE||Math.abs(Math.abs(dot(p.normal,q.normal))-1)<ANGLE));
 return {available:true,issue:oriented?null:components>1?'Varios cuerpos: unión y contactos geométricos pendientes':'Malla no cerrada, orientación incoherente o geometría degenerada',closed:oriented,components,volume:oriented?signedVolume:null,centroid,centroidMethod:oriented?'GEOMETRIC_CENTROID':'BOUNDING_BOX',bbox:{min,max},surfaceArea,bottomArea:oriented?bottomArea:null,verticalArea:oriented?verticalArea:null,topArea:oriented?topArea:null,thickness:horizontalPrism?max[2]-min[2]:null,perimeter,horizontalPrism,rectangularPrism:rectangular,twoLateralArea:rectangular?2*Math.max(...verticalPlanes.map(p=>p.area)):null,triangleCount:triangles.length,precision:'TESSELLATED_GEOMETRY',numericToleranceM:EPS};
}
export function geometryFallback(bbox,issue){return {available:false,issue,bbox,centroid:bbox?bbox.min.map((v,i)=>(v+bbox.max[i])/2):null,centroidMethod:'BOUNDING_BOX',closed:false};}
