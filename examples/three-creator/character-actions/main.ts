import * as THREE from 'three';
import {createHumanoidWorld,training} from '@worldkit/three';
import {map} from './map';

const scene=new THREE.Scene();scene.background=new THREE.Color('#9ec8dc');
scene.add(new THREE.HemisphereLight('#ffffff','#52604e',2.5));
const sun=new THREE.DirectionalLight('#fff1d7',3);sun.position.set(8,15,10);scene.add(sun);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.05,150);
camera.position.set(3.5,3.8,8);camera.lookAt(3.5,1,0);
const canvas=document.createElement('canvas');document.body.append(canvas);

for(const box of map.boxes){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),new THREE.MeshStandardMaterial({color:box.color}));
 mesh.position.set(...box.position);scene.add(mesh);
}
const water=new THREE.Mesh(new THREE.PlaneGeometry(11,40),new THREE.MeshStandardMaterial({color:'#3997ba',transparent:true,opacity:.55,roughness:.3,side:THREE.DoubleSide}));
water.rotation.x=-Math.PI/2;water.position.set(10.5,0,0);scene.add(water);

const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'person'});
world.setCaptureTargets(['person']);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;max-width:460px;padding:12px;background:#16313ddd;color:white;font:14px sans-serif';
const help=document.createElement('p');help.textContent=training.controlHints(world.getKeyBindings()).map(([key,label])=>`${key} ${label}`).join(' · ');
const button=document.createElement('button');button.textContent='通过 SDK 命令翻滚';
const result=document.createElement('pre'),status=document.createElement('pre');
const parcel=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.13),new THREE.MeshStandardMaterial({color:'#f4ae51'}));scene.add(parcel);
button.onclick=async()=>{
 const receipt=await world.execute({type:'training.action',request:{requestId:crypto.randomUUID(),action:'roll'}});
 result.textContent=JSON.stringify(receipt,null,2);presentation.focus();
 // An accepted receipt is not completion. A model uses the returned operationId
 // with world_get_operation; a page can query world.operations.get(operationId).
};
hud.append(help,button,result,status);presentation.ui.mount(hud);
world.training!.onVisualUpdate(()=>{
 const snapshot=world.snapshot().training!;
 const target=snapshot.interactionTargets.find(target=>target.id==='parcel');
 if(target){parcel.position.set(...target.positionWorldMetersXYZ);parcel.quaternion.set(...target.rotationWorldQuaternionXYZW);}
 status.textContent=JSON.stringify(snapshot.character,null,2);
});
await world.start();presentation.focus();
