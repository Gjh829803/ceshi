import {RAFT_SPEC} from '../../../../shared/preset-content/raft';
import {buildRaftModel} from '../../../../shared/preset-content/raft-model';
import {CANOE_SPEC} from '../../../../shared/preset-content/canoe';
import {buildCanoeModel} from '../../../../shared/preset-content/canoe-model';
import {CANOE_WATER,paddleGrip} from './kayak';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {SkinnedMesh,Vector3,PerspectiveCamera} from 'three';
import {createWorld} from '../world';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EnvironmentQueries,initEnvironmentQueries,vehicleBody} from './environment/queries';
import {createVehicle,stepVehicle as prepareVehicle,emptyInput,type Input} from './simulation';
import {createKayakState,KAYAK_WATER,kayakPaddlePose,KAYAK_GEOMETRY} from './kayak';
import {Character} from './character';
import {KAYAK_SPEC} from '../../../../shared/preset-content/kayak';
import {buildKayakModel} from '../../../../shared/preset-content/kayak-model';
import {sampleKayakVisual} from './kayak-visual';
beforeAll(initEnvironmentQueries);
function fixture(dry=false,wall=false,spec=KAYAK_SPEC){
 const q=new EnvironmentQueries({id:'pool',name:'Pool',description:'',bounds:{min:[-100,-10,-100],max:[100,20,100]},boxes:[{id:'floor',position:[0,dry?-.5:-6,0],size:[200,1,200]},...(wall?[{id:'wall',position:[0,2,8] as const,size:[100,8,.5] as const}]:[])],water:dry?[]:[{id:'water',min:[-90,-5.5,-90],max:[90,0,90],surface:0}],spawns:[],regions:[],playerSpawn:[-10,1,0]});
 const v=createVehicle({...spec,spawn:[0,dry?.245:.07,0],yaw:0});
 const run=(seconds:number,input:Partial<Input>={})=>{for(let n=0;n<Math.round(seconds*60);n++)stepVehicle(v,{...emptyInput(),...input},1/60,n/60,q);};
 return {q,v,run};
}
describe('kayak water and paddle mechanics',()=>{
 it('cannot accelerate during the airborne recovery part of a stroke',()=>{
  const {q,v,run}=fixture();try{run(2);run(.12,{forward:1});expect(v.motion.kayak!.bladeImmersion).toBe(0);expect(v.speed).toBeLessThan(.001);
   run(.5,{forward:1});expect(v.speed).toBeGreaterThan(.05);expect(v.motion.kayak!.bladeImmersion).toBeGreaterThan(.1);
  }finally{q.dispose();}
 });
 it('settles by displaced volume and damping instead of snapping to a water height',()=>{
  const {q,v,run}=fixture();try{v.position.y=.9;run(.2);expect(v.position.y).toBeGreaterThan(.1);run(8);
   expect(v.position.y).toBeCloseTo(.23-KAYAK_WATER.mass/(1000*KAYAK_WATER.maxDisplacement)*KAYAK_WATER.depth,2);
   expect(Math.abs(v.velocity.y)).toBeLessThan(.01);expect(v.motion.kayak!.buoyancy).toBeCloseTo(9.81,1);expect(v.grounded).toBe(false);
  }finally{q.dispose();}
 });
 it('pulses forward, coasts, back-paddles and brakes without motor boost',()=>{
  const a=fixture(),b=fixture();try{a.run(2);b.run(2);a.run(6,{forward:1});b.run(6,{forward:1,boost:true});
   expect(a.v.speed).toBeGreaterThan(1);expect(a.v.speed).toBeCloseTo(b.v.speed,6);
   const speed=a.v.speed,old=a.v.position.clone();a.run(1);expect(a.v.speed).toBeGreaterThan(.2);expect(a.v.speed).toBeLessThan(speed);expect(a.v.position.distanceTo(old)).toBeGreaterThan(.2);
   a.run(8,{forward:-1});expect(a.v.velocity.z).toBeLessThan(-.2);expect(a.v.speed).toBeLessThanOrEqual(1.81);
   a.run(3,{brake:true});expect(a.v.speed).toBeLessThan(.03);
  }finally{a.q.dispose();b.q.dispose();}
 });
 it('turns at rest using sweep strokes, has no dry-land thrust and collides with a pier',()=>{
  const a=fixture(),dry=fixture(true),wall=fixture(false,true);try{
   a.run(2);a.run(4,{steer:1});expect(a.v.yaw).toBeLessThan(-.3);expect(a.v.speed).toBeLessThan(.02);
   dry.run(8,{forward:1,steer:1});expect(Math.abs(dry.v.position.z)).toBeLessThan(.002);expect(dry.v.yaw).toBeCloseTo(0,4);
   wall.run(15,{forward:1});expect(wall.v.position.z).toBeGreaterThan(4);expect(wall.v.position.z).toBeLessThan(5.6);expect(qOverlap(wall)).toBe(false);
  }finally{a.q.dispose();dry.q.dispose();wall.q.dispose();}
 });
 it('keeps repeated visual samples stationary and reset clears stroke state',()=>{
  const root=buildKayakModel(),k={...createKayakState(),phase:.32,effort:1,surface:0};sampleKayakVisual(root,k,2);
  const before=root.getObjectByName('kayak.paddle')!.matrixWorld.toArray();sampleKayakVisual(root,k,2);root.updateMatrixWorld(true);
  expect(root.getObjectByName('kayak.paddle')!.matrixWorld.toArray()).toEqual(before);expect(createVehicle(KAYAK_SPEC).motion.kayak).toEqual(createKayakState());
 });
 it.each([KAYAK_SPEC,CANOE_SPEC,RAFT_SPEC])('keeps Source101 feet inside and hands on $id paddle in the runtime',async(spec)=>{
  expect(spec.mode).toBe('paddled_boat');expect(spec.archetype).toBe(spec.id);expect(spec.characterPose).toBe('paddling');expect(spec).not.toHaveProperty('visualVariant');
  const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{const bytes=await readFile(fileURLToPath(url));return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');});
  const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
  const rider=new Character();try{await rider.load(p=>new URL(`../../../../assets/three-creator/presets/${p}`,import.meta.url).href);rider.root.position.set(...spec.seat);
   for(const side of ((spec.archetype==='canoe'||spec.archetype==='raft')?[-1,1]:[-1]))for(const phase of [0,.25,.5,.85,1.25,1.5]){const k={...createVehicle(spec).motion.kayak!,...((spec.archetype==='canoe'||spec.archetype==='raft')?{side}:{}),phase,effort:1};
    rider.update(1/60,{position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:2,vertical:0,grounded:false,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',animationEvent:null,surface:null,skills:null,mounted:'paddling',kayakPose:k});
    rider.root.updateMatrixWorld(true);let minY=Infinity,minFootY=Infinity;const point=new Vector3();rider.root.traverse(n=>{if(n instanceof SkinnedMesh){n.skeleton.update();for(let j=0;j<n.geometry.getAttribute('position').count;j++){n.getVertexPosition(j,point).applyMatrix4(n.matrixWorld);minY=Math.min(minY,point.y);if(point.z>.38)minFootY=Math.min(minFootY,point.y);if(spec.id==='raft'&&point.z>.41&&point.z<.61&&Math.abs(point.x)<.25)expect(point.y).toBeGreaterThan(.305);}}});expect(minY).toBeGreaterThan(-.18);if(spec.id==='raft'&&phase===.5&&side===-1)console.log('RAFT_FEET',minY,minFootY,rider.root.getObjectByName('ball_l')!.getWorldPosition(new Vector3()).toArray(),rider.root.getObjectByName('ball_r')!.getWorldPosition(new Vector3()).toArray());
    const pose=kayakPaddlePose(k);for(const [suffix,side] of [['l',1],['r',-1]] as const){const target=paddleGrip(k,side).applyQuaternion(pose.rotation).add(pose.position);expect(rider.root.getObjectByName(`hand_${suffix}`)!.getWorldPosition(point).distanceTo(target)).toBeLessThan(.035);}
   }
   // Verify the runtime passes the stroke into the actual animation owner,
   // including a rotated craft; isolated bone posing is insufficient.
   const f=fixture(false,false,spec),map={...f.q.map,regions:[{id:'pool',name:'Pool',description:'',center:[0,0,0] as const,size:[180,180] as const,color:'#aaa',modes:['paddled_boat']}],spawns:[{id:'kayak',vehicleId:'kayak',name:'Kayak',position:[0,.07,0] as const,yaw:Math.PI/2,regionId:'pool'}]};f.q.dispose();
   const boat=spec.id==='raft'?buildRaftModel():spec.id==='canoe'?buildCanoeModel():buildKayakModel(),world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map,character:{instanceId:'person',object:rider.root,animation:rider},vehicles:[{instanceId:'kayak',assetId:'vehicle.kayak',object:boat,spec:{...spec,spawn:[0,.07,0],yaw:Math.PI/2}}]}});
   try{world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,.07,0],facingYawRadians:Math.PI/2,humanoid:{vehicleInstanceId:'kayak',mounted:true}});world.step({humanoid:{...emptyInput(),forward:1}},90);
    expect(world.humanoid!.inputGuide().family).toBe('paddled_boat');
    const v=world.humanoid!.simulation.controlledActor.vehicle!,p=kayakPaddlePose(v.motion.kayak!);for(const [suffix,side] of [['l',1],['r',-1]] as const){const target=paddleGrip(v.motion.kayak!,side).applyQuaternion(p.rotation).add(p.position).applyQuaternion(v.rotation).add(v.position);expect(rider.root.getObjectByName(`hand_${suffix}`)!.getWorldPosition(new Vector3()).distanceTo(target)).toBeLessThan(.035);}
   }finally{world.dispose();}
  }finally{rider.dispose();loader.mockRestore();transport.mockRestore();}
 });
});
function qOverlap(f:ReturnType<typeof fixture>){return f.q.overlaps(f.v.position,vehicleBody(f.v.spec),f.v.rotation);}

