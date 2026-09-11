import {afterEach,beforeAll,expect,it} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';

const worlds:RAPIER.World[]=[];
beforeAll(async()=>{await RAPIER.init();});
afterEach(()=>{for(const world of worlds.splice(0))world.free();});
function create(){const world=new RAPIER.World({x:0,y:-9.81,z:0});worlds.push(world);return world;}
function refresh(world:RAPIER.World){world.updateSceneQueries();}

it.each([false,true])('keeps KCC impulses on the contacted body with reversed insertion=%s',reverse=>{
  const world=create();world.gravity={x:0,y:0,z:0};
  const actor=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.55,.28),actor);
  const addChair=()=>{const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,-.42,.485));world.createCollider(RAPIER.ColliderDesc.cuboid(.28,.05,.19).setMass(8),body);return body;};
  const addOther=()=>{const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(.32,-.4,.32));world.createCollider(RAPIER.ColliderDesc.cuboid(.03,.03,.03).setMass(8),body);return body;};
  const [chair,other]=reverse?(()=>{const other=addOther();return [addChair(),other] as const;})():[addChair(),addOther()] as const;
  refresh(world);const controller=world.createCharacterController(.015);
  controller.setCharacterMass(75);controller.setApplyImpulsesToDynamicBodies(true);
  controller.computeColliderMovement(capsule,{x:0,y:0,z:.1});
  expect(controller.numComputedCollisions()).toBeGreaterThan(0);
  expect(chair.linvel().z).toBeGreaterThan(.1);
  expect(Math.hypot(other.linvel().x,other.linvel().y,other.linvel().z)).toBeLessThan(1e-6);
});

it.each([0,.015])('casts voxel surfaces with target distance %s including skin-only movement',targetDistance=>{
  const world=create(),identity={x:0,y:0,z:0,w:1},zero={x:0,y:0,z:0};
  const voxel=world.createCollider(new RAPIER.ColliderDesc(new RAPIER.Voxels(new Int32Array([-1,-1,-1,-1,-1,0,-1,0,-1,-1,0,0,0,-1,-1,0,-1,0,0,0,-1,0,0,0]),{x:4,y:.5,z:4})));
  const box=new RAPIER.Cuboid(4,.5,4),capsule=new RAPIER.Capsule(.1,.1);
  // The skin is reached; the capsule itself does not reach the voxel cell.
  const position={x:1,y:.7+targetDistance+.002,z:1},velocity={x:0,y:-.005,z:0};
  const expected=box.castShape(zero,identity,zero,capsule,position,identity,velocity,targetDistance,1,false);
  const actual=voxel.castShape(zero,capsule,position,identity,velocity,targetDistance,1,false);
  expect(expected).not.toBeNull();expect(actual).not.toBeNull();
  expect(Math.abs(actual!.time_of_impact-expected!.time_of_impact)*Math.abs(velocity.y)).toBeLessThan(1e-5);
  expect(actual!.normal1.y).toBeGreaterThan(.999);
});
it.each([-1,1])('casts through thin voxel grid boundaries in direction %s',direction=>{
  const world=create(),identity={x:0,y:0,z:0,w:1},zero={x:0,y:0,z:0};
  const coordinates=new Int32Array([-1,-1,-1,-1,-1,0,-1,0,-1,-1,0,0,0,-1,-1,0,-1,0,0,0,-1,0,0,0]);
  const collider=world.createCollider(new RAPIER.ColliderDesc(new RAPIER.Voxels(coordinates,{x:3,y:2,z:.1})));
  for(const y of [-.7,-.5,-.4])for(const rise of [0,.322,.4]){
    const position={x:0,y,z:-direction*2},velocity={x:0,y:rise,z:direction*Math.sqrt(1-rise*rise)},ball=new RAPIER.Ball(.2);
    const expected=new RAPIER.Cuboid(3,2,.1).castShape(zero,identity,zero,ball,position,identity,velocity,0,8.8,true);
    const actual=collider.castShape(zero,ball,position,identity,velocity,0,8.8,true);
    expect(expected).not.toBeNull();expect(actual).not.toBeNull();
    expect(Math.abs(actual!.time_of_impact-expected!.time_of_impact)).toBeLessThan(.0001);
  }
});
function ray(world:RAPIER.World,x=0){return world.castRayAndGetNormal(new RAPIER.Ray({x,y:1,z:0},{x:0,y:0,z:1}),20,true);}

