import {createHumanoidCameraDocument} from '@worldkit/three';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Group,PerspectiveCamera,Vector3,Quaternion} from 'three';
import {createWorld,type EpisodeFrame,type WorldSnapshot,type VehicleSpec,type EnvironmentDefinition} from '@worldkit/three';
import {PlayerCaptureController,summarizePlayerBehavior} from '../../src/planning/player-controller.js';
import type {EpisodeSegmentPlan} from '../../src/contracts.js';
import type {RouteDecision} from '../../src/planning/route-controller.js';
import {vehicleDirectionInput,VEHICLE_FAMILIES,VehicleRouteController} from '../../src/planning/vehicle-route.js';
describe('player family route input',()=>{
 it('drives every family through bounded input without position commands',()=>{
  for(const family of VEHICLE_FAMILIES){const value=vehicleDirectionInput(family,[0,0,0],[0,0,0],[0,0,0],[5,3,20]);
    expect(Object.keys(value)).toEqual(['humanoid']);
    for(const field of ['forward','steer','roll','lift','pitch','strafe'] as const)expect(Math.abs(value.humanoid![field])).toBeLessThanOrEqual(1);
  }
 });
 it('steers ground hulls relative to body, not the rendered camera',()=>{
  expect(vehicleDirectionInput('wheeled',[0,0,0],[0,0,0],[0,0,0],[10,0,10]).humanoid!.steer).toBeLessThan(0);
  expect(vehicleDirectionInput('wheeled',[0,0,0],[0,Math.PI/2,0],[0,0,0],[10,0,0]).humanoid!.steer).toBeCloseTo(0);
 });
 it('uses depth for submarines and independent body-local axes for spacecraft',()=>{
  expect(vehicleDirectionInput('submarine',[0,-5,0],[0,0,0],[0,0,0],[0,-15,20]).humanoid!.lift).toBe(-1);
  const space=vehicleDirectionInput('spacecraft',[0,0,0],[0,0,0],[0,0,0],[8,8,0]).humanoid!;
  expect(space.strafe).toBe(-1);expect(space.lift).toBe(1);expect(space.forward).toBe(0);
 });
 it('uses elevator input and throttle for aircraft instead of ground walking',()=>{
  const plane=vehicleDirectionInput('plane',[0,20,0],[0,0,0],[0,0,10],[0,40,50]).humanoid!;
  expect(plane.forward).toBeLessThan(0);expect(plane.boost).toBe(true);
 });
});

