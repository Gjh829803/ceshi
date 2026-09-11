import * as THREE from 'three';
import {createHumanoidWorld,type EnvironmentDefinition} from '@worldkit/three';

const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.5));
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.05,150);
camera.position.set(5,4,-7);camera.lookAt(0,1,2);
const canvas=document.createElement('canvas');document.body.append(canvas);
const map:EnvironmentDefinition={id:'shared-physics',name:'共享物理',description:'人物与普通动态物体共用碰撞世界',
  bounds:{min:[-20,-5,-20],max:[20,20,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],
  water:[],regions:[],spawns:[],playerSpawn:[0,.04,0]};
const floor=new THREE.Mesh(new THREE.BoxGeometry(40,1,40),new THREE.MeshStandardMaterial({color:'#cccccc'}));
floor.position.set(0,-.5,0);scene.add(floor);
const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'person'});
// Standard Three geometry and standard addEntity: no duplicate map, physics loop or pose copying.
const crate=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#d2a452'}));
crate.position.set(0,2.5,2);
world.addEntity({id:'crate',object:crate,role:'obstacle',physics:{kind:'dynamic',shape:'box',massKilograms:2}});
world.setCaptureTargets(['person','crate']);world.humanoid!.setCameraMode(0);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;top:16px;left:16px;padding:12px;background:#ffffffdd;font:14px sans-serif';
const text=document.createElement('p');text.textContent='WASD 移动并推动方块 · Space 跳跃';
const reset=document.createElement('button');reset.textContent='重置';
reset.onclick=async()=>{await world.reset();await world.start();presentation.focus();};
hud.append(text,reset);presentation.ui.mount(hud);
world.onDispose(()=>{for(const mesh of [floor,crate]){mesh.geometry.dispose();mesh.material.dispose();}});
await world.start();presentation.focus();
