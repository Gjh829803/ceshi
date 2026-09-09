import {getMap} from '../../../../shared/training-content/environment/maps';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Character} from './character';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {PerspectiveCamera,Group,Vector3,SkinnedMesh} from 'three';
import {createWorld} from '../world';
import {initEnvironmentQueries,EnvironmentQueries,vehicleBody} from './environment/queries';
import {createVehicle,stepVehicle,emptyInput,type Input} from './simulation';
import {SUBMERSIBLE_WATER,createSubmersibleState} from './submersible';
import {sampleSubmersibleVisual,disposeSubmersibleVisual} from './submersible-visual';
import {SUBMERSIBLE_SPEC} from '../../../../shared/training-content/submersible';
import {buildSubmersibleModel} from '../../../../shared/training-content/submersible-model';
beforeAll(initEnvironmentQueries);
function fixture(dry=false,wall=false){
 const q=new EnvironmentQueries({id:'pool',name:'Pool',description:'',bounds:{min:[-100,-30,-100],max:[100,30,100]},boxes:[{id:'floor',position:[0,dry?-1.55:-21,0],size:[200,1,200]},...(wall?[{id:'wall',position:[0,-4,9] as const,size:[100,40,.5] as const}]:[])],water:dry?[]:[{id:'water',min:[-90,-20.5,-90],max:[90,0,90],surface:0}],regions:[{id:'pool',name:'Pool',description:'',center:[0,0,0],size:[180,180],color:'#aaa',modes:['sub','character']}],spawns:[],playerSpawn:[-20,1,0]});
 const v=createVehicle({...SUBMERSIBLE_SPEC,spawn:[0,.12,0],yaw:0});let time=0;
 const run=(seconds:number,input:Partial<Input>={})=>{for(let n=0;n<Math.round(seconds*60);n++){time+=1/60;stepVehicle(v,{...emptyInput(),...input},1/60,time,q);}};
 return {q,v,run,time:()=>time};
}
describe('observation submersible',()=>{
 it('floats by displacement, dives with ballast, settles at depth and resurfaces',()=>{
  const f=fixture();try{f.v.position.y=1;f.run(12);expect(f.v.position.y).toBeCloseTo(.12,2);expect(f.v.submersible!.buoyancy).toBeCloseTo(9.81,1);
   f.run(7,{lift:-1});expect(f.v.position.y).toBeLessThan(-5);expect(f.v.submersible!.ballast).toBeGreaterThan(.99);
   f.run(5);const y=f.v.position.y;f.run(3);expect(Math.abs(f.v.position.y-y)).toBeLessThan(.05);expect(f.v.submersible!.mass).toBeCloseTo(SUBMERSIBLE_WATER.displacement*1000,0);
   f.run(14,{lift:1});f.run(10);expect(f.v.position.y).toBeCloseTo(.12,2);expect(f.v.submersible!.ballast).toBeLessThan(.01);
  }finally{f.q.dispose();}
 });
 it('moves both ways, turns at rest, obeys floor/wall collisions and has no land propulsion',()=>{
  const f=fixture(),dry=fixture(true),wall=fixture(false,true);try{f.run(4,{forward:1});expect(f.v.speed).toBeGreaterThan(2);f.run(9,{forward:-1});expect(f.v.velocity.z).toBeLessThan(-1);
   f.run(4,{boost:true});expect(f.v.speed).toBeLessThan(.1);f.run(2,{steer:1});expect(f.v.yaw).toBeLessThan(-.5);
   dry.run(8,{forward:1,lift:-1});expect(Math.abs(dry.v.position.z)).toBeLessThan(.002);expect(dry.v.submersible!.power).toBe(0);
   wall.run(8,{forward:1});expect(wall.v.position.z).toBeGreaterThan(3);expect(wall.v.position.z).toBeLessThan(7.4);expect(wall.q.overlaps(wall.v.position,vehicleBody(wall.v.spec),wall.v.rotation)).toBe(false);
   f.run(40,{lift:-1});expect(f.v.position.y).toBeGreaterThan(-19.5);expect(f.q.overlaps(f.v.position,vehicleBody(f.v.spec),f.v.rotation)).toBe(false);
  }finally{f.q.dispose();dry.q.dispose();wall.q.dispose();}
 });
 it('emits surface spray and underwater bubbles only with power; visuals sample without advancing time',()=>{
  const f=fixture(),root=buildSubmersibleModel();try{f.run(2);expect(f.v.submersible!.particles).toHaveLength(0);f.run(2,{forward:1});expect(f.v.submersible!.particles.some(p=>!p.bubble)).toBe(true);
   f.run(7,{lift:-1,forward:1});expect(f.v.submersible!.particles.some(p=>p.bubble)).toBe(true);const serial=f.v.submersible!.serial;
   sampleSubmersibleVisual(root,f.v.submersible!,f.time());const a=root.getObjectByName('submersible.rotor.1')!.rotation.z;sampleSubmersibleVisual(root,f.v.submersible!,f.time());expect(root.getObjectByName('submersible.rotor.1')!.rotation.z).toBe(a);expect(f.v.submersible!.serial).toBe(serial);
   f.run(5);expect(f.v.submersible!.particles).toHaveLength(0);expect(createVehicle(SUBMERSIBLE_SPEC).submersible).toEqual(createSubmersibleState());
  }finally{disposeSubmersibleVisual(root);expect(root.getObjectByName('submersible.water-fx')).toBeUndefined();f.q.dispose();}
 });
 it('keeps unattended craft afloat, prevents underwater hatch exit, and resets ballast/particles',async()=>{
  const f=fixture(),map=f.q.map;f.q.dispose();const spec={...SUBMERSIBLE_SPEC,spawn:[0,.12,0] as [number,number,number],yaw:0};
  const world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),navigation:false,training:{map:{...map,spawns:[{id:'sub',name:'sub',vehicleId:spec.id,position:spec.spawn,yaw:0,regionId:'pool'}]},vehicles:[{instanceId:spec.id,assetId:'training.observation-sub',spec,object:buildSubmersibleModel()}],character:{instanceId:'person',object:new Group()}}});
  try{world.step({training:emptyInput()},600);expect(world.training!.simulation.vehicles[0]!.position.y).toBeCloseTo(.12,2);
   world.training!.prepareEpisodeStart({positionWorldMetersXYZ:[0,-5,0],facingYawRadians:0,training:{vehicleInstanceId:spec.id,mounted:true}});expect(world.training!.interact()).toBe(false);
   world.training!.prepareEpisodeStart({positionWorldMetersXYZ:spec.spawn,facingYawRadians:0,training:{vehicleInstanceId:spec.id,mounted:true}});world.step({training:{...emptyInput(),lift:-1}},420);expect(world.training!.interact()).toBe(false);expect(world.training!.simulation.message).toContain('上浮');
   world.step({training:{...emptyInput(),lift:1}},900);world.step({training:emptyInput()},600);expect(world.training!.interact()).toBe(true);
   world.training!.simulation.visit(0);expect(world.training!.simulation.vehicles[0]!.submersible).toEqual(createSubmersibleState());
  }finally{world.dispose();}
 });
});

