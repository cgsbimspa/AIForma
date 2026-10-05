import {NextRequest,NextResponse} from 'next/server';
import {authorizeData,apiError} from '@/lib/autodesk/authorize';
import {trustedMutation,profile} from '@/lib/autodesk/oauth';
import {DataError,verifyProject} from '@/lib/autodesk/data';
import {privateHeaders} from '@/lib/autodesk/http';
import {memoryInput} from '@/lib/memory/server';
import {projectTransaction} from '@/lib/memory/database';
import {projectScope} from '@/lib/quantities/contracts';
import {createProjectRegistry} from '@/lib/projects/registry';
export const runtime='nodejs';
export async function POST(request:NextRequest){try{
 const {config,session}=authorizeData(request);if(!trustedMutation(request,config))throw new DataError('forbidden',403);
 const scope=projectScope.parse(await memoryInput(request));
 const [user,project]=await Promise.all([profile(session.accessToken),verifyProject(session.accessToken,scope.hubId,scope.projectId,fetch,request.signal)]);
 const actor={organizationId:scope.hubId,projectId:scope.projectId,userId:user.id};
 return NextResponse.json({project:await createProjectRegistry(projectTransaction).enter(actor,project.name)},{headers:privateHeaders});
}catch(e){return apiError(e);}}
