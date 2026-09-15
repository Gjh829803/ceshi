import {afterEach,expect,it} from 'vitest';
import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {hashCameraDocument,parseCameraDocument} from '@worldkit/three';
import type {WorldSnapshot} from '@worldkit/three';
import {Quaternion,Vector3} from 'three';
import type {Page} from 'playwright';
import {openEpisodeBrowser} from '@worldkit/episode-pipeline/browser';
import {ThreeCreatorTools} from '../../src/tools/tools';
import {executeThreeCreatorTool} from '../../src/cli/mcp';
import {sha256} from '../../src/contracts';
const services:ThreeCreatorTools[]=[];
afterEach(async()=>{for(const service of services.splice(0)){await service.close();await rm(service.workspace,{recursive:true,force:true});}});
it('compiles the discovered relative JSON binding into a self-contained runtime and verifies adopted and sealed identities',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'camera-binding-')),service=new ThreeCreatorTools(root,'three-sdk');services.push(service);
 await service.materializeRuntime();
 const example=await executeThreeCreatorTool(service,'creator_get_examples',{topic:'nonhuman-subject'}) as any;
 expect(example.files['config/camera.json']).toBeDefined();
 await mkdir(path.join(root,'config'));const bytes=example.files['config/camera.json'];await writeFile(path.join(root,'config/camera.json'),bytes);
 await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
 await writeFile(path.join(root,'index.html'),'<html><body><script type="module" src="./main.ts"></script></body></html>');
 const binding=example.files['main.ts'].replace('declare const world: ThreeWorld;', 'const world=await createWorld({scene:new Scene(),camera:new PerspectiveCamera(),canvas,navigation:false});const ground=new Mesh(new BoxGeometry(100,1,100),new MeshBasicMaterial());ground.position.y=-.5;world.addEntity({id:"floor",object:ground,role:"terrain"});').replace("declare const character: Parameters<ThreeWorld['addCharacter']>[0];","const character={id:'actor',object:new Group(),body:{heightMeters:1.8,radiusMeters:.3},eyePositionLocalMetersXYZ:[0,1.6,0] as const};");
 await writeFile(path.join(root,'main.ts'),`import {createWorld} from '@worldkit/three';\nimport {Scene,PerspectiveCamera,Group,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';\nconst canvas=document.createElement('canvas');document.body.append(canvas);\n${binding}\nawait world.start();world.stop();(window as any).cameraBindingWorld=world;`);
 const candidate=await service.compiler.prepare();
 expect(sha256((await service.compiler.sourceFiles()).get('config/camera.json')!)).toBe(sha256(bytes));
 expect(await readFile(path.join(candidate.sourceRoot,'config/camera.json'),'utf8')).toBe(bytes);
 const op=await executeThreeCreatorTool(service,'world_inspect',{sections:['camera']}) as {operationId:string};
 const result=await service.getOperation(op.operationId,25);expect(result.status,result.error).toBe('succeeded');
 expect(result.result!.runtimeSourceHash).toBe(candidate.runtimeSourceHash);
 expect(result.result!.observation.camera.documentHash).toBe(hashCameraDocument(parseCameraDocument(JSON.parse(bytes))));
 expect(result.result!.observation.camera.resolved.viewId).toBe('third-person');
 expect(result.result!.pageErrors).toEqual([]);
 const before=(await service.inspect({sections:['snapshot']})).observation.snapshot;
 const current=await service.preview('current');
 expect(current.cameraObservation.camera).toEqual(result.result!.observation.camera);
 expect((await service.inspect({sections:['snapshot']})).observation.snapshot).toEqual(before);
 const page=(service as unknown as {session:{page:Page}}).session.page;
 for(const direction of [-1,1]){
  const samples=await page.evaluate(direction=>{const world=(window as any).cameraBindingWorld,samples=[world.snapshot()];for(let tick=0;tick<180;tick++){world.step({moveXRatio:direction});samples.push(world.snapshot());}return samples;},direction);
  expectLateralWalk(samples,direction,'actor');
 }
 await writeFile(path.join(candidate.sourceRoot,'config/camera.json'),bytes+' ');
 await expect(service.compiler.prepare()).rejects.toThrow('THREE_ARTIFACT_CHANGED');
},30000);

function expectLateralWalk(samples:WorldSnapshot[],direction:number,actorId='rider'){
 const first=samples[0]!,last=samples.at(-1)!;
 const position=(sample:WorldSnapshot)=>new Vector3(...sample.entities.find(entity=>entity.id===actorId)!.positionWorldMetersXYZ);
 const rotation=(sample:WorldSnapshot)=>new Quaternion(...sample.camera.orientationWorldQuaternionXYZW);
 const right=new Vector3(1,0,0).applyQuaternion(rotation(first)).setY(0).normalize();
 expect(position(last).sub(position(first)).dot(right)*direction).toBeGreaterThan(2);
 // Orbit intent alone misses inherited subject rotation. Check the world camera at every sample.
 for(const sample of samples){
  if(sample.humanoid)expect(sample.humanoid.mountedInstanceId).toBeNull();
  expect(rotation(sample).angleTo(rotation(first))).toBeLessThan(1e-6);
  expect(sample.errors).toEqual([]);
 }
}

