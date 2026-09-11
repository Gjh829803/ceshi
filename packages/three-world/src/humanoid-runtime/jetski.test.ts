import {parseFixtureGlb} from './textured-glb-fixture';
import {beforeAll,expect,it,vi} from 'vitest';
import {Box3,Group,Mesh,SkinnedMesh,Vector3,PerspectiveCamera} from 'three';
import {createWorld} from '../index';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createVehicle,emptyInput,stepVehicle as prepareVehicle,type Input} from './simulation';
import {EnvironmentQueries,initEnvironmentQueries,vehicleBody} from './environment/queries';
import {createAtvState,sampleAtvVisual,ATV_GEOMETRY} from './motion-families/ground-vehicle/atv';
import {Character} from './character';
import {JETSKI_SPEC,JETSKI_SOCKETS} from '../../../../shared/preset-content/jetski';
import {buildJetSkiModel} from '../../../../shared/preset-content/jetski-model';
import {createJetSkiState,copyJetSkiState} from './motion-families/surface-vessel/jetski';
import {sampleJetSkiVisual,disposeJetSkiVisual} from './jetski-visual';
beforeAll(initEnvironmentQueries);
function fixture(water=true,wall=false){
 const q=new EnvironmentQueries({id:'jetski-test',name:'Jet ski',description:'',bounds:{min:[-2000,-100,-2000],max:[2000,100,2000]},
 boxes:[{id:'ground',position:[0,water?-21:-1,0],size:[4000,2,4000]},...(wall?[{id:'wall',position:[0,0,20] as const,size:[100,40,.2] as const}]:[])],
 water:water?[{id:'water',min:[-1900,-20,-1900],max:[1900,0,1900],surface:0}]:[],regions:[],spawns:[],playerSpawn:[-20,0,0]});
 const v=createVehicle({...JETSKI_SPEC,spawn:[0,water?.03:.34,0]});let tick=0;
 const run=(seconds:number,input:Partial<Input>={})=>{for(let n=0;n<Math.round(seconds*60);n++)stepVehicle(v,{...emptyInput(),...input},1/60,++tick/60,q);};return {q,v,run};
}
it('floats, drives, boosts, brakes before reverse, steers under thrust and fades its wake at rest',()=>{
 const {q,v,run}=fixture();try{
 run(2,{steer:1});expect(v.yaw).toBeCloseTo(0,4);expect(Math.abs(v.position.y)).toBeLessThan(.1);expect(v.motion.jetski!.particles).toHaveLength(0);
 run(5,{forward:1});expect(v.speed).toBeGreaterThan(22);const speed=v.speed;expect(v.motion.jetski!.particles.length).toBeGreaterThan(50);
 run(2,{forward:1,boost:true});expect(v.speed).toBeGreaterThan(speed+4);expect(Math.abs(v.position.y)).toBeLessThan(.25);
 run(.3,{forward:-1});expect(v.velocity.z).toBeGreaterThan(0);run(5,{forward:-1});expect(v.velocity.z).toBeLessThan(-4);
 run(1,{brake:true});expect(v.speed).toBeLessThan(.01);run(2.2);expect(v.motion.jetski!.particles).toHaveLength(0);
 run(3,{forward:1,steer:1});expect(Math.abs(v.yaw)).toBeGreaterThan(.4);expect(Math.abs(v.roll)).toBeGreaterThan(.04);
 const yaw=v.yaw;run(1,{forward:1,steer:-1});expect(v.yaw).toBeGreaterThan(yaw);expect(v.motion.jetski!.particles.some(p=>p.foam)).toBe(true);
 }finally{q.dispose();}
});
it('has no jet thrust on dry land or in air and sweeps against a solid pier',()=>{
 const dry=fixture(false);try{dry.run(2,{forward:1,steer:1,boost:true});expect(Math.hypot(dry.v.position.x,dry.v.position.z)).toBeLessThan(.01);expect(dry.v.motion.jetski!.particles).toHaveLength(0);expect(dry.v.grounded).toBe(true);}finally{dry.q.dispose();}
 const {q,v,run}=fixture(true,true);try{run(6,{forward:1,boost:true});expect(v.position.z).toBeLessThan(18.5);expect(q.overlaps(v.position,vehicleBody(v.spec),v.rotation)).toBe(false);run(2.2,{forward:1});expect(v.motion.jetski!.particles).toHaveLength(0);
 v.position.set(0,20,0);v.velocity.set(0,0,0);v.grounded=false;const yaw=v.yaw;run(.5,{forward:1,steer:1});expect(v.yaw).toBeCloseTo(yaw,3);expect(Math.hypot(v.position.x,v.position.z)).toBeLessThan(.001);expect(v.position.y).toBeLessThan(20);
 }finally{q.dispose();}
});
it('keeps emitted water in world coordinates and render sampling pure, including reset',()=>{
 const {q,v,run}=fixture();try{run(4,{forward:1});const model=buildJetSkiModel(),state=copyJetSkiState(v.motion.jetski)!;const before=JSON.stringify(state);
 model.position.copy(v.position);model.quaternion.copy(v.rotation);sampleJetSkiVisual(model,state,4);const drops=model.getObjectByName('jetski.drops') as any;expect(drops.count).toBeGreaterThan(0);
 const matrix=Array.from(drops.instanceMatrix.array);sampleJetSkiVisual(model,state,4);expect(Array.from(drops.instanceMatrix.array)).toEqual(matrix);expect(JSON.stringify(state)).toBe(before);
 model.position.x+=30;sampleJetSkiVisual(model,state,4);model.updateMatrixWorld(true);expect(model.getObjectByName('jetski.water-fx')!.getWorldPosition(new Vector3()).length()).toBeLessThan(.0001);
 sampleJetSkiVisual(model,createJetSkiState(),4);expect(drops.count).toBe(0);expect((model.getObjectByName('jetski.foam') as any).count).toBe(0);disposeJetSkiVisual(model);expect(model.getObjectByName('jetski.water-fx')).toBeUndefined();
 }finally{q.dispose();}
});
it('floats unoccupied, pushes another craft through native contact, preserves pause and resets',async()=>{
 const f=fixture(),object=buildJetSkiModel();
 const world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map:{...f.q.map,regions:[{id:'water',name:'Water',description:'',center:[0,0,0],size:[300,300],color:'#ccc',modes:['character','boat']}],spawns:[{id:'a',name:'Driver',vehicleId:'driver',position:[0,.03,0],yaw:0,regionId:'water'},{id:'b',name:'Parked',vehicleId:'parked',position:[0,.03,8],yaw:0,regionId:'water'}]},vehicles:[{instanceId:'driver',assetId:'vehicle.jetski',spec:JETSKI_SPEC,object},{instanceId:'parked',assetId:'vehicle.jetski',spec:JETSKI_SPEC,object:buildJetSkiModel()}],character:{instanceId:'person',object:new Group()}}});
 try{
  world.step({},120);const parked=world.humanoid!.simulation.vehicles[1]!;expect(Math.abs(parked.position.y)).toBeLessThan(.1);expect(parked.motion.jetski!.particles).toHaveLength(0);
  world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'driver',mounted:true}});
  world.step({humanoid:{...emptyInput(),forward:1}},360);const v=world.humanoid!.simulation.controlledActor.vehicle!;expect(parked.position.z).toBeGreaterThan(8);expect(parked.position.z-v.position.z).toBeGreaterThan(2.8);expect(v.motion.jetski!.sprayStrength).toBeGreaterThan(0);
  const state=JSON.stringify(v.motion.jetski);world.step({},0);expect(JSON.stringify(v.motion.jetski)).toBe(state);
  await world.reset();expect(world.humanoid!.snapshot().mountedInstanceId).toBeNull();expect(world.humanoid!.simulation.vehicles.every(v=>!v.motion.jetski!.particles.length)).toBe(true);
 }finally{world.dispose();f.q.dispose();}
});
it('keeps the original straddle rider clear of body panels and hands on the turning handlebar without scaling',async()=>{
 const transport=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{const b=await readFile(fileURLToPath(url));return parseFixtureGlb(b);});
 const fetchTransport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
 const rider=new Character(),model=buildJetSkiModel();
 try{
  await rider.load(p=>new URL(`../../../../assets/three-creator/presets/${p}`,import.meta.url).href);
  const identities=new Map<SkinnedMesh,unknown>();rider.root.traverse(n=>{if(n instanceof SkinnedMesh)identities.set(n,n.geometry);});
  const samples=[];
  for(const angle of [0,-.42,.42,0]){
   rider.root.position.set(...JETSKI_SPEC.seat);
   rider.update(0,{position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:0,vertical:0,grounded:true,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',animationEvent:null,surface:null,skills:null,mounted:'atv',atvSteeringAngle:angle});
   // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse, as the renderer does.
   rider.root.updateMatrixWorld(true);model.updateMatrixWorld(true);
   const bounds=new Box3(),p=new Vector3(),localPoint=new Vector3();
   const wallMeshes:Mesh[]=[];model.traverse(n=>{if(n instanceof Mesh&&/^body\./.test(n.name)&&n.name!=='body.hull'){n.geometry.computeBoundingBox();wallMeshes.push(n);}});
   const walls=wallMeshes.map(wall=>({name:wall.name,inverse:wall.matrixWorld.clone().invert(),bounds:wall.geometry.boundingBox!.clone().expandByScalar(-.001)}));
   const intersections=new Set<string>();
   for(const [mesh,geometry] of identities){expect(mesh.geometry).toBe(geometry);expect(mesh.visible).toBe(true);mesh.skeleton.update();
    for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){
     mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(p);if(Math.abs(p.x)<.68&&p.z<.45)expect(p.y).toBeGreaterThan(.24);
     for(const wall of walls)if(wall.bounds.containsPoint(localPoint.copy(p).applyMatrix4(wall.inverse)))intersections.add(wall.name);
    }
   }
   expect([...intersections]).toEqual([]);
   expect(bounds.min.y).toBeGreaterThan(.24);expect(bounds.max.y).toBeLessThan(1.85);
   // Foot sockets retain their physical calibration; the thicker UEFN shoe raises its ball bone 35 mm.
   for(const [bone,socket] of [['hand_l','control.hand.left'],['hand_r','control.hand.right'],['ball_l','control.foot.left'],['ball_r','control.foot.right']] as const){
    const point=rider.root.getObjectByName(bone)!.getWorldPosition(new Vector3());const target=socket.startsWith('control.hand')?new Vector3(...ATV_GEOMETRY.grips[bone==='hand_l'?0:1]!).applyAxisAngle(new Vector3(0,1,0),angle).add(new Vector3(...ATV_GEOMETRY.handlebar)):new Vector3(...JETSKI_SOCKETS[socket as keyof typeof JETSKI_SOCKETS]).add(new Vector3(0,.035,0));expect(point.distanceTo(target)).toBeLessThan(.002);
   }
   expect(rider.root.scale.toArray()).toEqual([1,1,1]);samples.push({angle,min:bounds.min.toArray(),max:bounds.max.toArray()});
  }
  console.log('JETSKI_RIDER_CLEARANCE',JSON.stringify(samples));
 }finally{rider.dispose();transport.mockRestore();fetchTransport.mockRestore();}
},15_000);

function stepVehicle(...args:Parameters<typeof prepareVehicle>){prepareVehicle(...args);if(args[0].motion.wheelPhysics||args[0].motion.body)args[4].stepPhysics(args[2]);}
