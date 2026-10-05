import {notFound} from 'next/navigation';
import {ProjectConfigurationPage} from '@/components/project-configuration';
import {moduleIdSchema} from '@/lib/projects/modules';
export default async function Page({params}:{params:Promise<{moduleId:string}>}){
 if(!moduleIdSchema.safeParse((await params).moduleId).success)notFound();
 return <ProjectConfigurationPage/>;
}