it('refreshes insert, teleport, disable, re-enable and reused handles without integrating',()=>{
  const world=create(),falling=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(10,5,0));
  world.createCollider(RAPIER.ColliderDesc.ball(.5),falling);
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,1,3));
  let wall=world.createCollider(RAPIER.ColliderDesc.cuboid(.5,.5,.5),body);
  const before={pose:falling.translation(),velocity:falling.linvel(),dt:world.timestep};
  refresh(world);expect(ray(world)?.collider.handle).toBe(wall.handle);
  body.setTranslation({x:4,y:1,z:3},true);refresh(world);
  expect(ray(world)).toBeNull();expect(ray(world,4)?.collider.handle).toBe(wall.handle);
  body.setEnabled(false);refresh(world);expect(ray(world,4)).toBeNull();
  body.setEnabled(true);refresh(world);expect(ray(world,4)?.collider.handle).toBe(wall.handle);
  wall.setEnabled(false);refresh(world);expect(ray(world,4)).toBeNull();
  wall.setEnabled(true);refresh(world);expect(ray(world,4)?.collider.handle).toBe(wall.handle);
  for(let n=0;n<20;n++){
    world.removeCollider(wall,true);refresh(world);expect(ray(world,4)).toBeNull();
    wall=world.createCollider(RAPIER.ColliderDesc.cuboid(.5,.5,.5),body);
    refresh(world);expect(ray(world,4)?.collider.handle).toBe(wall.handle);
  }
  expect({pose:falling.translation(),velocity:falling.linvel(),dt:world.timestep}).toEqual(before);
});

it('preserves ordinary collision start and stop events after a query refresh',()=>{
  const world=create(),queue=new RAPIER.EventQueue(true);
  const obstacle=world.createCollider(RAPIER.ColliderDesc.cuboid(1,1,1).setTranslation(0,1,0).setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,1,0).setGravityScale(0));
  const actor=world.createCollider(RAPIER.ColliderDesc.ball(.3),body);
  const events:boolean[]=[];
  const drain=()=>queue.drainCollisionEvents((a,b,started)=>{if([a,b].includes(obstacle.handle)&&[a,b].includes(actor.handle))events.push(started);});
  try{
    refresh(world);drain();expect(events).toEqual([]);
    world.step(queue);drain();expect(events).toEqual([true]);
    body.setTranslation({x:4,y:1,z:0},true);refresh(world);drain();expect(events).toEqual([true]);
    world.step(queue);drain();expect(events).toEqual([true,false]);
    body.setTranslation({x:0,y:1,z:0},true);refresh(world);world.step(queue);drain();expect(events).toEqual([true,false,true]);
  }finally{queue.free();}
});

it('re-enables a body whose collider was disabled by a previous physics step',()=>{
  const world=create(),body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,1,3));
  const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(.5,.5,.5),body);
  world.step();body.setEnabled(false);world.step();expect(ray(world)).toBeNull();
  body.setEnabled(true);refresh(world);expect(ray(world)?.collider.handle).toBe(collider.handle);
  collider.setEnabled(false);refresh(world);expect(ray(world)).toBeNull();
  body.setEnabled(false);world.step();body.setEnabled(true);refresh(world);
  expect(ray(world)).toBeNull(); // Explicit collider disable survives parent re-enable.
});

it.each(['body','collider'] as const)('does not resurrect physical pairs for a settled disabled %s',kind=>{
  const world=create(),queue=new RAPIER.EventQueue(true);
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,1,0).setGravityScale(0));
  const actor=world.createCollider(RAPIER.ColliderDesc.ball(.3),body);
  const owner=kind==='body'?body:actor;owner.setEnabled(false);world.step(queue);
  world.createCollider(RAPIER.ColliderDesc.ball(.5).setTranslation(0,1,0).setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
  const events:boolean[]=[];
  try{
    refresh(world);world.step(queue);queue.drainCollisionEvents((_a,_b,started)=>events.push(started));
    expect(events).toEqual([]);
    owner.setEnabled(true);refresh(world);world.step(queue);queue.drainCollisionEvents((_a,_b,started)=>events.push(started));
    expect(events).toEqual([true]);
  }finally{queue.free();}
});

it('keeps transformed shape witnesses, normals and filters equal to settled native queries',()=>{
  const world=create(),rotation={x:0,y:Math.sin(.3),z:0,w:Math.cos(.3)};
  const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(1,1,.3).setTranslation(3,1,5).setRotation(rotation).setCollisionGroups(0x00020002));
  const query=(groups:number,predicate?:(c:RAPIER.Collider)=>boolean)=>world.castShape({x:3,y:1,z:0},{x:0,y:0,z:0,w:1},{x:0,y:0,z:1},new RAPIER.Ball(.2),0,10,true,undefined,groups,undefined,undefined,predicate);
  refresh(world);const immediate=query(0x00020002);expect(immediate?.collider.handle).toBe(collider.handle);
  expect(query(0x00010001)).toBeNull();expect(query(0x00020002,()=>false)).toBeNull();
  world.step();const settled=query(0x00020002);expect(settled).not.toBeNull();
  expect(immediate!.time_of_impact).toBeCloseTo(settled!.time_of_impact,5);
  for(const field of ['normal1','normal2','witness1','witness2'] as const)
    for(const axis of ['x','y','z'] as const)expect(immediate![field][axis]).toBeCloseTo(settled![field][axis],5);
});

