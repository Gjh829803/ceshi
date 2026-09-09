import * as THREE from 'three';
import {createHumanoidWorld,training} from '@worldkit/three';
import {map} from './map';

const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.5));
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.05,150);
camera.position.set(3.5,3.8,8);camera.lookAt(3.5,1,0);
const canvas=document.createElement('canvas');document.body.append(canvas);

const propMeshes=new Map<string,THREE.Mesh>();
for(const box of map.boxes){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),new THREE.MeshStandardMaterial({color:box.color}));
 mesh.name=box.id;mesh.position.set(...box.position);mesh.rotation.set(...(box.rotation??[0,0,0]));scene.add(mesh);
 if(box.rigidGroup)propMeshes.set(box.id,mesh);
}
const water=new THREE.Mesh(new THREE.PlaneGeometry(11,40),new THREE.MeshStandardMaterial({color:'#88aebe',transparent:true,opacity:.55,roughness:1,side:THREE.DoubleSide}));
water.rotation.x=-Math.PI/2;water.position.set(10.5,0,0);scene.add(water);

const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'person'});
world.setCaptureTargets(['person']);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;max-width:460px;padding:12px;background:#16313ddd;color:white;font:14px sans-serif';
const help=document.createElement('p');help.textContent=training.controlHints(world.getKeyBindings()).map(([key,label])=>`${key} ${label}`).join(' · ');
const button=document.createElement('button');button.textContent='通过 SDK 命令翻滚';
const reset=document.createElement('button');reset.textContent='重置人物与桌椅';
reset.onclick=async()=>{await world.reset();await world.start();presentation.focus();};
const propsHelp=document.createElement('p');propsHelp.textContent='走向桌椅可推动它们；靠近椅子按 E 坐下。';
const result=document.createElement('pre'),status=document.createElement('pre');
const parcel=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.13),new THREE.MeshStandardMaterial({color:'#f4ae51'}));scene.add(parcel);
button.onclick=async()=>{
 const receipt=await world.execute({type:'training.action',request:{requestId:crypto.randomUUID(),action:'roll'}});
 result.textContent=JSON.stringify(receipt,null,2);presentation.focus();
 // An accepted receipt is not completion. A model uses the returned operationId
 // with world_get_operation; a page can query world.operations.get(operationId).
};
hud.append(help,propsHelp,button,reset,result,status);presentation.ui.mount(hud);
world.training!.onVisualUpdate(()=>{
 // Read the current owner each time: reset/map replacement can replace physics.
 // Meshes stay directly under the scene because these poses are world-space.
 const environment=world.training!.simulation.environment;
 for(const [id,mesh] of propMeshes){
  const pose=environment.propBoxPose(id);
  if(pose){mesh.position.copy(pose.position);mesh.quaternion.copy(pose.rotation);}
 }
 const snapshot=world.snapshot().training!;
 const target=snapshot.interactionTargets.find(target=>target.id==='parcel');
 if(target){parcel.position.set(...target.positionWorldMetersXYZ);parcel.quaternion.set(...target.rotationWorldQuaternionXYZW);}
 status.textContent=JSON.stringify(snapshot.character,null,2);
});
await world.start();presentation.focus();
