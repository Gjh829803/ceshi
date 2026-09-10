import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorld, type ThreeWorld } from './world.js';
import type { CommandReceipt, TaskScope } from './contracts.js';

const liveWorlds: ThreeWorld[] = [];
afterEach(() => { for (const world of liveWorlds.splice(0)) world.dispose(); });

describe('shared shadow configuration',()=>{
 it('applies project settings to the renderer and explicitly selected lights, including replacement lights',async()=>{
  const renderer={shadowMap:{enabled:false,type:THREE.BasicShadowMap,needsUpdate:false,autoUpdate:false},render:()=>{}} as unknown as THREE.WebGLRenderer;
  const untouched=new THREE.DirectionalLight(),scene=new THREE.Scene();scene.add(untouched);
  const options=JSON.parse('{"mapSizePixels":1024,"coverageMeters":40,"nearMeters":2,"farMeters":220,"bias":-0.0002,"normalBiasMeters":0.03,"radius":0.7,"intensity":0.6}');
  const world=await createWorld({scene,renderer,navigation:false,shadows:options});liveWorlds.push(world);
  expect(renderer.shadowMap.enabled).toBe(true);expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
  expect(untouched.castShadow).toBe(false);
  options.coverageMeters=4;
  for(let i=0;i<2;i++){
   const light=new THREE.DirectionalLight();light.position.set(8,10,12);light.target.position.set(1,2,3);
   // Three consumes the renderer-level dirty flag after rendering the previous light.
   renderer.shadowMap.needsUpdate=false;
   const projection=light.shadow.camera.projectionMatrix.clone();world.configureShadowLight(light);
   expect(renderer.shadowMap.needsUpdate).toBe(true);expect(renderer.shadowMap.autoUpdate).toBe(false);
   expect(light.castShadow).toBe(true);expect(light.shadow.mapSize.toArray()).toEqual([1024,1024]);
   expect(light.shadow.camera).toMatchObject({left:-20,right:20,top:20,bottom:-20,near:2,far:220});
   expect(light.shadow.camera.projectionMatrix.equals(projection)).toBe(false);
   expect(light.shadow).toMatchObject({bias:-.0002,normalBias:.03,radius:.7,intensity:.6});
   expect(light.position.toArray()).toEqual([8,10,12]);expect(light.target.position.toArray()).toEqual([1,2,3]);
   light.shadow.dispose();
  }
  expect(world.simulationTick).toBe(0);
  world.dispose();expect(renderer.shadowMap.enabled).toBe(false);expect(renderer.shadowMap.type).toBe(THREE.BasicShadowMap);
  expect(()=>world.configureShadowLight(new THREE.DirectionalLight())).toThrow();
 });
 it('supports a disabled headless world and does not contaminate another world defaults',async()=>{
  const disabled=await createWorld({navigation:false,shadows:{enabled:false}}),normal=await createWorld({navigation:false});liveWorlds.push(disabled,normal);
  const light=new THREE.DirectionalLight();light.castShadow=true;disabled.configureShadowLight(light);expect(light.castShadow).toBe(false);
  normal.configureShadowLight(light);expect(light.castShadow).toBe(true);
  expect(normal.shadowSettings.enabled).toBe(true);expect(disabled.shadowSettings.enabled).toBe(false);
  expect(Object.isFrozen(normal.shadowSettings)).toBe(true);
  light.shadow.dispose();
 });
 it('releases old shadow textures on resize and preserves light update ownership',async()=>{
  const world=await createWorld({navigation:false});liveWorlds.push(world);
  const light=new THREE.DirectionalLight(),map=new THREE.WebGLRenderTarget(512,512),pass=new THREE.WebGLRenderTarget(512,512);
  let disposed=0;map.addEventListener('dispose',()=>disposed++);pass.addEventListener('dispose',()=>disposed++);
  light.shadow.map=map;light.shadow.mapPass=pass;light.shadow.autoUpdate=false;
  world.configureShadowLight(light);
  expect(disposed).toBe(2);expect(light.shadow.map).toBeNull();expect(light.shadow.mapPass).toBeNull();
  expect(light.shadow.needsUpdate).toBe(true);expect(light.shadow.autoUpdate).toBe(false);
  world.configureShadowLight(light);expect(disposed).toBe(2);
 });
 it('rejects invalid project JSON before mutating a supplied renderer',async()=>{
  const renderer={shadowMap:{enabled:false,type:THREE.VSMShadowMap,needsUpdate:false}} as unknown as THREE.WebGLRenderer;
  await expect(createWorld({renderer,navigation:false,shadows:{coverageMeters:0}})).rejects.toThrow('SHADOW_SETTINGS_INVALID');
  expect(renderer.shadowMap).toEqual({enabled:false,type:THREE.VSMShadowMap,needsUpdate:false});
 });
 it('invalidates static light caches when applying and restoring the renderer algorithm',async()=>{
  const scene=new THREE.Scene(),light=new THREE.DirectionalLight();light.castShadow=true;light.shadow.autoUpdate=false;scene.add(light);
  const renderer={shadowMap:{enabled:true,type:THREE.BasicShadowMap,needsUpdate:false,autoUpdate:false}} as unknown as THREE.WebGLRenderer;
  const world=await createWorld({scene,renderer,navigation:false});liveWorlds.push(world);
  expect(light.shadow.needsUpdate).toBe(true);expect(light.shadow.autoUpdate).toBe(false);
  light.shadow.needsUpdate=false;renderer.shadowMap.needsUpdate=false;
  world.dispose();
  expect(renderer.shadowMap.type).toBe(THREE.BasicShadowMap);
  expect(renderer.shadowMap.needsUpdate).toBe(true);expect(light.shadow.needsUpdate).toBe(true);
  expect(light.shadow.mapSize.toArray()).toEqual([512,512]);expect(light.castShadow).toBe(true);
 });
});