function controllerResult(kind:'wall'|'step'|'ground',settled:boolean){
  const world=create();
  world.createCollider(RAPIER.ColliderDesc.cuboid(10,.5,10).setTranslation(0,kind==='ground'?-.6:-.5,0));
  if(kind==='ground')world.createCollider(RAPIER.ColliderDesc.cuboid(5,.5,10).setTranslation(-4.5,-.5,0));
  if(kind==='wall')world.createCollider(RAPIER.ColliderDesc.cuboid(.2,3,10).setTranslation(1,2,0));
  if(kind==='step')world.createCollider(RAPIER.ColliderDesc.cuboid(2,.1,2).setTranslation(2.5,.1,0));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,kind==='ground'?1:1.02,0));
  const capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.7,.3),body);
  if(settled)world.step();else refresh(world);
  const controller=world.createCharacterController(.015);
  controller.enableAutostep(.3,.1,false);controller.enableSnapToGround(.3);
  const desired=kind==='wall'?{x:2,y:-.1,z:1}:kind==='step'?{x:1,y:-.1,z:0}:{x:2,y:-.01,z:0};
  controller.computeColliderMovement(capsule,desired,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
  const result={movement:controller.computedMovement(),grounded:controller.computedGrounded(),collisions:controller.numComputedCollisions()};
  world.removeCharacterController(controller);return result;
}
it.each(['wall','step','ground'] as const)('keeps native KCC %s behavior identical before and after a normal step',kind=>{
  const immediate=controllerResult(kind,false),settled=controllerResult(kind,true);
  expect(immediate.grounded).toBe(settled.grounded);expect(immediate.collisions).toBe(settled.collisions);
  for(const axis of ['x','y','z'] as const)expect(immediate.movement[axis]).toBeCloseTo(settled.movement[axis],5);
  if(kind==='wall'){expect(immediate.movement.x).toBeLessThan(.6);expect(immediate.movement.z).toBeGreaterThan(.9);}
  if(kind==='step')expect(immediate.movement.y).toBeGreaterThan(.1);
  if(kind==='ground'){expect(immediate.grounded).toBe(true);expect(immediate.movement.y).toBeLessThan(-.05);}
});

it.each([false,true])('observes actual solver normals with compound clustering=%s without stepping',compound=>{
  const world=create(),positions=[{x:-2,y:0,z:-2},{x:2,y:0,z:-2},{x:-2,y:0,z:2},{x:2,y:0,z:2}];
  const shape=compound?new RAPIER.Compound(positions.map(()=>new RAPIER.Cuboid(2,.5,2)),positions,positions.map(()=>({x:0,y:0,z:0,w:1}))):new RAPIER.Cuboid(4,.5,4);
  const floor=world.createCollider(new RAPIER.ColliderDesc(shape).setTranslation(0,-.5,0));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,1,0).setCanSleep(false));
  const actor=world.createCollider(RAPIER.ColliderDesc.cuboid(1.5,.3,1.5),body);
  for(let tick=0;tick<120;tick++)world.step();
  const before={position:body.translation(),velocity:body.linvel(),dt:world.timestep};
  let geometricSolverContacts=0;world.contactPair(floor,actor,manifold=>{geometricSolverContacts+=manifold.numSolverContacts();});
  if(compound)expect(geometricSolverContacts).toBe(0);else expect(geometricSolverContacts).toBeGreaterThan(0);
  const normals=world.solverContactNormals(floor,actor),reversed=world.solverContactNormals(actor,floor);
  expect(normals.length).toBeGreaterThan(0);expect(reversed).toHaveLength(normals.length);
  for(let i=0;i<normals.length;i++){expect(normals[i]!.y).toBeGreaterThan(.999);expect(reversed[i]!.y).toBeLessThan(-.999);}
  normals[0]!.y=0;expect(world.solverContactNormals(floor,actor)[0]!.y).toBeGreaterThan(.999);
  expect({position:body.translation(),velocity:body.linvel(),dt:world.timestep}).toEqual(before);
  body.setTranslation({x:20,y:3,z:0},true);world.step();expect(world.solverContactNormals(floor,actor)).toEqual([]);
});
