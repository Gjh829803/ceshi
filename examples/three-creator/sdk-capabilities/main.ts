import * as THREE from 'three';
import { createWorld, loadAsset, type AssetDefinition, type WorldCommand } from '@worldkit/three';

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
  for (let i = 0; i < 18; i++) { const angle = i * 2.399; const stone = mesh(new THREE.DodecahedronGeometry(.14 + (i % 3) * .035, 0), materials.stone, [Math.cos(angle) * (10 + i % 4), .07, -2 + Math.sin(angle) * (9 + i % 3)]); stone.scale.set(1.3, .65, .9); world.addEntity({ id: `small-stone-${i}`, object: stone, role: 'decoration', physics: { kind: 'none' }, tags: ['small-stone', 'no-collision'] }); }
  const goal = new THREE.Group(); goal.position.set(-9, .03, -10); const goalRing = mesh(new THREE.TorusGeometry(.85, .06, 6, 48), materials.copper); goalRing.rotation.x = Math.PI / 2; goal.add(goalRing); world.addEntity({ id: 'far-ring', object: goal, role: 'decoration', tags: ['npc-destination'] });
  const resizePillar = mesh(new THREE.CylinderGeometry(.5, .7, 1.5, 6), materials.copper, [-10, .75, 4]); world.addEntity({ id: 'scale-pillar', object: resizePillar, role: 'obstacle', physics: { kind: 'fixed' } });
  const beacon = new THREE.Group(); beacon.position.set(1.8, 0, 6.6); beacon.add(box([.55, .7, .55], [0, .35, 0], materials.dark));
  const glow = material('#ffbb77', { emissive: '#ed843e', emissiveIntensity: .9 }); const orb = mesh(new THREE.IcosahedronGeometry(.35, 1), glow, [0, 1.2, 0]); beacon.add(orb);
  world.addEntity({ id: 'beacon', object: beacon, role: 'decoration', tags: ['interactable', 'emissive-beacon'] });
  const response = await fetch('./asset-definitions.json'); if (!response.ok) throw new Error(`ASSET_DEFINITIONS_HTTP_${response.status}`);
  const assetDocument = await response.json() as { assets: AssetDefinition[] }; const definition = assetDocument.assets.find(asset => asset.id === 'humanoid.g-bot'); if (!definition) throw new Error('GBOT_DEFINITION_MISSING');
  const gbot = await loadAsset(definition, { baseUri: location.href }); gbot.object.position.set(0, .05, 7); gbot.object.traverse(object => { if ((object as THREE.Mesh).isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  world.addCharacter({ id: 'player', object: gbot.object, asset: gbot, name: 'G Bot', character: { heightMeters: 1.8, radiusMeters: .35 } }); world.setControlledEntity('player'); gbot.play('idle'); gbot.update(0);
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
  world.addCharacter({ id: 'copper-fox', object: fox, name: 'Copper fox', character: { heightMeters: 1.8, radiusMeters: .35, walkSpeedMetersPerSecond: 2.2 }, tags: ['custom-character', 'complete-tail'] });
  let interactions = 0, spawned = 0, large = false; const crates: string[] = []; let overview = true;
  const announce = (message: string) => { status.textContent = message; };
  const command = (value: WorldCommand) => { const result = world.execute(value); announce(result.status === 'applied' ? `${value.type} · applied` : result.error?.message ?? 'command rejected'); world.render(); return result; };
  world.onInteract('beacon', () => { interactions++; glow.color.set(interactions % 2 ? '#9cebd0' : '#ffbb77'); glow.emissive.set(interactions % 2 ? '#30b78e' : '#ed843e'); announce(`信标响应 ${interactions} 次 · 真实 E 交互`); });
  world.registerPrototype('wood-crate', () => ({ id: 'prototype-crate', object: box([.8, .8, .8], [0, 0, 0], materials.wood), role: 'obstacle', physics: { kind: 'dynamic', shape: 'box', massKilograms: 2 }, tags: ['spawned-crate'] }));
  const button = (id: string, action: () => void) => { globalThis.document.getElementById(id)!.addEventListener('click', () => { action(); renderer.domElement.focus(); }); };
  button('play', () => { if (world.isRunning) { world.stop(); announce('已暂停'); } else { world.start(); announce('WASD 移动 · Shift 跑步'); } globalThis.document.getElementById('play')!.textContent = world.isRunning ? '暂停游玩' : '开始游玩'; });
  button('reset', () => { world.reset(); announce('场景已重置'); });
  button('interact', () => { world.interact('beacon'); world.render(); });
  button('visibility', () => { command({ type: 'entity.set-visible', entityId: 'beacon', visible: !beacon.visible }); });
  button('resize', () => { large = !large; command({ type: 'entity.set-scale', entityId: 'scale-pillar', scaleXYZ: large ? [1.5, 1.5, 1.5] : [1, 1, 1] }); });
  button('spawn', () => { const id = `spawned-crate-${++spawned}`; if (command({ type: 'entity.spawn', prototypeId: 'wood-crate', entityId: id, positionMetersXYZ: [-3 + crates.length % 3, 2, 4] }).status === 'applied') crates.push(id); });
  button('despawn', () => { const id = crates.pop(); if (id) command({ type: 'entity.despawn', entityId: id }); else announce('暂无生成木箱'); });
  button('action', () => { command({ type: 'entity.play-action', entityId: 'player', actionId: 'dance.rumba' }); });
  button('move', () => { command({ type: 'actor.move-to', entityId: 'copper-fox', targetPositionMetersXYZ: [-9, 0, -10] }); world.start(); });
  button('follow', () => { command({ type: 'actor.follow', entityId: 'copper-fox', targetEntityId: 'player', distanceMeters: 2.2 }); world.start(); });
  button('stop', () => { command({ type: 'actor.stop', entityId: 'copper-fox' }); });
  button('overview', () => { overview = !overview; if (overview) { camera.position.copy(overviewPosition); camera.lookAt(overviewTarget); } world.setCameraFollow({ targetEntityId: 'player', distanceMeters: 7, pitchRadians: .42, targetHeightMeters: 1.1, activateOnInput: overview }); world.render(); });
  world.onUpdate(({ simulationTick, deltaSeconds }) => { const state = world.physics.state('copper-fox'); const speed = state ? Math.hypot(state.velocityMetersPerSecondXYZ[0], state.velocityMetersPerSecondXYZ[2]) : 0; const phase = simulationTick * deltaSeconds; tail.rotation.z = Math.sin(phase * 3) * .2; tail.rotation.y = Math.sin(phase * 2.2) * .18; for (let i = 0; i < legs.length; i++) legs[i]!.rotation.x = Math.sin(phase * 10 + (i % 3 ? Math.PI : 0)) * Math.min(speed * .22, .6); orb.rotation.y += deltaSeconds * .8; });
  world.onReset(() => { gbot.play('idle'); gbot.update(0); interactions = 0; spawned = 0; large = false; crates.length = 0; tail.rotation.set(0, 0, 0); legs.forEach(leg => leg.rotation.set(0, 0, 0)); orb.rotation.set(0, 0, 0); glow.color.set('#ffbb77'); glow.emissive.set('#ed843e'); });
  world.onDispose(() => { for (const geometry of ownedGeometries) geometry.dispose(); for (const mat of ownedMaterials) mat.dispose(); renderer.dispose(); });
  world.setCameraFollow({ targetEntityId: 'player', distanceMeters: 7, pitchRadians: .42, targetHeightMeters: 1.1, activateOnInput: true });
  addEventListener('resize', () => world.resize(innerWidth, innerHeight));
  world.expose({ targetEntityIds: ['player', 'copper-fox', 'stair-platform', 'ramp-platform', 'beacon'] }); world.render(); loading.hidden = true; announce('已就绪 · G Bot / Rapier / 自定义完整角色');
  if (new URLSearchParams(location.search).get('play') === '1') { world.start(); globalThis.document.getElementById('play')!.textContent = '暂停游玩'; }
}
main().catch(error => { loading.textContent = `场景启动失败：${error instanceof Error ? error.message : String(error)}`; console.error(error); });
