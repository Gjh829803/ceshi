import {createHumanoidCameraDocument} from '../config/camera/index';
import {requestDragonLanding} from './motion-families/flying-creature/ground';
import {dragonStandingPoint} from './motion-families/flying-creature/mount';
import {actionForKey,createKeyBindings} from './input';
import RAPIER from '@dimforge/rapier3d-compat';
import {beforeAll,expect,it} from 'vitest';
import {DRAGON_VARIANTS} from '@worldkit/preset-content/dragon-variants';
import {Group,PerspectiveCamera,Vector3} from 'three';
import {createWorld} from '../world';
import {EnvironmentQueries,initEnvironmentQueries} from './environment/queries';
import {Simulation,createVehicle,emptyInput,stepVehicle,type Input} from './simulation';
import {createFlyingCreatureSpec} from './motion-families/flying-creature/controller';
import {creatureBodies} from './creatures/controller';
import {CREATURE_SPECS} from '@worldkit/preset-content/creatures/specs';
import {createDragonTrainingMap} from '@worldkit/preset-content/environment/dragon-training';
beforeAll(initEnvironmentQueries);

it('routes H and remapped summon keys through the shared unmounted action channel',()=>{
  expect(actionForKey('KeyH',false)).toEqual({kind:'humanoid',input:{summonDragon:true}});
  expect(actionForKey('KeyH',true)).toBeUndefined();
  expect(actionForKey('KeyJ',false,new Set(),createKeyBindings({summonDragon:['KeyJ']}))).toEqual({kind:'humanoid',input:{summonDragon:true}});
});

it('stops a summoned dragon before a new wall and rejects wet landing candidates',async()=>{
  const map=createDragonTrainingMap();
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,
    vehicles:[{instanceId:'dragon',assetId:'creature.dragon.d01',spec:createFlyingCreatureSpec('dragon'),object:new Group()}],character:{instanceId:'person',object:new Group()}}});
  try{
    const r=world.humanoid!,s=r.simulation,v=s.vehicles[0]!;world.step({},4);
    expect(world.snapshot().humanoid?.vehicles[0]?.assetId).toBe('creature.dragon.d01');
    expect(r.summonDragon('dragon'),s.controlledActor.message).toBe(true);
    const wall=s.controlledActor.controller.world.createCollider(RAPIER.ColliderDesc.cuboid(.2,200,200).setTranslation(-15,180,0));
    world.step({},1200);
    expect(v.motion.flyingCreature!.summon!.phase).toBe('blocked');expect(v.position.x).toBeGreaterThan(-15);expect(v.speed).toBe(0);
    s.controlledActor.controller.world.removeCollider(wall,true);
    const p=s.controlledActor.player.position.clone();s.environment.map.water=[{id:'wet',min:[p.x-100,-3,p.z-100],max:[p.x+100,3,p.z+100],surface:2}];
    expect(r.summonDragon('dragon')).toBe(false);expect(s.controlledActor.message).toContain('降落空间');
    expect(s.controlledActor.player.position.distanceTo(p)).toBe(0);
  }finally{world.dispose();}
},15000);

