import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Ajv from 'ajv';
import {Quaternion} from 'three';
import type {Page} from 'playwright';
import {ThreeCreatorTools} from '../../src/tools/tools.js';
import {executeThreeCreatorTool} from '../../src/cli/mcp.js';
import {EPISODE_SCHEMA,type EpisodeStep} from '../../src/contracts.js';

const services:ThreeCreatorTools[]=[];
afterEach(async()=>{for(const service of services.splice(0)){await service.close();await rm(service.workspace,{recursive:true,force:true});}});
const drive=(z:number,timeoutSeconds=20)=>({driveTo:{vehicleId:'vehicle',positionWorldMetersXYZ:[0,0,z] as [number,number,number],maximumSpeedMetersPerSecond:4},timeoutSeconds});
async function fixture(family:'car'|'motorcycle'='motorcycle',blocked=false,renderWorkMilliseconds=0){
 const root=await mkdtemp(path.join(os.tmpdir(),'creator-road-route-'));
 const service=new ThreeCreatorTools(root,'three-sdk');services.push(service);
 await writeFile(path.join(root,'index.html'),'<html><body style="margin:0"><canvas></canvas><script type="module" src="./main.ts"></script></body></html>');
 await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
 await writeFile(path.join(root,'main.ts'),`
import {Scene,PerspectiveCamera,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';
import {createWorld,humanoid,createHumanoidCameraDocument} from '@worldkit/three';
const scene=new Scene();
const ground=new Mesh(new BoxGeometry(100,1,100),new MeshBasicMaterial({color:0xcccccc}));ground.position.y=-.5;scene.add(ground);
const vehicle=new Mesh(new BoxGeometry(1,1,2),new MeshBasicMaterial({color:0xbb3322}));
const player=new Mesh(new BoxGeometry(.4,1.5,.4),new MeshBasicMaterial({color:0x995511}));
const spec=humanoid.createRoadVehicleSpec('${family}');
const map={id:'road',name:'Road',description:'',bounds:{min:[-50,-5,-50],max:[50,20,50]},boxes:[{id:'floor',position:[0,-.5,0],size:[100,1,100]}${blocked?',{id:"wall",position:[0,2,6],size:[20,4,1]}':''}],water:[],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[100,100],color:'#fff',modes:[spec.mode]}],spawns:[{id:'parking',name:'Parking',regionId:'road',vehicleId:'vehicle',position:[0,0,0],yaw:0}],playerSpawn:[-5,0,0]};
const world=await createWorld({scene,camera:new PerspectiveCamera(),canvas:document.querySelector('canvas'),humanoid:{map,vehicles:[{instanceId:'vehicle',assetId:'custom.vehicle',object:vehicle,spec}],character:{instanceId:'player',object:player,initialMountId:'vehicle'}}});
world.setCameraFollow({configuration:createHumanoidCameraDocument('player')});
world.setCaptureTargets(['player']);world.createPresentation();
// Deliberately expensive drawing models a busy browser without replacing the SDK clock.
if(${renderWorkMilliseconds}>0)world.onRender(()=>{const until=performance.now()+${renderWorkMilliseconds};while(performance.now()<until){};});
await world.start();window.routeTestWorld=world;
`);
 return service;
}
async function record(service:ThreeCreatorTools,steps:EpisodeStep[]){
 await writeFile(path.join(service.workspace,'episode.json'),JSON.stringify({schemaVersion:2,steps,targets:[]}));
 const started=await executeThreeCreatorTool(service,'world_playtest',{framesPerSecond:1}) as {operationId:string};
 let operation;do{operation=await service.getOperation(started.operationId,25);}while(['queued','running'].includes(operation.status));
 expect(operation.status,JSON.stringify(operation.error)).toBe('succeeded');
 return operation.result;
}
async function inputOverride(service:ThreeCreatorTools){
 return (service as unknown as {session:{page:Page}}).session.page.evaluate(()=>(window as any).routeTestWorld.humanoid.inspectControls().override);
}
it('validates exclusive bounded road steps and retains legacy timed plans',()=>{
 const check=new Ajv({strict:false}).compile(EPISODE_SCHEMA);
 const plan=(step:unknown,schemaVersion=2)=>({schemaVersion,steps:[step],targets:[]});
 expect(check(plan(drive(8)))).toBe(true);
 expect(check(plan({durationSeconds:1,keysDown:['KeyW']},1))).toBe(true);
 for(const step of [{...drive(8),durationSeconds:1},{...drive(8),keysDown:['KeyW']},{...drive(8),commands:[]},{...drive(8),timeoutSeconds:0},{driveTo:drive(8).driveTo},{durationSeconds:1,timeoutSeconds:2}])expect(check(plan(step))).toBe(false);
 expect(check(plan(drive(8),1))).toBe(false);
});

