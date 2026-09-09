import * as THREE from 'three';
import {createHumanoidWorld, type HumanoidAssetDefinition, type TrainingMap, type TrainingVehicleSpec} from '@worldkit/three';
import {applyWhiteboxMaterials} from './whitebox-materials';

// Creator packages exactly the assets selected in project.json, including the humanoid actions.
type CatalogAsset = HumanoidAssetDefinition & {training?: {spec: TrainingVehicleSpec}};
const response = await fetch('./asset-definitions.json');
if (!response.ok) throw new Error(`Asset catalog failed: HTTP ${response.status}`);
const catalog = await response.json() as {assets: CatalogAsset[]};
const roverAsset = catalog.assets.find(asset => asset.id === 'training.rover');
if (!roverAsset?.training) throw new Error('Select training.rover in project.json');
const assetDefinitions = Object.fromEntries(catalog.assets.map(asset => [asset.id, asset]));

const scene = new THREE.Scene();
scene.background = new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 2));
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .08, 200);
const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100vw;height:100vh';
document.body.append(canvas);

// Box centres and full sizes are in metres. Visuals and collision use the same boxes.
const map: TrainingMap = {
  id: 'vehicle-camera', name: 'Rover camera and glass',
  description: 'Walk beside the open cabin, drive, orbit through glass and compare the solid wall.',
  bounds: {min: [-30, -5, -30], max: [30, 20, 30]},
  boxes: [
    {id: 'ground', position: [0, -.1, 0], size: [60, .2, 60], color: '#dddddd'},
    {id: 'wall', position: [-4, 1.5, 0], size: [.4, 3, 8], color: '#eeeeee'},
  ],
  water: [],
  regions: [{id: 'course', name: 'Flat course', description: 'Walking and driving',
    center: [0, 0, 0], size: [58, 58], color: '#dddddd', modes: ['character', 'wheeled']}],
  spawns: [{id: 'rover-start', vehicleId: 'rover', name: 'Rover', position: [0, 0, 0], yaw: 0, regionId: 'course'}],
  playerSpawn: [1.9, 0, 0],
};
const environmentMeshes = map.boxes.map(box => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...box.size),
    new THREE.MeshStandardMaterial({color: box.color ?? '#eeeeee', roughness: 1, metalness: 0}));
  mesh.name = box.id; mesh.position.set(...box.position); scene.add(mesh);
  return mesh;
});

// Retain the supplied rover geometry, seat and movement envelope, with a separate preset rider.
const rover = new THREE.Group();
const world = await createHumanoidWorld({scene, camera, canvas, map, assetDefinitions, characterId: 'person',
  vehicles: [{instanceId: 'rover', assetId: 'training.rover', object: rover,
    spec: structuredClone(roverAsset.training.spec)}],
  profile: {
    view: {defaultPerspective: 'third-person', keyboardToggleEnabled: true},
    cameraDistanceMeters: 11,
    // speed: m/s; accel: m/s². Other handling and actual collider dimensions retain the preset.
    vehicles: {rover: {speed: 12, accel: 6}},
  },
});
world.onDispose(() => {
  for (const mesh of environmentMeshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
});
try {
  const model = await world.assets.load('training.rover');
  rover.add(model.object);
  world.onDispose(applyWhiteboxMaterials(model.object));
} catch (error) { world.dispose(); throw error; }
world.setCaptureTargets(['person', 'rover']);

const presentation = world.createPresentation();
const hud = document.createElement('div');
hud.style.cssText = 'position:absolute;left:16px;top:16px;padding:12px;background:#333c;color:white;font:14px sans-serif';
const status = document.createElement('div');
status.style.whiteSpace = 'pre-line';
const reset = document.createElement('button');
reset.textContent = 'Reset'; reset.style.marginTop = '8px';
reset.onclick = async () => { await world.reset(); presentation.focus(); };
hud.append(status, reset); presentation.ui.mount(hud);
world.onUpdate(() => {
  const state = world.snapshot().training!;
  status.textContent = `Rover camera and glass\nWASD move / drive · F enter / exit · Space brake\nDrag to orbit · T third person / first person / shoulder\n${state.mountedInstanceId ? 'Driving' : 'On foot'} · ${['Third person', 'First person', 'Shoulder'][state.cameraMode]}\n${state.message}`;
});
await world.start(); presentation.focus();
