import * as THREE from 'three';
import {createHumanoidWorld,humanoid,type EnvironmentDefinition} from '@worldkit/three';

// Select flight handling first. airframe is the existing solver's fixed metre-scale
// authoring reference, not a bag of per-instance physics overrides.
const spec=humanoid.createAircraftSpec('plane');spec.id='custom-plane';
const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight(0xffffff,0xbbbbbb,2));
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,3000);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const map:EnvironmentDefinition={id:'custom-aircraft',name:'Self-drawn fixed wing',description:'Runway takeoff and coordinated flight',
 bounds:{min:[-1200,-20,-1200],max:[1200,1000,1200]},
 boxes:[{id:'ground',position:[0,-.1,0],size:[2400,.2,2400],color:'#dddddd'}],water:[],
 regions:[{id:'airfield',name:'Airfield',description:'Walking and fixed-wing flight',center:[0,0,0],size:[2300,2300],color:'#dddddd',modes:['character','plane']}],
 spawns:[{id:'plane-start',vehicleId:spec.id,name:'Plane',position:[0,0,0],yaw:0,regionId:'airfield'}],playerSpawn:[4.8,0,.1]};
const material=new THREE.MeshStandardMaterial({color:'#eeeeee',roughness:1});
const accent=new THREE.MeshStandardMaterial({color:'#648fa4',roughness:1});
const rubber=new THREE.MeshStandardMaterial({color:'#666666',roughness:1});
const geometries:THREE.BufferGeometry[]=[];
function box(root:THREE.Object3D,size:readonly [number,number,number],position:readonly [number,number,number],mat=material){
 const geometry=new THREE.BoxGeometry(...size);geometries.push(geometry);
 const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...position);root.add(mesh);return mesh;
}
for(const entry of map.boxes)box(scene,entry.size,entry.position);
const plane=new THREE.Group();
for(const part of spec.airframe.boxes)box(plane,part.halfExtents.map(v=>v*2) as [number,number,number],part.offset);
box(plane,[1.5,.1,.6],[0,1.35,-2.4],accent);
box(plane,[.1,.8,.65],[0,1.65,-2.4],accent);
// Pelvis anchor is distinct from the cushion top; keep the supplied rider separate.
box(plane,[.55,.12,.5],[spec.seat[0],spec.seat[1]-.19,spec.seat[2]],rubber);
const wheelRigs:{steering:THREE.Group;spin:THREE.Group;radius:number}[]=[];
for(const [index,w] of spec.airframe.wheels.entries()){
 const steering=new THREE.Group(),spin=new THREE.Group();
 steering.name=`wheel.${index}.steer`;spin.name=`wheel.${index}.spin`;steering.position.set(w.x,w.y,w.z);
 const geometry=new THREE.CylinderGeometry(w.radius,w.radius,.16,16);geometries.push(geometry);
 const mesh=new THREE.Mesh(geometry,rubber);mesh.rotation.z=Math.PI/2;
 spin.add(mesh);steering.add(spin);plane.add(steering);wheelRigs.push({steering,spin,radius:w.radius});
}
const mechanical={wheelRigs,steering:wheelRigs.filter((_,i)=>spec.airframe.wheels[i]!.steering).map(w=>w.steering)};
const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'person',
 vehicles:[{instanceId:spec.id,assetId:'custom.plane',object:plane,spec}],
 profile:{view:{defaultPerspective:'third-person',keyboardToggleEnabled:true},cameraDistanceMeters:15}});
world.humanoid!.onVisualUpdate((dt,sample)=>{
 const runtime=world.humanoid!,state=runtime.simulation.vehicles[0]!;
 humanoid.updateVehicleWheels(mechanical,sample.vehicles[0]!,{dt,grounded:state.grounded,revision:runtime.simulation.teleportRevision});
});
world.setCaptureTargets(['person',spec.id]);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;padding:12px;background:#333c;color:white;font:14px sans-serif;white-space:pre-line';
hud.textContent=spec.hint;presentation.ui.mount(hud);
world.onDispose(()=>{for(const geometry of geometries)geometry.dispose();material.dispose();accent.dispose();rubber.dispose();});
await world.start();presentation.focus();
