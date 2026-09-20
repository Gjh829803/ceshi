import {testAssetResourceUrl} from '../asset-library.test-support';
import {contactColliderVolume} from '../physics-box';
import {parseFixtureGlb} from './textured-glb-fixture';
import {RAFT_SPEC} from '@worldkit/preset-content/raft';
import {buildRaftModel} from '@worldkit/preset-content/raft-model';
import {CANOE_SPEC} from '@worldkit/preset-content/canoe';
import {buildCanoeModel} from '@worldkit/preset-content/canoe-model';
import {CANOE_WATER} from './motion-families/surface-vessel/paddling';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {SkinnedMesh,Vector3,PerspectiveCamera} from 'three';
import {createWorld} from '../world';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EnvironmentQueries,initEnvironmentQueries,vehicleBody} from './environment/queries';
import {createVehicle,stepVehicle as prepareVehicle,emptyInput,type Input} from './simulation';
import {createKayakState,KAYAK_WATER,kayakPaddlePose,KAYAK_GEOMETRY} from './motion-families/surface-vessel/paddling';
import {Character,type HumanoidRenderState} from './character';
import {createUnicycleState} from './motion-families/ground-vehicle/unicycle';
import {KAYAK_SPEC} from '@worldkit/preset-content/kayak';
import {buildKayakModel} from '@worldkit/preset-content/kayak-model';
import {sampleKayakVisual} from './kayak-visual';
import {readControls} from './input';
import {kayakStroke} from './motion-families/surface-vessel/paddling';
beforeAll(initEnvironmentQueries);
describe.each([KAYAK_SPEC,CANOE_SPEC])('$id keyboard and visible paddle direction',spec=>{
 it.each(['stationary','forward','reverse'])('keeps A left and D right while %s, including switching sides',travel=>{
  const f=fixture(false,false,spec),model=spec.id==='canoe'?buildCanoeModel():buildKayakModel();
  try{
   f.run(2);
   for(const key of ['KeyA','KeyD']){
    const input=readControls(new Set([key,...(travel==='forward'?['KeyW']:travel==='reverse'?['KeyS']:[])]),true,false,{},undefined,{mode:'paddled_boat'});
    const sign=key==='KeyA'?-1:1;
    expect(input.steer).toBe(sign);
    const initialForward=new Vector3(0,0,1).applyQuaternion(f.v.rotation);
    const initialRight=initialForward.clone().cross(new Vector3(0,1,0)).normalize();
    let wetSamples=0;
    for(let frame=0;frame<240;frame++){
     f.run(1/60,input);
     const k=f.v.motion.kayak!,stroke=kayakStroke(k);
     if(frame<60||stroke.power<.1||k.bladeImmersion<.1)continue;
     model.position.copy(f.v.position);model.quaternion.copy(f.v.rotation);sampleKayakVisual(model,k,f.v.speed);
     const blade=model.getObjectByName(spec.id==='canoe'?'canoe.single-blade':`kayak.blade.${stroke.side}`)!;
     const right=new Vector3(0,0,1).applyQuaternion(f.v.rotation).cross(new Vector3(0,1,0)).normalize();
     // 使用实际模型桨叶位置和人物面向船头时的右向量，不凭 yaw 正负命名左右。
     expect(blade.getWorldPosition(new Vector3()).sub(f.v.position).dot(right)*sign).toBeGreaterThan(.2);
     wetSamples++;
    }
    expect(wetSamples).toBeGreaterThan(5);
    expect(new Vector3(0,0,1).applyQuaternion(f.v.rotation).dot(initialRight)*sign).toBeGreaterThan(.05);
    expect(f.v.motion.kayak!.yawRate*sign).toBeLessThan(-.01);
   }
   if(spec.id==='kayak'){
    f.run(3,{forward:1});expect(f.v.motion.kayak!.side).toBeUndefined();
   }
  }finally{f.q.dispose();}
 });
});
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
 it('turns toward the active paddle side at rest, has no dry-land thrust and collides with a pier',()=>{
  const right=fixture(),left=fixture(),dry=fixture(true),wall=fixture(false,true);try{
   right.run(2);right.run(5,{steer:1});expect(right.v.yaw).toBeLessThan(-.3);expect(right.v.speed).toBeLessThan(.02);
   left.run(2);left.run(5,{steer:-1});expect(left.v.yaw).toBeGreaterThan(.3);expect(left.v.speed).toBeLessThan(.02);
   dry.run(8,{forward:1,steer:1});expect(Math.abs(dry.v.position.z)).toBeLessThan(.002);expect(dry.v.yaw).toBeCloseTo(0,4);
   wall.run(15,{forward:1});expect(wall.v.position.z).toBeGreaterThan(4);expect(wall.v.position.z).toBeLessThan(5.6);expect(qOverlap(wall)).toBe(false);
  }finally{right.q.dispose();left.q.dispose();dry.q.dispose();wall.q.dispose();}
 });
 it('keeps repeated visual samples stationary and reset clears stroke state',()=>{
  const root=buildKayakModel(),k={...createKayakState(),phase:.32,effort:1,surface:0};sampleKayakVisual(root,k,2);
  const before=root.getObjectByName('kayak.paddle')!.matrixWorld.toArray();sampleKayakVisual(root,k,2);root.updateMatrixWorld(true);
  expect(root.getObjectByName('kayak.paddle')!.matrixWorld.toArray()).toEqual(before);expect(createVehicle(KAYAK_SPEC).motion.kayak).toEqual(createKayakState());
 });
 it.each([KAYAK_SPEC,CANOE_SPEC,RAFT_SPEC])('keeps Source101 feet inside with fixed hands while $id paddles and moves',async(spec)=>{
  expect(spec.mode).toBe('paddled_boat');expect(spec.archetype).toBe(spec.id);expect(spec.characterPose).toBe('paddling');expect(spec).not.toHaveProperty('visualVariant');
  const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{const bytes=await readFile(fileURLToPath(url));return parseFixtureGlb(bytes);});
  const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
  const rider=new Character();try{await rider.load(testAssetResourceUrl);rider.root.position.set(...spec.seat);
   const hands:Vector3[]=[];
   for(const side of ((spec.archetype==='canoe'||spec.archetype==='raft')?[-1,1]:[-1]))for(const phase of [0,.25,.5,.85,1.25,1.5]){const k={...createVehicle(spec).motion.kayak!,...((spec.archetype==='canoe'||spec.archetype==='raft')?{side}:{}),phase,effort:1};
    rider.update(1/60,{position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:2,vertical:0,grounded:false,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',animationEvent:null,surface:null,skills:null,mounted:'paddling',kayakPose:k});
    rider.root.updateMatrixWorld(true);let minY=Infinity,minFootY=Infinity;const point=new Vector3();rider.root.traverse(n=>{if(n instanceof SkinnedMesh){n.skeleton.update();for(let j=0;j<n.geometry.getAttribute('position').count;j++){n.getVertexPosition(j,point).applyMatrix4(n.matrixWorld);minY=Math.min(minY,point.y);if(point.z>.38)minFootY=Math.min(minFootY,point.y);if(spec.id==='raft'&&point.z>.41&&point.z<.61&&Math.abs(point.x)<.25)expect(point.y).toBeGreaterThan(.305);}}});expect(minY).toBeGreaterThan(-.18);if(spec.id==='raft'&&phase===.5&&side===-1)console.log('RAFT_FEET',minY,minFootY,rider.root.getObjectByName('ball_l')!.getWorldPosition(new Vector3()).toArray(),rider.root.getObjectByName('ball_r')!.getWorldPosition(new Vector3()).toArray());
    for(const [index,suffix] of ['l','r'].entries()){const hand=rider.root.worldToLocal(rider.root.getObjectByName(`hand_${suffix}`)!.getWorldPosition(new Vector3()));hands[index]??=hand.clone();expect(hand.distanceTo(hands[index]!)).toBeLessThan(1e-6);}
   }
   // Verify the runtime moves the paddle without moving the rider limbs,
   // including a rotated craft; isolated bone posing is insufficient.
   const f=fixture(false,false,spec),map={...f.q.map,regions:[{id:'pool',name:'Pool',description:'',center:[0,0,0] as const,size:[180,180] as const,color:'#aaa',modes:['paddled_boat']}],spawns:[{id:'kayak',vehicleId:'kayak',name:'Kayak',position:[0,.07,0] as const,yaw:Math.PI/2,regionId:'pool'}]};f.q.dispose();
   const boat=spec.id==='raft'?buildRaftModel():spec.id==='canoe'?buildCanoeModel():buildKayakModel(),world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map,character:{instanceId:'person',object:rider.root,animation:rider},vehicles:[{instanceId:'kayak',assetId:'vehicle.kayak',object:boat,spec:{...spec,spawn:[0,.07,0],yaw:Math.PI/2}}]}});
   try{world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,.07,0],facingYawRadians:Math.PI/2,humanoid:{vehicleInstanceId:'kayak',mounted:true}});world.step({humanoid:{...emptyInput(),forward:1}},90);
    expect(world.humanoid!.inputGuide().family).toBe('paddled_boat');
    const v=world.humanoid!.simulation.controlledActor.vehicle!;
    expect(v.motion.kayak!.phase).toBeGreaterThan(0);expect(v.position.distanceTo(new Vector3(0,.07,0))).toBeGreaterThan(.1);
    const paddle=boat.getObjectByName('kayak.paddle')!,before=paddle.position.clone(),rotationBefore=paddle.quaternion.clone();
    const checkHands=()=>{rider.root.updateWorldMatrix(true,true);for(const [index,suffix] of ['l','r'].entries())expect(rider.root.worldToLocal(rider.root.getObjectByName(`hand_${suffix}`)!.getWorldPosition(new Vector3())).distanceTo(hands[index]!)).toBeLessThan(1e-5);};
    checkHands();world.step({humanoid:{...emptyInput(),forward:1,steer:1}},20);checkHands();
    expect(paddle.position.distanceTo(before)+paddle.quaternion.angleTo(rotationBefore)).toBeGreaterThan(.001);

   }finally{world.dispose();}
  }finally{rider.dispose();loader.mockRestore();transport.mockRestore();}
 });
});
// Rounded hull corners are intentionally smaller than their rectangular envelope.
// Check the actual solver shapes against exact obstacle volumes, with zero penetration.
function qOverlap(f:ReturnType<typeof fixture>){
 const v=f.v,rig=f.q.vehicleRig(v.spec.id,v.motion.body!,v.position,v.rotation,1,1,1,1,1);let overlaps=false;
 f.q.borrowPhysics().world.colliders.forEach(other=>{
  if(!other.isEnabled()||other.isSensor()||rig.colliders.includes(other))return;
  for(const self of rig.colliders)if(self.isEnabled()){
   const contact=contactColliderVolume(other,self.shape,self.translation(),self.rotation(),0);
   if(contact&&contact.distance<0)overlaps=true;
  }
 });return overlaps;
}

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
   wall.run(15,{forward:1});expect(wall.v.position.z).toBeGreaterThan(3);expect(wall.v.position.z).toBeLessThan(7.75);expect(qOverlap(wall)).toBe(false);
   expect(createVehicle(CANOE_SPEC).motion.kayak).toMatchObject({craft:'canoe',side:-1,phase:0,effort:0,yawRate:0});
  }finally{c.q.dispose();dry.q.dispose();wall.q.dispose();}
 });
});