// Exercise the shared lifecycle on the baseline and the D07 repeat-summon regression.
// Every variant still runs collision/support checks below and real rig, boarding,
// dismount and camera checks in flying-creature-visual.test.ts.
it.each(['D01','D07'])('summons %s from the sky, then boards, takes off and walks after dismount',async id=>{
  const variant=DRAGON_VARIANTS.find(variant=>variant.id===id)!;
  const map=createDragonTrainingMap();
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,
    vehicles:[{instanceId:'dragon',assetId:`creature.dragon.${variant.id.toLowerCase()}`,spec:{...createFlyingCreatureSpec('dragon'),flyingCreatureGround:variant.ground!,flyingCreatureCollision:variant.collisionProbes!},object:new Group()}],character:{instanceId:'person',object:new Group()}}});
  try{
    const r=world.humanoid!,s=r.simulation,v=s.vehicles[0]!;world.step({},4);
    const human=s.controlledActor.player.position.clone(),origin=v.position.clone();
    world.step({humanoid:{...emptyInput(),actions:{summonDragon:true}}},1);
    expect(v.motion.flyingCreature!.summon,s.controlledActor.message).toBeDefined();
    expect(s.controlledActor.player.position.distanceTo(human)).toBeLessThan(.05);expect(v.position.distanceTo(origin)).toBeLessThan(.1);
    for(let i=0;i<2400&&v.motion.flyingCreature!.summon!.phase!=='arrived';i++)world.step({},1);
    expect(v.motion.flyingCreature!.summon!.phase,JSON.stringify(v.motion.flyingCreature)).toBe('arrived');
    expect(s.controlledActor.player.position.distanceTo(human)).toBeLessThan(.1);expect(s.controlledActor.vehicleIndex).toBe(-1);
    const entry=s.controlledActor.inspectBoarding('dragon').approachPositionWorldMetersXYZ;expect(entry).not.toBeNull();
    // Initialize the next interaction at the validated approach; flight above used no relocation.
    expect(r.prepareCharacter(entry!,v.yaw)).toBe(true);world.step({},5);
    expect(r.enter('dragon'),s.controlledActor.message).toBe(true);world.step({},600);expect(s.controlledActor.dragonTransition).toBeUndefined();
    world.step({humanoid:{...emptyInput(),jump:true}},1);world.step({},180);expect(v.motion.flyingCreature!.groundPhase).toBe('airborne');
    expect(r.exit()).toBe(true);world.step({},600);expect(v.grounded).toBe(true);
    expect(r.exit(),s.controlledActor.message).toBe(true);world.step({},600);expect(s.controlledActor.vehicleIndex).toBe(-1);
    const p=s.controlledActor.player.position.clone();world.step({humanoid:{...emptyInput(),steer:-1}},120);
    expect(s.controlledActor.player.position.distanceTo(p),variant.id+' down then walk').toBeGreaterThan(1);
    if(variant.id==='D07'){
      expect(r.summonDragon('dragon'),s.controlledActor.message).toBe(true);
      const snapshot=r.snapshot().vehicleDynamics[0]!.flyingCreature!.summon!;
      snapshot.waypoints[0]![0]=700;
      expect(v.motion.flyingCreature!.summon!.waypoints[0]![0]).not.toBe(700);
      expect(r.summonDragon('dragon')).toBe(false);
      for(let i=0;i<2400&&v.motion.flyingCreature!.summon!.phase!=='arrived';i++)world.step({},1);
      expect(v.motion.flyingCreature!.summon!.phase,JSON.stringify(v.motion.flyingCreature)).toBe('arrived');
    }
  }finally{world.dispose();}
},30000);

it('walks away after a rotated D07 dismount with live collision bodies',async()=>{
  const variant=DRAGON_VARIANTS.find(v=>v.id==='D07')!,map=createDragonTrainingMap();
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,
    vehicles:[{instanceId:'dragon',assetId:`creature.dragon.${variant.id.toLowerCase()}`,spec:{...createFlyingCreatureSpec('dragon'),flyingCreatureGround:variant.ground!,flyingCreatureCollision:variant.collisionProbes!},object:new Group()}],character:{instanceId:'person',object:new Group()}}});
  try{
    const r=world.humanoid!,s=r.simulation;
    r.prepareEpisodeStart({positionWorldMetersXYZ:[170,22,-10],facingYawRadians:.9-Math.PI,humanoid:{vehicleInstanceId:'dragon',mounted:true}});
    expect(r.exit()).toBe(true);world.step({},900);expect(s.controlledActor.vehicle!.grounded).toBe(true);
    expect(r.exit(),s.controlledActor.message).toBe(true);world.step({},600);expect(s.controlledActor.vehicle).toBeUndefined();
    const p=s.controlledActor.player.position.clone();world.step({humanoid:{...emptyInput(),forward:1}},120);
    expect(s.controlledActor.player.position.distanceTo(p),JSON.stringify({p:p.toArray(),end:s.controlledActor.player.position.toArray(),collisions:s.controlledActor.controller.collisions,mounted:s.controlledActor.controller.isMounted,velocity:s.controlledActor.controller.velocity.toArray()})).toBeGreaterThan(2);
    s.controlledActor.controller.commitDismount(new Vector3(173.43797302246094,.01304790735244743,-10.487921714782717),.9,new Vector3());
    const exact=s.controlledActor.controller.position.clone();world.step({humanoid:{...emptyInput(),forward:1}},120);
    expect(s.controlledActor.controller.position.distanceTo(exact),'reported D07 floor contact').toBeGreaterThan(2);
  }finally{world.dispose();}
},30000);

