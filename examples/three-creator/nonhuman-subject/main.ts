import * as THREE from 'three';
import {createWorld} from '@worldkit/three';

const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight(0xffffff,0xaaaaaa,2.2));
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,200);
camera.position.set(0,4,8);camera.lookAt(0,.5,0);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const world=await createWorld({scene,camera,canvas});
const white=new THREE.MeshStandardMaterial({color:'#e5e6e2',roughness:1});
const dark=new THREE.MeshStandardMaterial({color:'#737971',roughness:1});
const ground=new THREE.Mesh(new THREE.BoxGeometry(24,.2,24),white);ground.position.y=-.1;
world.addEntity({id:'ground',object:ground,role:'terrain'});
const wall=new THREE.Mesh(new THREE.BoxGeometry(8,2,.5),new THREE.MeshStandardMaterial({color:'#c7b885',roughness:1}));
wall.position.set(0,1,-4);world.addEntity({id:'wall',object:wall,role:'obstacle'});

// The fox is the sole controlled actor. There is no hidden human or riding controller.
// Its root is at the feet, with visuals above local Y=0 and its nose toward local -Z.
const fox=new THREE.Group();
function part(size:[number,number,number],position:[number,number,number],material=white,parent:THREE.Object3D=fox){
 const object=new THREE.Mesh(new THREE.BoxGeometry(...size),material);object.position.set(...position);parent.add(object);return object;
}
part([.5,.42,.8],[0,.52,0]);
part([.38,.34,.38],[0,.77,-.45]);
part([.24,.15,.22],[0,.69,-.72]);
part([.18,.09,.08],[0,.71,-.86],dark);
for(const x of [-.13,.13]){
 const ear=new THREE.Mesh(new THREE.ConeGeometry(.1,.25,4),white);ear.position.set(x,1.04,-.43);fox.add(ear);
 part([.05,.05,.03],[x,.81,-.65],dark);
}
const tail=part([.19,.2,.6],[0,.54,.62]);tail.rotation.x=-.3;
const legs:THREE.Group[]=[];
for(const x of [-.19,.19])for(const z of [-.27,.27]){
 const leg=new THREE.Group();leg.position.set(x,.45,z);fox.add(leg);
 part([.12,.4,.13],[0,-.2,0],dark,leg);legs.push(leg);
}
// Capsule height includes both end caps and extends upward from the root.
world.addCharacter({id:'fox',name:'狐狸',object:fox,body:{heightMeters:1.15,radiusMeters:.45},
 movement:{kind:'ground',walkSpeedMetersPerSecond:2.5,runSpeedMetersPerSecond:4,jumpSpeedMetersPerSecond:3}});
world.setControlledEntity('fox');
world.setCameraFollow({targetEntityId:'fox',view:{eyeOffsetLocalMetersXYZ:[0,.82,-.5],defaultPerspective:'third-person',keyboardToggleEnabled:true}});
world.setCaptureTargets(['fox','wall']);
const presentation=world.createPresentation(),hud=document.createElement('div');
hud.style.cssText='position:absolute;left:16px;top:16px;background:#333c;color:white;padding:12px;font:14px sans-serif;white-space:pre';
hud.textContent='狐狸主体\nWASD 移动 · Shift 奔跑 · Space 跳跃\nT 第一 / 第三人称 · 前方矮墙具有真实碰撞';
presentation.ui.mount(hud);
// Visual limb motion reads the SDK clock and measured speed; it never moves the root.
world.onUpdate(({simulationSeconds})=>{
 const state=world.getEntityState('fox'),velocity=state.motion?.velocityWorldMetersPerSecondXYZ??[0,0,0];
 const amplitude=state.motion?.isGrounded?Math.min(.45,Math.hypot(velocity[0],velocity[2])*.12):0;
 legs.forEach((leg,index)=>{leg.rotation.x=Math.sin(simulationSeconds*10+(index===0||index===3?0:Math.PI))*amplitude;});
});
// First start seals registered actors, camera defaults and capture targets for reset.
await world.start();presentation.focus();
