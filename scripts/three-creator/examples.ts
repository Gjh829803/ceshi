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
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);camera.position.set(7,6,10);camera.lookAt(0,0.7,0);
const renderer = new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
const world=await createWorld({scene,camera,renderer});scene.add(new THREE.HemisphereLight(0xffffff,0x476035,2));
const ground=new THREE.Mesh(new THREE.BoxGeometry(60,0.2,60),new THREE.MeshStandardMaterial({color:0x759955}));ground.position.y=-0.1;
world.addEntity({id:'ground',object:ground,role:'terrain',physics:{kind:'fixed'}});
const player=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(0.8,1.4,0.8),new THREE.MeshStandardMaterial({color:0xe87836}));body.position.y=0.7;player.add(body);player.position.y=0.05;
world.addCharacter({id:'player',object:player,character:{heightMeters:1.4,radiusMeters:0.35}});world.setControlledEntity('player');
// Preserve the reference camera until input, then follow during play.
world.setCameraFollow({targetEntityId:'player',distanceMeters:8,pitchRadians:0.4,targetHeightMeters:1,activateOnInput:true});
world.expose({targetEntityIds:['player']});world.render();world.start();
// world.onUpdate(({deltaSeconds,simulationTick})=>{...}) supplies the SDK tick for
// author animation/gameplay; do not run a second physics timer.
// world.onInteract('object-id',()=>{...}) registers actual nearby interaction.
// world.execute({type:'entity.set-visible',entityId:'object-id',visible:false})
// and actor.move-to / actor.follow / entity.attach operate registered identities.
// A minimal SDK integration example, not a completed reference reconstruction.
`;
