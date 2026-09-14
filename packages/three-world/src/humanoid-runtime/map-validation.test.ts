import {describe,expect,it} from 'vitest';
import {Group,PerspectiveCamera} from 'three';
import {createWorld} from '../world';
import {validateEnvironment} from './map-validation';
import type {EnvironmentDefinition} from './environment/types';

const lift={id:'platform',position:[0,0,0] as const,height:2,speed:2};
const platform={id:'platform-floor',position:[0,-.1,0] as const,size:[4,.2,4] as const,liftId:lift.id};
const map:EnvironmentDefinition={id:'lifts',name:'Lifts',description:'',bounds:{min:[-20,-10,-20],max:[20,20,20]},boxes:[platform],lifts:[lift],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]};
const create=(definition:EnvironmentDefinition)=>createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:definition,character:{instanceId:'person',object:new Group()},vehicles:[]}});
const malformed:readonly [string,unknown][]=[
 ['non-array lifts',{...map,lifts:{}}],
 ['null lifts',{...map,lifts:null}],
 ['primitive lift',{...map,lifts:[true]}],
 ['null lift',{...map,lifts:[null]}],
 ['missing lift id',{...map,lifts:[{...lift,id:undefined}]}],
 ['blank lift id',{...map,lifts:[{...lift,id:'  '}]}],
 ['duplicate lift id',{...map,lifts:[lift,{...lift,position:[5,0,0]}]}],
 ['short lift position',{...map,lifts:[{...lift,position:[0,0]}]}],
 ['nonfinite lift position',{...map,lifts:[{...lift,position:[0,Infinity,0]}]}],
 ['out-of-range lift position',{...map,lifts:[{...lift,position:[100001,0,0]}]}],
 ['missing height',{...map,lifts:[{...lift,height:undefined}]}],
 ['nonfinite height',{...map,lifts:[{...lift,height:NaN}]}],
 ['infinite height',{...map,lifts:[{...lift,height:Infinity}]}],
 ['nonnumeric height',{...map,lifts:[{...lift,height:'2'}]}],
 ['out-of-range height',{...map,lifts:[{...lift,height:100001}]}],
 ['missing speed',{...map,lifts:[{...lift,speed:undefined}]}],
 ['infinite speed',{...map,lifts:[{...lift,speed:Infinity}]}],
 ['NaN speed',{...map,lifts:[{...lift,speed:NaN}]}],
 ['nonnumeric speed',{...map,lifts:[{...lift,speed:'2'}]}],
 ['negative speed',{...map,lifts:[{...lift,speed:-1}]}],
 ['unknown lift reference',{...map,boxes:[{...platform,liftId:'missing'}]}],
 ['reference without lifts',{...map,lifts:undefined}],
 ['empty lift reference',{...map,boxes:[{...platform,liftId:''}]}],
 ['blank lift reference',{...map,boxes:[{...platform,liftId:'  '}]}],
 ['nonstring lift reference',{...map,boxes:[{...platform,liftId:3}]}],
 ['null lift reference',{...map,boxes:[{...platform,liftId:null}]}],
 ['conflicting physical owners',{...map,boxes:[{...platform,rigidGroup:{id:'crate',massKg:2}}]}],
 ['sparse lift position',{...map,lifts:[{...lift,position:new Array(3)}]}],
 ['null box',{...map,boxes:[null]}],
 ['unknown decoration reference',{...map,boxes:[{...platform,liftId:'missing',collision:false}]}],
];

