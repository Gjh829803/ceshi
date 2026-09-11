import * as THREE from 'three';
import {createWorld,HumanoidCharacter,type EnvironmentDefinition,type VehicleSpec} from '@worldkit/three';
// Asset discovery supplies IDs; compiler closes primary models, clips, notices and hashes.
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map((a:{id:string})=>[a.id,a]));
const selected=catalog.assets.find((a:{id:string})=>a.id==='vehicle.raft');
const resources=new Map<string,string>(catalog.assets.flatMap((a:any)=>a.resources??[]).map((r:any)=>[r.path,r.uri]));
const character=new HumanoidCharacter();
await character.load((logicalPath:string)=>{const uri=resources.get(logicalPath);if(!uri)throw new Error(`Missing resource ${logicalPath}`);return new URL(uri,document.baseURI).href;});
const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.4));
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,500);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const a=Math.atan(.2);
const map:EnvironmentDefinition={id:'raft-course',name:'橡皮艇岸坡试验',description:'陆地下滑、弹性接触、入水与划桨',bounds:{min:[-120,-30,-100],max:[120,100,300]},
 boxes:[{id:'floor',position:[0,-11,100],size:[240,2,400],color:'#cccccc'},{id:'ramp',position:[0,-.2*Math.cos(a),0],size:[16,.4,40/Math.cos(a)],rotation:[a,0,0],color:'#dddddd'},{id:'board-step',position:[2.1,2.9,-15],size:[1.5,.2,3],color:'#eeeeee'},{id:'pier',position:[0,1,65],size:[14,4,.6],color:'#cccccc'}],
 water:[{id:'water',min:[-119,-10,0],max:[119,0,299],surface:0}],regions:[{id:'water',name:'Shore',description:'Sloping bank and water',center:[0,0,90],size:[230,390],color:'#67a9bb',modes:['character','paddled_boat']}],
 spawns:[{id:'raft-start',vehicleId:'raft-instance-1',name:'橡皮艇',position:[0,3.95,-15],yaw:0,regionId:'water'}],playerSpawn:[1.9,3.015,-15]};
const waterMesh=new THREE.Mesh(new THREE.PlaneGeometry(238,299),new THREE.MeshStandardMaterial({color:'#4d97b1',roughness:1}));waterMesh.rotation.x=-Math.PI/2;waterMesh.position.set(0,0,149.5);scene.add(waterMesh);
// Author visible surfaces from the scene design; map contains physical support only.
function surface(width:number,depth:number,position:[number,number,number],color='#dddddd'){
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({color,roughness:1}));
 mesh.rotation.x=-Math.PI/2;mesh.position.set(...position);scene.add(mesh);return mesh;
}
function structure(name:string,size:[number,number,number],position:[number,number,number],rotation:[number,number,number]=[0,0,0],color='#eeeeee'){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:1}));
 mesh.name=name;mesh.position.set(...position);mesh.rotation.set(...rotation);scene.add(mesh);return mesh;
}
surface(240,400,[0,-10,100]);
structure('shore-slope',[16,.4,40/Math.cos(a)],[0,-.2*Math.cos(a),0],[a,0,0]);
structure('boarding-step',[1.5,.2,3],[2.1,2.9,-15]);
structure('pier',[14,4,.6],[0,1,65]);
const vehicleObject=new THREE.Group();
const spec=structuredClone(selected.humanoid.spec) as VehicleSpec;
const world=await createWorld({scene,camera,canvas,assetDefinitions:definitions,humanoid:{map,vehicles:[{instanceId:'raft-instance-1',assetId:selected.id,spec,object:vehicleObject}],character:{instanceId:'person',object:character.root,animation:character}}});
// The same catalog asset can be loaded/cloned into additional independent instance roots.
const model=await world.assets.load(selected.id);vehicleObject.add(model.object);

world.setCaptureTargets([{entityId:'person'},{entityId:'raft-instance-1'}]);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;background:#102c35d9;color:white;padding:12px;font:14px sans-serif';
hud.textContent='橡皮艇 · F 进出 · W / S 划桨、倒划 · A / D 换侧转向 · Shift 快划 · Space 制动 · T 视角';presentation.ui.mount(hud);
const button=document.createElement('button');button.textContent='走近橡皮艇';button.onclick=async()=>{await world.execute({type:'humanoid.approach',instanceId:'raft-instance-1'});presentation.focus();};hud.append(button);
const cycleCamera=(key:KeyboardEvent)=>{if(key.code==='KeyT'&&!key.repeat){const mode=((world.snapshot().humanoid!.cameraMode+1)%3) as 0|1|2;void world.execute({type:'humanoid.camera',mode});}};
window.addEventListener('keydown',cycleCamera);world.onDispose(()=>window.removeEventListener('keydown',cycleCamera));
await world.start();presentation.focus();
