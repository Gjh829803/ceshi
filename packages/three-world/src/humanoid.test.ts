import {readFile} from 'node:fs/promises';
import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {fixtureTextureLoader} from './humanoid-runtime/textured-glb-fixture';
import catalog from '../../../assets/three-creator/asset-catalog.json';
import {createHumanoidWorld,type HumanoidAssetDefinition} from './humanoid';
import {createWorld,type ThreeWorld} from './world';
import type {EnvironmentDefinition} from './humanoid-runtime/environment/types';
import {Character} from './humanoid-runtime/character';
import {createRoadVehicleSpec} from './humanoid-runtime/road-vehicle';
import {emptyInput} from './humanoid-runtime/simulation';
import type {VehicleSpec} from './humanoid-runtime/config';

const worlds:ThreeWorld[]=[];
const map:EnvironmentDefinition={id:'room',name:'Room',description:'Supported floor',bounds:{min:[-30,-5,-30],max:[30,20,30]},boxes:[{id:'floor',position:[0,-.5,0],size:[60,1,60]}],water:[],regions:[],spawns:[],playerSpawn:[0,.04,0]};
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.unstubAllGlobals();vi.restoreAllMocks();});

it.each(['car','motorcycle','horse'] as const)('starts %s mounted before tick zero and restores the relationship with its camera',async kind=>{
 const spec=kind==='horse'?structuredClone(catalog.assets.find(asset=>asset.id==='creature.horse')!.vehicle!.spec) as unknown as VehicleSpec:createRoadVehicleSpec(kind),startMap:EnvironmentDefinition={...map,playerSpawn:[0,.025,0],
  regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[60,60],color:'#fff',modes:[spec.mode]}],
  spawns:[{id:'ride-start',name:'Ride',vehicleId:'ride',regionId:'road',position:[0,.025,0],yaw:1.2}]};
 const world=await createWorld({navigation:false,assetDefinitions:{},humanoid:{map:startMap,
  character:{instanceId:'person',object:new THREE.Group(),initialMountId:'ride'},
  vehicles:[{instanceId:'ride',assetId:'custom.vehicle',object:new THREE.Group(),spec}]}});worlds.push(world);
 expect(world.snapshot()).toMatchObject({simulationTick:0,humanoid:{mountedInstanceId:'ride',transition:{remainingSeconds:0}}});
 world.setCameraFollow({opening:{positionWorldMetersXYZ:[7,5,9],lookAtWorldMetersXYZ:[0,1,0],fovDegrees:49},headingFollow:'vehicle'});
 const camera=world.camera.clone(),person=world.humanoid!.simulation.controlledActor;
 world.step({},0);expect(person.player.yaw).toBeCloseTo(1.2);expect(world.camera.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-7);
 world.step({humanoid:{...emptyInput(),forward:1}},90);expect(person.vehicle!.position.distanceTo(new THREE.Vector3(0,.025,0))).toBeGreaterThan(.5);
 world.step({humanoid:{...emptyInput(),brake:true}},150);expect(world.humanoid!.exit()).toBe(true);world.step({},60);
 await world.reset();expect(world.snapshot()).toMatchObject({simulationTick:0,humanoid:{mountedInstanceId:'ride',transition:{remainingSeconds:0}},camera:{mode:'follow-pending'}});
 expect(world.camera.position.distanceTo(camera.position)).toBeLessThan(1e-7);expect(world.camera.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-7);
 expect(world.humanoid!.simulation.controlledActor.player.yaw).toBeCloseTo(1.2);
});

it('validates late scene geometry before sealing a mounted baseline and permits correction',async()=>{
 const spec=createRoadVehicleSpec('motorcycle');
 const world=await createWorld({navigation:false,assetDefinitions:{},humanoid:{map:{...map,
  regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[60,60],color:'#fff',modes:[spec.mode]}],
  spawns:[{id:'ride-start',name:'Ride',vehicleId:'ride',regionId:'road',position:[0,.025,0],yaw:0}]},
  character:{instanceId:'person',object:new THREE.Group(),initialMountId:'ride'},
  vehicles:[{instanceId:'ride',assetId:'custom.vehicle',object:new THREE.Group(),spec}]}});worlds.push(world);
 const ceiling=new THREE.Mesh(new THREE.BoxGeometry(4,.2,4));ceiling.position.y=2;
 world.addEntity({id:'ceiling',object:ceiling,role:'obstacle'});
 expect(()=>world.step({},0)).toThrow('HUMANOID_INITIAL_MOUNT_CLEARANCE_BLOCKED');expect(world.snapshot().simulationTick).toBe(0);
 await world.execute({type:'entity.set-position',entityId:'ceiling',positionWorldMetersXYZ:[15,2,0]});
 world.addEntity({id:'after-repair',object:new THREE.Group(),role:'decoration'});
 world.step({},0);expect(world.snapshot().humanoid!.mountedInstanceId).toBe('ride');
 await world.reset();expect(world.snapshot().entities.some(entity=>entity.id==='after-repair')).toBe(true);
 ceiling.geometry.dispose();(ceiling.material as THREE.Material).dispose();
});

