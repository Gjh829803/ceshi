import * as THREE from 'three';
import {createHumanoidWorld,humanoid,type EnvironmentDefinition,type VehicleSpec} from '@worldkit/three';

// Select handling first; this returns configuration only, never a vehicle model.
const spec=humanoid.createRoadVehicleSpec('motorcycle');
spec.id='custom-bike';spec.speed=12;spec.maxSpeed=16;
const physics=spec.wheelPhysics;

const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight(0xffffff,0xbbbbbb,2));
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,300);
camera.position.set(7,4,-8);camera.lookAt(0,1,0);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
// Map boxes use world-space metres: position is the centre, size is the full XYZ extent.
const map:EnvironmentDefinition={id:'custom-bike-course',name:'自建摩托',description:'预设人物上下车，载具只包含机械结构',
 bounds:{min:[-60,-5,-60],max:[60,30,60]},
 boxes:[{id:'ground',position:[0,-.1,0],size:[120,.2,120],color:'#dddddd'}],
 water:[],
 // A region enables the vehicle family; a spawn places this instance in that region.
 regions:[{id:'course',name:'骑行场地',description:'平地驾驶',center:[0,0,0],size:[110,110],color:'#dddddd',modes:['character','bike']}],
 spawns:[{id:'bike-start',vehicleId:'custom-bike',name:'摩托起点',position:[0,0,0],yaw:0,regionId:'course'}],
 playerSpawn:[1.7,0,-.2]};
for(const box of map.boxes){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),new THREE.MeshStandardMaterial({color:box.color}));
 mesh.position.set(...box.position);scene.add(mesh);
}

// Author the vehicle around the selected dimensions; no supplied vehicle model is loaded.
// Only the vehicle is authored here: do not add a torso, head, limbs or a second rider.
const bike=new THREE.Group();
const frameMaterial=new THREE.MeshStandardMaterial({color:'#eeeeee',roughness:1});
const darkMaterial=new THREE.MeshStandardMaterial({color:'#777777',roughness:1});
function part(size:[number,number,number],position:[number,number,number],material=frameMaterial){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);bike.add(mesh);return mesh;
}
const wheelRigs:{steering:THREE.Group;spin:THREE.Group;radius:number}[]=[];
for(const [index,{x,z}] of physics.wheels.entries()){
 const wheel=new THREE.Mesh(new THREE.CylinderGeometry(physics.radius,physics.radius,physics.wheelWidth,16),darkMaterial);
 wheel.rotation.z=Math.PI/2;
 const steering=new THREE.Group(),spin=new THREE.Group();steering.name=`wheel.${index}.steer`;spin.name=`wheel.${index}.spin`;steering.position.set(x,physics.hubHeight,z);spin.add(wheel);steering.add(spin);bike.add(steering);wheelRigs.push({steering,spin,radius:physics.radius});
 part([.12,.65,.12],[0,.72,z]);
}
part([.4,.3,1.3],[0,.62,0]);
const cushionCenter:[number,number,number]=[spec.seat[0],spec.seat[1]-.165-.05,spec.seat[2]];
const cushionSize:[number,number,number]=[.36,.1,.6];
part(cushionSize,cushionCenter,darkMaterial);
part([.32,.25,.4],[0,.94,.4]);
part([.1,.35,.1],[0,1.08,.72]);
part([.8,.08,.08],[0,1.23,.72],darkMaterial);
part([.8,.06,.14],[0,.46,-.1],darkMaterial);

// spec.seat is the pelvis anchor. The narrow cushion uses 0.165 m pose clearance.
// Keep this fit when drawing a new saddle, or verify the changed seat with the real rider.
const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'person',
 vehicles:[{instanceId:'custom-bike',assetId:'custom.motorcycle',object:bike,spec}]});
// Optional mechanical presentation; the SDK still owns chassis movement and time.
const mechanical={wheelRigs,steering:[wheelRigs[1]!.steering]};
world.humanoid!.onVisualUpdate((dt,sample)=>{const runtime=world.humanoid!,state=runtime.simulation.vehicles[0]!;humanoid.updateVehicleWheels(mechanical,sample.vehicles[0]!,{dt,grounded:state.grounded,revision:runtime.simulation.teleportRevision,active:runtime.simulation.vehicle===state});});
// createHumanoidWorld owns the one preset character for walking, riding and reset.
// Never hide/recreate it when mounted; vehicle and character keep separate SDK-owned roots.
world.setCaptureTargets(['person','custom-bike']);
const presentation=world.createPresentation();
const recover=document.createElement('button');recover.textContent='扶正车辆';
recover.onclick=()=>{void world.execute({type:'vehicle.recover'}).then(()=>presentation.focus());};
presentation.ui.mount(recover);
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;background:#333c;color:white;padding:12px;font:14px sans-serif;white-space:pre';
presentation.ui.mount(hud);
world.onUpdate(()=>{const state=world.snapshot().humanoid;hud.textContent=`预设人物 + 自建摩托\nWASD 移动 / 驾驶 · F 上下车 · Space 制动\n${state?.mountedInstanceId?'骑乘':'步行'} · ${state?.message??''}`;});
await world.start();presentation.focus();
