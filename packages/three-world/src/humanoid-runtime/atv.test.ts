import {parseFixtureGlb} from './textured-glb-fixture';
import {beforeAll,expect,it,vi} from 'vitest';
import {Box3,Group,Mesh,SkinnedMesh,Vector3,PerspectiveCamera} from 'three';
import {createWorld} from '../index';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createVehicle,emptyInput,stepVehicle as prepareVehicle,type Input} from './simulation';
import {EnvironmentQueries,initEnvironmentQueries,vehicleBody} from './environment/queries';
import {createAtvState,sampleAtvVisual} from './motion-families/ground-vehicle/atv';
import {Character} from './character';
import {ATV_SPEC,ATV_SOCKETS} from '@worldkit/preset-content/atv';
import {buildAtvModel} from '@worldkit/preset-content/atv-model';
beforeAll(initEnvironmentQueries);
function fixture(wall=false){
 const q=new EnvironmentQueries({id:'atv-test',name:'Tank',description:'',bounds:{min:[-2000,-10,-2000],max:[2000,100,2000]},
  boxes:[{id:'ground',position:[0,-1,0],size:[4000,2,4000]},...(wall?[{id:'wall',position:[0,3,18] as const,size:[80,6,.12] as const}]:[])],water:[],regions:[],spawns:[],playerSpawn:[-20,0,0]});
 const v=createVehicle({...ATV_SPEC,spawn:[0,.035,0]});
 const run=(seconds:number,input:Partial<Input>={})=>{for(let i=0;i<Math.round(seconds*60);i++)stepVehicle(v,{...emptyInput(),...input},1/60,i/60,q);};
 return {q,v,run};
}
it('drives, boosts, brakes before reverse, holds parked and cannot pivot without travel',()=>{
 const {q,v,run}=fixture();try{
 run(1,{steer:1});expect(Math.abs(v.yaw)).toBeLessThan(.001);run(8,{forward:1});expect(v.speed).toBeGreaterThan(29);
 run(3,{forward:1,boost:true});expect(v.speed).toBeGreaterThan(33);run(.3,{forward:-1});expect(v.velocity.z).toBeGreaterThan(0);
 run(10,{forward:-1});expect(v.velocity.z).toBeLessThan(-4);expect(v.speed).toBeLessThanOrEqual(6.1);run(2,{brake:true});expect(v.speed).toBeLessThan(.01);
 const p=v.position.clone();run(2);expect(v.position.distanceTo(p)).toBeLessThan(.02);
 run(2,{forward:1,steer:1});expect(Math.abs(v.yaw)).toBeGreaterThan(.2);expect(Math.abs(v.motion.atv!.wheelAngles[0]!-v.motion.atv!.wheelAngles[1]!)).toBeGreaterThan(.2);
 const model=buildAtvModel();sampleAtvVisual(model,v.motion.atv!);const angle=model.getObjectByName('atv.spin.0')!.rotation.x;sampleAtvVisual(model,v.motion.atv!);expect(model.getObjectByName('atv.spin.0')!.rotation.x).toBe(angle);sampleAtvVisual(model,createAtvState());expect(model.getObjectByName('atv.spin.0')!.rotation.x).toBe(0);
 }finally{q.dispose();}
});
it('stops at solid walls and has no propulsion or chassis steering in midair',()=>{
 const {q,v,run}=fixture(true);try{run(6,{forward:1,boost:true});expect(v.position.z).toBeLessThan(17);expect(q.overlaps(v.position,v.spec.wheelPhysics!.chassis!,v.rotation)).toBe(false);
 v.position.set(0,30,0);v.velocity.set(0,0,0);v.grounded=false;const yaw=v.yaw;run(.5,{forward:1,steer:1,boost:true});expect(v.yaw).toBeCloseTo(yaw,3);expect(Math.hypot(v.position.x,v.position.z)).toBeLessThan(.001);expect(v.position.y).toBeLessThan(30);
 }finally{q.dispose();}
});
it('climbs a physical ramp, aligns the chassis and returns to grounded support after an edge',()=>{
 const f=fixture(),angle=Math.atan(.15);
 const q=new EnvironmentQueries({...f.q.map,boxes:[...f.q.map.boxes,
  {id:'ramp',position:[0,1.5-.2*Math.cos(angle),20],size:[12,.4,20/Math.cos(angle)],rotation:[-angle,0,0]},
  {id:'deck',position:[0,1.5,40],size:[12,3,20]}]});
 try{let height=0,pitch=0,airborne=false,landed=false;
  for(let n=0;n<420;n++){stepVehicle(f.v,{...emptyInput(),forward:1},1/60,n/60,q);height=Math.max(height,f.v.position.y);pitch=Math.max(pitch,Math.abs(f.v.pitch));if(f.v.position.z>51&&!f.v.grounded)airborne=true;if(airborne&&f.v.grounded)landed=true;}
  expect(height).toBeGreaterThan(2.7);expect(pitch).toBeGreaterThan(.07);expect(airborne).toBe(true);expect(landed).toBe(true);
 }finally{q.dispose();f.q.dispose();}
});
it('exchanges impulses with a parked vehicle and displays the solver tyre travel',async()=>{
 const f=fixture();
 const world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map:{...f.q.map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[300,300],color:'#ccc',modes:['character','wheeled']}],spawns:[{id:'a',name:'Driver',vehicleId:'driver',position:[0,.035,0],yaw:0,regionId:'road'},{id:'b',name:'Parked',vehicleId:'parked',position:[0,.035,4],yaw:0,regionId:'road'}]},
  vehicles:[{instanceId:'driver',assetId:'vehicle.atv',spec:{...ATV_SPEC,spawn:[0,.035,0]},object:buildAtvModel()},
   {instanceId:'parked',assetId:'vehicle.atv',spec:{...ATV_SPEC,spawn:[0,.035,4]},object:buildAtvModel()}],
  character:{instanceId:'person',object:new Group()}}});
 try{world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,.035,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'driver',mounted:true}});
  world.step({humanoid:{...emptyInput(),forward:1}},180);const v=world.humanoid!.simulation.controlledActor.vehicle!,p=v.position.clone(),angles=[...v.motion.atv!.wheelAngles];
  world.step({humanoid:{...emptyInput(),forward:1}},60);const parked=world.humanoid!.simulation.vehicles[1]!;expect(parked.position.z).toBeGreaterThan(4);expect(parked.position.z-v.position.z).toBeGreaterThan(2.3);expect(v.motion.atv!.wheelAngles).toEqual(v.motion.wheelPhysics!.wheels.map(w=>w.angle));
 }finally{world.dispose();f.q.dispose();}
});
it('keeps the original straddle rider clear of body panels and relaxed arms independent of the turning handlebar without scaling',async()=>{
 const transport=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{const b=await readFile(fileURLToPath(url));return parseFixtureGlb(b);});
 const fetchTransport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
 const rider=new Character(),model=buildAtvModel();
 try{
  await rider.load(p=>new URL(`../../../../assets/three-creator/presets/${p}`,import.meta.url).href);
  const identities=new Map<SkinnedMesh,unknown>();rider.root.traverse(n=>{if(n instanceof SkinnedMesh)identities.set(n,n.geometry);});
  const samples=[];const restHands:Vector3[]=[];
  for(const angle of [0,-.42,.42,0]){
   rider.root.position.set(...ATV_SPEC.seat);
   rider.update(0,{position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:0,vertical:0,grounded:true,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',animationEvent:null,surface:null,skills:null,mounted:'atv',atvSteeringAngle:angle});
   // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse, as the renderer does.
   rider.root.updateMatrixWorld(true);model.updateMatrixWorld(true);
   const bounds=new Box3(),p=new Vector3(),localPoint=new Vector3();
   const wallMeshes:Mesh[]=[];model.traverse(n=>{if(n instanceof Mesh&&/^(body\.|fender\.)/.test(n.name)){n.geometry.computeBoundingBox();wallMeshes.push(n);}});
   const walls=wallMeshes.map(wall=>({name:wall.name,inverse:wall.matrixWorld.clone().invert(),bounds:wall.geometry.boundingBox!.clone().expandByScalar(-.001)}));
   const intersections=new Set<string>();
   for(const [mesh,geometry] of identities){expect(mesh.geometry).toBe(geometry);expect(mesh.visible).toBe(true);mesh.skeleton.update();
    for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){
     mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(p);
     for(const wall of walls)if(wall.bounds.containsPoint(localPoint.copy(p).applyMatrix4(wall.inverse)))intersections.add(wall.name);
    }
   }
   expect([...intersections]).toEqual([]);
   expect(bounds.min.y).toBeGreaterThan(.24);expect(bounds.max.y).toBeLessThan(1.85);
   // Foot sockets retain their physical calibration; the thicker UEFN shoe raises its ball bone 35 mm.
   for(const [bone,socket] of [['ball_l','control.foot.left'],['ball_r','control.foot.right']] as const){
    const point=rider.root.getObjectByName(bone)!.getWorldPosition(new Vector3());const target=new Vector3(...ATV_SOCKETS[socket]).add(new Vector3(0,.035,0));expect(point.distanceTo(target)).toBeLessThan(.002);
   }
   for(const [index,side] of ['l','r'].entries()){const hand=rider.root.getObjectByName(`hand_${side}`)!.getWorldPosition(new Vector3());restHands[index]??=hand.clone();expect(hand.distanceTo(restHands[index]!)).toBeLessThan(1e-6);}
   expect(rider.root.scale.toArray()).toEqual([1,1,1]);samples.push({angle,min:bounds.min.toArray(),max:bounds.max.toArray()});
  }
  console.log('ATV_RIDER_CLEARANCE',JSON.stringify(samples));
 }finally{rider.dispose();transport.mockRestore();fetchTransport.mockRestore();}
},15_000);

function stepVehicle(...args:Parameters<typeof prepareVehicle>){prepareVehicle(...args);if(args[0].motion.wheelPhysics||args[0].motion.body)args[4].stepPhysics(args[2]);}
