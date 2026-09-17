import * as THREE from 'three';
import {createWorld} from '@worldkit/three';

const renderer=new THREE.WebGLRenderer({canvas:document.querySelector<HTMLCanvasElement>('#world')!,antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight,false);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,250);camera.position.set(7,6,10);camera.lookAt(0,1,0);
const world=await createWorld({renderer,camera,navigation:false,assetDefinitions:{}});
world.scene.background=new THREE.Color('#b9c8ce');world.scene.add(new THREE.HemisphereLight('#ffffff','#84909a',2));
const material=new THREE.MeshStandardMaterial({color:'#edf0f0',roughness:1});
const floor=new THREE.Mesh(new THREE.BoxGeometry(60,.5,60),material);floor.position.y=-.25;world.addEntity({id:'ground',role:'terrain',object:floor});
for(let i=0;i<8;i++){const block=new THREE.Mesh(new THREE.BoxGeometry(2,1+i%3,2),material);block.position.set((i%4-1.5)*6,(1+i%3)/2,-5-Math.floor(i/4)*7);world.addEntity({id:`block-${i}`,role:'obstacle',object:block});}
const actor=new THREE.Group(),capsule=new THREE.Mesh(new THREE.CapsuleGeometry(.35,1.1),new THREE.MeshStandardMaterial({color:'#397b82'}));capsule.position.y=.9;actor.add(capsule);
world.addCharacter({id:'player',object:actor,body:{heightMeters:1.8,radiusMeters:.35}});world.setControlledEntity('player');
world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'follow',binding:{targetEntityId:'player'},activation:'on-input',views:{follow:{kind:'third-person',overrides:{framing:{kind:'preserve-opening'}}}}}});
const health=world.state.define('health',100);
await world.start();
// This producer-only binding exports observations and named actions, never renderer closures.
Object.assign(window,{__WORLDKIT_STREAM_WORLD__:{world,readUiState:()=>({player:{health:health.value,maxHealth:100}}),actions:{damage:()=>health.set(Math.max(0,health.value-20)),heal:()=>health.set(100)}}});