it('places the original rider inside the sealed cabin from the first mounted frame',async()=>{
 const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{const b=await readFile(fileURLToPath(url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');});
 const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
 const rider=new Character();try{await rider.load(p=>new URL(`../../../../assets/three-creator/training/${p}`,import.meta.url).href);rider.root.position.set(...SUBMERSIBLE_SPEC.seat);
  for(const dt of [0,1/60,.5]){rider.update(dt,{position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:0,vertical:0,grounded:false,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',animationEvent:null,surface:null,skills:null,mounted:'sub'});
   rider.root.updateMatrixWorld(true);let low=Infinity,high=-Infinity,front=-Infinity;const v=new Vector3();rider.root.traverse(n=>{if(n instanceof SkinnedMesh){n.skeleton.update();for(let j=0;j<n.geometry.getAttribute('position').count;j++){n.getVertexPosition(j,v).applyMatrix4(n.matrixWorld);low=Math.min(low,v.y);high=Math.max(high,v.y);front=Math.max(front,v.z);}}});
   expect(low).toBeGreaterThan(-.33);expect(high).toBeLessThan(1.42);expect(front).toBeLessThan(1.27);
  }
 }finally{rider.dispose();loader.mockRestore();transport.mockRestore();}
});

it('leaves the real deep-water berth clear during rotation and vertical travel',()=>{
 const q=new EnvironmentQueries(getMap('campus'));try{
  const v=createVehicle(SUBMERSIBLE_SPEC),body=vehicleBody(v.spec);
  for(const depth of [0,1,4,10])for(let n=0;n<16;n++){
   v.rotation.setFromAxisAngle(new Vector3(0,1,0),n*Math.PI/8);const p=new Vector3(...SUBMERSIBLE_SPEC.spawn);p.y-=depth;
   expect(q.overlaps(p,body,v.rotation),`depth=${depth}, heading=${n}`).toBe(false);
  }
 }finally{q.dispose();}
});
