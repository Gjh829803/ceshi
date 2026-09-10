import {beforeAll,expect,it} from 'vitest';
import {Group,PerspectiveCamera,Vector3} from 'three';
import {createWorld} from '../world';
import {EnvironmentQueries,initEnvironmentQueries} from './environment/queries';
import {createVehicle,emptyInput,stepVehicle,type Input} from './simulation';
import {createFlyingCreatureSpec} from './motion-families/flying-creature/controller';
import {creatureBodies} from './creatures/controller';
import {createDragonTrainingMap} from '../../../../shared/preset-content/environment/dragon-training';
beforeAll(initEnvironmentQueries);
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
    const hover=v.position.clone();step({primary:true},120);expect(v.position.distanceTo(hover)).toBe(0);expect(v.flyingCreature!.flamePhase).toBe('loop');
    step({boost:true},120);step({slow:true},240);step({},120);expect(v.speed).toBe(0);expect(v.flyingCreature!.mode).toBe('hover');
  }finally{q.dispose();}
});
it('sweeps the full animation envelope through a thin wall at maximum speed',()=>{
  const {q,v,step}=fixture(true);try{
    v.velocity.set(0,0,44);v.flyingCreature!.speedMetersPerSecond=44;step({boost:true},180);
    expect(v.position.z).toBeLessThan(38);expect(v.flyingCreature!.collisionCount).toBeGreaterThan(0);
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
    q.stepPhysics(1/60);step({boost:true},180);expect(v.position.z).toBeLessThan(28);
  }finally{q.dispose();}
});
it('keeps independent stamina/action state and resets to hover',()=>{
  const {q,v,step}=fixture();try{
    const other=createVehicle(createFlyingCreatureSpec('bird'));step({boost:true,primary:true,secondary:true},60);
    expect(other.flyingCreature!.staminaRatio).toBe(1);expect(other.flyingCreature!.evadeCount).toBe(0);
    const reset=createVehicle(v.spec);expect(reset.flyingCreature!.flamePhase).toBe('off');expect(reset.velocity.length()).toBe(0);expect(reset.flyingCreature!.collisionCount).toBe(0);
  }finally{q.dispose();}
});
it('runs dedicated actions, camera switching and map reset through the public SDK owner',async()=>{
  const spec=createFlyingCreatureSpec('dragon'),map=createDragonTrainingMap(),world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,vehicles:[{instanceId:'dragon',assetId:'creature.dragon',spec,object:new Group()}],character:{instanceId:'person',object:new Group()}}});
  try{
    const runtime=world.humanoid!;runtime.prepareEpisodeStart({positionWorldMetersXYZ:[0,40,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'dragon',mounted:true}});
    const descriptors=JSON.stringify(runtime.commandDescriptors('person'));
    expect(descriptors).toContain('松键减速度');expect(descriptors).toContain('振翅加速度');
    const originalSpeed=runtime.simulation.vehicle!.spec.speed;
    expect(()=>runtime.applyProfile({vehicles:{dragon:{speed:40,maxSpeed:20}}})).toThrow('CREATURE_FEEL_SPEED_ORDER_INVALID');
    expect(runtime.simulation.vehicle!.spec.speed).toBe(originalSpeed);
    const release=runtime.setInput({...emptyInput(),primary:true});world.step({},60);release();
    expect(runtime.simulation.vehicle!.flyingCreature!.flamePhase).toBe('loop');expect(runtime.simulation.vehicle!.speed).toBe(0);
    runtime.applyProfile({view:{keyboardToggleEnabled:true}});world.step({cameraTogglePressed:true},1);expect(runtime.followCamera.mode).toBe(1);
    const snapshot=structuredClone(runtime.simulation.vehicle!.flyingCreature);world.snapshot();world.snapshot();expect(runtime.simulation.vehicle!.flyingCreature).toEqual(snapshot);
    runtime.switchMap(map);expect(runtime.simulation.vehicles[0]!.flyingCreature!.flamePhase).toBe('off');expect(runtime.simulation.vehicles[0]!.speed).toBe(0);expect(runtime.simulation.active).toBe(-1);
  }finally{world.dispose();}
});