for(const family of ['car','motorcycle'] as const)it(`${family}: records arrival, stop, dismount and stable lateral camera`,async()=>{
 const service=await fixture(family);
 const report=await record(service,[drive(8),{keysDown:['KeyF'],durationSeconds:.15},{keysUp:['KeyF'],durationSeconds:.7},
   {keysDown:['KeyA'],durationSeconds:.8},{keysUp:['KeyA'],durationSeconds:.1},{keysDown:['KeyD'],durationSeconds:.8},{keysUp:['KeyD'],durationSeconds:.1}]);
 expect(report.status,report.failure).toBe('passed');expect(report.isCompleteEpisode).toBe(true);
 expect(report.roadRouteResults[0]).toMatchObject({status:'arrived',stopAtTarget:true});
 expect(report.roadRouteResults[0].subjectIdentity).toMatchObject({actorId:'player',vehicleId:'vehicle',actorGeneration:expect.any(Number),vehicleGeneration:expect.any(Number),lifecycleGeneration:expect.any(Number)});
 expect(report.feedback.roadRoutes.steps[0].status).toBe('arrived');
 const summary=await service.readPlaytest(report.readTrace.arguments.operationId);
 expect(summary).toMatchObject({recording:{roadRoutes:{steps:[{status:'arrived'}]}}});
 expect(report.roadRouteResults[0].finalSample.speedMetersPerSecond).toBeLessThanOrEqual(.25);
 const roadTrace=JSON.parse(await readFile(path.join(path.dirname(report.videoPath),report.roadRouteTrace.file),'utf8'));
 expect(roadTrace.episodeHash).toBe(report.episodeHash);expect(roadTrace.steps[0].samples.length).toBe(report.roadRouteResults[0].sampleCount);
 expect(roadTrace.steps[0].subjectIdentity).toEqual(report.feedback.roadRoutes.steps[0].subjectIdentity);
 expect(report.lastObservation.snapshot.humanoid.mountedInstanceId).toBeNull();
 expect(await inputOverride(service)).toBeNull();
 const trace=JSON.parse(await readFile(path.join(path.dirname(report.videoPath),'trace.json'),'utf8'));
 const walkingStart=report.hostKeyboardEvents.find((e:any)=>e.type==='keydown'&&e.key==='KeyA').wallSeconds;
 const walking=trace.samples.filter((s:any)=>s.wallSeconds>=walkingStart);
 expect(walking.length).toBeGreaterThan(4);
 const first=new Quaternion(...walking[0].camera.orientationWorldQuaternionXYZW);
 for(const sample of walking){expect(sample.humanoid.mountedInstanceId).toBeNull();expect(first.angleTo(new Quaternion(...sample.camera.orientationWorldQuaternionXYZW))).toBeLessThan(1e-6);}
 expect(report.runtimeErrors).toEqual([]);expect(report.pageErrors).toEqual([]);
},45000);

it('submits a complete road-input-only recording without waiting out the timeout',async()=>{
 const service=await fixture(),report=await record(service,[drive(4,25)]);
 expect(report.status,report.failure).toBe('passed');expect(report.capturedKeyboardInput).toBe(false);expect(report.capturedRoadInput).toBe(true);
 expect(report.inputWallSeconds).toBeLessThan(20);expect(report.recordingReadiness.eligible).toBe(true);
 expect(await inputOverride(service)).toBeNull();
 expect((await service.submit()).technicalStatus).toBe('passed');
},45000);

