import cameraData from './config/camera.json';
import {parseCameraDocument} from '@worldkit/three';
import * as THREE from 'three';
import {createWorld,HumanoidCharacter,type EnvironmentDefinition,type VehicleSpec} from '@worldkit/three';
// Asset discovery supplies IDs; compiler closes primary models, clips, notices and hashes.
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map((a:{id:string})=>[a.id,a]));
const selected=catalog.assets.find((a:{id:string})=>a.id==='vehicle.atv');
const resources=new Map<string,string>(catalog.assets.flatMap((a:any)=>a.resources??[]).map((r:any)=>[r.path,r.uri]));
const character=new HumanoidCharacter();
await character.load((logicalPath:string)=>{const uri=resources.get(logicalPath);if(!uri)throw new Error(`Missing resource ${logicalPath}`);return new URL(uri,document.baseURI).href;});
const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.4));
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,500);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const map:EnvironmentDefinition={id:'atv-course',name:'全地形车试车场',description:'跨坐、车把转向和越野坡道验收',bounds:{min:[-120,-10,-120],max:[120,100,120]},
  boxes:[{id:'ground',position:[0,-.5,0],size:[240,1,240],color:'#cccccc'},{id:'wall',position:[0,2.5,110],size:[45,5,1],color:'#eeeeee'},{id:'ramp',position:[0,1.5-.2*Math.cos(Math.atan(.15)),35],size:[10,.4,20/Math.cos(Math.atan(.15))],rotation:[-Math.atan(.15),0,0],color:'#eeeeee'},{id:'platform',position:[0,1.5,60],size:[10,3,30],color:'#eeeeee'},...[-1,1].flatMap(side=>[0,25,50,75].map(z=>({id:`marker-${side}-${z}`,position:[side*18,.75,z] as [number,number,number],size:[.4,1.5,.4] as [number,number,number],color:'#c9843f'})))],
  water:[],regions:[{id:'road',name:'Course',description:'A reusable map module',center:[0,0,0],size:[200,200],color:'#e8be73',modes:['character','wheeled']}],
  spawns:[{id:'atv-start',vehicleId:'atv-instance-1',name:'四轮全地形车',position:[0,.025,0],yaw:0,regionId:'road'}],playerSpawn:[1.6,.025,0]};
// Author visible surfaces from the scene design; map contains physical support only.
function surface(width:number,depth:number,position:[number,number,number],color='#dddddd'){
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({color,roughness:1}));
 mesh.rotation.x=-Math.PI/2;mesh.position.set(...position);scene.add(mesh);return mesh;
}
function structure(name:string,size:[number,number,number],position:[number,number,number],rotation:[number,number,number]=[0,0,0],color='#eeeeee'){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:1}));
 mesh.name=name;mesh.position.set(...position);mesh.rotation.set(...rotation);scene.add(mesh);return mesh;
}
function marker(x:number,y:number,z:number,height=1.5){
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.15,.2,height,12),new THREE.MeshStandardMaterial({color:'#c9843f',roughness:1}));mesh.position.set(x,y,z);scene.add(mesh);
}
surface(240,240,[0,0,0]);
structure('wall',[45,5,1],[0,2.5,110]);
structure('ramp',[10,.4,20/Math.cos(Math.atan(.15))],[0,1.5-.2*Math.cos(Math.atan(.15)),35],[-Math.atan(.15),0,0]);
structure('platform',[10,3,30],[0,1.5,60]);
for(const side of [-1,1])for(const z of [0,25,50,75])marker(side*18,.75,z);
const vehicleObject=new THREE.Group();
const spec=structuredClone(selected.vehicle.spec) as VehicleSpec;
const world=await createWorld({scene,camera,canvas,assetDefinitions:definitions,humanoid:{map,vehicles:[{instanceId:'atv-instance-1',assetId:selected.id,spec,object:vehicleObject}],character:{instanceId:'person',object:character.root,animation:character}}});
// The same catalog asset can be loaded/cloned into additional independent instance roots.
const model=await world.assets.load(selected.id);vehicleObject.add(model.object);

world.setCaptureTargets([{entityId:'person'},{entityId:'atv-instance-1'}]);
world.setCameraFollow({configuration:parseCameraDocument(cameraData)});
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;background:#102c35d9;color:white;padding:12px;font:14px sans-serif';
hud.textContent='四轮全地形车 · F 进出 · W / S 前进、制动后倒车 · A / D 车把转向 · Shift 加速 · Space 刹车 · T 视角';presentation.ui.mount(hud);
const button=document.createElement('button');button.textContent='走近全地形车';button.onclick=async()=>{await world.execute({type:'vehicle.approach',instanceId:'atv-instance-1'});presentation.focus();};hud.append(button);
await world.start();presentation.focus();