function stepVehicle(...args:Parameters<typeof prepareVehicle>){prepareVehicle(...args);if(args[0].motion.wheelPhysics||args[0].motion.body)args[4].stepPhysics(args[2]);}

it('keeps vehicle rider poses fixed while preserving wearable ground locomotion and walking on dismount',async()=>{
 const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>parseFixtureGlb(await readFile(fileURLToPath(url))));
 const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
 const rider=new Character();
 const frame:HumanoidRenderState={position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:0,vertical:0,grounded:true,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',animationEvent:null,surface:null,skills:null};
 const locals=()=>{const values:number[]=[];rider.actor.traverse(n=>{if(n.type==='Bone'||n===rider.actor){n.updateMatrix();values.push(...n.matrix.toArray());}});return values;};
 try{
  await rider.load(testAssetResourceUrl);
  const modes:NonNullable<HumanoidRenderState['mounted']>[]=['drive','ride','stand','unicycle','atv','tank','submarine','paddling','sled','ski','wingsuit','paraglider'];
  for(const mounted of modes){
   rider.update(0,{...frame,mounted});const before=locals();
   for(let n=0;n<12;n++){
    rider.root.position.set(n,2,-n);rider.root.rotation.set(n*.02,n*.1,-n*.01);
    rider.update(1/30,{...frame,mounted,speed:8,atvSteeringAngle:n%2?.42:-.42,unicyclePose:{...createUnicycleState(),wheelAngle:n,footDown:n/12,balance:n/12,balanceTime:n},kayakPose:{...createKayakState(),phase:n/12,effort:1},sledPose:{push:n/12,brake:n/12,steer:n%2?1:-1},wearablePose:{spread:n/12,seated:1-n/12,landing:.3}});
    const after=locals();expect(after.length).toBe(before.length);after.forEach((v,i)=>expect(v,`${mounted} local ${i}`).toBeCloseTo(before[i]!,5));
   }
  }
  // 翼装准备是正常地面移动：真实跑步动作必须有权重，骨架必须继续前进。
  for(let n=0;n<60;n++)rider.update(1/60,{...frame,mounted:'wingsuit-ready',speed:6});
  expect(rider.sourceCharacter!.weights.run).toBeGreaterThan(.5);
  const running=locals();rider.update(.15,{...frame,mounted:'wingsuit-ready',speed:6});expect(locals()).not.toEqual(running);
  for(let n=0;n<60;n++)rider.update(1/60,{...frame,mounted:'wingsuit-ready',speed:0});
  expect(rider.sourceCharacter!.weights.idle).toBeGreaterThan(.5);
  rider.update(1/60,{...frame,speed:4});const before=locals();rider.update(.2,{...frame,speed:4});expect(locals()).not.toEqual(before);expect(rider.actor.position.toArray()).toEqual([0,0,0]);
 }finally{rider.dispose();loader.mockRestore();transport.mockRestore();}
});
