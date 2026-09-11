import {beforeAll,describe,expect,it,vi} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {compileBoundaryBoxes,type BoundaryDefinition} from '../boundaries';
import {EnvironmentQueries,HUMANOID_BODY,initEnvironmentQueries} from './environment/queries';
import type {EnvironmentDefinition} from './environment/types';
import {validateEnvironment} from './map-validation';
import {HumanoidController} from './humanoid/controller';
import {humanoidLevel} from './humanoid/level-adapter';

const allocations=vi.hoisted(()=>({forbidden:false,count:0}));
vi.mock('@dimforge/rapier3d-compat',async importOriginal=>{
 const actual=await importOriginal<typeof import('@dimforge/rapier3d-compat')>();
 class World extends actual.default.World{
  constructor(...args:ConstructorParameters<typeof actual.default.World>){
   allocations.count++;
   if(allocations.forbidden)throw new Error('WASM_WORLD_MUST_NOT_BE_ALLOCATED');
   super(...args);
  }
 }
 return {...actual,default:{...actual.default,World}};
});

beforeAll(initEnvironmentQueries);
const rectangle:BoundaryDefinition={id:'play-area',shape:'rectangle',minimumXZ:[-5,-5],maximumXZ:[5,5],bottomMeters:-1,topMeters:8,thicknessMeters:.3};
const polyline:BoundaryDefinition={id:'restricted',shape:'polyline',pointsXZ:[[-5,5],[5,5],[5,-5]],bottomMeters:-1,topMeters:8,thicknessMeters:.3};
function map(boundaries:readonly BoundaryDefinition[]=[]):EnvironmentDefinition{return{
 id:'boundary-map',name:'Boundary map',description:'',bounds:{min:[-100,-20,-100],max:[100,100,100]},
 boxes:[{id:'ground',position:[0,-.5,0],size:[100,1,100]}],boundaries,
 water:[],regions:[],spawns:[],playerSpawn:[0,.04,0],
};}

