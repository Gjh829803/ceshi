import * as THREE from 'three';
import {createWorld,HumanoidCharacter,type EnvironmentDefinition,type VehicleSpec} from '@worldkit/three';
// Asset discovery supplies IDs; compiler closes primary models, clips, notices and hashes.
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map((a:{id:string})=>[a.id,a]));
const selected=catalog.assets.find((a:{id:string})=>a.id==='vehicle.ski');
const resources=new Map<string,string>(catalog.assets.flatMap((a:any)=>a.resources??[]).map((r:any)=>[r.path,r.uri]));
const character=new HumanoidCharacter();
await character.load((logicalPath:string)=>{const uri=resources.get(logicalPath);if(!uri)throw new Error(`Missing resource ${logicalPath}`);return new URL(uri,document.baseURI).href;});
const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.4));
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,500);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const rise=Math.tan(Math.PI/15)*80;
const map:EnvironmentDefinition={id:'alpine-ski',name:'双板滑雪坡',description:'12° 压实雪坡与平坦起步区',bounds:{min:[-100,-10,-130],max:[100,100,100]},
 boxes:[{id:'ground',position:[0,-.5,-15],size:[200,1,230],color:'#e4e8e9'},
 {id:'snow-slope',position:[0,rise/2-.25*Math.cos(Math.PI/15),.25*Math.sin(Math.PI/15)],size:[50,.5,80/Math.cos(Math.PI/15)],rotation:[-Math.PI/15,0,0],color:'#f3f4f5'},
 {id:'boarding-deck',position:[0,rise/2,46],size:[50,rise,12],color:'#f3f4f5'},
 {id:'stop-wall',position:[0,1.5,-90],size:[50,3,.5],color:'#bac2c6'},
 ...[-1,1].flatMap(side=>[25,5,-15,-35].map((z,i)=>({id:`marker-${side}-${i}`,position:[side*20,Math.max(0,Math.tan(Math.PI/15)*(z+40))+.6,z] as [number,number,number],size:[.3,1.2,.3] as [number,number,number],color:'#df7440'})))],
 water:[],regions:[{id:'snow',name:'滑雪坡',description:'穿板、撑杖、顺坡滑行、压弯和制动',center:[0,0,0],size:[80,180],color:'#e8be73',modes:['character','ski']}],
 spawns:[{id:'ski-start',vehicleId:'ski-instance-1',name:'双板',position:[0,rise+.025,43],yaw:Math.PI,regionId:'snow'}],playerSpawn:[1.8,rise+.025,43]};
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
surface(200,230,[0,0,-15],'#e4e8e9');
structure('snow-slope',[50,.5,80/Math.cos(Math.PI/15)],[0,rise/2-.25*Math.cos(Math.PI/15),.25*Math.sin(Math.PI/15)],[-Math.PI/15,0,0]);
structure('boarding-deck',[50,rise,12],[0,rise/2,46]);
structure('stop-wall',[50,3,.5],[0,1.5,-90]);
for(const side of [-1,1])for(const z of [25,5,-15,-35])marker(side*20,Math.max(0,Math.tan(Math.PI/15)*(z+40))+.6,z,1.2);
const vehicleObject=new THREE.Group();
const spec=structuredClone(selected.humanoid.spec) as VehicleSpec;
const world=await createWorld({scene,camera,canvas,assetDefinitions:definitions,humanoid:{map,vehicles:[{instanceId:'ski-instance-1',assetId:selected.id,spec,object:vehicleObject}],character:{instanceId:'person',object:character.root,animation:character}}});
// The same catalog asset can be loaded/cloned into additional independent instance roots.
const model=await world.assets.load(selected.id);vehicleObject.add(model.object);

world.setCaptureTargets([{entityId:'person'},{entityId:'ski-instance-1'}]);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;background:#102c35d9;color:white;padding:12px;font:14px sans-serif';
hud.textContent='双板滑雪 · F 穿脱 · W 低速撑杖 · A / D 压刃转弯 · S / Space 制动 · 松键顺坡滑行';presentation.ui.mount(hud);
const button=document.createElement('button');button.textContent='走近双板';button.onclick=async()=>{await world.execute({type:'humanoid.approach',instanceId:'ski-instance-1'});presentation.focus();};hud.append(button);
await world.start();presentation.focus();
