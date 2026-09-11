export const RAW_EXAMPLE = `import * as THREE from 'three';
const scene = new THREE.Scene(); scene.background = new THREE.Color('#eeeeee');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(7, 6, 10); camera.lookAt(0, 0.7, 0);
const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0xaaaaaa, 2));
const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 60), new THREE.MeshStandardMaterial({color:0xcccccc})); ground.position.y=-0.1; scene.add(ground);
const player = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.4,0.8),new THREE.MeshStandardMaterial({color:0xffffff})); body.position.y=0.7; player.add(body); scene.add(player);
// This tiny raw example only demonstrates input/observation. It has no physics engine,
// reference reconstruction; author the reference scene and only prompt-requested behavior.
const keys = new Set(); let running=false, previous=0, frameId=0;
addEventListener('keydown', event=>{keys.add(event.code); if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();});
addEventListener('keyup', event=>keys.delete(event.code)); addEventListener('blur',()=>keys.clear());
function frame(now){if(!running)return; const dt=previous?Math.min((now-previous)/1000,0.05):0;previous=now;const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?6:3;const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));const dz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));const length=Math.hypot(dx,dz)||1;player.position.x+=dx/length*speed*dt;player.position.z+=dz/length*speed*dt;renderer.render(scene,camera);frameId=requestAnimationFrame(frame);}
function startLive(){if(running)return;running=true;previous=0;frameId=requestAnimationFrame(frame);}
function stopLive(){running=false;cancelAnimationFrame(frameId);keys.clear();}
function reset(){stopLive();player.position.set(0,0,0);renderer.render(scene,camera);}
window.__WORLDKIT_EVAL__={ready:true,scene,camera,renderer,controlledObject:player,targets:{player},startLive,stopLive,reset};reset();startLive();
`;
export const SDK_EXAMPLE = `import * as THREE from 'three';
import {createHumanoidWorld, type EnvironmentDefinition} from '@worldkit/three';
const scene = new THREE.Scene(); scene.background = new THREE.Color('#eeeeee');
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(7,6,10); camera.lookAt(0,0.7,0);
const canvas = document.createElement('canvas'); document.body.append(canvas);
scene.add(new THREE.HemisphereLight(0xffffff,0xaaaaaa,2));
const map:EnvironmentDefinition={id:'world',name:'World',description:'Exploration',
 bounds:{min:[-30,-5,-30],max:[30,30,30]},
 boxes:[{id:'ground',position:[0,-.1,0],size:[60,.2,60],color:'#cccccc'}],
 water:[],regions:[],spawns:[],playerSpawn:[0,0,0]};
// Author the visible ground independently; map.boxes supplies physical support.
const ground=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshStandardMaterial({color:'#cccccc'}));
ground.rotation.x=-Math.PI/2;scene.add(ground);
// Select humanoid.uefn-mannequin in project.json; the helper loads all supplied actions.
// Reuse the visible supplied model. Use restrained identifying colors for the subject, key counterparts and landmarks.
// Optional first-person opening and T switching: add profile:{view:{defaultPerspective:'first-person',keyboardToggleEnabled:true}}.
const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'player',characterLoadOptions:{loadTextures:false}});
world.setCaptureTargets(['player']);
// Keep loading UI visible until initial materials and the opening frame are ready.
await world.start();
// Extend this binding to the reference scene. See the SDK/asset index for required capabilities.
`;

export function sdkExample(_assetId: string): string { return SDK_EXAMPLE; }
