import {testAssetResourceUrl} from '../asset-library.test-support';
import {parseFixtureGlb} from './textured-glb-fixture';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, SkinnedMesh, Vector3 } from 'three';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Character } from './character';
import { EnvironmentQueries, initEnvironmentQueries, vehicleBody } from './environment/queries';
import { createVehicle, emptyInput, stepVehicle as prepareVehicle, type Input } from './simulation';
import type { EnvironmentDefinition } from './environment/types';
import { SLED_SPEC } from '@worldkit/preset-content/sled';
import {readControls} from './input';

import { SKI_SPEC } from '@worldkit/preset-content/ski';

import {buildSkiModel} from '@worldkit/preset-content/ski-model';
import {sampleSkiEquipment} from './ski-visual';
import {getDefaultProfile} from '@worldkit/preset-content/platform/profiles';

beforeAll(initEnvironmentQueries);
describe.each([SLED_SPEC,SKI_SPEC])('$id snow vehicle',spec=>{
function fixture(degrees=0, wall=false) {
  const angle=degrees*Math.PI/180;
  const map:EnvironmentDefinition={id:'sled-test',name:'Snow',description:'',bounds:{min:[-150,-80,-150],max:[150,100,150]},
    boxes:[{id:'slope',position:[0,20-.25*Math.cos(angle),.25*Math.sin(angle)],size:[200,.5,200/Math.cos(angle)],rotation:[-angle,0,0]},
      ...(wall?[{id:'wall',position:[0,24,10] as const,size:[30,8,.5] as const}]:[])],
    water:[],spawns:[],regions:[],playerSpawn:[-20,20,0]};
  const q=new EnvironmentQueries(map),v=createVehicle({...spec,spawn:[0,degrees?20.6:20.035,0]});
  const run=(seconds:number,controls:Partial<Input>={})=>{for(let t=0;t<Math.round(seconds*60);t++)stepVehicle(v,{...emptyInput(),...controls},1/60,t/60,q);};
  return {q,v,run};
}
it('rests without thrust, pushes only to walking speed, and coasts after release',()=>{
  const {q,v,run}=fixture(),neutral=fixture();try{
    neutral.run(2);run(2,{boost:true});expect(v.speed).toBeLessThan(.01);
    // Isolate input-driven pivot from the same native body's contact settling.
    expect(v.yaw-neutral.v.yaw).toBeCloseTo(0,3);
    expect(v.position.distanceTo(neutral.v.position)).toBeLessThan(.01);
    run(10,{forward:1});expect(v.speed).toBeGreaterThan(1);expect(v.speed).toBeLessThanOrEqual(3.01);
    const speed=v.speed,z=v.position.z;run(1);expect(v.position.z-z).toBeGreaterThan(.5);expect(v.speed).toBeLessThan(speed);
    run(3,{brake:true});expect(v.speed).toBeLessThan(.01);const stop=v.position.clone();run(2,{brake:true});expect(v.position.distanceTo(stop)).toBeLessThan(.02);
  }finally{q.dispose();neutral.q.dispose();}
});
it.each(['KeyA','KeyD'])('respects subtype stationary steering from %s',key=>{
 const {q,v,run}=fixture();
 try{run(2);const start=v.position.clone(),yaw=v.yaw;
  run(2,readControls(new Set([key]),true,false,{},undefined,{mode:spec.mode}));
  if(spec.mode==='sled')expect((v.yaw-yaw)*(key==='KeyA'?1:-1)).toBeGreaterThan(.35);
  else expect(Math.abs(v.yaw-yaw)).toBeLessThan(.01);
  expect(v.position.distanceTo(start)).toBeLessThan(.06);
  run(2);const released=v.yaw;run(1);expect(Math.abs(v.yaw-released)).toBeLessThan(.01);
 }finally{q.dispose();}
});
it('reads S from rest and switches between forward, braking, and reverse without releasing the key',()=>{
 const {q,v,run}=fixture(),s=readControls(new Set(['KeyS']),true,false,{},undefined,{mode:spec.mode});
 try{run(2);const start=v.position.z;run(4,s);
  if(spec.mode==='sled'){
   expect(v.position.z-start).toBeLessThan(-1);expect(v.velocity.z).toBeLessThan(-.2);expect(v.speed).toBeLessThan(1.6);
   run(6,{forward:1});expect(v.velocity.z).toBeGreaterThan(1);
   const before=v.velocity.z;run(.2,s);expect(v.velocity.z).toBeLessThan(before);run(4,s);expect(v.velocity.z).toBeLessThan(-.2);
   run(2,{...s,brake:true});expect(v.speed).toBeLessThan(.01);const stop=v.position.clone();run(2,{...s,brake:true});expect(v.position.distanceTo(stop)).toBeLessThan(.02);
  }else{expect(Math.abs(v.position.z-start)).toBeLessThan(.02);expect(v.speed).toBeLessThan(.01);}
 }finally{q.dispose();}
});
it('accelerates downhill without W, brakes against gravity, then slides again when released',()=>{
  const {q,v,run}=fixture(12);try{
    v.yaw=Math.PI;run(3);expect(v.velocity.z).toBeLessThan(-2);expect(v.position.y).toBeLessThan(20);
    expect(q.overlaps(v.position,vehicleBody(v.spec),v.rotation)).toBe(false);
    expect(v.position.y-q.support(v.position,2,.3)!.height).toBeLessThan(.10);
    run(2,{brake:true});expect(v.speed).toBeLessThan(.03);const stop=v.position.clone();run(1,{brake:true});expect(v.position.distanceTo(stop)).toBeLessThan(.08);
    run(2);expect(v.velocity.z).toBeLessThan(-1);
    {const yaw=v.yaw;run(.7,{steer:1});expect(Math.abs(v.yaw-yaw)).toBeGreaterThan(.05);}
  }finally{q.dispose();}
});
it('loses uphill momentum and slides backwards; crossfall follows gravity rather than the nose',()=>{
  const uphill=fixture(12);try{uphill.v.velocity.z=4;uphill.run(5);expect(uphill.v.velocity.z).toBeLessThan(-1);}finally{uphill.q.dispose();}
  // Rounded native contacts allow small lateral settling; gravity must still
  // carry the craft across its heading, without commanded forward propulsion.
  const cross=fixture(12);try{cross.v.yaw=Math.PI/2;cross.run(3);expect(cross.v.velocity.z).toBeLessThan(-.3);expect(Math.abs(cross.v.velocity.x)).toBeLessThan(.03);}finally{cross.q.dispose();}
});
it('steers with retained lateral momentum and collision blocks a fast downhill-style approach',()=>{
  const turn=fixture();try{turn.v.velocity.z=10;turn.run(.5,{steer:1});expect(turn.v.yaw).toBeLessThan(-.1);
    const heading=new Vector3(Math.sin(turn.v.yaw),0,Math.cos(turn.v.yaw));expect(turn.v.velocity.clone().normalize().angleTo(heading)).toBeGreaterThan(.03);
  }finally{turn.q.dispose();}
  const wall=fixture(0,true);try{wall.v.velocity.z=20;wall.run(4);expect(wall.v.position.z).toBeLessThan(8.8);expect(wall.v.speed).toBeLessThan(.05);}finally{wall.q.dispose();}
});
it('has no foot thrust or steering in the air and recreates empty push state',()=>{
  const {q,v,run}=fixture();try{v.position.y=35;v.grounded=false;run(.5,{forward:1,steer:1,brake:true});
    expect(v.velocity.z).toBe(0);expect(v.yaw).toBeCloseTo(0,3);expect(v.velocity.y).toBeCloseTo(-9.81*.5);
    expect(createVehicle(v.spec).motion.sled).toEqual({phase:0,push:0,brake:0,steer:0});
  }finally{q.dispose();}
});
it('keeps the actual Source101 soles above snow throughout pushing, steering and braking',async()=>{
  const transport=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{
    const bytes=await readFile(fileURLToPath(url));return parseFixtureGlb(bytes);
  });
  const fetchTransport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
  const rider=new Character();
  try{
    await rider.load(testAssetResourceUrl);
    const bounds=[];
    for(const sledPose of [{push:0,brake:0,steer:0},{push:1,brake:0,steer:0},{push:0,brake:1,steer:0},{push:0,brake:0,steer:1},{push:0,brake:0,steer:-1}]){
      rider.root.position.set(...spec.seat);
      rider.update(1/60,{position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:0,vertical:0,grounded:true,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',animationEvent:null,surface:null,skills:null,mounted:spec.characterPose!,sledPose});
      rider.root.updateMatrixWorld(true);
      let minY=Infinity;const point=new Vector3();
      rider.root.traverse(node=>{if(node instanceof SkinnedMesh){node.skeleton.update();for(let n=0;n<node.geometry.getAttribute('position').count;n++){node.getVertexPosition(n,point).applyMatrix4(node.matrixWorld);minY=Math.min(minY,point.y);}}});
      bounds.push({sledPose,minY});
      expect(minY).toBeGreaterThanOrEqual(.005);
      if(spec.mode==='ski'){
        expect(minY).toBeLessThan(.075); // soles meet the .0575 m ski top
        const equipment=new Group(),model=buildSkiModel();equipment.add(model);
        sampleSkiEquipment(equipment,rider.root);
        for(const [suffix,side] of [['left','l'],['right','r']]){
          const hand=rider.root.getObjectByName(`hand_${side}`)!;
          const pole=equipment.getObjectByName(`ski.pole.${suffix}`)!;
          expect(pole.getWorldPosition(new Vector3()).distanceTo(hand.getWorldPosition(new Vector3()))).toBeLessThan(1e-6);
        }
        const locals=model.children.map(n=>n.position.clone());
        sampleSkiEquipment(equipment,rider.root);
        model.children.forEach((n,i)=>expect(n.position.distanceTo(locals[i]!)).toBeLessThan(1e-6));
        sampleSkiEquipment(equipment,null);
        expect(equipment.getObjectByName('ski.board.left')!.position.x).toBe(.16);
        expect(equipment.getObjectByName('ski.pole.left')!.position.y).toBe(1.05);
        model.traverse(n=>{if(n instanceof SkinnedMesh)return;if('geometry' in n)(n.geometry as {dispose():void}).dispose();});
      }
      expect(rider.hip!.getWorldPosition(point).distanceTo(new Vector3(...spec.seat))).toBeLessThan(1e-6);
    }
    console.log('SLED_RIDER_CLEARANCE',JSON.stringify(bounds));
  }finally{rider.dispose();transport.mockRestore();fetchTransport.mockRestore();}
});

});

it('keeps authored skiing control values in the workspace profile and catalog',()=>{
  const profile=getDefaultProfile('ski')!;
  for(const key of ['groundSpeed','coastDeceleration','brakeDeceleration','dragQuadratic','steeringResponse'] as const)
    expect(profile.control[key]).toBe(SKI_SPEC[key]);
});

function stepVehicle(...args:Parameters<typeof prepareVehicle>){prepareVehicle(...args);if(args[0].motion.wheelPhysics||args[0].motion.body)args[4].stepPhysics(args[2]);}