it.each(['water','narrow','missing','slope'])('rejects a %s landing site before descending',kind=>{
  const map=createDragonTrainingMap();map.boxes=[{id:'floor',position:[0,-.5,0],size:[300,1,300]}];
  if(kind==='water')map.water=[{id:'water',min:[-200,-2,-200],max:[200,4,200],surface:4}];
  if(kind==='narrow')map.boxes=[{id:'platform',position:[0,5,0],size:[1,1,1]}];
  if(kind==='missing')map.boxes=[];
  if(kind==='slope')map.boxes=[{id:'slope',position:[0,-5,0],size:[100,1,100],rotation:[0,0,Math.PI/3]}];
  const q=new EnvironmentQueries(map),v=createVehicle(createFlyingCreatureSpec());v.position.set(0,22,0);q.stepPhysics(1/60);
  try{expect(requestDragonLanding(v,q)).toBe(false);expect(v.motion.flyingCreature!.groundPhase).toBe('airborne');expect(v.position.y).toBe(22);}finally{q.dispose();}
});

it('rejects invalid ground configurations and isolates per-instance tuning',()=>{
  const spec={...createFlyingCreatureSpec(),flyingCreatureGround:DRAGON_VARIANTS[0]!.ground!};
  for(const patch of [{takeoffSeconds:0},{rootHeight:NaN},{support:[1,-1,0,2] as [number,number,number,number]},{probes:[]}])
    expect(()=>createVehicle({...spec,flyingCreatureGround:{...spec.flyingCreatureGround,...patch}})).toThrow('FLYING_CREATURE_GROUND_INVALID');
  const a=createVehicle(spec),b=createVehicle(spec);a.spec.flyingCreatureGround!.seat[1]+=1;
  expect(b.spec.flyingCreatureGround!.seat).toEqual(spec.flyingCreatureGround.seat);
});