describe('single-blade canoe profile',()=>{
 it('settles its heavier hull and has slower propulsion with persistent single-sided yaw',()=>{
  const c=fixture(false,false,CANOE_SPEC),k=fixture();try{c.run(8);k.run(8);
   expect(c.v.position.y).toBeCloseTo(.32-CANOE_WATER.mass/(1000*CANOE_WATER.maxDisplacement)*CANOE_WATER.depth,2);
   expect(c.v.motion.kayak!.buoyancy).toBeCloseTo(9.81,1);
   c.run(6,{forward:1});k.run(6,{forward:1});expect(c.v.speed).toBeGreaterThan(.5);expect(c.v.speed).toBeLessThan(k.v.speed*.9);
   expect(c.v.yaw).toBeLessThan(-.15);expect(c.v.motion.kayak!.side).toBe(-1);
   const speed=c.v.speed;c.run(1);expect(c.v.speed).toBeGreaterThan(.2);expect(c.v.speed).toBeLessThan(speed);
   c.run(10,{forward:-1});const forward=new Vector3(Math.sin(c.v.yaw),0,Math.cos(c.v.yaw));expect(c.v.velocity.dot(forward)).toBeLessThan(-.2);
   c.run(4,{brake:true});expect(c.v.speed).toBeLessThan(.05);
  }finally{c.q.dispose();k.q.dispose();}
 });
 it('changes paddle side to turn both ways, cannot propel on land and stops at a pier',()=>{
  const c=fixture(false,false,CANOE_SPEC),dry=fixture(true,false,CANOE_SPEC),wall=fixture(false,true,CANOE_SPEC);
  try{c.run(2);c.run(5,{steer:-1});expect(c.v.motion.kayak!.side).toBe(1);expect(c.v.yaw).toBeGreaterThan(.3);
   const yaw=c.v.yaw;c.run(6,{steer:1});expect(c.v.motion.kayak!.side).toBe(-1);expect(c.v.yaw).toBeLessThan(yaw-.3);
   dry.run(8,{forward:1});expect(dry.v.speed).toBeLessThan(.002);expect(dry.v.motion.kayak!.bladeImmersion).toBe(0);
   wall.run(15,{forward:1});expect(wall.v.position.z).toBeGreaterThan(3);expect(wall.v.position.z).toBeLessThan(7);expect(qOverlap(wall)).toBe(false);
   expect(createVehicle(CANOE_SPEC).motion.kayak).toMatchObject({craft:'canoe',side:-1,phase:0,effort:0,yawRate:0});
  }finally{c.q.dispose();dry.q.dispose();wall.q.dispose();}
 });
});

function stepVehicle(...args:Parameters<typeof prepareVehicle>){prepareVehicle(...args);if(args[0].motion.wheelPhysics||args[0].motion.body)args[4].stepPhysics(args[2]);}
