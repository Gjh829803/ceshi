import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createWorld } from './engine.js';
import { WorldKeyboard } from './input.js';

function ground(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80, 20, 20), new THREE.MeshBasicMaterial()); mesh.rotation.x = -Math.PI / 2; return mesh;
}
function actor(): THREE.Group {
  const root = new THREE.Group(); const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.3), new THREE.MeshBasicMaterial()); body.position.y = 0.9; root.add(body); return root;
}
async function fixture(navigation = false) {
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(47, 1.7, .05, 500); camera.position.set(3, 4, 6); camera.lookAt(0, 1, 0);
  const world = await createWorld({ scene, camera, navigation }); world.addEntity({ id: '地形:Main', object: ground(), role: 'terrain' });
  world.addCharacter({ id: 'Player-A', object: actor() }); world.setControlledEntity('Player-A'); return world;
}
const point = (world: Awaited<ReturnType<typeof fixture>>, id = 'Player-A') => world.snapshot().entities.find(e => e.id === id)!.positionMetersXYZ;

describe('ThreeWorld', () => {
  it.each([[3,6],[3.2,6],[1.5,2.5]])('keeps walk/run animation aligned with held intent at speeds %s/%s', async (walkSpeed,runSpeed) => {
    const world = await fixture();
    try {
      const object=actor();object.position.x=5;let selected='';
      const asset={object,clips:[],mixer:new THREE.AnimationMixer(object),actionIds:['idle','walk','run','jump','fall'],isActionComplete:false,timeSeconds:0,
        play:(actionId:string)=>{selected=actionId;},update:()=>{},dispose:()=>{}};
      world.addCharacter({id:'Animated',object,asset,character:{walkSpeedMetersPerSecond:walkSpeed,runSpeedMetersPerSecond:runSpeed}});
      world.setControlledEntity('Animated');world.step({},60);
      world.step({moveZRatio:-1},30);expect(selected).toBe('walk');
      world.step({moveZRatio:-1,run:true},30);expect(selected).toBe('run');
      world.step({moveZRatio:-1},30);expect(selected).toBe('walk');
      world.step({},30);expect(selected).toBe('idle');
    } finally {world.dispose();}
  });
  it('uses held arrow keys to orbit the camera without driving the character', async () => {
    const world = await fixture();
    try {
      world.setCameraFollow({ distanceMeters: 6, pitchRadians: .3, activateOnInput: true }); world.step({}, 30);
      const playerBefore = point(world); const cameraBefore = world.camera.quaternion.clone();
      world.keyboard.enabled = true; world.keyboard.keyDown('ArrowRight');
      for (let i = 0; i < 60; i++) world.advance(1 / 60);
      expect(point(world)[0]).toBeCloseTo(playerBefore[0], 4); expect(point(world)[2]).toBeCloseTo(playerBefore[2], 4);
      expect(world.camera.quaternion.angleTo(cameraBefore)).toBeGreaterThan(.5);
      world.keyboard.keyUp('ArrowRight'); const stopped = world.camera.quaternion.clone();
      for (let i = 0; i < 30; i++) world.advance(1 / 60);
      expect(world.camera.quaternion.angleTo(stopped)).toBeLessThan(.01);
      world.keyboard.keyDown('ArrowUp'); for (let i = 0; i < 30; i++) world.advance(1 / 60);
      expect(world.camera.quaternion.angleTo(stopped)).toBeGreaterThan(.2);
    } finally { world.dispose(); }
  });
  it('accepts a first animation-frame timestamp earlier than start time and records frame failures', async () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const world = await fixture();
    try {
      world.start(); callbacks.shift()!(0);
      expect(world.isRunning).toBe(true); expect(callbacks).toHaveLength(1); expect(world.snapshot().errors).toEqual([]);
      const render = vi.spyOn(world, 'render').mockImplementation(() => { throw new Error('WebGL context lost during frame'); });
      callbacks.shift()!(16); expect(world.isRunning).toBe(false);
      expect(world.snapshot().errors.some(error => error.message.includes('WebGL context lost'))).toBe(true); render.mockRestore();
    } finally { world.dispose(); vi.unstubAllGlobals(); }
  });
  it('evaluates the restored animation pose before rendering a reset opening', async () => {
    const world = await fixture();
    try {
      const object = actor(); object.position.x = 8; const joint = new THREE.Object3D(); joint.name = 'joint'; object.add(joint);
      const clip = new THREE.AnimationClip('idle', 1, [new THREE.NumberKeyframeTrack('joint.position[y]', [0, 1], [.4, .6])]);
      const mixer = new THREE.AnimationMixer(object); const action = mixer.clipAction(clip);
      const asset = { object, clips: [clip], mixer, actionIds:['idle'],isActionComplete:false,timeSeconds:0, play: () => { action.reset().play(); }, update: (dt: number) => { mixer.update(dt); }, dispose: () => { mixer.stopAllAction(); } };
      world.addCharacter({ id: 'Animated', object, asset }); world.step({}, 15); expect(joint.position.y).toBeGreaterThan(.4);
      world.reset(); expect(world.simulationTick).toBe(0); expect(joint.position.y).toBeCloseTo(.4);
    } finally { world.dispose(); }
  });
  it('restores an authored manual matrix when resetting', async () => {
    const world = await fixture();
    try {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      mesh.matrixAutoUpdate = false; mesh.matrix.makeTranslation(3, 1, 0);
      world.addEntity({ id: 'Manual matrix', object: mesh, role: 'obstacle' }); world.step();
      expect(world.execute({ type: 'entity.set-scale', entityId: 'Manual matrix', scaleXYZ: [2, 2, 2] }).status).toBe('applied');
      expect(point(world, 'Manual matrix')).toEqual([3, 1, 0]);
      expect(world.execute({ type: 'entity.set-position', entityId: 'Manual matrix', positionMetersXYZ: [9, 1, 0] }).status).toBe('applied');
      world.reset(); expect(point(world, 'Manual matrix')).toEqual([3, 1, 0]); expect(mesh.matrixAutoUpdate).toBe(false);
      expect(world.physics.state('Manual matrix')!.positionMetersXYZ).toEqual([3, 1, 0]);
    } finally { world.dispose(); }
  });
  it('faces the movement direction using semantic front under a rotated parent', async () => {
    const world = await fixture();
    try {
      const parent = new THREE.Group(); parent.position.x=5; parent.rotation.y = Math.PI / 2; world.scene.add(parent);
      const child = actor(); parent.add(child); world.addCharacter({ id: 'Parented actor', object: child, frontYawRadians: Math.PI / 2 });
      world.setControlledEntity('Parented actor'); world.camera.position.set(0, 3, 7); world.camera.lookAt(0, 1, 0);
      world.step({ moveZRatio: -1 }, 60);
      const front = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).applyQuaternion(child.getWorldQuaternion(new THREE.Quaternion()));
      expect(front.z).toBeCloseTo(-1, 5); expect(front.x).toBeCloseTo(0, 5);
    } finally { world.dispose(); }
  });
  it('does not absorb independently registered skinned decorations into a rigid ancestor', async () => {
    const world = await fixture();
    try {
      const platform = new THREE.Mesh(new THREE.BoxGeometry(5, .5, 5), new THREE.MeshBasicMaterial()); platform.position.set(10, 0, 0);
      world.addEntity({ id: 'Platform', object: platform, role: 'obstacle' });
      const decoration = new THREE.SkinnedMesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshBasicMaterial()); platform.add(decoration);
      world.addEntity({ id: 'Skinned ornament', object: decoration, role: 'decoration' });
      expect(() => world.step()).not.toThrow();
      expect(world.execute({ type: 'entity.attach', childEntityId: 'Skinned ornament', parentEntityId: '地形:Main', positionMetersXYZ: [15, 0, 0] }).status).toBe('applied');
      expect(() => world.step()).not.toThrow(); world.reset(); expect(() => world.step()).not.toThrow();
    } finally { world.dispose(); }
  });
  it('keeps a supplied opening camera and runs ordinary Three update/interaction hooks', async () => {
    const world = await fixture();
    try {
      const at = world.camera.position.clone(); const rotation = world.camera.quaternion.clone(); const shape = new THREE.Mesh(new THREE.TorusKnotGeometry(), new THREE.MeshBasicMaterial());
      world.addEntity({ id: 'Turnable Object', object: shape }); let interactions = 0;
      world.onUpdate(({ deltaSeconds }) => { shape.rotation.y += deltaSeconds; }); world.onInteract('Turnable Object', () => interactions++);
      world.step({}, 60); world.interact('Turnable Object');
      expect(shape.rotation.y).toBeCloseTo(1, 6); expect(interactions).toBe(1); expect(world.camera.position.toArray()).toEqual(at.toArray()); expect(world.camera.quaternion.toArray()).toEqual(rotation.toArray());
      expect(world.snapshot().simulationTick).toBe(60); expect(world.physics.audit().engine).toBe('rapier');
    } finally { world.dispose(); }
  });
  it('updates nonphysical visibility and preserves state/revision after invalid commands', async () => {
    const world = await fixture();
    try {
      const decoration = new THREE.Mesh(new THREE.SphereGeometry(.2), new THREE.MeshBasicMaterial()); world.addEntity({ id: 'Small stone', object: decoration, role: 'decoration' }); world.step({}, 30);
      expect(world.execute({ type: 'entity.set-visible', entityId: 'Small stone', visible: false }).status).toBe('applied'); expect(decoration.visible).toBe(false);
      const before = world.snapshot(); expect(world.execute({ type: 'entity.set-scale', entityId: 'Player-A', scaleXYZ: [NaN, 1, 1] }).status).toBe('rejected');
      expect(world.snapshot()).toEqual(before);
      expect(world.execute({ type: 'entity.set-visible', entityId: 'Small stone', visible: true, extra: 1 } as never).status).toBe('rejected');
    } finally { world.dispose(); }
  });
  it('keeps attachments with actors and resets spawn/despawn/transform changes', async () => {
    const world = await fixture();
    try {
      const tail = new THREE.Group(); tail.add(new THREE.Mesh(new THREE.ConeGeometry(.3, 1), new THREE.MeshBasicMaterial())); tail.position.set(0, .7, .5);
      world.getObject('Player-A').add(tail); world.addEntity({ id: 'Nine tails', object: tail });
      world.registerPrototype('rock', () => ({ id: 'new', object: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()), role: 'obstacle' }));
      world.step({}, 60); const local = tail.position.clone(); world.step({ moveZRatio: -1, run: true }, 120);
      expect(tail.position.toArray()).toEqual(local.toArray()); expect(tail.getWorldPosition(new THREE.Vector3()).distanceTo(world.getObject('Player-A').getWorldPosition(new THREE.Vector3()))).toBeLessThan(1);
      expect(world.execute({ type: 'entity.spawn', prototypeId: 'rock', entityId: 'Rock-1', positionMetersXYZ: [10, .5, 1] }).status).toBe('applied');
      expect(world.execute({ type: 'entity.despawn', entityId: 'Nine tails' }).status).toBe('applied');
      world.reset(); expect(world.snapshot().entities.some(e => e.id === 'Rock-1')).toBe(false); expect(world.getObject('Nine tails').parent).toBe(world.getObject('Player-A')); expect(point(world)).toEqual([0, 0, 0]);
    } finally { world.dispose(); }
  });
  it('does not move a live object when a broken prototype returns the same object', async () => {
    const world = await fixture();
    try {
      const shared = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); world.addEntity({ id: 'Existing', object: shared });
      world.registerPrototype('bad', () => ({ id: 'alias', object: shared })); const before = world.snapshot();
      expect(world.execute({ type: 'entity.spawn', prototypeId: 'bad', entityId: 'Other', positionMetersXYZ: [20, 30, 40] }).status).toBe('rejected'); expect(world.snapshot()).toEqual(before);
    } finally { world.dispose(); }
  });
  it('has equal fixed-step movement for 30, 60, and 120 Hz input scheduling', async () => {
    const positions: readonly number[][] = [] as number[][];
    for (const fps of [30, 60, 120]) {
      const world = await fixture(); try {
        world.camera.position.set(0, 3, 7); world.camera.lookAt(0, 1, 0); world.step({}, 60);
        for (let frame = 0; frame < fps * 3; frame++) world.advance(1 / fps, { moveZRatio: -1, run: true });
        expect(world.simulationTick).toBe(240); (positions as number[][]).push([...point(world)]);
      } finally { world.dispose(); }
    }
    expect(positions[0]).toEqual(positions[1]); expect(positions[1]).toEqual(positions[2]); expect(Math.abs(positions[0]![2]!)).toBeGreaterThan(14);
  });
  it('uses a real navigation route around obstacles and reports unsupported navigation', async () => {
    const world = await fixture(true);
    try {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 10), new THREE.MeshBasicMaterial()); wall.position.set(4, 2, -2); world.addEntity({ id: 'Wall', object: wall, role: 'obstacle' });
      const npc = actor(); npc.position.set(1, .05, -2); world.addCharacter({ id: 'NPC', object: npc }); world.step({}, 60);
      const result = world.execute({ type: 'actor.move-to', entityId: 'NPC', targetPositionMetersXYZ: [8, 0, -2], run: true }); expect(result).toMatchObject({ status: 'applied' });
      world.step({}, 600); expect(new THREE.Vector3(...point(world, 'NPC')).distanceTo(new THREE.Vector3(8, 0, -2))).toBeLessThan(.8); expect(world.snapshot().errors).toEqual([]);
    } finally { world.dispose(); }
    const disabled = await fixture(false); try {
      disabled.addCharacter({ id: 'NPC', object: actor() }); const capabilities = disabled.capabilities() as { entityId: string; commands: string[] }[];
      expect(capabilities.find(c => c.entityId === 'NPC')!.commands).not.toContain('actor.move-to');
    } finally { disabled.dispose(); }
  }, 30_000);
  it('records original fixed-update failures and still releases later resources', async () => {
    const world = await fixture(); let disposed = false;
    world.onUpdate(() => { throw new Error('Moving bridge failed at hinge-7'); }); world.onDispose(() => { throw new Error('first cleanup'); }); world.onDispose(() => { disposed = true; });
    expect(() => world.step()).toThrow('Moving bridge failed at hinge-7'); expect(world.snapshot().errors[0]?.message).toContain('hinge-7'); world.dispose(); world.dispose(); expect(disposed).toBe(true);
  });
  it('restores the original controlled actor and full camera projection on reset', async () => {
    const world = await fixture();
    try {
      world.step({}, 30); const camera = world.camera as THREE.PerspectiveCamera; const fov = camera.fov;
      const later = actor(); later.position.set(5, .1, 0); world.addCharacter({ id: 'Later actor', object: later }); world.setControlledEntity('Later actor'); camera.fov = 85; camera.updateProjectionMatrix();
      world.reset(); expect(world.controlledEntityId).toBe('Player-A'); expect(camera.fov).toBe(fov); expect(() => world.step()).not.toThrow();
    } finally { world.dispose(); }
  });
  it('prevalidates scale changes affecting a child character before applying a command', async () => {
    const world = await fixture();
    try {
      const group = new THREE.Group(); group.position.x=5; world.addEntity({ id: 'Container', object: group });
      const npc = actor(); group.add(npc); world.addCharacter({ id: 'Child actor', object: npc }); world.step({}, 30);
      const before = world.snapshot(); const result = world.execute({ type: 'entity.set-scale', entityId: 'Container', scaleXYZ: [4, 1, 4] });
      expect(result.status).toBe('rejected'); expect(world.snapshot()).toEqual(before); expect(() => world.step()).not.toThrow();
    } finally { world.dispose(); }
  });
  it('uses world-space spawn coordinates beneath a transformed scene', async () => {
    const scene = new THREE.Scene(); scene.position.x = 10; const world = await createWorld({ scene, navigation: false });
    try {
      world.registerPrototype('small', () => ({ id: 'template', object: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()) }));
      expect(world.execute({ type: 'entity.spawn', prototypeId: 'small', entityId: 'Spawned', positionMetersXYZ: [2, 1, 0] }).status).toBe('applied');
      expect(point(world, 'Spawned')).toEqual([2, 1, 0]);
    } finally { world.dispose(); }
  });
  it('places a supplied parented follow camera in world coordinates', async () => {
    const scene = new THREE.Scene(); const rig = new THREE.Group(); rig.position.set(12, 0, 0); scene.add(rig);
    const camera = new THREE.PerspectiveCamera(); rig.add(camera); camera.position.set(-12, 2, 4); camera.lookAt(0, 1, 0);
    const world = await createWorld({ scene, camera, navigation: false });
    try {
      world.addCharacter({ id: 'hero', object: actor() }); world.setControlledEntity('hero'); world.setCameraFollow({ distanceMeters: 4, pitchRadians: 0, targetHeightMeters: 1.3, activateOnInput: false, transitionSeconds:0 }); world.step();
      const target = world.getObject('hero').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.3, 0));
      expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeCloseTo(4, 5);
    } finally { world.dispose(); }
  });
  it('removes a post-baseline replacement object with the same id when resetting', async () => {
    const world = await fixture();
    try {
      const original = new THREE.Group(); world.addEntity({ id: 'Object', object: original }); world.step();
      world.execute({ type: 'entity.despawn', entityId: 'Object' }); const replacement = new THREE.Group(); world.addEntity({ id: 'Object', object: replacement });
      world.reset(); expect(world.getObject('Object')).toBe(original); expect(replacement.parent).toBeNull();
    } finally { world.dispose(); }
  });
  it('does not retract a follow camera against a hidden child mesh', async () => {
    const world = await fixture();
    try {
      world.camera.position.set(0, 1.3, 4); world.camera.lookAt(0, 1.3, 0);
      const obstacle = new THREE.Group(); const child = new THREE.Mesh(new THREE.BoxGeometry(2, 3, .2), new THREE.MeshBasicMaterial()); child.position.set(0, 1.5, 2); obstacle.add(child);
      world.addEntity({ id: 'Hidden wall', object: obstacle, role: 'obstacle' }); child.visible = false;
      world.setCameraFollow({ distanceMeters: 4, pitchRadians: 0, targetHeightMeters: 1.3, activateOnInput: false, transitionSeconds:0 }); world.step();
      const target = world.getObject('Player-A').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.3, 0));
      expect(world.camera.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeCloseTo(4, 5);
    } finally { world.dispose(); }
  });
  it('distinguishes held jump from a new key press in the same simulation interval', async () => {
    const world = await fixture();
    try {
      world.step({}, 60); world.start(); world.keyboard.keyDown('Space');
      for (let i = 0; i < 120; i++) world.advance(1 / 60);
      expect(point(world)[1]).toBeLessThan(.05);
      world.keyboard.keyUp('Space'); world.keyboard.keyDown('Space');
      for (let i = 0; i < 12; i++) world.advance(1 / 60);
      expect(point(world)[1]).toBeGreaterThan(.6);
      world.stop();
    } finally { world.dispose(); }
  });
});

it('separates arrow orbit from WASD movement and Shift repeat never toggles run', () => {
  const keyboard = new WorldKeyboard(() => 10, () => {}); keyboard.enabled = true;
  keyboard.keyDown('ArrowUp'); keyboard.keyDown('ShiftLeft');
  for (let i = 0; i < 200; i++) { keyboard.keyDown('ShiftLeft', true); expect(keyboard.sample()).toMatchObject({ moveZRatio: 0, cameraPitchRatio: -1, run: true }); }
  keyboard.keyDown('KeyW'); keyboard.keyUp('ArrowUp'); expect(keyboard.sample().moveZRatio).toBe(-1);
  keyboard.keyUp('ShiftLeft'); expect(keyboard.sample().run).toBe(false); keyboard.keyUp('KeyW'); expect(keyboard.sample().moveZRatio).toBe(0);
  keyboard.keyDown('Space'); keyboard.keyUp('Space'); expect(keyboard.sample().jump).toBe(true); expect(keyboard.sample().jump).toBe(false); keyboard.clear();
  keyboard.keyDown('Space', true); keyboard.keyDown('KeyW', true); expect(keyboard.sample()).toMatchObject({ jump: false, jumpPressed: false, moveZRatio: 0 });
});