it('rejects blocked exits and switches dragon mounting immediately when a safe point is available',async()=>{
  const map=createDragonTrainingMap();map.boxes=[{id:'floor',position:[0,-.5,0],size:[300,1,300]}];
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,
    vehicles:[{instanceId:'dragon',assetId:'creature.dragon.d01',spec:createFlyingCreatureSpec('dragon'),object:new Group()}],character:{instanceId:'person',object:new Group()}}});
  try{
    const r=world.humanoid!,s=r.simulation;
    const start={positionWorldMetersXYZ:[0,22,0] as [number,number,number],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'dragon',mounted:true}};
    r.prepareEpisodeStart(start);expect(r.exit()).toBe(true);world.step({},800);expect(s.controlledActor.vehicle!.grounded).toBe(true);
    // The preflight overlap must reject a roof without changing the grounded pose.
    const h=s.controlledActor.controller,roof=h.world.createCollider(RAPIER.ColliderDesc.cuboid(30,1,30).setTranslation(0,s.controlledActor.vehicle!.position.y+8,0));
    world.step({},1);world.step({humanoid:{...emptyInput(),jump:true}},1);
    expect(s.controlledActor.vehicle!.motion.flyingCreature!.groundPhase).toBe('grounded');expect(s.controlledActor.vehicle!.motion.flyingCreature!.groundFailure).toContain('上方');
    h.world.removeCollider(roof,true);world.step({},1);
    const context={environment:s.environment,humanoid:h,vehicles:s.vehicles,available:()=>true,transitionSeconds:0,mountedInstanceId:'dragon'};
    const obstacles=[-1,1].map(side=>{
      const p=dragonStandingPoint(context,s.controlledActor.vehicle!,side)!;expect(p).not.toBeNull();
      return h.world.createCollider(RAPIER.ColliderDesc.cuboid(.55,1,.55).setTranslation(p.x,p.y+1,p.z));
    });
    world.step({},1);
    expect(r.exit()).toBe(false);expect(s.controlledActor.vehicleIndex).toBe(0);expect(h.capsule.isEnabled()).toBe(false);
    expect(s.controlledActor.dragonTransition).toBeUndefined();expect(s.controlledActor.transition).toBe(0);
    for(const obstacle of obstacles)h.world.removeCollider(obstacle,true);world.step({},1);
    expect(r.exit(),s.controlledActor.message).toBe(true);
    expect(s.controlledActor.vehicleIndex).toBe(-1);expect(h.capsule.isEnabled()).toBe(true);
    expect(s.controlledActor.dragonTransition).toBeUndefined();expect(s.controlledActor.transition).toBe(0);
    expect(s.controlledActor.player.animation).not.toBe('Sitting_Exit');
    world.step({},20);
    expect(r.enter('dragon'),s.controlledActor.message).toBe(true);
    expect(s.controlledActor.vehicleIndex).toBe(0);expect(h.capsule.isEnabled()).toBe(false);
    expect(s.controlledActor.dragonTransition).toBeUndefined();expect(s.controlledActor.transition).toBe(0);
    expect(s.controlledActor.player.animation).toBe('Driving_Loop');
    r.prepareEpisodeStart(start);expect(s.controlledActor.dragonTransition).toBeUndefined();expect(s.controlledActor.transition).toBe(0);expect(s.controlledActor.vehicle!.motion.flyingCreature!.groundPhase).toBe('airborne');
  }finally{world.dispose();}
});
function fixture(wall=false){
  const map=createDragonTrainingMap();map.boxes=wall?[{id:'wall',position:[0,80,50],size:[200,160,.2]}]:[];
  const q=new EnvironmentQueries(map),v=createVehicle(createFlyingCreatureSpec());v.position.y=80;
  q.stepPhysics(1/60);
  const step=(input:Partial<Input>,count:number)=>{for(let n=0;n<count;n++){stepVehicle(v,{...emptyInput(),...input},1/60,n/60,q);q.stepPhysics(1/60);}};
  return {q,v,step};
}
it('turns A left and D right in the +Z camera convention',()=>{
  for(const steer of [-1,1]){const {q,v,step}=fixture();try{step({steer},60);expect(v.position.x*steer).toBeLessThan(-.5);expect(v.roll*steer).toBeGreaterThan(.5);}finally{q.dispose();}}
});
it('releases WASD to a true zero-velocity hover, including after Ctrl release',()=>{
  const {q,v,step}=fixture();try{
    step({boost:true},180);expect(v.speed).toBeGreaterThan(20);step({},600);expect(v.velocity.toArray()).toEqual([0,0,0]);
    const hover=v.position.clone();step({primary:true},120);expect(v.position.distanceTo(hover)).toBe(0);expect(v.motion.flyingCreature!.flamePhase).toBe('loop');
    step({boost:true},120);step({slow:true},240);step({},120);expect(v.speed).toBe(0);expect(v.motion.flyingCreature!.mode).toBe('hover');
  }finally{q.dispose();}
});
it('sweeps the head and torso through a thin wall at maximum speed',()=>{
  const {q,v,step}=fixture(true);try{
    v.velocity.set(0,0,44);v.motion.flyingCreature!.speedMetersPerSecond=44;step({boost:true},180);
    expect(v.position.z).toBeLessThan(49.9-Math.max(...DRAGON_VARIANTS[0]!.collisionProbes!.map(p=>p.center[2]+p.radius))+.02);expect(v.motion.flyingCreature!.collisionCount).toBeGreaterThan(0);
    for(const part of creatureBodies(v))expect(q.overlaps(part.position,part.body,part.rotation)).toBe(false);
    step({},300);expect(v.speed).toBe(0);
    const contact=v.position.clone();step({steer:1},360);expect(v.position.distanceTo(contact)).toBeGreaterThan(3);
  }finally{q.dispose();}
});
it('excludes its own collision proxies and blocks another actor',()=>{
  const {q,v,step}=fixture();try{
    q.syncActorBodies(creatureBodies(v).map((part,n)=>({id:'self:'+n,actorId:v.spec.id,...part})));
    q.stepPhysics(1/60);step({boost:true},30);expect(v.position.z).toBeGreaterThan(.1);
    q.syncActorBodies([{id:'other',actorId:'plane',position:new Vector3(0,80,40),rotation:v.rotation.clone(),body:{kind:'box',halfExtents:[50,30,.2],offset:[0,0,0]}}]);
    q.stepPhysics(1/60);step({boost:true},180);expect(v.position.z).toBeLessThan(39.8-Math.max(...DRAGON_VARIANTS[0]!.collisionProbes!.map(p=>p.center[2]+p.radius))+.02);
  }finally{q.dispose();}
});
it('keeps independent stamina/action state and resets to hover',()=>{
  const {q,v,step}=fixture();try{
    const other=createVehicle(createFlyingCreatureSpec('bird'));step({boost:true,primary:true,secondary:true},60);
    expect(other.motion.flyingCreature!.staminaRatio).toBe(1);expect(other.motion.flyingCreature!.evadeCount).toBe(0);
    const reset=createVehicle(v.spec);expect(reset.motion.flyingCreature!.flamePhase).toBe('off');expect(reset.velocity.length()).toBe(0);expect(reset.motion.flyingCreature!.collisionCount).toBe(0);
  }finally{q.dispose();}
});
it('runs dedicated actions, camera switching and map reset through the public SDK owner',async()=>{
  const spec=createFlyingCreatureSpec('dragon'),map=createDragonTrainingMap(),world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,vehicles:[{instanceId:'dragon',assetId:'creature.dragon.d01',spec,object:new Group()}],character:{instanceId:'person',object:new Group()}}});
  try{
    world.setCameraFollow({configuration:{...createHumanoidCameraDocument('person'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});const runtime=world.humanoid!;runtime.prepareEpisodeStart({positionWorldMetersXYZ:[0,40,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'dragon',mounted:true}});
    const descriptors=JSON.stringify(runtime.commandDescriptors('person'));
    expect(descriptors).toContain('松键减速度');expect(descriptors).toContain('振翅加速度');
    const originalSpeed=runtime.simulation.controlledActor.vehicle!.spec.speed;
    expect(()=>runtime.applyProfile({vehicles:{dragon:{speed:40,maxSpeed:20}}})).toThrow('CREATURE_FEEL_SPEED_ORDER_INVALID');
    expect(runtime.simulation.controlledActor.vehicle!.spec.speed).toBe(originalSpeed);
    const release=runtime.setInput({...emptyInput(),primary:true});world.step({},60);release();
    expect(runtime.simulation.controlledActor.vehicle!.motion.flyingCreature!.flamePhase).toBe('loop');expect(runtime.simulation.controlledActor.vehicle!.speed).toBe(0);
    world.setCameraFollow({configuration:{...world.inspectCamera().document!,input:{cycleViewIds:['third-person','first-person','shoulder']}}});world.step({cameraTogglePressed:true},1);expect(world.inspectCamera().resolved?.kind).toBe('first-person');
    const snapshot=structuredClone(runtime.simulation.controlledActor.vehicle!.motion.flyingCreature);world.snapshot();world.snapshot();expect(runtime.simulation.controlledActor.vehicle!.motion.flyingCreature).toEqual(snapshot);
    runtime.switchMap(map);expect(runtime.simulation.vehicles[0]!.motion.flyingCreature!.flamePhase).toBe('off');expect(runtime.simulation.vehicles[0]!.speed).toBe(0);expect(runtime.simulation.controlledActor.vehicleIndex).toBe(-1);
  }finally{world.dispose();}
});