function box(width = 1, height = 1, depth = 1) {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial());
}

it('identifies a decoration physics conflict without registering the entity',async()=>{
  const world=await createWorld({navigation:false});liveWorlds.push(world);
  const object=box();let error:unknown;
  try{world.addEntity({id:'capture-landmark',object,role:'decoration',physics:{kind:'fixed'}} as never);}catch(caught){error=caught;}
  expect(error).toMatchObject({code:'DECORATION_CANNOT_HAVE_PHYSICS',category:'invalid-input',phase:'control',entityIds:['capture-landmark'],path:'physics',actual:'present',expected:'omitted'});
  expect((error as {suggestedAction:string}).suggestedAction).toContain('existing collision');
  expect(world.snapshot().entities.some(entity=>entity.id==='capture-landmark')).toBe(false);
  object.geometry.dispose();object.material.dispose();
});

it.each([
  {role:undefined, actual:'undefined'},
  {role:'actor', actual:'"actor"'},
  {role:null, actual:'null'},
  {role:17, actual:'17'},
  {role:{toString(){throw new Error('must not inspect object values');}}, actual:'object'},
])('rejects an invalid entity role with repair context and no registration ($actual)',async({role,actual})=>{
  const world=await createWorld({navigation:false});liveWorlds.push(world);
  const object=box(),before=world.snapshot();
  let error:unknown;
  try{world.addEntity({id:'landmark',object,role} as never);}catch(caught){error=caught;}
  expect(error).toMatchObject({code:'ENTITY_ROLE_REQUIRED',category:'invalid-input',phase:'control',entityIds:['landmark']});
  const diagnostic=error as {message:string;suggestedAction:string};
  for(const value of ['options.role','terrain','obstacle','decoration',actual])expect(diagnostic.message).toContain(value);
  expect(diagnostic.suggestedAction).toContain('options.role');
  expect(world.snapshot().entities).toEqual(before.entities);
  expect(object.parent).toBeNull();
  object.geometry.dispose();object.material.dispose();
});

async function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, .05, 100);
  camera.position.set(0, 4, 8); camera.lookAt(0, 1, 0);
  const world = await createWorld({ scene, camera, navigation: false });
  liveWorlds.push(world);
  const ground = box(40, 1, 40); ground.position.y = -.5;
  world.addEntity({ id: 'ground', object: ground, role: 'terrain' });
  const hero = new THREE.Group();
  const body = box(.6, 1.8, .6); body.position.y = .9; hero.add(body); hero.position.y = .05;
  world.addCharacter({ id: 'hero', object: hero, body: { heightMeters: 1.8, radiusMeters: .3 } });
  world.setControlledEntity('hero');
  return { world, scene, hero };
}

