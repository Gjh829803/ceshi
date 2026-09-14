import cameraData from './config/camera.json';
import * as THREE from 'three';
import {createHumanoidWorld,parseCameraDocument,humanoid} from '@worldkit/three';
import {map} from './map';

const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.5));
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.05,150);
camera.position.set(3.5,3.8,8);camera.lookAt(3.5,1,0);
const canvas=document.createElement('canvas');document.body.append(canvas);

const propMeshes=new Map<string,THREE.Mesh>();
// Author visible surfaces from the scene design; map contains physical support only.
function surface(width:number,depth:number,position:[number,number,number],color='#dddddd'){
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({color,roughness:1}));
 mesh.rotation.x=-Math.PI/2;mesh.position.set(...position);scene.add(mesh);return mesh;
}
function structure(name:string,size:[number,number,number],position:[number,number,number],rotation:[number,number,number]=[0,0,0],color='#eeeeee'){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:1}));
 mesh.name=name;mesh.position.set(...position);mesh.rotation.set(...rotation);scene.add(mesh);return mesh;
}
surface(30,40,[-10,0,0],'#cccccc');surface(11,40,[10.5,-2,0],'#bbbbbb');surface(24,40,[28,0,0],'#cccccc');
structure('slide-beam',[4,.45,1.4],[-10,1.275,3],[0,0,0],'#759fc7');
structure('crawl-roof',[3.2,.6,3],[-18,1.15,3]);
structure('wall',[6,3,1.8],[-16,1.5,-7]);structure('hurdle',[4,.8,.8],[-9,.4,-12]);
function table(id:string,x:number){
 propMeshes.set(id,structure(id,[1.35,.1,.75],[x,.799,-6.71]));
 for(const dx of [-.55,.55])for(const dz of [-.26,.26]){
  const legId=`${id}-leg-${dx}-${dz}`;
  const leg=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.749,12),new THREE.MeshStandardMaterial({color:'#dddddd'}));
  leg.position.set(x+dx,.3745,-6.71+dz);scene.add(leg);propMeshes.set(legId,leg);
 }
}
table('pickup-table',-5);table('place-table',-8);
propMeshes.set('seat',structure('seat',[.56,.1,.38],[1,.41,-5.51]));
propMeshes.set('seat-back',structure('seat-back',[.56,.55,.075],[1,.705,-5.275]));
for(const dx of [-.22,.22])for(const dz of [-.14,.14]){
 const id=`chair-leg-${dx}-${dz}`;
 const leg=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.36,12),new THREE.MeshStandardMaterial({color:'#eeeeee'}));
 leg.position.set(1+dx,.18,-5.51+dz);scene.add(leg);propMeshes.set(id,leg);
}

const water=new THREE.Mesh(new THREE.PlaneGeometry(11,40),new THREE.MeshStandardMaterial({color:'#88aebe',transparent:true,opacity:.55,roughness:1,side:THREE.DoubleSide}));
water.rotation.x=-Math.PI/2;water.position.set(10.5,0,0);scene.add(water);

const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'person'});
world.setCameraFollow({configuration:parseCameraDocument(cameraData)});
world.setCaptureTargets(['person']);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;max-width:460px;padding:12px;background:#16313ddd;color:white;font:14px sans-serif';
const help=document.createElement('p');help.textContent=humanoid.controlHints(world.getKeyBindings()).map(([key,label])=>`${key} ${label}`).join(' · ');
const button=document.createElement('button');button.textContent='通过 SDK 命令翻滚';
const reset=document.createElement('button');reset.textContent='重置人物与桌椅';
reset.onclick=async()=>{await world.reset();await world.start();presentation.focus();};
const propsHelp=document.createElement('p');propsHelp.textContent='走向桌椅可推动它们；靠近椅子按 E 坐下。';
const result=document.createElement('pre'),status=document.createElement('pre');
const parcel=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.13),new THREE.MeshStandardMaterial({color:'#f4ae51'}));scene.add(parcel);
button.onclick=async()=>{
 const receipt=await world.execute({type:'humanoid.perform-action',request:{requestId:crypto.randomUUID(),action:'roll'}});
 result.textContent=JSON.stringify(receipt,null,2);presentation.focus();
 // An accepted receipt is not completion. A model uses the returned operationId
 // with world_get_operation; a page can query world.operations.get(operationId).
};
hud.append(help,propsHelp,button,reset,result,status);presentation.ui.mount(hud);
world.humanoid!.onVisualUpdate(()=>{
 // Read the current owner each time: reset/map replacement can replace physics.
 // Meshes stay directly under the scene because these poses are world-space.
 const environment=world.humanoid!.simulation.environment;
 for(const [id,mesh] of propMeshes){
  const pose=environment.propBoxPose(id);
  if(pose){mesh.position.copy(pose.position);mesh.quaternion.copy(pose.rotation);}
 }
 const snapshot=world.snapshot().humanoid!;
 const target=snapshot.interactionTargets.find(target=>target.id==='parcel');
 if(target){parcel.position.set(...target.positionWorldMetersXYZ);parcel.quaternion.set(...target.rotationWorldQuaternionXYZW);}
 status.textContent=JSON.stringify(snapshot.character,null,2);
});
await world.start();presentation.focus();