describe('Humanoid physical map boundaries',()=>{
 it('rejects excessive actual subdivisions before allocating any Rapier world',()=>{
  const before=allocations.count;allocations.forbidden=true;
  try{
   const hugeBoundary:BoundaryDefinition={id:'oversized',shape:'polyline',pointsXZ:[[0,0],[1,0]],bottomMeters:0,topMeters:1,thicknessMeters:99999};
   const oversizedMap={...map(),boxes:[{id:'oversized-floor',position:[0,0,0] as const,size:[100000,1,100000] as const}]};
   const combined={...map(),boxes:[
    {id:'first-floor',position:[0,-.5,0] as const,size:[4096,1,2048] as const},
    {id:'second-floor',position:[4096,-.5,0] as const,size:[4096,1,2048] as const},
   ],boundaries:[rectangle]};
   for(const definition of [map([hugeBoundary]),oversizedMap,combined])
    expect(()=>new EnvironmentQueries(definition)).toThrow('HUMANOID_ENVIRONMENT_COLLIDER_BUDGET_EXCEEDED');
   expect(allocations.count).toBe(before);
  }finally{allocations.forbidden=false;}
 });
 it.each([['rectangle',rectangle],['polyline',polyline]] as const)('%s closes its corner against a high-speed capsule sweep',(_name,boundary)=>{
  const definition=map([boundary]),q=new EnvironmentQueries(definition);
  try{
   const count=q.colliderCount;
   const hit=q.move(new Vector3(0,.04,0),new Vector3(40,0,40),HUMANOID_BODY);
   expect(hit.blocked).toBe(true);expect(hit.position.x).toBeLessThan(5);expect(hit.position.z).toBeLessThan(5);
   expect(hit.position.x).toBeGreaterThan(0);expect(hit.position.z).toBeGreaterThan(0);
   expect(q.colliderCount).toBe(count);
   expect(humanoidLevel(definition).boxes.map(box=>box.id)).toEqual(['ground']);
   for(const box of compileBoundaryBoxes([boundary]))expect(q.isBoundaryCollider(q.colliderForId(box.id)!)).toBe(true);
  }finally{q.dispose();}
 });

 it('stops actual walking and jumping humanoid motion at the rectangle without silently resetting to spawn',()=>{
  const q=new EnvironmentQueries(map([rectangle])),h=new HumanoidController(q);
  try{
   const direction=new Vector3(1,0,1).normalize();
   for(let i=0;i<180;i++){h.step(direction,true,false,i===35);q.stepPhysics(1/60);}
   expect(h.position.x).toBeGreaterThan(4);expect(h.position.z).toBeGreaterThan(4);
   expect(h.position.x).toBeLessThan(5);expect(h.position.z).toBeLessThan(5);
   expect(h.lastResult).not.toContain('已返回');
  }finally{h.dispose();q.dispose();}
 });

 it.each([rectangle,polyline])('blocks a real CCD rigid vehicle at the $shape corner in the same physics world',boundary=>{
  const q=new EnvironmentQueries(map([boundary]));
  try{
   const rig=q.vehicleRig('fast-car',{},new Vector3(0,1,0),new Quaternion(),300,.5,.5,1,.4,
    [{body:{kind:'box',halfExtents:[.5,.5,.5],offset:[0,0,0]}}],.3,0);
   rig.body.setLinvel({x:100,y:0,z:100},true);
   for(let i=0;i<120;i++){
    q.stepPhysics(1/60);
    const p=rig.body.translation();
    expect(p.x).toBeLessThan(5);expect(p.z).toBeLessThan(5);
   }
   expect(q.vehicleContactNormals(rig).length).toBeGreaterThan(0);
  }finally{q.dispose();}
 });

 it('leaves open polyline ends and unconfigured map edges open',()=>{
  for(const boundaries of [[],[polyline]]){
   const q=new EnvironmentQueries(map(boundaries));
   try{expect(q.move(new Vector3(0,.04,0),new Vector3(-20,0,0),HUMANOID_BODY).position.x).toBeLessThan(-19);}
   finally{q.dispose();}
  }
 });

 it('ignores air walls in camera probes while ordinary walls and explicitly camera-blocking boundaries remain solid',()=>{
  const from:[number,number,number]=[0,2,0],to:[number,number,number]=[0,2,12];
  for(const blocksCamera of [false,true]){
   const definition=map([{...rectangle,blocksCamera}]);
   definition.boxes=[...definition.boxes,{id:'visible-wall',position:[0,3,10],size:[10,6,.3]}];
   const q=new EnvironmentQueries(definition);
   try{
    const hit=q.cameraProbe(from,to,.1),explicit=q.cameraProbe(from,to,.1,q.cameraFilter(new Set()));
    expect(hit.distanceMeters).toBeCloseTo(explicit.distanceMeters,8);
    expect(q.cameraProbe(from,to,.1,()=>true).distanceMeters).toBeCloseTo(hit.distanceMeters,8);
    expect(hit.colliderEntityId).toBeTruthy();
    if(blocksCamera)expect(hit.distanceMeters).toBeLessThan(5);
    else expect(hit.distanceMeters).toBeGreaterThan(9);
    expect(q.move(new Vector3(0,.04,0),new Vector3(0,0,12)).position.z).toBeLessThan(5);
   }finally{q.dispose();}
  }
 });

 it('does not report a boundary top as support or permit a declared climb surface on it',()=>{
  const definition=map([rectangle]),q=new EnvironmentQueries(definition);
  try{
   const overTop=new Vector3(0,9,5);
   expect(q.support(overTop,2,0)).toBeNull();
   expect(q.standingSupport(overTop,2,Math.PI/4)).toBeNull();
   expect(q.support(overTop,12,0)?.height).toBeCloseTo(0,5);
   expect(()=>validateEnvironment({...definition,climbSurfaces:[{id:'fake-climb',kind:'wall',colliderId:compileBoundaryBoxes([rectangle])[0]!.id,center:[0,4,5],normal:[0,0,-1],width:10,minY:0,maxY:8}]})).toThrow('ENVIRONMENT_INVALID');
  }finally{q.dispose();}
 });

 it('validates boundary identity conflicts and only the declared recovery input constraints',()=>{
  const definition=map([rectangle]),id=compileBoundaryBoxes([rectangle])[0]!.id;
  const collision={...definition,boxes:[...definition.boxes,{id,position:[0,1,0] as const,size:[1,1,1] as const}]};
  expect(()=>validateEnvironment(collision)).toThrow('ENVIRONMENT_INVALID');
  expect(()=>new EnvironmentQueries(collision)).toThrow('HUMANOID_BOUNDARY_ID_CONFLICT');
  expect(()=>validateEnvironment({...definition,recovery:{fallBelowY:-10}})).not.toThrow();
  expect(()=>validateEnvironment({...definition,recovery:{fallBelowY:-10,checkpoint:{position:[0,0,0],yaw:0}}})).not.toThrow();
  for(const recovery of [{fallBelowY:NaN},{fallBelowY:-20},{fallBelowY:100},{fallBelowY:0,checkpoint:{position:[0,-1,0] as const,yaw:0}},{fallBelowY:-10,checkpoint:{position:[101,0,0] as const,yaw:0}},{fallBelowY:-10,checkpoint:{position:[0,0,0] as const,yaw:Infinity}}])expect(()=>validateEnvironment({...definition,recovery})).toThrow('ENVIRONMENT_INVALID');
 });
});
