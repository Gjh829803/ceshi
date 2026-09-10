import * as THREE from 'three';
import {createWorld,HumanoidCharacter,type EnvironmentDefinition,type VehicleSpec} from '@worldkit/three';
// Asset discovery supplies IDs; compiler closes primary models, clips, notices and hashes.
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map((a:{id:string})=>[a.id,a]));
const selected=catalog.assets.find((a:{id:string})=>a.id==='vehicle.jetski');
const resources=new Map<string,string>(catalog.assets.flatMap((a:any)=>a.resources??[]).map((r:any)=>[r.path,r.uri]));
const character=new HumanoidCharacter();
await character.load((logicalPath:string)=>{const uri=resources.get(logicalPath);if(!uri)throw new Error(`Missing resource ${logicalPath}`);return new URL(uri,document.baseURI).href;});
const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.4));
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,500);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const map:EnvironmentDefinition={id:'jetski-course',name:'水上摩托试驾水域',description:'跨坐、喷口转向、浮力与水花验收',bounds:{min:[-220,-30,-220],max:[220,100,220]},
 boxes:[{id:'floor',position:[0,-21,0],size:[440,2,440],color:'#cccccc'},{id:'dock',position:[2.7,-.2,0],size:[2,.8,8],color:'#eeeeee'},...[-1,1].flatMap(side=>[25,50,75].map(z=>({id:`marker-${side}-${z}`,position:[side*18,.6,z] as [number,number,number],size:[.4,1.2,.4] as [number,number,number],color:'#bad43e'})))],
 water:[{id:'water',min:[-219,-20,-219],max:[219,0,219],surface:0}],regions:[{id:'water',name:'Water',description:'Jet ski test course',center:[0,0,0],size:[430,430],color:'#67a9bb',modes:['character','boat']}],
 spawns:[{id:'jetski-start',vehicleId:'jetski-instance-1',name:'水上摩托',position:[0,.03,0],yaw:0,regionId:'water'}],playerSpawn:[2,.215,0]};
const waterMesh=new THREE.Mesh(new THREE.PlaneGeometry(438,438),new THREE.MeshStandardMaterial({color:'#4d97b1',roughness:1}));waterMesh.rotation.x=-Math.PI/2;waterMesh.position.y=0;scene.add(waterMesh);
for(const box of map.boxes){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),new THREE.MeshStandardMaterial({color:box.color??'#eeeeee'}));mesh.position.set(...box.position);if(box.rotation)mesh.rotation.set(...box.rotation);scene.add(mesh);}
const vehicleObject=new THREE.Group();
const spec=structuredClone(selected.humanoid.spec) as VehicleSpec;
const world=await createWorld({scene,camera,canvas,assetDefinitions:definitions,humanoid:{map,vehicles:[{instanceId:'jetski-instance-1',assetId:selected.id,spec,object:vehicleObject}],character:{instanceId:'person',object:character.root,animation:character}}});
// The same catalog asset can be loaded/cloned into additional independent instance roots.
const model=await world.assets.load(selected.id);vehicleObject.add(model.object);

world.setCaptureTargets([{entityId:'person'},{entityId:'jetski-instance-1'}]);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;background:#102c35d9;color:white;padding:12px;font:14px sans-serif';
hud.textContent='水上摩托 · F 进出 · W / S 前进、制动后倒车 · A / D 车把转向 · Shift 加速 · Space 水阻制动 · T 视角';presentation.ui.mount(hud);
const button=document.createElement('button');button.textContent='走近水上摩托';button.onclick=async()=>{await world.execute({type:'humanoid.approach',instanceId:'jetski-instance-1'});presentation.focus();};hud.append(button);
const cycleCamera=(key:KeyboardEvent)=>{if(key.code==='KeyT'&&!key.repeat){const mode=((world.snapshot().humanoid!.cameraMode+1)%3) as 0|1|2;void world.execute({type:'humanoid.camera',mode});}};
window.addEventListener('keydown',cycleCamera);world.onDispose(()=>window.removeEventListener('keydown',cycleCamera));
await world.start();presentation.focus();