it.each(DRAGON_VARIANTS.slice(1).map(v=>v.id))('%s uses instance collision geometry for thin-wall sweeps and stationary hover',id=>{
  const variant=DRAGON_VARIANTS.find(v=>v.id===id)!;
  const map=createDragonTrainingMap();map.boxes=[{id:'thin-wall',position:[0,100,100],size:[300,200,.2]}];
  const q=new EnvironmentQueries(map),v=createVehicle({...createFlyingCreatureSpec(id),flyingCreatureCollision:variant.collisionProbes!});v.position.set(0,100,0);q.stepPhysics(1/60);
  try{
    for(let n=0;n<600;n++){stepVehicle(v,{...emptyInput(),boost:n<300},1/60,n/60,q);q.stepPhysics(1/60);}
    expect(v.motion.flyingCreature!.collisionCount).toBeGreaterThan(0);expect(v.position.z).toBeLessThan(100);expect(v.speed).toBe(0);
    for(const part of creatureBodies(v))expect(q.overlaps(part.position,part.body,part.rotation)).toBe(false);
    const original=variant.collisionProbes![0]!.radius;
    (v.spec.flyingCreatureCollision![0]! as {radius:number}).radius+=1;
    expect(variant.collisionProbes![0]!.radius).toBe(original);
  }finally{q.dispose();}
});
it('rejects invalid per-instance creature collision geometry before creating physics bodies',()=>{
  const spec=createFlyingCreatureSpec();
  expect(()=>createVehicle({...spec,flyingCreatureCollision:[]})).toThrow('FLYING_CREATURE_COLLISION_INVALID');
  expect(()=>createVehicle({...spec,flyingCreatureCollision:[{id:'bad',center:[0,NaN,0],radius:1}]})).toThrow('FLYING_CREATURE_COLLISION_INVALID');
});

