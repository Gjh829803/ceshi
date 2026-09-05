import * as THREE from 'three';
import { createWorld, type CommandReceipt, type TaskScope, type WorldCommand } from '@worldkit/three';

const status = document.querySelector<HTMLDivElement>('#status')!;
const loading = document.querySelector<HTMLDivElement>('#loading')!;
async function main() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#acd0d9'); scene.fog = new THREE.Fog('#acd0d9', 42, 110);
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 180);
  const overviewPosition = new THREE.Vector3(19, 18, 24), overviewTarget = new THREE.Vector3(0, 0, -2);
  camera.position.copy(overviewPosition); camera.lookAt(overviewTarget);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setClearColor('#acd0d9');
  renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', 'Three SDK 可玩场景'); document.body.prepend(renderer.domElement);
  const world = await createWorld({ scene, camera, renderer });
  const ownedGeometries = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>();
  const material = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra }); ownedMaterials.add(m); return m; };
  const materials = { grass: material('#7eac74'), stone: material('#d2c5a7'), step: material('#eddfbc'), sand: material('#cfb783'), copper: material('#dc8c52'), dark: material('#333e36'), cream: material('#ffdfb3'), green: material('#37654c'), blue: material('#6ea5bc'), wood: material('#bd8755') };
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number] = [0, 0, 0]) => { ownedGeometries.add(geometry); const object = new THREE.Mesh(geometry, mat); object.position.fromArray(at); object.castShadow = true; object.receiveShadow = true; return object; };
  const box = (size: [number, number, number], at: [number, number, number], mat = materials.stone) => mesh(new THREE.BoxGeometry(...size), mat, at);
  const addFixed = (id: string, object: THREE.Object3D) => world.addEntity({ id, object, role: 'terrain', physics: { kind: 'fixed' } });
  scene.add(new THREE.HemisphereLight('#f4f7ed', '#58714d', 2.1));
  const sun = new THREE.DirectionalLight('#fff2d6', 3.2); sun.position.set(-15, 30, 16); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: .5, far: 90 }); sun.shadow.bias = -.0003; scene.add(sun);
  addFixed('meadow', box([36, .6, 34], [0, -.3, -2], materials.grass));
  // Real stair and sloped triangle geometry, solved by the one SDK Rapier world.
  for (let i = 0; i < 5; i++) { const h = .18 * (i + 1); addFixed(`step-${i + 1}`, box([3.4, h, .8], [-6, h / 2, -i * .8], materials.step)); }
  addFixed('stair-platform', box([3.4, .9, 2.4], [-6, .45, -4.8], materials.stone));
  const rampGeometry = new THREE.BufferGeometry(); rampGeometry.setAttribute('position', new THREE.Float32BufferAttribute([4, 0, 0, 7.4, 0, 0, 4, 1.2, -6, 7.4, 1.2, -6], 3)); rampGeometry.setIndex([0, 1, 2, 2, 1, 3]); rampGeometry.computeVertexNormals();
  addFixed('ramp', mesh(rampGeometry, materials.blue)); addFixed('ramp-platform', box([3.4, 1.2, 3], [5.7, .6, -7.5], materials.step));
  for (const [id, at, size] of [['north', [0, .35, -18.5], [36, .7, .4]], ['south', [0, .35, 14.5], [36, .7, .4]], ['west', [-17.5, .35, -2], [.4, .7, 34]], ['east', [17.5, .35, -2], [.4, .7, 34]]] as const) addFixed(`edge-${id}`, box([...size], [...at], materials.green));
  // These small visible stones deliberately have no collision; the role is inspectable.
  for (let i = 0; i < 18; i++) { const angle = i * 2.399; const stone = mesh(new THREE.DodecahedronGeometry(.14 + (i % 3) * .035, 0), materials.stone, [Math.cos(angle) * (10 + i % 4), .07, -2 + Math.sin(angle) * (9 + i % 3)]); stone.scale.set(1.3, .65, .9); world.addEntity({ id: `small-stone-${i}`, object: stone, role: 'decoration', tags: ['small-stone', 'no-collision'] }); }
  const goal = new THREE.Group(); goal.position.set(-9, .03, -10); const goalRing = mesh(new THREE.TorusGeometry(.85, .06, 6, 48), materials.copper); goalRing.rotation.x = Math.PI / 2; goal.add(goalRing); world.addEntity({ id: 'far-ring', object: goal, role: 'decoration', tags: ['npc-destination'] });
  const resizePillar = mesh(new THREE.CylinderGeometry(.5, .7, 1.5, 6), materials.copper, [-10, .75, 4]); world.addEntity({ id: 'scale-pillar', object: resizePillar, role: 'obstacle', physics: { kind: 'fixed' } });
  const beacon = new THREE.Group(); beacon.position.set(1.8, 0, 6.6); beacon.add(box([.55, .7, .55], [0, .35, 0], materials.dark));
  const glow = material('#ffbb77', { emissive: '#ed843e', emissiveIntensity: .9 }); const orb = mesh(new THREE.IcosahedronGeometry(.35, 1), glow, [0, 1.2, 0]); beacon.add(orb);
  world.addEntity({ id: 'beacon', object: beacon, role: 'decoration', tags: ['interactable', 'emissive-beacon'] });
  const gbot = await world.assets.load('humanoid.g-bot');
  gbot.object.position.set(0, .05, 7);
  gbot.object.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
  world.addCharacter({ id: 'player', asset: gbot, name: 'G Bot' }); world.setControlledEntity('player');
  // Complete free-form actor; all children belong to the observed/captured target.
  const fox = new THREE.Group(); fox.position.set(4, .05, 5); fox.name = 'Copper fox with full tail';
  const body = mesh(new THREE.SphereGeometry(.55, 16, 12), materials.copper, [0, .83, .05]); body.scale.set(.7, .9, 1.25); fox.add(body);
  const head = mesh(new THREE.SphereGeometry(.43, 16, 12), materials.copper, [0, 1.21, -.6]); head.scale.set(1, .95, 1.15); fox.add(head);
  const muzzle = mesh(new THREE.SphereGeometry(.25, 12, 8), materials.cream, [0, 1.1, -.94]); muzzle.scale.set(.9, .7, 1.25); fox.add(muzzle, mesh(new THREE.SphereGeometry(.085, 10, 8), materials.dark, [0, 1.13, -1.19]));
  for (const x of [-.24, .24]) { fox.add(mesh(new THREE.ConeGeometry(.19, .55, 4), materials.copper, [x, 1.65, -.55])); fox.add(mesh(new THREE.SphereGeometry(.065, 10, 8), materials.dark, [x, 1.31, -.94])); }
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-.27, -.4], [.27, -.4], [-.27, .45], [.27, .45]]) { const leg = new THREE.Group(); leg.position.set(x!, .65, z!); leg.add(mesh(new THREE.CapsuleGeometry(.105, .34, 4, 10), materials.copper, [0, -.24, 0]), box([.23, .16, .32], [0, -.53, -.055], materials.dark)); fox.add(leg); legs.push(leg); }
  const tail = new THREE.Group(); tail.position.set(0, .84, .53); const tailBase = mesh(new THREE.CapsuleGeometry(.24, .8, 6, 12), materials.copper, [0, .3, .58]); tailBase.rotation.x = .95;
  const tailTip = mesh(new THREE.CapsuleGeometry(.19, .38, 6, 12), materials.cream, [0, .76, 1.17]); tailTip.rotation.x = .68; tail.add(tailBase, tailTip); fox.add(tail);
  world.addCharacter({ id: 'copper-fox', object: fox, name: 'Copper fox', body: { heightMeters: 1.8, radiusMeters: .35 }, movement: { kind: 'ground', walkSpeedMetersPerSecond: 2.2 }, tags: ['custom-character', 'complete-tail'] });
  const announce = (message: string) => { status.textContent = message; };
  const serial = world.state.define('crates.serial', 0), crates = world.state.define<string[]>('crates.ids', []);
  const lit = world.defineParameter({ id: 'beacon.lit', description: 'Light the beacon',
    schema: { type: 'boolean' }, initialValue: false, writes: [{ kind: 'visual', channelId: 'beacon.material' }],
    effect: value => { glow.color.set(value ? '#9cebd0' : '#ffbb77'); glow.emissive.set(value ? '#30b78e' : '#ed843e'); } });
  world.onInteract('beacon', () => ({ type: 'parameter.set', parameterId: lit.id, value: !lit.value }));
  const sky = world.defineParameter({ id: 'sky.mode', description: 'Daylight or aurora sky',
    schema: { type: 'string', enum: ['day', 'aurora'] }, initialValue: 'day',
    writes: [{ kind: 'visual', channelId: 'scene.sky' }],
    effect: value => { scene.background = new THREE.Color(value === 'aurora' ? '#183158' : '#acd0d9');
      if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background); } });
  const large = world.defineParameter({ id: 'pillar.large', description: 'Enlarge the stone pillar',
    schema: { type: 'boolean' }, initialValue: false,
    writes: [{ kind: 'entity', entityId: 'scale-pillar', channels: ['scale'] }],
    plan: value => [{ type: 'entity.set-scale', entityId: 'scale-pillar', scaleLocalXYZ: value ? [1.5, 1.5, 1.5] : [1, 1, 1] }] });
  // Player intent only: this does not implement aerial NPC pathfinding.
  world.registerMovement({ id: 'hover-flight', version: 1, description: 'Controlled hover; hold Space to rise, release to descend; no flight navigation',
    initialState: { elapsedSeconds: 0 }, update: ({ state, deltaSeconds, input, desiredDirectionWorldXYZ }) => ({
      state: { elapsedSeconds: state.elapsedSeconds + deltaSeconds }, applyGravity: false,
      velocityWorldMetersPerSecondXYZ: [desiredDirectionWorldXYZ[0] * (input.run ? 6 : 3), input.jump ? 2 : -.7, desiredDirectionWorldXYZ[2] * (input.run ? 6 : 3)],
    }) });
  const bridge = box([3, .3, 3], [10, .15, -3], materials.wood);
  world.addEntity({ id: 'bridge', object: bridge, role: 'terrain' });
  await world.registerGeometry({ id: 'bridge.short', description: 'Short bridge deck', geometry: bridge.geometry });
  await world.registerGeometry({ id: 'bridge.long', description: 'Long bridge deck', geometry: new THREE.BoxGeometry(3, .3, 8) });
  await world.registerPrototype({ id: 'wood-crate', description: 'A physical wooden crate',
    template: { kind: 'entity', options: { object: box([.8, .8, .8], [0, 0, 0], materials.wood),
      role: 'obstacle', physics: { kind: 'dynamic', shape: 'box', massKilograms: 2 }, tags: ['spawned-crate'] } } });
  world.setAutonomy('copper-fox', { kind: 'patrol', waypointPositionsWorldMetersXYZ: [[4, 0, 5], [6, 0, 1], [0, 0, 1]], pauseSeconds: 1 });
  async function complete(receipt: CommandReceipt, scope: TaskScope) {
    if (receipt.status === 'rejected') throw receipt.error;
    if (receipt.status === 'accepted') {
      const terminal = await world.operations.wait(receipt.operationId, { signal: scope.signal });
      if (terminal.status !== 'succeeded') throw terminal.error ?? new Error(`Operation ${terminal.status}`);
    }
  }
  async function command(value: WorldCommand) {
    const receipt = await world.execute(value);
    if (receipt.status === 'rejected') { announce(`${receipt.error.code}: ${receipt.error.message}`); return; }
    announce(`${value.type} · ${receipt.status}`);
    if (receipt.status === 'accepted') {
      void world.operations.wait(receipt.operationId).then(result => announce(`${value.type} · ${result.status}${result.error ? ': ' + result.error.message : ''}`))
        .catch(error => announce(String(error)));
    }
  }
  function button(id: string, action: () => void | Promise<void>) {
    const element = document.getElementById(id) as HTMLButtonElement | null;
    if (!element) throw new Error(`Missing button ${id}`);
    element.addEventListener('click', () => {
      element.disabled = true;
      Promise.resolve().then(action).catch(error => announce(error?.message ?? String(error)))
        .finally(() => { element.disabled = false; renderer.domElement.focus(); });
    });
  }
  button('play', async () => { if (world.snapshot().isRunning) world.stop(); else await world.start();
    document.getElementById('play')!.textContent = world.snapshot().isRunning ? '暂停游玩' : '继续游玩'; });
  button('reset', async () => { await world.reset(); announce('场景与扩展已重置'); });
  button('interact', () => command({ type: 'parameter.set', parameterId: lit.id, value: !lit.value }));
  button('visibility', () => command({ type: 'entity.set-visible', entityId: 'beacon', isVisible: !world.getEntityState('beacon').isVisibleLocal }));
  button('resize', () => command({ type: 'parameter.set', parameterId: large.id, value: !large.value }));
  button('sky', () => command({ type: 'parameter.set', parameterId: sky.id, value: sky.value === 'day' ? 'aurora' : 'day' }));
  button('flight', () => command({ type: 'actor.set-movement', entityId: 'player', movementId: 'hover-flight' }));
  button('ground', () => command({ type: 'actor.set-movement', entityId: 'player', movementId: 'ground' }));
  button('bridge-long', () => command({ type: 'entity.set-geometry', entityId: 'bridge', geometryId: 'bridge.long' }));
  button('bridge-short', () => command({ type: 'entity.set-geometry', entityId: 'bridge', geometryId: 'bridge.short' }));
  button('spawn', () => world.runTask(async scope => {
    const index = serial.value + 1, id = `spawned-crate-${index}`;
    await complete(await scope.execute({ type: 'entity.spawn', prototypeId: 'wood-crate', entityId: id,
      positionWorldMetersXYZ: [-3 + crates.value.length % 3, 2, 4] }), scope);
    scope.setState(serial, index); scope.setState(crates, [...crates.value, id]); announce(`已生成 ${id}`);
  }));
  button('despawn', () => world.runTask(async scope => {
    const id = crates.value.at(-1); if (!id) { announce('暂无生成木箱'); return; }
    await complete(await scope.execute({ type: 'entity.despawn', entityId: id }), scope);
    scope.setState(crates, crates.value.filter(value => value !== id));
  }));
  button('action', () => command({ type: 'entity.play-action', entityId: 'player', actionId: 'dance.rumba', playback: 'once' }));
  button('move', () => command({ type: 'actor.move-to', entityId: 'copper-fox', targetPositionWorldMetersXYZ: [-9, 0, -10] }));
  button('follow', () => command({ type: 'actor.follow', entityId: 'copper-fox', targetEntityId: 'player', distanceMeters: 2.2 }));
  button('stop', () => command({ type: 'actor.stop', entityId: 'copper-fox' }));
  button('resume', () => command({ type: 'actor.resume-autonomy', entityId: 'copper-fox' }));
  button('overview', () => { if (world.cameraMode === 'authored') world.setCameraFollow({ targetEntityId: 'player', distanceMeters: 7, activateOnInput: false });
    else { world.useAuthoredCamera(); camera.position.copy(overviewPosition); camera.lookAt(overviewTarget); } });
  world.onUpdate(({ simulationSeconds, deltaSeconds }) => {
    const velocity = world.getEntityState('copper-fox').motion?.velocityWorldMetersPerSecondXYZ;
    const speed = velocity ? Math.hypot(velocity[0], velocity[2]) : 0;
    tail.rotation.z = Math.sin(simulationSeconds * 3) * .2; tail.rotation.y = Math.sin(simulationSeconds * 2.2) * .18;
    for (let i = 0; i < legs.length; i++) legs[i]!.rotation.x = Math.sin(simulationSeconds * 10 + (i % 3 ? Math.PI : 0)) * Math.min(speed * .22, .6);
    orb.rotation.y += deltaSeconds * .8;
  });
  world.onReset(() => { tail.rotation.set(0, 0, 0); legs.forEach(leg => leg.rotation.set(0, 0, 0)); orb.rotation.set(0, 0, 0); });
  world.onDispose(() => { for (const geometry of ownedGeometries) geometry.dispose(); for (const mat of ownedMaterials) mat.dispose(); renderer.dispose(); });
  world.setCameraFollow({ targetEntityId: 'player', distanceMeters: 7, pitchRadians: .42, targetHeightMeters: 1.1, activateOnInput: true });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  world.setCaptureTargets(['player', 'copper-fox', 'stair-platform', 'ramp-platform', 'beacon', 'bridge']);
  await world.start(); loading.hidden = true; document.getElementById('play')!.textContent = '暂停游玩';
  announce('已就绪 · 地面 / 悬浮输入 / 天空 / 桥梁 / NPC');
}
main().catch(error => { loading.textContent = `场景启动失败：${error instanceof Error ? error.message : String(error)}`; console.error(error); });