it('rejects a blocked initial rider without publishing an unmounted fallback',async()=>{
 const spec=createRoadVehicleSpec('motorcycle');
 await expect(createWorld({navigation:false,assetDefinitions:{},humanoid:{map:{...map,
  boxes:[...map.boxes,{id:'ceiling',position:[0,2,0],size:[4,.2,4]}],
  regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[60,60],color:'#fff',modes:[spec.mode]}],
  spawns:[{id:'ride-start',name:'Ride',vehicleId:'ride',regionId:'road',position:[0,.025,0],yaw:0}]},
  character:{instanceId:'person',object:new THREE.Group(),initialMountId:'ride'},
  vehicles:[{instanceId:'ride',assetId:'custom.vehicle',object:new THREE.Group(),spec}]}})).rejects.toThrow('HUMANOID_INITIAL_MOUNT_CLEARANCE_BLOCKED');
});

it.each([
  {center:[0,24],actual:[0,24]},
  {center:[0,Number.NaN,24],actual:[0,'NaN',24]},
  {center:undefined,actual:'missing'},
  {center:new Proxy([0,24],{getOwnPropertyDescriptor(){throw new Error('diagnostic blocked');}}),actual:'unavailable'},
])('identifies an invalid region center without allocating the Humanoid world ($actual)',async({center,actual})=>{
  const invalid={...map,regions:[{id:'road',name:'Road',description:'',center,size:[20,12],color:'#fff',modes:['wheeled']}]} as unknown as EnvironmentDefinition;
  let error:unknown;try{await createHumanoidWorld({map:invalid});}catch(caught){error=caught;}
  expect(error).toMatchObject({code:'ENVIRONMENT_INVALID',category:'invalid-input',phase:'environment',entityIds:['road'],path:'regions[0].center',actual,expected:'three finite numbers [x,y,z], each with absolute value <= 100000'});
  expect((error as Error).message).toContain('regions[0].center');
});

it('binds ordinary obstacles into the same world after Humanoid creation',async()=>{
  const person=new THREE.Group();
  const world=await createWorld({navigation:false,humanoid:{map,vehicles:[],character:{instanceId:'player',object:person}}});worlds.push(world);
  const landmark=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());landmark.position.set(3,1,0);
  world.addEntity({id:'town-hall',object:landmark,role:'obstacle',physics:{kind:'fixed',shape:'box'}});
  expect(world.snapshot().entities.some(entity=>entity.id==='town-hall')).toBe(true);
  expect(world.humanoid!.probe([0,1,0],[1,0,0],5)?.entityId).toBe('town-hall');
  landmark.geometry.dispose();landmark.material.dispose();
});

it('uses explicit standalone resources without requiring a Creator catalog',async()=>{
  vi.stubGlobal('document',{baseURI:'https://standalone.test/'});
  const fetch=vi.fn(async()=>new Response(null,{status:404}));vi.stubGlobal('fetch',fetch);
  const character=new Character();const resourceUrl=(path:string)=>`https://resources.test/${path}`;
  const load=vi.spyOn(character,'load').mockImplementation(async resolver=>{
    expect(resolver).toBe(resourceUrl);throw new Error('RESOURCE_LOAD_FAILURE');
  });
  const dispose=vi.spyOn(character,'dispose');
  await expect(createHumanoidWorld({map,resourceUrl,character})).rejects.toThrow('RESOURCE_LOAD_FAILURE');
  expect(load).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();expect(dispose).toHaveBeenCalledOnce();
});

