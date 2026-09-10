import * as THREE from 'three';
import {createHumanoidWorld,type EnvironmentDefinition} from '@worldkit/three';

const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.5));
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.05,150);
camera.position.set(9,7,-12);camera.lookAt(0,1,2);
const canvas=document.createElement('canvas');document.body.append(canvas);
const map:EnvironmentDefinition={id:'multiple-actors',name:'多角色',description:'三个完整人形共用世界，NPC 独立导航',
  bounds:{min:[-20,-5,-20],max:[20,20,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],
  water:[],regions:[],spawns:[],playerSpawn:[0,.04,0]};
const floor=new THREE.Mesh(new THREE.BoxGeometry(40,1,40),new THREE.MeshStandardMaterial({color:'#cccccc'}));
floor.position.set(0,-.5,0);scene.add(floor);
const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'person'});
for(const [id,x] of [['npc-left',-4],['npc-right',4]] as const){
  // Share immutable source assets; each instance has its own rig, animation and controller.
  const character=await world.humanoid!.createCharacter();character.root.position.set(x,.04,0);
  world.addCharacter({id,humanoid:character});
  world.setAutonomy(id,{kind:'patrol',waypointPositionsWorldMetersXYZ:[[x,0,7],[x,0,-3]],pauseSeconds:.5});
}
world.setCaptureTargets(['person','npc-left','npc-right']);
const presentation=world.createPresentation(),hud=document.createElement('div');
hud.style.cssText='position:absolute;top:16px;left:16px;padding:12px;background:#ffffffdd;font:14px sans-serif';
const label=document.createElement('p');label.textContent='WASD 控制人物 · NPC 自动往返';hud.append(label);
for(const id of ['person','npc-left','npc-right']){
  const button=document.createElement('button');button.textContent=`跟随 ${id}`;
  button.onclick=()=>{world.setCameraFollow({targetEntityId:id});presentation.focus();};hud.append(button);
}
const reset=document.createElement('button');reset.textContent='重置';reset.onclick=async()=>{await world.reset();await world.start();presentation.focus();};hud.append(reset);
presentation.ui.mount(hud);
world.onDispose(()=>{floor.geometry.dispose();floor.material.dispose();});
await world.start();presentation.focus();