describe('environment lift contract',()=>{
 it.each(malformed)('rejects %s before physical construction',(_name,value)=>{
  expect(()=>validateEnvironment(value as EnvironmentDefinition)).toThrow('ENVIRONMENT_INVALID');
 });
 it.each([malformed[0]!,malformed[6]!,malformed[20]!,malformed[26]!])('public creation rejects %s instead of dropping or duplicating collision',async(_name,value)=>{
  let created:Awaited<ReturnType<typeof create>>|undefined;
  try{await expect(create(value as EnvironmentDefinition).then(world=>{created=world;})).rejects.toThrow('ENVIRONMENT_INVALID');}
  finally{created?.dispose();}
 });
 it('rejects a malformed replacement before touching the live map and its collider',async()=>{
  const world=await create(map);
  try{
   const original=world.humanoid!.environment,collider=original.colliderForId(platform.id),before=world.snapshot();
   expect(collider).toBeDefined();
   expect(()=>world.humanoid!.switchMap({...map,boxes:[{...platform,liftId:'missing'}]})).toThrow('ENVIRONMENT_INVALID');
   expect(world.humanoid!.environment).toBe(original);expect(original.colliderForId(platform.id)).toBe(collider);expect(world.snapshot()).toEqual(before);
  }finally{world.dispose();}
 });
 it.each([{height:0,speed:2},{height:2,speed:0},{height:0,speed:0}])('retains a solid static lift for %j',async values=>{
  const definition={...map,lifts:[{...lift,...values}]};expect(()=>validateEnvironment(definition)).not.toThrow();
  const world=await create(definition);
  try{
   const environment=world.humanoid!.environment,collider=environment.colliderForId(platform.id)!;
   expect(collider).toBeDefined();const position={...collider.translation()};
   world.step({},180);
   expect(collider.translation()).toEqual(position);expect(world.getEntityState('person').positionWorldMetersXYZ[1]).toBeGreaterThan(0);
   expect(world.getEntityState('person').positionWorldMetersXYZ[1]).toBeLessThan(.1);
  }finally{world.dispose();}
 });
 it('accepts omitted and empty lift arrays, unused lifts and decorative members',()=>{
  const {lifts:_lifts,...withoutLifts}=map;
  for(const definition of [{...withoutLifts,boxes:[]},{...map,boxes:[],lifts:[]},{...map,boxes:[]},{...map,boxes:[{...platform,collision:false}]}])
   expect(()=>validateEnvironment(definition)).not.toThrow();
 });
 it('accepts downward travel and moves one collider owner with the passenger',async()=>{
  const world=await create({...map,lifts:[{...lift,height:-2}]});
  try{
   const environment=world.humanoid!.environment,collider=environment.colliderForId(platform.id)!,body=collider.parent()!;
   expect(body.numColliders()).toBe(1);world.step({},180);
   expect(collider.translation().y).toBeCloseTo(-2.1,4);expect(world.getEntityState('person').positionWorldMetersXYZ[1]).toBeLessThan(-1.9);
   await world.reset();const resetCollider=world.humanoid!.environment.colliderForId(platform.id)!;expect(resetCollider.parent()!.numColliders()).toBe(1);expect(resetCollider.translation().y).toBeCloseTo(-.1,6);
  }finally{world.dispose();}
 });
});

it.each([{baseY:10,height:2},{baseY:10,height:-2},{baseY:-5,height:2},{baseY:-5,height:-2},{baseY:0,height:2},{baseY:0,height:-2}])('lift origin and signed relative travel support boarding, carrying, empty return and reset: %j',async({baseY,height})=>{
 const baseX=5,baseZ=-4;
 const definition:EnvironmentDefinition={...map,bounds:{min:[-20,-20,-20],max:[20,30,20]},
  lifts:[{...lift,position:[baseX,baseY,baseZ],height}],
  boxes:[{...platform,position:[baseX,baseY-.1,baseZ]},
   {id:'start-landing',position:[baseX+4,baseY-.1,baseZ],size:[4,.2,4]},
   {id:'destination-landing',position:[baseX+4,baseY+height-.1,baseZ],size:[4,.2,4]}],
  playerSpawn:[baseX+3,baseY+.03,baseZ]};
 const world=await create(definition);
 try{
  world.useAuthoredCamera();
  const runtime=world.humanoid!,pose=(offset:number)=>{
   const environment=runtime.environment,collider=environment.colliderForId(platform.id)!;
   expect(collider.translation().x).toBeCloseTo(baseX,6);expect(collider.translation().z).toBeCloseTo(baseZ,6);
   expect(collider.translation().y).toBeCloseTo(baseY-.1+offset,5);
   expect(environment.propBoxPose(platform.id)!.position.y).toBeCloseTo(baseY-.1+offset,5);
  };
  pose(0);world.step({},120);pose(0); // Adjacent passengers must not trigger departure.
  const board=()=>{expect(runtime.prepareCharacter([baseX,baseY+.03,baseZ])).toBe(true);};
  board();world.step({},60);pose(0); // Boarding retains the existing wait at the starting stop.
  world.step({},120);pose(height);
  expect(runtime.environment.colliderForId(platform.id)!.parent()!.translation().y).toBeCloseTo(baseY+height,5);
  const passengerY=world.getEntityState('person').positionWorldMetersXYZ[1];
  expect(Math.abs(passengerY-(baseY+height))).toBeLessThan(.1);
  world.step({},120);pose(height); // Occupancy holds the destination stop.
  expect(runtime.prepareCharacter([baseX+3,baseY+height+.03,baseZ])).toBe(true);
  world.step({},60);pose(height);world.step({},120);pose(0);
  expect(Math.abs(world.getEntityState('person').positionWorldMetersXYZ[1]-(baseY+height))).toBeLessThan(.1);
  // Reset from the destination, not an already-reset relative offset.
  board();world.step({},180);pose(height);
  await world.reset();pose(0);
  expect(runtime.environment.colliderForId(platform.id)!.parent()!.translation().y).toBeCloseTo(baseY,5);
  expect(world.getEntityState('person').positionWorldMetersXYZ).toEqual(definition.playerSpawn);
  world.step({},120);pose(0);
 }finally{world.dispose();}
});