it('keeps the MCP human example camera stable after dismount and through independent Episode walking',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'human-camera-binding-')),service=new ThreeCreatorTools(root,'three-sdk');services.push(service);
 const example=await executeThreeCreatorTool(service,'creator_get_examples',{topic:'getting-started'}) as {files:Record<string,string>};
 const document=parseCameraDocument(JSON.parse(example.files['config/camera.json']!));
 const configuration={...document,binding:{...document.binding,targetEntityId:'rider',subjectOverrides:{
  rider:document.binding.subjectOverrides!.player!,
  scooter:{views:{'third-person':{overrides:{orientation:{referenceFrame:'subject-heading',inheritSubjectYaw:true,recenter:{enabled:true}}}}}},
 }},views:{...document.views,inspection:{kind:'third-person',presetId:'humanoid.third-person'}}};
 await mkdir(path.join(root,'config'));
 await writeFile(path.join(root,'config/camera.json'),JSON.stringify(configuration));
 await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.uefn-mannequin']}));
 await writeFile(path.join(root,'index.html'),'<html><body style="margin:0"><script type="module" src="./main.ts"></script></body></html>');
 const binding=example.files['main.ts']!
  .replace("declare const options: Omit<HumanoidWorldOptions, 'characterId'>;",`const options: Omit<HumanoidWorldOptions,'characterId'>={scene,canvas,map,initialMountId:'scooter',vehicles:[{instanceId:'scooter',assetId:'custom.motorcycle',object:new Group(),spec:humanoid.createRoadVehicleSpec('motorcycle')}]};`)
  .replace('declare const opening: CameraOpeningConfiguration;',`const opening:CameraOpeningConfiguration={positionWorldMetersXYZ:[0,8,28],lookAtWorldMetersXYZ:[0,1,0],fovDegrees:48};`);
 await writeFile(path.join(root,'main.ts'),`
import {Scene,Group,HemisphereLight} from 'three';
import {humanoid} from '@worldkit/three';
const scene=new Scene();scene.add(new HemisphereLight(0xffffff,0xffffff,2));
const canvas=document.createElement('canvas');document.body.append(canvas);
const map={id:'camera-walk',name:'Camera walk',description:'',bounds:{min:[-80,-5,-80],max:[80,50,80]},boxes:[{id:'floor',position:[0,-.5,0],size:[160,1,160]}],water:[],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[160,160],color:'#fff',modes:['motorcycle']}],playerSpawn:[0,.025,0],spawns:[{id:'scooter-start',name:'Scooter',regionId:'road',vehicleId:'scooter',position:[0,.025,0],yaw:Math.PI}]};
${binding}
(window as any).cameraBindingWorld=world;
`);
 const candidate=await service.compiler.prepare();
 await service.preview('opening');
 const page=(service as unknown as {session:{page:Page}}).session.page;
 const read=()=>page.evaluate(()=>{const world=(window as any).cameraBindingWorld;return {snapshot:world.snapshot(),camera:world.inspectCamera()};});
 const opening=await read();
 expect(new Vector3(...opening.snapshot.camera.positionWorldMetersXYZ).distanceTo(new Vector3(0,8,28))).toBeLessThan(1e-9);
 expect(opening.camera.resolved.values.orientation).toMatchObject({referenceFrame:'subject-heading',inheritSubjectYaw:true,recenter:{enabled:true}});
 expect(Object.keys(opening.camera.document.views).sort()).toEqual(['first-person','inspection','shoulder','third-person']);
 expect(opening.camera.document.presets).toEqual(document.presets);
 // Public driving still rotates the vehicle camera; reset returns to the sealed mounted opening.
 const driven=await page.evaluate(()=>{const world=(window as any).cameraBindingWorld;world.step({moveZRatio:-1,moveXRatio:.5},90);return world.snapshot();});
 expect(new Quaternion(...driven.camera.orientationWorldQuaternionXYZW).angleTo(new Quaternion(...opening.snapshot.camera.orientationWorldQuaternionXYZW))).toBeGreaterThan(.05);
 await service.preview('opening');
 await page.evaluate(()=>window.__THREE_CREATOR_HOST__!.start());
 await page.keyboard.press('f');
 await expect.poll(async()=>{const state=(await read()).snapshot.humanoid;return state.mountedInstanceId===null&&state.transition.remainingSeconds===0;},{timeout:10000}).toBe(true);
 await page.evaluate(()=>{(window as any).cameraBindingWorld.stop();});
 expect((await read()).camera.resolved.values.orientation).toMatchObject({referenceFrame:'world-up',recenter:{enabled:false}});
 for(const direction of [-1,1]){
  const samples=await page.evaluate(direction=>{const world=(window as any).cameraBindingWorld,samples=[world.snapshot()];for(let tick=0;tick<180;tick++){world.step({moveXRatio:direction});samples.push(world.snapshot());}return samples;},direction);
  expectLateralWalk(samples,direction);
 }
 const beforeOrbit=(await read()).snapshot;
 const afterOrbit=await page.evaluate(()=>{const world=(window as any).cameraBindingWorld;world.step({cameraYawRatio:1},15);return world.snapshot();});
 expect(new Quaternion(...afterOrbit.camera.orientationWorldQuaternionXYZW).angleTo(new Quaternion(...beforeOrbit.camera.orientationWorldQuaternionXYZW))).toBeGreaterThan(.05);
 await service.preview('opening');
 expect((await read()).snapshot.camera.positionWorldMetersXYZ).toEqual(opening.snapshot.camera.positionWorldMetersXYZ);
 expect((await read()).camera.documentHash).toBe(opening.camera.documentHash);
 // An independent consumer uses those same compiled bytes and the exclusive Episode clock.
 const episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
 try{
  await episode.prepareSegment({positionWorldMetersXYZ:[5,.025,0],facingYawRadians:0,humanoid:{mounted:false}},{widthPixels:640,heightPixels:360});
  for(const direction of [-1,1]){
   const samples=[await episode.advance({},1)];
   for(let interval=0;interval<18;interval++)samples.push(await episode.advance({moveXRatio:direction},10));
   expectLateralWalk(samples,direction);
  }
  expect(await episode.frame('image/png')).toEqual(await episode.frame('image/png'));
  expect(episode.errors).toEqual([]);
 }finally{await episode.close();}
},60000);