it.each(DRAGON_VARIANTS.map(v=>v.id))('%s flies through a torso-width corridor without wing or tail blockers',id=>{
  const variant=DRAGON_VARIANTS.find(v=>v.id===id)!,probes=variant.collisionProbes!;
  const width=Math.max(...probes.map(p=>Math.abs(p.center[0])+p.radius));
  expect(probes.length).toBeLessThanOrEqual(12);expect(width).toBeLessThan(4.5);
  const map=createDragonTrainingMap();map.boxes=[-1,1].map(side=>({id:'side'+side,position:[side*(width+.35+.5),100,40] as [number,number,number],size:[1,100,200] as [number,number,number]}));
  const q=new EnvironmentQueries(map),v=createVehicle({...createFlyingCreatureSpec(id),flyingCreatureCollision:probes});v.position.set(0,100,0);q.stepPhysics(1/60);
  try{
    for(let n=0;n<240;n++){stepVehicle(v,{...emptyInput(),boost:true},1/60,n/60,q);q.stepPhysics(1/60);}
    expect(v.position.z).toBeGreaterThan(60);expect(v.motion.flyingCreature!.collisionCount).toBe(0);
    for(const part of creatureBodies(v))expect(q.overlaps(part.position,part.body,part.rotation)).toBe(false);
  }finally{q.dispose();}
});

it.each(DRAGON_VARIANTS.map(v=>v.id))('%s lands on real dry support, remains parked, and takes off into hover',id=>{
  const variant=DRAGON_VARIANTS.find(v=>v.id===id)!,map=createDragonTrainingMap();map.boxes=map.boxes.filter(b=>b.id==='dragon-ground');
  const q=new EnvironmentQueries(map),v=createVehicle({...createFlyingCreatureSpec(id),flyingCreatureGround:variant.ground!,flyingCreatureCollision:variant.collisionProbes!});v.position.set(0,22,0);q.stepPhysics(1/60);
  const step=(input:Partial<Input>,frames:number)=>{for(let n=0;n<frames;n++){stepVehicle(v,{...emptyInput(),...input},1/60,n/60,q);q.stepPhysics(1/60);}};
  try{
    expect(requestDragonLanding(v,q)).toBe(true);step({},1200);
    expect(v.motion.flyingCreature!.groundPhase,JSON.stringify({position:v.position,state:v.motion.flyingCreature})).toBe('grounded');
    expect(v.grounded).toBe(true);expect(v.velocity.length()).toBe(0);
    const point=v.position.clone();step({forward:1},120);expect(v.position.distanceTo(point)).toBe(0);
    for(const part of creatureBodies(v))expect(q.overlaps(part.position,part.body,part.rotation)).toBe(false);
    step({jump:true},1);step({},300);expect(v.motion.flyingCreature!.groundPhase).toBe('airborne');expect(v.position.y).toBeGreaterThan(point.y+5);expect(v.grounded).toBe(false);
  }finally{q.dispose();}
},30000);

