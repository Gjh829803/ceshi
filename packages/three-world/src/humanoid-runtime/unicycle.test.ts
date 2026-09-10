import {beforeAll,expect,it,vi} from 'vitest';
import {Group,PerspectiveCamera,Vector3,SkinnedMesh,Box3} from 'three';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createWorld} from '../index';
import {Character} from './character';
import {createVehicle,emptyInput,stepVehicle,type Input} from './simulation';
import {EnvironmentQueries,initEnvironmentQueries,vehicleBody} from './environment/queries';
import {createUnicycleState,unicyclePedal,sampleUnicycleVisual,copyUnicycleState} from './unicycle';
import {UNICYCLE_SPEC} from '../../../../shared/preset-content/unicycle';
import {buildUnicycleModel} from '../../../../shared/preset-content/unicycle-model';
beforeAll(initEnvironmentQueries);
function fixture(wall=false){
  const q=new EnvironmentQueries({id:'unicycle-test',name:'Unicycle',description:'',bounds:{min:[-100,-10,-100],max:[100,100,100]},
    boxes:[{id:'ground',position:[0,-1,0],size:[200,2,200]},...(wall?[{id:'wall',position:[0,3,8] as const,size:[80,6,.12] as const}]:[])],water:[],regions:[],spawns:[],playerSpawn:[-20,0,0]});
  const v=createVehicle({...UNICYCLE_SPEC,spawn:[0,.035,0]});let time=0;
  const run=(seconds:number,input:Partial<Input>={})=>{for(let n=0;n<Math.round(seconds*60);n++){time+=1/60;stepVehicle(v,{...emptyInput(),...input},1/60,time,q);}};
  return {q,v,run};
}
it('plants a foot, lifts before driving, pedals with travel and supports repeated stops without dismount',()=>{
  const {q,v,run}=fixture();try{
    run(1);expect(v.unicycle!.phase).toBe('supported');expect(v.unicycle!.supportLocal).not.toBeNull();
    const p=v.position.clone();run(.25,{forward:1});expect(v.unicycle!.phase).toBe('lifting');expect(v.position.distanceTo(p)).toBeLessThan(.01);
    expect(v.unicycle!.footDown).toBeGreaterThan(.4);run(.4,{forward:1});expect(v.speed).toBeGreaterThan(0);expect(v.unicycle!.footDown).toBe(0);
    const z=v.position.z,phase=v.unicycle!.wheelAngle;run(2,{forward:1});expect(v.unicycle!.wheelAngle-phase).toBeCloseTo((v.position.z-z)/.36,3);
    run(3);expect(v.unicycle!.phase).toBe('supported');expect(v.speed).toBeLessThan(.01);
    const parked=v.position.clone();run(.25,{forward:-1});expect(v.position.distanceTo(parked)).toBeLessThan(.01);run(2,{forward:-1});expect(v.velocity.z).toBeLessThan(-1);
    run(2,{brake:true});expect(v.unicycle!.phase).toBe('supported');
    const model=buildUnicycleModel(),state=copyUnicycleState(v.unicycle)!;sampleUnicycleVisual(model,state);sampleUnicycleVisual(model,state);expect(v.unicycle).toEqual(state);
    expect(model.getObjectByName('unicycle.pedal.1')!.position.distanceTo(unicyclePedal(state.wheelAngle,1))).toBeLessThan(1e-6);
  }finally{q.dispose();}
});
it('stops pedalling and plants at a wall, clears the blocked latch on release, and cannot power itself in air',()=>{
  const {q,v,run}=fixture(true);try{
    run(6,{forward:1});expect(v.position.z).toBeLessThan(7.7);expect(v.unicycle!.phase).toBe('supported');
    const angle=v.unicycle!.wheelAngle;run(1,{forward:1});expect(v.unicycle!.wheelAngle).toBe(angle);expect(q.overlaps(v.position,vehicleBody(v.spec),v.rotation)).toBe(false);
    run(.1);run(2,{forward:-1});expect(v.velocity.z).toBeLessThan(-1);
    v.position.set(0,10,0);v.velocity.set(0,0,0);v.grounded=false;const yaw=v.yaw;
    run(.7,{forward:1,steer:1});expect(v.unicycle!.phase).toBe('airborne');expect(v.unicycle!.supportLocal).toBeNull();expect(v.unicycle!.footDown).toBe(0);expect(v.yaw).toBe(yaw);expect(v.position.z).toBe(0);
  }finally{q.dispose();}
});
it('requires ground beside the wheel for foot support and follows real ramps',()=>{
  const f=fixture(),ledge=new EnvironmentQueries({...f.q.map,boxes:[{id:'ledge',position:[0,-1,0],size:[.45,2,20]}]});
  try{
    for(let n=0;n<60;n++)stepVehicle(f.v,emptyInput(),1/60,n/60,ledge);
    expect(f.v.grounded).toBe(true);expect(f.v.unicycle!.supportLocal).toBeNull();expect(f.v.unicycle!.footDown).toBe(0);
  }finally{ledge.dispose();f.q.dispose();}
  const g=fixture(),angle=Math.atan(.15),ramp=new EnvironmentQueries({...g.q.map,boxes:[...g.q.map.boxes,{id:'ramp',position:[0,1.5-.2*Math.cos(angle),15],size:[8,.4,20/Math.cos(angle)],rotation:[-angle,0,0]}]});
  try{
    let height=0,pitch=0;for(let n=0;n<360;n++){stepVehicle(g.v,{...emptyInput(),forward:1},1/60,n/60,ramp);height=Math.max(height,g.v.position.y);pitch=Math.max(pitch,g.v.pitch);}
    expect(height).toBeGreaterThan(1.5);expect(pitch).toBeGreaterThan(.07);
  }finally{ramp.dispose();g.q.dispose();}
});
it('retains the original skeleton and fits alternating pedals, ground support and the lift arc',async()=>{
  const transport=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{const b=await readFile(fileURLToPath(url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');});
  const fetchTransport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
  const rider=new Character();
  try{
    await rider.load(p=>new URL(`../../../../assets/three-creator/presets/${p}`,import.meta.url).href);
    const identities=new Map<SkinnedMesh,unknown>();rider.root.traverse(n=>{if(n instanceof SkinnedMesh)identities.set(n,n.geometry);});
    const frame={position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:0,vertical:0,grounded:true,animationGrounded:true,stance:'stand' as const,swimming:false,swimStyle:'freestyle' as const,animationEvent:null,surface:null,skills:null,mounted:'unicycle' as const};
    const hands:Vector3[]=[];
    const saddleBounds=new Box3().setFromObject(buildUnicycleModel().getObjectByName('seat-cushion')!);
    const saddleInterior=saddleBounds.clone().expandByScalar(-.002);
    for(const angle of Array.from({length:16},(_,i)=>i*Math.PI/8))for(const down of Array.from({length:11},(_,i)=>i/10)){
      const s={...createUnicycleState(),wheelAngle:angle,footDown:down,balanceTime:angle,supportLocal:[.30,.055,-.06] as [number,number,number]};
      rider.root.position.set(...UNICYCLE_SPEC.seat);rider.update(1/60,{...frame,unicyclePose:s});rider.root.updateMatrixWorld(true);
      for(const [suffix,side] of [['l',1],['r',-1]] as const){
        const target=unicyclePedal(angle,side);target.y+=.055;if(side===1){target.lerp(new Vector3(...s.supportLocal),down);target.y+=Math.sin(Math.PI*down)*.09;}
        const actual=rider.root.getObjectByName(`ball_${suffix}`)!.getWorldPosition(new Vector3());expect(actual.distanceTo(target),JSON.stringify({angle,down,side,actual,target})).toBeLessThan(.015);
      }
      const bounds=new Box3(),point=new Vector3();let legVertices=0,minClearance=Infinity,pelvisBottom=Infinity,saddleIntersections=0;
      for(const [mesh,geometry] of identities){
        expect(mesh.geometry).toBe(geometry);mesh.skeleton.update();
        const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
        for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){
          bounds.expandByPoint(mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld));
          if(saddleInterior.containsPoint(point))saddleIntersections++;
          for(let j=0;j<4;j++)if(mesh.skeleton.bones[indices.getComponent(i,j)]!.name==='pelvis'&&weights.getComponent(i,j)>.5){
            pelvisBottom=Math.min(pelvisBottom,point.y);
            expect(saddleBounds.containsPoint(point),`pelvis intersects saddle: pedal=${angle}, support=${down}`).toBe(false);
          }
          let rightLegWeight=0;
          for(let j=0;j<4;j++)if(/^(thigh|calf)_r$/.test(mesh.skeleton.bones[indices.getComponent(i,j)]!.name))rightLegWeight+=weights.getComponent(i,j);
          if(rightLegWeight<.5)continue;
          legVertices++;
          const tyre=Math.hypot(point.x,Math.hypot(point.y-.36,point.z)-.29)-.07;
          const fork=Math.hypot(point.x+.12,point.y-Math.max(.36,Math.min(.76,point.y)),point.z)-.022;
          minClearance=Math.min(minClearance,tyre,fork);
        }
      }
      expect(legVertices).toBeGreaterThan(0);
      expect(saddleIntersections,`body intersects saddle: pedal=${angle}, support=${down}`).toBe(0);
      if(down===0){expect(pelvisBottom).toBeGreaterThan(saddleBounds.max.y);expect(pelvisBottom-saddleBounds.max.y).toBeLessThan(.01);}
      expect(minClearance,`right leg clearance: pedal=${angle}, support=${down}`).toBeGreaterThan(0);
      expect(bounds.min.y).toBeGreaterThan(-.025);expect(rider.root.scale.toArray()).toEqual([1,1,1]);
      hands.push(rider.root.getObjectByName('hand_l')!.getWorldPosition(new Vector3()));
    }
    expect(hands[0]!.distanceTo(hands[6]!)).toBeGreaterThan(.03);
    rider.update(1/60,{...frame,mounted:null});expect(rider.actor.position.toArray()).toEqual([0,0,0]);
  }finally{rider.dispose();transport.mockRestore();fetchTransport.mockRestore();}
},15000);
it('uses Episode starts and common collision ownership, snapshots and reset with a parked vehicle',async()=>{
  const f=fixture(),map={...f.q.map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0] as const,size:[180,180] as const,color:'#ccc',modes:['character','bike'] as ('character'|'bike')[]}],spawns:[{id:'a',name:'A',vehicleId:'driver',position:[0,.035,0] as const,yaw:0,regionId:'road'},{id:'b',name:'B',vehicleId:'parked',position:[0,.035,4] as const,yaw:0,regionId:'road'}]};
  const world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map,vehicles:['driver','parked'].map(instanceId=>({instanceId,assetId:'vehicle.unicycle',spec:UNICYCLE_SPEC,object:buildUnicycleModel()})),character:{instanceId:'person',object:new Group()}}});
  try{
    world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,.035,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'driver',mounted:true}});
    world.step({humanoid:{...emptyInput(),forward:1}},360);const v=world.humanoid!.simulation.vehicle!,angle=v.unicycle!.wheelAngle;
    world.step({humanoid:{...emptyInput(),forward:1}},60);expect(v.unicycle!.wheelAngle).toBe(angle);expect(v.unicycle!.phase).toBe('supported');expect(world.snapshot().humanoid!.mountedInstanceId).toBe('driver');
    const snapshot=world.humanoid!.snapshot();snapshot.vehicleDynamics[0]!.unicycle!.supportLocal![0]=999;expect(v.unicycle!.supportLocal![0]).not.toBe(999);
    world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,.035,-20],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'driver',mounted:true,velocityWorldMetersPerSecondXYZ:[0,0,2]}});
    expect(world.humanoid!.simulation.vehicle!.unicycle!.footDown).toBe(0);
    world.step({humanoid:{...emptyInput(),forward:1}},1);expect(world.humanoid!.simulation.vehicle!.speed).toBeGreaterThan(2);
    await world.reset();expect(world.humanoid!.simulation.vehicles[0]!.unicycle).toEqual(createUnicycleState());expect(world.snapshot().humanoid!.mountedInstanceId).toBeNull();
  }finally{world.dispose();f.q.dispose();}
});
