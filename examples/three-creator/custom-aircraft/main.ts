import cameraData from './config/camera.json';
import * as THREE from 'three';
import {createHumanoidWorld,parseCameraDocument,humanoid,type EnvironmentDefinition} from '@worldkit/three';

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
const groundGeometry=new THREE.PlaneGeometry(2400,2400);geometries.push(groundGeometry);
const ground=new THREE.Mesh(groundGeometry,material);ground.rotation.x=-Math.PI/2;scene.add(ground);
const plane=new THREE.Group();
// Visual outlines are authored independently from the collision volumes.
const bodyGeometry=new THREE.CapsuleGeometry(.46,4.65,8,16);geometries.push(bodyGeometry);
const fuselage=new THREE.Mesh(bodyGeometry,material);fuselage.rotation.x=Math.PI/2;fuselage.position.y=1.03;plane.add(fuselage);
const wingOutline=new THREE.Shape();wingOutline.moveTo(-4,-.48);wingOutline.lineTo(-3.6,.75);wingOutline.lineTo(3.6,.75);wingOutline.lineTo(4,-.48);wingOutline.closePath();
const wingGeometry=new THREE.ExtrudeGeometry(wingOutline,{depth:.1,bevelEnabled:false});geometries.push(wingGeometry);
const wing=new THREE.Mesh(wingGeometry,material);wing.rotation.x=Math.PI/2;wing.position.set(0,2.25,.05);plane.add(wing);
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
 vehicles:[{instanceId:spec.id,assetId:'custom.plane',object:plane,spec}],});
world.setCameraFollow({configuration:parseCameraDocument(cameraData)});
world.humanoid!.onVisualUpdate((dt,sample)=>{
 const runtime=world.humanoid!,state=runtime.simulation.vehicles[0]!;
 humanoid.updateVehicleWheels(mechanical,sample.vehicles[0]!,{dt,grounded:state.grounded,revision:sample.epoch});
});
world.setCaptureTargets(['person',spec.id]);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;padding:12px;background:#333c;color:white;font:14px sans-serif;white-space:pre-line';
const key=(action:humanoid.ControlAction)=>humanoid.bindingLabel(action,world.getKeyBindings());
hud.textContent=`自绘固定翼飞机\n${key('forward')} / ${key('backward')} 增减油门 · ${key('fixedWingPitchDown')} / ${key('fixedWingPitchUp')} 低头 / 抬头\n${key('left')} / ${key('right')} 转向 · ${key('slow')} 减油门 / 地面制动 · ${key('sprint')} 辅助加油门 · ${key('jump')} 地面制动 · ${key('interact')} 上下机`;
presentation.ui.mount(hud);
world.onDispose(()=>{for(const geometry of geometries)geometry.dispose();material.dispose();accent.dispose();rubber.dispose();});
await world.start();presentation.focus();