it('keeps the catalog grounded-flight mount walking, taking off and landing with its own envelope',()=>{
  const map=createDragonTrainingMap();map.boxes=map.boxes.filter(box=>box.id==='dragon-ground');
  const q=new EnvironmentQueries(map),v=createVehicle(CREATURE_SPECS.find(spec=>spec.mode==='dragon')!);
  v.position.set(0,.225,0);v.grounded=true;
  const step=(input:Partial<Input>,count:number)=>{for(let n=0;n<count;n++){stepVehicle(v,{...emptyInput(),...input},1/60,n/60,q);q.stepPhysics(1/60);}};
  try{
    expect(v.motion.flyingCreature).toBeUndefined();step({forward:1},120);
    expect(v.position.z).toBeGreaterThan(2);expect(v.grounded).toBe(true);expect(v.motion.creature!.gait).toBe('walk');
    step({lift:1},120);expect(v.position.y).toBeGreaterThan(8);expect(v.motion.creature!.flying).toBe(true);
    step({},120);expect(v.velocity.y).toBeCloseTo(0);step({lift:-1},240);
    expect(v.grounded).toBe(true);expect(v.motion.creature!.flying).toBe(false);expect(v.position.y).toBeLessThan(.3);
    const reset=createVehicle(v.spec);expect(reset.motion.creature!.gait).toBe('rest');expect(reset.motion.creature!.flying).toBe(false);
  }finally{q.dispose();}
});


it('keeps dragon summon, boarding and occupancy scoped to the requesting actor',()=>{
  const q=new EnvironmentQueries(createDragonTrainingMap()),sim=new Simulation(q,[createFlyingCreatureSpec('dragon')],{id:'player'});
  try{
    const player=sim.controlledActor,npc=sim.addActor('npc',player.player.position.clone().add(new Vector3(20,0,0)));
    for(let n=0;n<10;n++)sim.step(1/60);
    const playerPosition=player.player.position.clone();
    expect(sim.summonDragon('dragon','npc'),npc.message).toBe(true);
    const dragon=sim.vehicles[0]!,summon=structuredClone(dragon.motion.flyingCreature!.summon);
    expect(sim.summonDragon('dragon')).toBe(false);expect(dragon.motion.flyingCreature!.summon).toEqual(summon);
    for(let n=0;n<2400&&dragon.motion.flyingCreature!.summon!.phase!=='arrived';n++)sim.step(1/60);
    expect(dragon.motion.flyingCreature!.summon!.phase).toBe('arrived');
    const entry=npc.inspectBoarding('dragon').approachPositionWorldMetersXYZ;expect(entry).not.toBeNull();
    expect(npc.prepareCharacter(new Vector3(...entry!),dragon.yaw)).toBe(true);
    for(let n=0;n<5;n++)sim.step(1/60);
    expect(npc.enter('dragon'),npc.message).toBe(true);
    expect(npc.dragonTransition).toBeUndefined();expect(npc.transition).toBe(0);expect(player.dragonTransition).toBeUndefined();
    expect(player.vehicle).toBeUndefined();expect(npc.vehicle).toBe(dragon);
    expect(player.inspectBoarding('dragon')).toMatchObject({eligible:false,reason:'HUMANOID_TARGET_UNAVAILABLE'});
    expect(player.enter('dragon')).toBe(false);expect(sim.summonDragon('dragon')).toBe(false);
    for(let n=0;n<600;n++)sim.step(1/60);
    expect(npc.dragonTransition).toBeUndefined();expect(npc.vehicle).toBe(dragon);
    expect(sim.controlledActorId).toBe('player');expect(player.player.position.distanceTo(playerPosition)).toBeLessThan(.1);
    expect(player.controller.capsule.isEnabled()).toBe(true);expect(npc.controller.capsule.isEnabled()).toBe(false);
  }finally{sim.dispose();q.dispose();}
},30000);