it('loads the complete humanoid and performs a physical action through the public world',async()=>{
  const parse=GLTFLoader.prototype.parse;
  vi.spyOn(GLTFLoader.prototype,'parse').mockImplementation(function(this:GLTFLoader,data,path,onLoad,onError){return parse.call(fixtureTextureLoader(this),data,path,onLoad,onError);});
  const definition=catalog.assets.find(asset=>asset.id==='humanoid.uefn-mannequin')!;
  const resources=new Map(definition.resources!.map(resource=>[resource.path,resource.sourcePath]));
  vi.stubGlobal('ProgressEvent',class extends Event{constructor(type:string,init:object){super(type);Object.assign(this,init);}});
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
    const uri=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const logical=decodeURIComponent(new URL(uri).pathname.slice(1));
    const file=resources.get(logical);if(!file)throw new Error(`Unexpected resource ${logical}`);
    return new Response(await readFile(file));
  }));
  const camera=new THREE.PerspectiveCamera(55,1,.05,200);camera.position.set(3,3,6);camera.lookAt(0,1,0);
  const world=await createHumanoidWorld({scene:new THREE.Scene(),camera,map,characterId:'person',characterFacingYawRadians:Math.PI/2,assetDefinitions:{[definition.id]:definition as unknown as HumanoidAssetDefinition},resourceUrl:path=>`https://humanoid.test/${path}`});worlds.push(world);
  expect(world).toHaveProperty('humanoid');
  const animation=world.humanoid!.options.character.animation!;
  expect(animation.availableHumanoidClips.size).toBe(48);
  let triangles=0;animation.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh){
    triangles+=(o.geometry.index?.count??0)/3;
    for(const material of Array.isArray(o.material)?o.material:[o.material]){
      expect(material.transparent).toBe(false);expect(material.depthWrite).toBe(true);
    }
  }});
  expect(triangles).toBe(4660);
  expect(world.snapshot().controlledEntityId).toBe('person');
  const bounds=new THREE.Box3().setFromObject(animation.root,true);expect(bounds.getSize(new THREE.Vector3()).y).toBeGreaterThan(1.5);
  world.step({},30);
  expect(world.humanoid!.simulation.controlledActor.controller.facing.x).toBeCloseTo(-1,8);
  const start=world.getEntityState('person').positionWorldMetersXYZ;
  const receipt=await world.execute({type:'humanoid.perform-action',request:{requestId:'roll-once',action:'roll'}});
  expect(receipt.status).toBe('accepted');world.step({},120);
  if(receipt.status==='accepted')expect(world.operations.get(receipt.operationId).status).toBe('succeeded');
  const end=world.getEntityState('person').positionWorldMetersXYZ;
  expect(Math.hypot(end[0]-start[0],end[2]-start[2])).toBeGreaterThan(1);
  await world.reset();world.step({},30);
  expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
  expect(world.snapshot().errors).toEqual([]);
  // Breaking API rename: old commands must not reach the controller.
  expect(await world.execute({type:'training.action',request:{requestId:'legacy-roll',action:'roll'}} as never)).toMatchObject({status:'rejected'});
  expect(world).not.toHaveProperty('training');
  expect(world).not.toHaveProperty('player');
  expect(await world.execute({type:'character.perform-action',request:{requestId:'old-character-roll',action:'roll'}} as never)).toMatchObject({status:'rejected'});
  expect(world.snapshot()).not.toHaveProperty('player');
  expect(world.snapshot()).not.toHaveProperty('training');

});

it('binds an authored non-human mesh to a custom movement intent with real collision',async()=>{
  const world=await createWorld({scene:new THREE.Scene(),navigation:false,assetDefinitions:{}});worlds.push(world);
  world.registerMovement({id:'hover',version:1,description:'Horizontal hover intent',initialState:null,update:context=>({state:null,velocityWorldMetersPerSecondXYZ:[(context.input.moveXRatio??0)*3,0,0],applyGravity:false})});
  const subject=new THREE.Mesh(new THREE.IcosahedronGeometry(.4),new THREE.MeshStandardMaterial());subject.position.set(0,1,0);
  world.addCharacter({id:'orb',object:subject,body:{heightMeters:.8,radiusMeters:.35},movement:{kind:'custom',movementId:'hover'}});
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.4,4,8));wall.position.set(2,1,0);world.addEntity({id:'wall',object:wall,role:'obstacle'});
  world.setControlledEntity('orb');world.step({moveXRatio:1},120);
  const state=world.getEntityState('orb');expect(state.positionWorldMetersXYZ[0]).toBeGreaterThan(1);expect(state.positionWorldMetersXYZ[0]).toBeLessThan(1.8);expect(state.positionWorldMetersXYZ[1]).toBeCloseTo(1,2);
  expect(state.motion?.collisionEntityIds).toContain('wall');
  subject.geometry.dispose();(subject.material as THREE.Material).dispose();wall.geometry.dispose();(wall.material as THREE.Material).dispose();
});

it.each([NaN,Infinity,-Infinity])('rejects invalid initial facing before loading assets (%s)',async characterFacingYawRadians=>{
  const character=new Character(),load=vi.spyOn(character,'load');
  await expect(createHumanoidWorld({map,character,characterFacingYawRadians})).rejects.toThrow('HUMANOID_INITIAL_FACING_INVALID');
  expect(load).not.toHaveBeenCalled();
});