for(const renderWorkMilliseconds of [0,25])it(`records a continuous return circuit with ${renderWorkMilliseconds} ms render work`,async()=>{
 const service=await fixture('motorcycle',false,renderWorkMilliseconds);
 const points:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[[0,0,8],[8,0,8],[8,0,0],[0,0,0]];
 const report=await record(service,[...points.map(positionWorldMetersXYZ=>({driveTo:{vehicleId:'vehicle',positionWorldMetersXYZ,maximumSpeedMetersPerSecond:3},timeoutSeconds:35})),
  {keysDown:['KeyF'],durationSeconds:.15},{keysUp:['KeyF'],durationSeconds:.8}]);
 expect(report.status,report.failure).toBe('passed');expect(report.isCompleteEpisode).toBe(true);
 expect(report.completedSteps).toBe(6);expect(report.roadRouteResults).toHaveLength(4);
 const identity=report.roadRouteResults[0].subjectIdentity;
 for(const [index,route] of report.roadRouteResults.entries()){
  expect(route.status).toBe('arrived');expect(route.subjectIdentity).toEqual(identity);
  expect(route.finalSample.speedMetersPerSecond).toBeLessThanOrEqual(.25);
  expect(Math.hypot(...route.finalSample.positionWorldMetersXYZ.map((n:number,i:number)=>n-points[index]![i]!))).toBeLessThanOrEqual(1.5);
  if(index)expect(route.startSimulationTick).toBeGreaterThanOrEqual(report.roadRouteResults[index-1].endSimulationTick);
 }
 expect(report.roadRouteResults[0].finalSample.positionWorldMetersXYZ[2]).toBeGreaterThan(6);
 expect(report.hostKeyboardEvents.some((event:any)=>event.type==='lifecycle'&&event.action==='reset')).toBe(false);
 expect(report.lastObservation.snapshot.humanoid.mountedInstanceId).toBeNull();
 expect(report.runtimeErrors).toEqual([]);expect(report.pageErrors).toEqual([]);
 expect(await inputOverride(service)).toBeNull();
},100000);

it('reports real wall blockage, stops the plan before dismount and releases input',async()=>{
 const service=await fixture('car',true),report=await record(service,[drive(20),{keysDown:['KeyF'],durationSeconds:.1}]);
 expect(report.status).toBe('failed');expect(report.failure).toContain('ROAD_ROUTE_BLOCKED');
 expect(report.isCompleteEpisode).toBe(false);expect(report.completedSteps).toBe(0);
 expect(report.roadRouteResults[0].status).toBe('failed');
 expect(report.hostKeyboardEvents.some((e:any)=>e.key==='KeyF')).toBe(false);
 expect(report.lastObservation.snapshot.humanoid.mountedInstanceId).toBe('vehicle');
 expect(await inputOverride(service)).toBeNull();
 await expect(service.submit()).rejects.toThrow('THREE_SUBMIT_PLAYTEST_REQUIRED');
},45000);

it('bounds timeout and rejects a missing mounted vehicle without leaking input',async()=>{
 const service=await fixture(),report=await record(service,[drive(40,.2),{keysDown:['KeyF'],durationSeconds:.1}]);
 expect(report.status).toBe('failed');expect(report.failure).toContain('THREE_ROAD_ROUTE_TIMEOUT');expect(await inputOverride(service)).toBeNull();
 const missing=await record(service,[{...drive(4),driveTo:{...drive(4).driveTo,vehicleId:'missing'}}]);
 expect(missing.status).toBe('failed');expect(missing.failure).toContain('THREE_ROAD_ROUTE_VEHICLE_NOT_MOUNTED');expect(missing.capturedInput).toBe(false);
},30000);

async function startLongRoute(service:ThreeCreatorTools){
 await writeFile(path.join(service.workspace,'episode.json'),JSON.stringify({schemaVersion:2,steps:[drive(40,40)],targets:[]}));
 const started=await executeThreeCreatorTool(service,'world_playtest',{framesPerSecond:1}) as {operationId:string};
 await vi.waitFor(async()=>{expect((await service.getOperation(started.operationId,.1)).progress).toMatchObject({phase:'road-route'});},{timeout:15000,interval:50});
 return started.operationId;
}
it('rejects a reset during driving instead of reporting a new starting pose as arrival',async()=>{
 const service=await fixture(),id=await startLongRoute(service);
 const page=(service as unknown as {session:{page:Page}}).session.page;
 await page.evaluate(async()=>{const w=(window as any).routeTestWorld;await w.reset();await w.start();});
 let op;do{op=await service.getOperation(id,25);}while(['running','queued'].includes(op.status));
 expect(op.result.status).toBe('failed');
 expect(op.result.failure).toMatch(/THREE_ROAD_ROUTE_SUBJECT_CHANGED|ROAD_ROUTE_CLOCK_CHANGED|THREE_PLAYTEST_RUNTIME_STOPPED/);
 expect(op.result.roadRouteResults[0].status).toBe('failed');expect(await inputOverride(service)).toBeNull();
},30000);
it('cancels driving by closing its own browser and cannot submit the cancelled recording',async()=>{
 const service=await fixture(),id=await startLongRoute(service);
 await service.cancel(id);
 let op;do{op=await service.getOperation(id,25);}while(['running','queued'].includes(op.status));
 expect(op.status).toBe('cancelled');
 expect((service as unknown as {session?:unknown}).session).toBeUndefined();
 await expect(service.submit()).rejects.toThrow('THREE_SUBMIT_PLAYTEST_REQUIRED');
},30000);
