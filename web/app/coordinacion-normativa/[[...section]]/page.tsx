import {notFound} from 'next/navigation';
import {systems,specialties} from '@/lib/coordination/catalog';
import {CoordinationPage} from '@/components/coordination/page';
export default async function Page({params}:{params:Promise<{section?:string[]}>}){
 const path=(await params).section??[],system=path[0]==='sanitario'?systems.find(s=>s.slug===path[1]):undefined;
 if(!path.length||path.length===1&&(path[0]==='sanitario'||specialties.some(s=>s.slug===path[0])))return <CoordinationPage section={path[0]??'resumen'}/>;
 if(!system||path.length>3||path[2]&&!['configuracion','reglas','historial'].includes(path[2]))notFound();
 return <CoordinationPage systemId={system.id} section={path[2]??'revision'}/>;
}