describe('actual player capture controller and humanoid physics integration',()=>{
 const assets=JSON.parse(readFileSync(new URL('../../../../assets/three-creator/asset-catalog.json',import.meta.url),'utf8')).assets as {id:string;vehicle?:{spec:VehicleSpec}}[];
 for(const family of ['motorcycle','unicycle','raft','observation-submarine','jetski','canoe','atv','kayak','wheeled','bus','tank','plane','glider','submarine','spacecraft'] as const){
  it(`${family}: reaches successive three-dimensional waypoints through thirty seconds of capture input`,async()=>{
   const asset=assets.find(a=>family==='unicycle'?a.id==='vehicle.unicycle':family==='raft'?a.id==='vehicle.raft':family==='jetski'?a.id==='vehicle.jetski':family==='observation-submarine'?a.id==='vehicle.observation-submarine':family==='submarine'?a.id==='vehicle.submarine':family==='canoe'?a.id==='vehicle.canoe':family==='atv'?a.vehicle?.spec.archetype==='atv':family==='kayak'?a.vehicle?.spec.archetype==='kayak':a.vehicle?.spec.mode===family)!,spec=structuredClone(asset.vehicle!.spec);
   // The two submarine assets share a mode but have different speeds and routes.
   // Catalog order must not replace the fast submarine with the observation sub.
   if(family==='submarine')expect(asset.id).toBe('vehicle.submarine');
   const aquatic=family==='raft'||family==='jetski'||family==='observation-submarine'||family==='submarine'||family==='kayak'||family==='canoe',flight=family==='plane'||family==='glider';
   const y=(family==='raft'||family==='jetski'||family==='kayak'||family==='canoe')?.1:aquatic?-15:flight||family==='spacecraft'?100:.03;
   const floor=aquatic?-80:0;
   const map:EnvironmentDefinition={id:`capture-route-${family}`,name:'Independent capture route',description:'',bounds:{min:[-2000,-100,-2000],max:[2000,1000,2000]},
    boxes:[{id:'floor',position:[0,floor-1,0],size:[4000,2,4000]}],
    water:aquatic?[{id:'water',min:[-1900,-79,-1900],max:[1900,0,1900],surface:0}]:[],
    regions:[{id:'route',name:'Route',description:'',center:[0,0,0],size:[3800,3800],color:'#aaa',modes:['character',spec.mode]}],
    spawns:[{id:'parked',name:'Parked',vehicleId:'subject',position:[-100,y,-150],yaw:0,regionId:'route'}],playerSpawn:[-100,aquatic?-1.25:.03,-100]};
   const segment:EpisodeSegmentPlan={id:'segment-00',purpose:'Controller integration; not rendered video acceptance',endBehavior:'stop',
    start:{positionWorldMetersXYZ:[0,y,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'subject',mounted:true,
     ...(flight?{velocityWorldMetersPerSecondXYZ:[0,0,30],throttle:.7,launched:true}:{})}},
    waypoints:family==='unicycle'?[{positionWorldMetersXYZ:[2,y,8],gait:'walk'},{positionWorldMetersXYZ:[4,y,20],gait:'walk'},{positionWorldMetersXYZ:[0,y,100],gait:'walk'}]:family==='observation-submarine'?[{positionWorldMetersXYZ:[2,y-2,15],gait:'walk'},{positionWorldMetersXYZ:[4,y-4,35],gait:'walk'},{positionWorldMetersXYZ:[0,y,120],gait:'walk'}]:family==='canoe'?[{positionWorldMetersXYZ:[2,y,8],gait:'walk'},{positionWorldMetersXYZ:[4,y,20],gait:'walk'},{positionWorldMetersXYZ:[0,y,100],gait:'walk'}]:(family==='raft'||family==='kayak')?[{positionWorldMetersXYZ:[2,y,15],gait:'walk'},{positionWorldMetersXYZ:[4,y,35],gait:'walk'},{positionWorldMetersXYZ:[0,y,100],gait:'walk'}]:[{positionWorldMetersXYZ:[5,y+(aquatic&&family!=='jetski'?-5:flight||family==='spacecraft'?5:0),100],gait:'walk'},
     {positionWorldMetersXYZ:[15,y,250],gait:'walk'},{positionWorldMetersXYZ:[0,y,1500],gait:'walk'}]};
   const world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map,vehicles:[{instanceId:'subject',assetId:asset.id,spec,object:new Group()}],character:{instanceId:'person',object:new Group()}}});
   try{
    world.setCameraFollow({configuration:createHumanoidCameraDocument('person')});const runtime=world.humanoid!;expect(runtime.probeEpisodeStart(segment.start).isValid).toBe(true);runtime.prepareEpisodeStart(segment.start);
    expect(world.snapshot().humanoid!.vehicles[0]!.mode).toBe(spec.mode);
    const controller=new PlayerCaptureController(segment,{kind:'ground',walkSpeedMetersPerSecond:3.1,runSpeedMetersPerSecond:5.8,heightMeters:1.68,radiusMeters:.28},'follow',async start=>runtime.probeEpisodeStart(start));
    const frames:{snapshot:WorldSnapshot;camera:EpisodeFrame['camera'];decision:RouteDecision}[]=[];
    const revision=runtime.simulation.controlledActor.teleportRevision;let tick=0;
    for(let frame=0;frame<720;frame++){
     const snapshot=world.snapshot(),forward:[number,number,number]=new Vector3(0,0,-1).applyQuaternion(new Quaternion(...world.inspectCamera().current!.quaternionWorldXYZW)).toArray();
     const decision=await controller.step(snapshot,forward,frame/24);
     world.camera.updateMatrixWorld();
     frames.push({snapshot,decision,camera:{projectionMatrix:world.camera.projectionMatrix.toArray(),viewMatrix:world.camera.matrixWorldInverse.toArray(),cameraToWorldMatrix:world.camera.matrixWorld.toArray(),controlForwardWorldXYZ:forward}});
     const nextTick=Math.round((frame+1)*60/24);world.step(decision.input,nextTick-tick);tick=nextTick;
    }
    const reachedIndex=Math.max(...frames.map(f=>f.decision.waypointIndex));
    const evidence=summarizePlayerBehavior(frames);
    const health={family,assetId:asset.id,reachedIndex,lastPosition:runtime.simulation.controlledActor.vehicle!.position.toArray(),lastDistance:frames.at(-1)!.decision.distanceToTargetMeters,
     failures:frames.filter(f=>f.decision.mode==='failed').map(f=>f.decision.diagnostic?.code),yawTravel:evidence.renderedYawTravelDegrees};
    console.info('vehicle-route-physical-health',JSON.stringify(health));
    expect(health.failures,JSON.stringify(health)).toEqual([]);
    expect(reachedIndex,JSON.stringify(health)).toBeGreaterThanOrEqual(2);
    expect(evidence.renderedYawTravelDegrees).toBeGreaterThan(10);
    expect(world.simulationTick).toBe(1800);expect(runtime.simulation.controlledActor.teleportRevision).toBe(revision);
    expect(frames.every(f=>f.snapshot.errors.length===0&&f.decision.positionWorldMetersXYZ.every(Number.isFinite))).toBe(true);
    expect(new Vector3(...world.getEntityState('subject').positionWorldMetersXYZ).distanceTo(new Vector3(...segment.start.positionWorldMetersXYZ))).toBeGreaterThan(family==='unicycle'?40:family==='observation-submarine'?40:family==='canoe'?20:family==='raft'||family==='kayak'?30:100);
   }finally{world.dispose();}
  },20_000);
 }
});

