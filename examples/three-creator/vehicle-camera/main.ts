import * as THREE from 'three';
import {createHumanoidWorld, humanoid, type EnvironmentDefinition} from '@worldkit/three';
import {applyWhiteboxMaterials} from './whitebox-materials';

// Choose automobile handling before authoring the model. This contains no geometry.
const spec=humanoid.createRoadVehicleSpec('car');spec.id='rover';spec.speed=12;spec.maxSpeed=16;
const physics=spec.wheelPhysics;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 2));
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .08, 200);
const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100vw;height:100vh';
document.body.append(canvas);

// Box centres and full sizes are in metres. Visuals and collision use the same boxes.
const map: EnvironmentDefinition = {
  id: 'vehicle-camera', name: 'Self-drawn car camera and glass',
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

// Self-drawn open car: dimensions, wheel layout and seat come from the selected configuration.
const rover = new THREE.Group();
const bodyMaterial=new THREE.MeshStandardMaterial({color:'#eeeeee',roughness:1});
const rubber=new THREE.MeshStandardMaterial({color:'#666666',roughness:1});
const glass=new THREE.MeshStandardMaterial({color:'#cccccc',transparent:true,opacity:.25,side:THREE.DoubleSide});
function part(size:[number,number,number],position:[number,number,number],material=bodyMaterial){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);rover.add(mesh);return mesh;
}
const halfWidth=spec.envelope.halfExtents[0],halfLength=spec.envelope.halfExtents[2];
part([halfWidth*2-.2,.18,halfLength*2-.4],[0,.5,0]);
part([halfWidth*2-.2,.35,.9],[0,.8,halfLength-.7]);
part([halfWidth*2-.2,.4,.7],[0,.85,-halfLength+.6]);
for(const side of [-1,1])part([.12,.45,2.3],[side*(halfWidth-.15),.8,0]);
part([.72,.13,.5],[spec.seat[0],spec.seat[1]-.125-.065,spec.seat[2]],rubber);
part([.72,.65,.12],[spec.seat[0],spec.seat[1]+.12,spec.seat[2]-.3]);
part([halfWidth*2-.4,.65,.035],[0,1.35,.8],glass);
const wheelRigs:{steering:THREE.Group;spin:THREE.Group;radius:number}[]=[];
for(const [index,{x,z}] of physics.wheels.entries()){
  const steering=new THREE.Group(),spin=new THREE.Group();
  steering.name=`wheel.${index}.steer`;spin.name=`wheel.${index}.spin`;
  steering.position.set(x,physics.hubHeight,z);
  const wheel=new THREE.Mesh(new THREE.CylinderGeometry(physics.radius,physics.radius,physics.wheelWidth,16),rubber);
  wheel.rotation.z=Math.PI/2;spin.add(wheel);steering.add(spin);rover.add(steering);
  wheelRigs.push({steering,spin,radius:physics.radius});
}
const mechanical={wheelRigs,steering:wheelRigs.filter((_,i)=>physics.wheels[i]!.steering).map(r=>r.steering)};
const world = await createHumanoidWorld({scene, camera, canvas, map, characterId: 'person',
  vehicles: [{instanceId: 'rover', assetId: 'custom.car', object: rover,
    spec}],
  profile: {
    view: {defaultPerspective: 'third-person', keyboardToggleEnabled: true},
    cameraDistanceMeters: 11,
  },
});
world.onDispose(() => {
  for (const mesh of environmentMeshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
});
world.onDispose(applyWhiteboxMaterials(rover));
world.humanoid!.onVisualUpdate((dt,sample)=>{
  const runtime=world.humanoid!,state=runtime.simulation.vehicles[0]!;
  humanoid.updateVehicleWheels(mechanical,sample.vehicles[0]!,{dt,grounded:state.grounded,revision:sample.epoch});
});
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
  const state = world.snapshot().humanoid!;
  status.textContent = `Self-drawn car camera and glass\nWASD move / drive · F enter / exit · Space brake\nDrag to orbit · T third person / first person / shoulder\n${state.mountedInstanceId ? 'Driving' : 'On foot'} · ${['Third person', 'First person', 'Shoulder'][state.cameraMode]}\n${state.message}`;
});
await world.start(); presentation.focus();
