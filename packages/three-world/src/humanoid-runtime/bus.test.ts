import {parseFixtureGlb} from './textured-glb-fixture';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {SkinnedMesh,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Character} from './character';
import {EnvironmentQueries,initEnvironmentQueries,vehicleBody} from './environment/queries';
import {createVehicle,emptyInput,stepVehicle as prepareVehicle,type Input} from './simulation';
import {BUS_SPEC} from '../../../../shared/preset-content/bus';
import {busWheelAngle} from './motion-families/ground-vehicle/bus';
beforeAll(initEnvironmentQueries);
function fixture(wall=false){
 const q=new EnvironmentQueries({id:'road',name:'Road',description:'',bounds:{min:[-500,-10,-500],max:[500,100,500]},boxes:[{id:'floor',position:[0,-1,0],size:[1000,2,1000]},...(wall?[{id:'wall',position:[0,5,20] as const,size:[100,10,1] as const}]:[])],water:[],spawns:[],regions:[],playerSpawn:[-10,.03,0]});
 const v=createVehicle({...BUS_SPEC,spawn:[0,.035,0]});
 const run=(seconds:number,input:Partial<Input>={})=>{for(let n=0;n<Math.round(seconds*60);n++)stepVehicle(v,{...emptyInput(),...input},1/60,n/60,q);};
 run(.2);return {q,v,run};
}
describe('minibus handling',()=>{
 it('keeps the actual Source101 driver above the cabin floor and inside its windows',async()=>{
  const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{const bytes=await readFile(fileURLToPath(url));return parseFixtureGlb(bytes);});
  const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
  const rider=new Character();try{
   await rider.load(p=>new URL(`../../../../assets/three-creator/presets/${p}`,import.meta.url).href);rider.root.position.set(...BUS_SPEC.seat);
   for(let n=0;n<120;n++)rider.update(1/60,{position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:n/20,vertical:0,grounded:true,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',animationEvent:null,surface:null,skills:null,mounted:'drive'});
   rider.root.updateMatrixWorld(true);let minY=Infinity,maxY=-Infinity,maxZ=-Infinity;const point=new Vector3();
   rider.root.traverse(node=>{if(node instanceof SkinnedMesh){node.skeleton.update();for(let n=0;n<node.geometry.getAttribute('position').count;n++){node.getVertexPosition(n,point).applyMatrix4(node.matrixWorld);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);maxZ=Math.max(maxZ,point.z);}}});
   expect(minY).toBeGreaterThan(.52);expect(maxY).toBeLessThan(2.4);expect(maxZ).toBeLessThan(2.6);
   console.log('BUS_RIDER_BOUNDS',JSON.stringify({minY,maxY,maxZ}));
  }finally{rider.dispose();loader.mockRestore();transport.mockRestore();}
 });
 it('starts slowly, coasts and ignores boost; cannot pivot when stopped',()=>{
  const a=fixture(),b=fixture();try{
   a.run(1,{steer:1});expect(a.v.yaw).toBeCloseTo(0,4);
   a.run(1);b.run(2);a.run(2,{forward:1});b.run(2,{forward:1,boost:true});
   expect(a.v.speed).toBeGreaterThan(1);expect(a.v.speed).toBeLessThan(3.5);expect(a.v.speed).toBeCloseTo(b.v.speed,2);
   const speed=a.v.speed;a.run(1);expect(a.v.speed).toBeGreaterThan(.5);expect(a.v.speed).toBeLessThan(speed);
  }finally{a.q.dispose();b.q.dispose();}
 });
 it('brakes before reversing, caps reverse and brakes to rest with Space',()=>{
  const {q,v,run}=fixture();try{
   run(5,{forward:1});const speed=v.speed;run(.2,{forward:-1});expect(v.velocity.z).toBeGreaterThan(0);expect(v.speed).toBeLessThan(speed);
   run(8,{forward:-1});expect(v.velocity.z).toBeLessThan(-1);expect(v.speed).toBeLessThanOrEqual(2.501);
   run(2,{brake:true});expect(v.speed).toBeLessThan(.01);
  }finally{q.dispose();}
 });
 it('uses long-wheelbase steering and reverses yaw direction while backing up',()=>{
  const a=fixture(),b=fixture();try{
   a.v.velocity.z=3;b.v.velocity.z=-3;a.run(.5,{steer:1});b.run(.5,{steer:1});
   expect(a.v.yaw).toBeLessThan(-.03);expect(b.v.yaw).toBeGreaterThan(.03);expect(Math.abs(a.v.yaw)).toBeLessThan(.2);
   expect(Math.abs(busWheelAngle(1,20,.52))).toBeLessThan(Math.abs(busWheelAngle(1,2,.52)));
  }finally{a.q.dispose();b.q.dispose();}
 });
 it('stops the full bus nose at a wall and remains finite',()=>{
  const {q,v,run}=fixture(true);try{
   v.velocity.z=18;run(5,{forward:1});expect(v.position.z).toBeLessThan(16.6);expect(v.position.z).toBeGreaterThan(15);
   expect(q.overlaps(v.position,v.spec.wheelPhysics!.chassis!,v.rotation)).toBe(false);
   expect([...v.position.toArray(),...v.rotation.toArray()].every(Number.isFinite)).toBe(true);
  }finally{q.dispose();}
 });
});

function stepVehicle(...args:Parameters<typeof prepareVehicle>){prepareVehicle(...args);if(args[0].motion.wheelPhysics||args[0].motion.body)args[4].stepPhysics(args[2]);}
