import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {manifestRoots,packViewerGrant,readViewerGrant,viewerOwner,viewerResource,resolveViewerGeometry} from '../lib/quantities/viewer.ts';

// TEST-only source manifests. No real credentials or model data.
const urn='TEST_MODEL_V3',root=`urn:adsk.viewing:fs.file:${urn}/`;
test('metadata and viewer GUIDs are linked only by the published viewableID, never by name or default view',()=>{
 const geometry=(guid,viewableID,name='TEST same name')=>({type:'geometry',role:'3d',guid,viewableID,name});
 const viewer={children:[geometry('TEST_SVF','TEST_REVIT_VIEW'),geometry('TEST_OTHER','TEST_OTHER_VIEW')]};
 const metadata={derivatives:[{children:[geometry('TEST_SVF2','TEST_REVIT_VIEW')]}]};
 assert.equal(resolveViewerGeometry('TEST_SVF2',viewer,metadata),'TEST_SVF');
 assert.equal(resolveViewerGeometry('TEST_SVF',viewer,{}),'TEST_SVF');
 const resource={type:'resource',role:'graphics',mime:'application/autodesk-svf',guid:'TEST_METADATA_RESOURCE'};
 const resourceManifest={children:[{...geometry('TEST_GEOMETRY','TEST_REVIT_VIEW'),children:[resource]}]};
 assert.equal(resolveViewerGeometry('TEST_METADATA_RESOURCE',resourceManifest,{}),'TEST_GEOMETRY');
 assert.throws(()=>resolveViewerGeometry('TEST_METADATA_RESOURCE',{children:[{...geometry('TEST_GEOMETRY','TEST_REVIT_VIEW'),children:[{...resource,role:'thumbnail'}]}]},{}),/view_unavailable/);
 assert.throws(()=>resolveViewerGeometry('TEST_METADATA_RESOURCE',{children:[...resourceManifest.children,...resourceManifest.children]},{}),/view_unavailable/);
 assert.throws(()=>resolveViewerGeometry('TEST_SVF2',viewer,{children:[geometry('TEST_SVF2','TEST_UNKNOWN')]}),/view_unavailable/);
 assert.throws(()=>resolveViewerGeometry('TEST_SVF2',{children:[geometry('TEST_SVF','TEST_REVIT_VIEW'),geometry('TEST_DUP','TEST_REVIT_VIEW')]},metadata),/view_unavailable/);
 assert.throws(()=>resolveViewerGeometry('TEST_SVF2',viewer,{children:[geometry('TEST_SVF2',undefined)]}),/view_unavailable/);
});
test('viewer grant binds the verified version/view to the same signed-in session, expires and rejects tampering',()=>{
 const key=randomBytes(32),grant={owner:viewerOwner('TEST_SESSION'),urn,viewId:'TEST_VIEW',roots:[root],expiresAt:1000};
 const ticket=packViewerGrant(grant,key);
 assert.deepEqual(readViewerGrant(ticket,key,'TEST_SESSION',999),grant);
 assert.throws(()=>readViewerGrant(ticket,key,'TEST_OTHER',999),/viewer_expired/);
 assert.throws(()=>readViewerGrant(ticket,key,'TEST_SESSION',1000),/viewer_expired/);
 assert.throws(()=>readViewerGrant(ticket,randomBytes(32),'TEST_SESSION',999),/viewer_expired/);
 const tampered=Buffer.from(ticket,'base64url');tampered[30]^=1;
 assert.throws(()=>readViewerGrant(tampered.toString('base64url'),key,'TEST_SESSION',999));
});
test('viewer proxy permits only manifest-derived resources and never arbitrary URLs, models, traversal or write APIs',()=>{
 const roots=manifestRoots({urn,children:[{children:[{urn:root+'output/1/model.svf'},{urn:root+'output/properties.db'}]}]});
 assert.deepEqual(roots,[root]);
 assert.throws(()=>manifestRoots({status:'inprogress',children:[]}));
 const grant={owner:'TEST',urn,viewId:'TEST',roots,expiresAt:1000};
 const query=new URLSearchParams({domain:'https://app.cgsbim.cl',access_token:'TEST_MUST_NOT_FORWARD',redirect:'https://evil.test'});
 for(const path of [`derivativeservice/v2/manifest/${urn}`,`derivativeservice/v2/endpoints/${urn}`,`derivativeservice/v2/derivatives/${root}output/1/model.svf`,`derivativeservice/v2/regions/eu/derivatives/${root}output/1/model.svf`]){
   const url=viewerResource(grant,path.split('/'),query);assert.equal(url.origin,'https://developer.api.autodesk.com');assert.equal(url.searchParams.has('access_token'),false);assert.equal(url.searchParams.has('redirect'),false);
 }
 for(const path of ['https://evil.test','data/v1/projects','authentication/v2/token','derivativeservice/v2/manifest/TEST_OTHER',`derivativeservice/v2/derivatives/urn:adsk.viewing:fs.file:TEST_OTHER/output/model.svf`,`derivativeservice/v2/derivatives/${root}../TEST_OTHER/model.svf`,`derivativeservice/v2/derivatives/${root}%252e%252e/model.svf`,`derivativeservice/v2/derivatives/${root}output/model.svf?secret=x`])assert.throws(()=>viewerResource(grant,path.split('/'),query),/forbidden/);
});