async function sealPaused(world: ThreeWorld) { await world.start(); world.stop(); }

function operationId(receipt: CommandReceipt): string {
  expect(receipt.status).toBe('accepted');
  if (receipt.status !== 'accepted') throw new Error(`Expected an accepted operation, got ${JSON.stringify(receipt)}`);
  return receipt.operationId;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

const emptyInput = { type: 'object', properties: {}, required: [], additionalProperties: false } as const;

describe('public Three SDK v2 authoring and control contracts', () => {
  it('reports disabled navigation consistently before accepting an NPC operation',async()=>{
    const {world}=await fixture();world.addCharacter({id:'npc',object:new THREE.Group(),body:{heightMeters:1.8,radiusMeters:.3}});
    const descriptor=world.describe({entityIds:['npc']}).entities[0]!.commands.find(c=>c.type==='actor.move-to')!;
    expect(descriptor.isAvailable).toBe(false);
    const receipt=await world.execute({type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[2,0,0]});
    expect(receipt).toMatchObject({status:'rejected',error:{code:'WORLD_NAVIGATION_DISABLED',category:'unsupported-capability'}});
    if(receipt.status==='rejected')expect(receipt.error).toEqual(descriptor.unavailableReason);
    expect(world.describe({entityIds:['npc']}).entities[0]!.commands.find(c=>c.type==='actor.stop')!.isAvailable).toBe(true);
    for(const command of [{type:'actor.follow',entityId:'npc',targetEntityId:'hero'},{type:'actor.resume-autonomy',entityId:'npc'}] as const){
      const description=world.describe({entityIds:['npc']}).entities[0]!.commands.find(c=>c.type===command.type)!;
      const result=await world.execute(command);expect(result.status).toBe('rejected');
      if(result.status==='rejected')expect(result.error).toEqual(description.unavailableReason);
    }

  });

  it('shares one parameter value between nearby player interaction and external control', async () => {
    const { world } = await fixture();
    const gate = box(); gate.position.set(1, .5, 0);
    world.addEntity({ id: 'gate', object: gate, role: 'decoration' });
    const open = world.defineParameter({
      id: 'gate.open', description: 'Open gate', schema: { type: 'boolean' }, initialValue: false,
      writes: [{ kind: 'entity', entityId: 'gate', channels: ['rotation'] }],
      plan: value => [{ type: 'entity.set-rotation', entityId: 'gate', rotationLocalRadiansXYZ: [0, value ? Math.PI / 2 : 0, 0] }],
    });
    world.onInteract('gate', () => ({ type: 'parameter.set', parameterId: open.id, value: !open.value }));
    await sealPaused(world);
    world.step({ interactPressed: true });
    // Interaction plans may prepare asynchronously even while simulation stays paused.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(open.value).toBe(true);
    expect(world.describe().parameters.find(parameter => parameter.id === open.id)?.value).toBe(true);
    expect(world.getEntityState('gate').rotationLocalRadiansXYZ[1]).toBeCloseTo(Math.PI / 2);
    expect((await world.execute({ type: 'parameter.set', parameterId: open.id, value: false })).status).toBe('applied');
    expect(open.value).toBe(false);
    world.step({}); world.step({ interactPressed: true });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(open.value).toBe(true);
  });

  it('rejects parameter channel bypass and undeclared writes without changing desired or actual state', async () => {
    const { world } = await fixture();
    world.addEntity({ id: 'gate', object: box(), role: 'decoration' });
    world.addEntity({ id: 'neighbor', object: box(), role: 'decoration' });
    const height = world.defineParameter({
      id: 'gate.height', description: 'Gate height', schema: { type: 'number', minimum: 0, maximum: 2 }, initialValue: 0,
      writes: [{ kind: 'entity', entityId: 'gate', channels: ['position'] }],
      plan: value => [{ type: 'entity.set-position', entityId: value === 2 ? 'neighbor' : 'gate', positionWorldMetersXYZ: [0, value, 0] }],
    });
    await sealPaused(world);
    const bypass = await world.execute({ type: 'entity.set-position', entityId: 'gate', positionWorldMetersXYZ: [0, 5, 0] });
    expect(bypass.status).toBe('rejected');
    if (bypass.status === 'rejected') expect(bypass.error.code).toBe('CHANNEL_OWNED_BY_PARAMETER');
    const undeclared = await world.execute({ type: 'parameter.set', parameterId: height.id, value: 2 });
    expect(undeclared.status).toBe('rejected');
    expect(height.value).toBe(0);
    expect(world.getEntityState('gate').positionWorldMetersXYZ).toEqual([0, 0, 0]);
    expect(world.getEntityState('neighbor').positionWorldMetersXYZ).toEqual([0, 0, 0]);
  });

  it('authorizes spawn then attach through the prototype claim and replays command IDs without duplication', async () => {
    const { world } = await fixture();
    await world.registerPrototype({ id: 'lantern', description: 'A carried lantern', template: { kind: 'entity', options: { role: 'decoration', object: box(.2, .3, .2) } } });
    world.registerAction({
      id: 'equip-lantern', description: 'Create and attach one lantern', inputSchema: emptyInput,
      writes: [{ kind: 'prototype', prototypeId: 'lantern' }],
      plan: () => [
        { type: 'entity.spawn', prototypeId: 'lantern', entityId: 'lantern-1', positionWorldMetersXYZ: [3, 1, 0] },
        { type: 'entity.attach', childEntityId: 'lantern-1', parentEntityId: 'hero', positionLocalMetersXYZ: [.5, 1, 0] },
      ],
    });
    await sealPaused(world);
    const command = { type: 'action.invoke', actionId: 'equip-lantern', arguments: {} } as const;
    const first = await world.execute(command, { commandId: 'equip-42' });
    expect(first.status).not.toBe('rejected');
    expect(await world.execute(command, { commandId: 'equip-42' })).toEqual(first);
    expect(world.snapshot().entities.filter(entity => entity.id === 'lantern-1')).toHaveLength(1);
    expect(world.getEntityState('lantern-1').parentEntityId).toBe('hero');
    const lanternPosition = world.getEntityState('lantern-1').positionWorldMetersXYZ;
    const heroPosition = world.getEntityState('hero').positionWorldMetersXYZ;
    expect(lanternPosition[0] - heroPosition[0]).toBeCloseTo(.5);
    expect(lanternPosition[1] - heroPosition[1]).toBeCloseTo(1);
    const collision = await world.execute({ type: 'entity.set-visible', entityId: 'lantern-1', isVisible: false }, { commandId: 'equip-42' });
    expect(collision.status).toBe('rejected');
    expect(world.getEntityState('lantern-1').isVisibleLocal).toBe(true);
    const existing = await world.execute(command, { commandId: 'equip-43' });
    expect(existing.status).toBe('rejected');
    expect(world.snapshot().entities.filter(entity => entity.id === 'lantern-1')).toHaveLength(1);
  });

  it('requires explicit lifecycle authority for independently registered descendants of a deleted parent', async () => {
    const { world } = await fixture();
    const parent = new THREE.Group(); const child = box(); parent.add(child);
    world.addEntity({ id: 'parent', object: parent, role: 'decoration' });
    world.addEntity({ id: 'protected-child', object: child, role: 'decoration' });
    world.registerAction({
      id: 'delete-parent', description: 'Delete only the permitted parent', inputSchema: emptyInput,
      writes: [{ kind: 'entity', entityId: 'parent', channels: ['lifecycle'] }],
      plan: () => [{ type: 'entity.despawn', entityId: 'parent' }],
    });
    await sealPaused(world);
    const before = world.snapshot();
    const result = await world.execute({ type: 'action.invoke', actionId: 'delete-parent', arguments: {} });
    expect(result.status).toBe('rejected');
    expect(world.snapshot().entities.map(entity => entity.id)).toEqual(before.entities.map(entity => entity.id));
    expect(world.getEntityState('protected-child').parentEntityId).toBe('parent');
  });

  it('rejects an invalid composite plan before publishing an earlier valid property write', async () => {
    const { world } = await fixture();
    world.addEntity({ id: 'marker', object: box(), role: 'decoration' });
    world.registerAction({
      id: 'invalid-composite', description: 'Invalid nonuniform character scaling', inputSchema: emptyInput,
      writes: [
        { kind: 'entity', entityId: 'marker', channels: ['position'] },
        { kind: 'entity', entityId: 'hero', channels: ['scale'] },
      ],
      plan: () => [
        { type: 'entity.set-position', entityId: 'marker', positionWorldMetersXYZ: [8, 0, 0] },
        { type: 'entity.set-scale', entityId: 'hero', scaleLocalXYZ: [1, 2, 1] },
      ],
    });
    await sealPaused(world);
    const beforeRevision = world.describe().worldRevision;
    const result = await world.execute({ type: 'action.invoke', actionId: 'invalid-composite', arguments: {} });
    expect(result.status).toBe('rejected');
    expect(world.getEntityState('marker').positionWorldMetersXYZ).toEqual([0, 0, 0]);
    expect(world.getEntityState('hero').scaleLocalXYZ).toEqual([1, 1, 1]);
    expect(world.describe().worldRevision).toBe(beforeRevision);
  });

  it('rejects locomotion and root-position writes to the same actor in one composite plan', async () => {
    const { world } = await fixture();
    const npc = new THREE.Group(); npc.position.set(4, .05, 0);
    world.addCharacter({ id: 'guide', object: npc, body: { heightMeters: 1.8, radiusMeters: .3 } });
    world.registerAction({
      id: 'conflicting-actor-control', description: 'Two owners of one actor position', inputSchema: emptyInput,
      writes: [{ kind: 'entity', entityId: 'guide', channels: ['position', 'locomotion'] }],
      plan: () => [
        { type: 'entity.set-position', entityId: 'guide', positionWorldMetersXYZ: [8, 0, 0] },
        { type: 'actor.follow', entityId: 'guide', targetEntityId: 'hero' },
      ],
    });
    await sealPaused(world);
    const before = world.getEntityState('guide');
    const result = await world.execute({ type: 'action.invoke', actionId: 'conflicting-actor-control', arguments: {} });
    expect.soft(result.status).toBe('rejected');
    expect.soft(world.getEntityState('guide').positionWorldMetersXYZ).toEqual(before.positionWorldMetersXYZ);
  });

  it('pauses and disables an action whose authored plan writes a managed root directly', async () => {
    const { world } = await fixture();
    const marker = box(); world.addEntity({ id: 'marker', object: marker, role: 'decoration' });
    world.registerAction({
      id: 'illegal-author-code', description: 'Deliberate authoring violation', inputSchema: emptyInput, writes: [],
      plan: () => { marker.position.x = 2; return []; },
    });
    await world.start();
    const result = await world.execute({ type: 'action.invoke', actionId: 'illegal-author-code', arguments: {} });
    expect(result.status).toBe('rejected');
    // Arbitrary authored JS cannot be rolled back; the world must make the fault visible.
    expect.soft(world.isRunning).toBe(false);
    expect.soft(world.describe().actions.find(action => action.id === 'illegal-author-code')?.isAvailable).toBe(false);
    expect.soft(world.snapshot().errors.some(error => error.code === 'MANAGED_CHANNEL_WRITE')).toBe(true);
  });

  it('commits paused instant commands but leaves duration operations pending until explicit stepping', async () => {
    const { world } = await fixture();
    world.addEntity({ id: 'marker', object: box(), role: 'decoration' });
    await sealPaused(world);
    const beforeTick = world.simulationTick;
    expect((await world.execute({ type: 'entity.set-visible', entityId: 'marker', isVisible: false })).status).toBe('applied');
    const id = operationId(await world.execute({ type: 'entity.set-position', entityId: 'marker', positionWorldMetersXYZ: [3, 0, 0], durationSeconds: .25 }));
    let settled = false;
    const completion = world.operations.wait(id).then(result => { settled = true; return result; });
    await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false);
    expect(world.isRunning).toBe(false);
    expect(world.simulationTick).toBe(beforeTick);
    expect(world.getEntityState('marker').positionWorldMetersXYZ).toEqual([0, 0, 0]);
    world.step({}, 30);
    expect((await completion).status).toBe('succeeded');
    expect(world.getEntityState('marker').positionWorldMetersXYZ[0]).toBeCloseTo(3);
  });

  it('queues running commands at a tick boundary without secretly advancing a headless world', async () => {
    const { world } = await fixture();
    world.addEntity({ id: 'marker', object: box(), role: 'decoration' });
    await world.start();
    const beforeTick = world.simulationTick;
    const pending = world.execute({ type: 'entity.set-visible', entityId: 'marker', isVisible: false });
    await Promise.resolve();
    expect(world.getEntityState('marker').isVisibleLocal).toBe(true);
    expect(world.simulationTick).toBe(beforeTick);
    world.step();
    expect((await pending).status).toBe('applied');
    expect(world.getEntityState('marker').isVisibleLocal).toBe(false);
    expect(world.simulationTick).toBe(beforeTick + 1);
  });

  it('cancels operations and wakes existing waiters on reset while restoring the sealed baseline', async () => {
    const { world } = await fixture();
    world.addEntity({ id: 'marker', object: box(), role: 'decoration' });
    await sealPaused(world);
    const id = operationId(await world.execute({ type: 'entity.set-position', entityId: 'marker', positionWorldMetersXYZ: [10, 0, 0], durationSeconds: 10 }));
    world.step({}, 10);
    expect(world.getEntityState('marker').positionWorldMetersXYZ[0]).toBeGreaterThan(0);
    const waiter = world.operations.wait(id);
    await world.reset();
    expect((await waiter).status).toBe('cancelled');
    expect(world.operations.get(id).status).toBe('cancelled');
    expect(world.getEntityState('marker').positionWorldMetersXYZ).toEqual([0, 0, 0]);
  });

  it('invalidates delayed task state, entity and command commits after reset', async () => {
    const { world } = await fixture();
    const score = world.state.define('score', 0);
    await sealPaused(world);
    const release = deferred();
    const scopes: TaskScope[] = [];
    const mutations = [
      (scope: TaskScope) => scope.setState(score, 9),
      (scope: TaskScope) => scope.addEntity({ id: 'late', object: box(), role: 'decoration' }),
      (scope: TaskScope) => scope.execute({ type: 'entity.set-visible', entityId: 'hero', isVisible: false }),
    ];
    const results = Promise.allSettled(mutations.map(mutate => world.runTask(async scope => {
      scopes.push(scope); await release.promise; return mutate(scope);
    })));
    await Promise.resolve();
    expect(scopes).toHaveLength(3);
    await world.reset();
    expect(scopes.every(scope => scope.signal.aborted)).toBe(true);
    release.resolve();
    expect((await results).every(result => result.status === 'rejected')).toBe(true);
    expect(score.value).toBe(0);
    expect(world.snapshot().entities.some(entity => entity.id === 'late')).toBe(false);
    expect(world.getEntityState('hero').isVisibleLocal).toBe(true);
  });

  it('applies visual and private-state effect parameters initially and restores them on reset', async () => {
    const { world, scene } = await fixture();
    const theme = world.state.define('theme-color', 0);
    const sky = world.defineParameter({
      id: 'sky-color', description: 'Sky color', schema: { type: 'number', minimum: 0, maximum: 0xffffff }, initialValue: 0x334455,
      writes: [{ kind: 'visual', channelId: 'sky' }, { kind: 'state', stateId: theme.id }],
      effect: value => { scene.background = new THREE.Color(value); theme.set(value); },
    });
    await sealPaused(world);
    expect((scene.background as THREE.Color).getHex()).toBe(0x334455);
    expect(theme.value).toBe(0x334455);
    expect((await world.execute({ type: 'parameter.set', parameterId: sky.id, value: 0x998877 })).status).toBe('applied');
    expect((scene.background as THREE.Color).getHex()).toBe(0x998877);
    expect(theme.value).toBe(0x998877);
    await world.reset();
    expect(sky.value).toBe(0x334455);
    expect((scene.background as THREE.Color).getHex()).toBe(0x334455);
    expect(theme.value).toBe(0x334455);
  });

  it('replaces named Mesh geometry in the same entity and real collider, restores it, and rejects invalid candidates', async () => {
    const { world } = await fixture();
    const wall = box(.2, 3, 8); wall.position.set(3, 1.5, 0);
    const originalGeometry = wall.geometry; const material = wall.material;
    const attachment = new THREE.Object3D(); wall.add(attachment);
    world.addEntity({ id: 'wall', object: wall, role: 'obstacle' });
    await world.registerGeometry({ id: 'low-curb', description: 'Passable low curb', geometry: new THREE.BoxGeometry(.2, .1, 8).translate(0, -1.45, 0) });
    await sealPaused(world);
    world.step({ moveXRatio: 1 }, 120);
    expect(world.getEntityState('hero').positionWorldMetersXYZ[0]).toBeGreaterThan(1);
    expect(world.getEntityState('hero').positionWorldMetersXYZ[0]).toBeLessThan(2.9);
    const generation = world.getEntityState('wall').generation;
    const oldGeometryVersion = world.getEntityState('wall').geometryVersion;
    expect((await world.execute({ type: 'entity.set-geometry', entityId: 'wall', geometryId: 'low-curb' })).status).toBe('applied');
    expect(world.getEntityState('wall').generation).toBe(generation);
    expect(world.getEntityState('wall').geometryVersion).toBeGreaterThan(oldGeometryVersion);
    expect(wall.material).toBe(material); expect(attachment.parent).toBe(wall);
    world.step({ moveXRatio: 1 }, 90);
    expect(world.getEntityState('hero').positionWorldMetersXYZ[0]).toBeGreaterThan(3.5);
    await world.reset();
    expect(wall.geometry).toBe(originalGeometry);
    let rejected = false;
    try { rejected = (await world.replaceGeometry('wall', new THREE.BufferGeometry())).status === 'rejected'; }
    catch { rejected = true; }
    expect(rejected).toBe(true);
    expect(wall.geometry).toBe(originalGeometry);
    world.step({ moveXRatio: 1 }, 120);
    expect(world.getEntityState('hero').positionWorldMetersXYZ[0]).toBeGreaterThan(1);
    expect(world.getEntityState('hero').positionWorldMetersXYZ[0]).toBeLessThan(2.9);
  });

  it('resolves authored XYZ movement against walls and a ceiling, then resumes grounded gravity', async () => {
    const { world } = await fixture();
    const xWall = box(.2, 8, 20); xWall.position.set(2, 3, 0);
    const zWall = box(20, 8, .2); zWall.position.set(0, 3, 2);
    const ceiling = box(20, .2, 20); ceiling.position.y = 3;
    world.addEntity({ id: 'east-wall', object: xWall, role: 'obstacle' });
    world.addEntity({ id: 'north-wall', object: zWall, role: 'obstacle' });
    world.addEntity({ id: 'ceiling', object: ceiling, role: 'obstacle' });
    let calls = 0;
    world.registerMovement({
      id: 'test-fly', version: 1, description: 'Three-axis intent without gravity', initialState: 0,
      update: ({ state }) => { calls++; return { state: state + 1, velocityWorldMetersPerSecondXYZ: [2, 2, 2], applyGravity: false }; },
    });
    await sealPaused(world);
    expect((await world.execute({ type: 'actor.set-movement', entityId: 'hero', movementId: 'test-fly' })).status).toBe('applied');
    world.step({}, 180);
    const flight = world.getEntityState('hero');
    expect(calls).toBe(180);
    expect(flight.movementId).toBe('test-fly');
    expect(flight.positionWorldMetersXYZ[0]).toBeGreaterThan(.5);
    expect(flight.positionWorldMetersXYZ[2]).toBeGreaterThan(.5);
    expect(flight.positionWorldMetersXYZ[1]).toBeGreaterThan(.3);
    expect(flight.positionWorldMetersXYZ[0]).toBeLessThan(1.9);
    expect(flight.positionWorldMetersXYZ[2]).toBeLessThan(1.9);
    expect(flight.positionWorldMetersXYZ[1]).toBeLessThan(1.3);
    expect((await world.execute({ type: 'actor.set-movement', entityId: 'hero', movementId: 'ground' })).status).toBe('applied');
    world.step({}, 180);
    expect(calls).toBe(180);
    expect(world.getEntityState('hero').movementId).toBe('ground');
    expect(world.getEntityState('hero').motion?.isGrounded).toBe(true);
    expect(world.getEntityState('hero').positionWorldMetersXYZ[1]).toBeLessThan(.15);
    expect(world.snapshot().errors).toEqual([]);
  });
});
