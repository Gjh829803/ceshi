import * as THREE from 'three';
import {createHumanoidWorld,training,type TrainingMap,type TrainingVehicleSpec} from '@worldkit/three';

const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight(0xffffff,0xbbbbbb,2));
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,300);
camera.position.set(7,4,-8);camera.lookAt(0,1,0);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const map:TrainingMap={id:'custom-bike-course',name:'自建摩托',description:'预设人物上下车，载具只包含机械结构',
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

// This example demonstrates composition, not a replacement for a suitable catalog bike.
// Only the vehicle is authored here: do not add a torso, head, limbs or a second rider.
const bike=new THREE.Group();
const frameMaterial=new THREE.MeshStandardMaterial({color:'#eeeeee',roughness:1});
const darkMaterial=new THREE.MeshStandardMaterial({color:'#777777',roughness:1});
function part(size:[number,number,number],position:[number,number,number],material=frameMaterial){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);bike.add(mesh);return mesh;
}
const wheelRigs:{steering:THREE.Group;spin:THREE.Group;radius:number}[]=[];
for(const z of [-.85,.85]){
 const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.16,16),darkMaterial);
 wheel.rotation.z=Math.PI/2;
 const steering=new THREE.Group(),spin=new THREE.Group();steering.position.set(0,.4,z);spin.add(wheel);steering.add(spin);bike.add(steering);wheelRigs.push({steering,spin,radius:.4});
 part([.12,.65,.12],[0,.72,z]);
}
part([.4,.3,1.3],[0,.62,0]);
part([.36,.1,.6],[0,.94,-.2],darkMaterial);
part([.32,.25,.4],[0,.94,.4]);
part([.1,.35,.1],[0,1.08,.72]);
part([.8,.08,.08],[0,1.23,.72],darkMaterial);
part([.8,.06,.14],[0,.46,-.1],darkMaterial);

// The seat is the rider pelvis anchor in vehicle-local metres. Positive Z is forward.
// The standard vehicle pose uses the existing skeleton; this is not automatic hand/foot IK.
const spec:TrainingVehicleSpec={id:'custom-bike',name:'自建摩托',en:'CUSTOM BIKE',mode:'bike',kernel:'K02',archetype:'bike',color:'#eeeeee',
 spawn:[0,0,0],yaw:0,speed:12,accel:6,grip:13,steer:1.12,radius:.85,seat:[0,.99,-.2],camera:6.8,
 hint:'W/S 油门与制动 · A/D 转向 · Space 刹车 · F 上下车',
 envelope:{kind:'box',halfExtents:[.55,1.2,1.3],offset:[0,1.2,0]}};
const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'person',
 vehicles:[{instanceId:'custom-bike',assetId:'custom.motorcycle',object:bike,spec}]});
// Optional mechanical presentation; the SDK still owns chassis movement and time.
const mechanical={wheelRigs,steering:[wheelRigs[1]!.steering]};
world.training!.onVisualUpdate(dt=>{const runtime=world.training!,state=runtime.simulation.vehicles[0]!;training.updateVehicleWheels(mechanical,state,{dt,grounded:state.grounded,revision:runtime.simulation.teleportRevision,active:runtime.simulation.vehicle===state});});
// createHumanoidWorld owns the one preset character for walking, riding and reset.
// Never hide/recreate it when mounted; vehicle and character keep separate SDK-owned roots.
world.setCaptureTargets(['person','custom-bike']);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;background:#333c;color:white;padding:12px;font:14px sans-serif;white-space:pre';
presentation.ui.mount(hud);
world.onUpdate(()=>{const state=world.snapshot().training;hud.textContent=`预设人物 + 自建摩托\nWASD 移动 / 驾驶 · F 上下车 · Space 刹车\n${state?.mountedInstanceId?'骑乘':'步行'} · ${state?.message??''}`;});
await world.start();presentation.focus();