it('holds mounted action waypoints without route timeout, then synchronizes segment indices', () => {
 const segment: EpisodeSegmentPlan = { id: 'segment-00', start: { positionWorldMetersXYZ: [-5, 0, 0], facingYawRadians: 0 },
  waypoints: [{ positionWorldMetersXYZ: [0, 0, 0], gait: 'walk' }, { positionWorldMetersXYZ: [0, 0, 10], gait: 'walk' }], endBehavior: 'reverse', purpose: 'mounted actions' };
 const controller = new VehicleRouteController(segment);
 const snapshot = { humanoid: { mountedInstanceId: 'car', vehicles: [{ instanceId: 'car', mode: 'wheeled' }] },
  entities: [{ id: 'car', positionWorldMetersXYZ: [0, 0, 0], rotationLocalRadiansXYZ: [0, 0, 0] }] } as unknown as WorldSnapshot;
 controller.holdWaypoint({ waypointIndex: 0, radiusMeters: .6 });
 expect(controller.step(snapshot, 0)).toMatchObject({ mode: 'action', waypointIndex: 0, input: { humanoid: { forward: 0, brake: true } } });
 expect(controller.step(snapshot, 10).mode).toBe('action');
 controller.completeHeldWaypoint(0); controller.holdWaypoint(undefined);
 expect(controller.cursor.waypointIndex).toBe(1);
 expect(controller.step(snapshot, 11)).toMatchObject({ mode: 'travel', waypointIndex: 1 });
 controller.seekCursor({ waypointIndex: 0, direction: 1, finished: false });
 expect(controller.cursor.waypointIndex).toBe(0);
 controller.holdWaypoint({ waypointIndex: 0, radiusMeters: .6 });
 expect(controller.step(snapshot, 20).mode).toBe('action');
});

for(const subtype of ['helicopter','multirotor','tiltrotor'] as const)it(`${subtype} follows an Episode route using rotor inputs`,async()=>{
 const assets=JSON.parse(readFileSync(new URL('../../../../assets/three-creator/asset-catalog.json',import.meta.url),'utf8')).assets;
 const spec={...structuredClone(assets.find((a:any)=>a.vehicle?.spec.mode==='plane').vehicle.spec),aircraftSubtype:subtype};
 const map:EnvironmentDefinition={id:'rotor-route',name:'Rotor route',description:'',bounds:{min:[-2000,-100,-2000],max:[2000,1000,2000]},boxes:[{id:'floor',position:[0,-1,0],size:[4000,2,4000]}],water:[],regions:[{id:'route',name:'Route',description:'',center:[0,0,0],size:[3800,3800],color:'#aaa',modes:['character','plane']}],spawns:[{id:'parked',name:'Parked',vehicleId:'subject',position:[0,0,0],yaw:0,regionId:'route'}],playerSpawn:[-10,0,0]};
 const world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map,vehicles:[{instanceId:'subject',assetId:'rotor',spec,object:new Group()}],character:{instanceId:'person',object:new Group()}}});
 try{
 const segment:EpisodeSegmentPlan={id:'rotor',purpose:'Rotor input integration',endBehavior:'stop',start:{positionWorldMetersXYZ:[0,20,0],facingYawRadians:0,humanoid:{vehicleInstanceId:'subject',mounted:true,throttle:.5}},waypoints:[{positionWorldMetersXYZ:[0,23,25],gait:'walk'},{positionWorldMetersXYZ:[10,25,60],gait:'walk'}]};
 world.humanoid!.prepareEpisodeStart(segment.start);const controller=new VehicleRouteController(segment);let last:RouteDecision|undefined;
 for(let n=0;n<1800;n++){last=controller.step(world.snapshot(),n/60);expect(last.mode).not.toBe('failed');world.step(last.input,1);}
 expect(last!.mode,JSON.stringify(last)).toBe('finished');expect(world.humanoid!.simulation.controlledActor.vehicle!.position.y).toBeGreaterThan(20);
 }finally{world.dispose();}
});
