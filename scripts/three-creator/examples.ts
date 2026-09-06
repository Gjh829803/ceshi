export const RAW_EXAMPLE = `import * as THREE from 'three';
const scene = new THREE.Scene(); scene.background = new THREE.Color('#92bad0');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(7, 6, 10); camera.lookAt(0, 0.7, 0);
const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x476035, 2));
const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 60), new THREE.MeshStandardMaterial({color:0x759955})); ground.position.y=-0.1; scene.add(ground);
const player = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.4,0.8),new THREE.MeshStandardMaterial({color:0xe87836})); body.position.y=0.7; player.add(body); scene.add(player);
// This tiny raw example only demonstrates input/observation. It has no physics engine,
// obstacles, exploration or reference reconstruction; build those for the actual task.
const keys = new Set(); let running=false, previous=0, frameId=0;
addEventListener('keydown', event=>{keys.add(event.code); if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();});
addEventListener('keyup', event=>keys.delete(event.code)); addEventListener('blur',()=>keys.clear());
function frame(now){if(!running)return; const dt=previous?Math.min((now-previous)/1000,0.05):0;previous=now;const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?6:3;const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));const dz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));const length=Math.hypot(dx,dz)||1;player.position.x+=dx/length*speed*dt;player.position.z+=dz/length*speed*dt;renderer.render(scene,camera);frameId=requestAnimationFrame(frame);}
function startLive(){if(running)return;running=true;previous=0;frameId=requestAnimationFrame(frame);}
function stopLive(){running=false;cancelAnimationFrame(frameId);keys.clear();}
function reset(){stopLive();player.position.set(0,0,0);renderer.render(scene,camera);}
window.__WORLDKIT_EVAL__={ready:true,scene,camera,renderer,player,targets:{player},startLive,stopLive,reset};reset();startLive();
`;
export const SDK_EXAMPLE = `import * as THREE from 'three';
import {createWorld} from '@worldkit/three';
const scene = new THREE.Scene(); scene.background = new THREE.Color('#92bad0');
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(7,6,10); camera.lookAt(0,0.7,0);
const canvas = document.createElement('canvas'); document.body.append(canvas);
const world = await createWorld({scene,camera,canvas});
scene.add(new THREE.HemisphereLight(0xffffff,0x476035,2));
const ground = new THREE.Mesh(new THREE.BoxGeometry(60,0.2,60),new THREE.MeshStandardMaterial({color:0x759955}));
ground.position.y=-0.1; world.addEntity({id:'ground',object:ground,role:'terrain'});
const player = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.4,0.8),new THREE.MeshStandardMaterial({color:0xe87836}));
body.position.y=0.7; player.add(body);
world.addCharacter({id:'player',object:player,body:{heightMeters:1.4,radiusMeters:0.35}});
world.setControlledEntity('player');
world.setCameraFollow(); // follow from the authored camera without reframing
world.setCaptureTargets(['player']);
await world.start(); // prepares baseline and installs the real same-scene observer
// WASD movement; arrows/drag camera; Shift run; Space jump; E interact; R reset.
// Author pure visual child motion with onUpdate; managed root motion uses execute.
// This is a minimal integration example, not a completed reference reconstruction.
`;
