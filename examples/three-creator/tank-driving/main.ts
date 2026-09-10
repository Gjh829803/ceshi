import * as THREE from 'three';
import {createWorld,HumanoidCharacter,type EnvironmentDefinition,type VehicleSpec} from '@worldkit/three';
// Asset discovery supplies IDs; compiler closes primary models, clips, notices and hashes.
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map((a:{id:string})=>[a.id,a]));
const selected=catalog.assets.find((a:{id:string})=>a.id==='vehicle.tank');
const resources=new Map<string,string>(catalog.assets.flatMap((a:any)=>a.resources??[]).map((r:any)=>[r.path,r.uri]));
const character=new HumanoidCharacter();
await character.load((logicalPath:string)=>{const uri=resources.get(logicalPath);if(!uri)throw new Error(`Missing resource ${logicalPath}`);return new URL(uri,document.baseURI).href;});
const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.4));
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,500);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const map:EnvironmentDefinition={id:'tank-course',name:'坦克试车场',description:'驾驶舱、差速履带和独立炮塔操作验收',bounds:{min:[-120,-10,-120],max:[120,100,120]},
  boxes:[{id:'ground',position:[0,-.5,0],size:[240,1,240],color:'#cccccc'},{id:'wall',position:[0,2.5,90],size:[45,5,1],color:'#eeeeee'},...[-1,1].flatMap(side=>[0,25,50,75].map(z=>({id:`marker-${side}-${z}`,position:[side*18,.75,z] as [number,number,number],size:[.4,1.5,.4] as [number,number,number],color:'#c9843f'})))],
  water:[],regions:[{id:'road',name:'Course',description:'A reusable map module',center:[0,0,0],size:[200,200],color:'#e8be73',modes:['character','tank']}],
  spawns:[{id:'tank-start',vehicleId:'tank-instance-1',name:'履带坦克',position:[0,.025,0],yaw:0,regionId:'road'}],playerSpawn:[3.5,.025,0]};
for(const box of map.boxes){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),new THREE.MeshStandardMaterial({color:box.color??'#eeeeee'}));mesh.position.set(...box.position);scene.add(mesh);}
const vehicleObject=new THREE.Group();
const spec=structuredClone(selected.humanoid.spec) as VehicleSpec;
const world=await createWorld({scene,camera,canvas,assetDefinitions:definitions,humanoid:{map,vehicles:[{instanceId:'tank-instance-1',assetId:selected.id,spec,object:vehicleObject}],character:{instanceId:'person',object:character.root,animation:character}}});
// The same catalog asset can be loaded/cloned into additional independent instance roots.
const model=await world.assets.load(selected.id);vehicleObject.add(model.object);

world.setCaptureTargets([{entityId:'person'},{entityId:'tank-instance-1'}]);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;background:#102c35d9;color:white;padding:12px;font:14px sans-serif';
hud.textContent='履带坦克 · F 进出 · W / S 前进、制动后倒车 · A / D 差速转向 · Shift 加速 · Space 刹车 · Q / E 炮塔 · ↑ / ↓ 炮管 · T 视角';presentation.ui.mount(hud);
const button=document.createElement('button');button.textContent='走近坦克';button.onclick=async()=>{await world.execute({type:'humanoid.approach',instanceId:'tank-instance-1'});presentation.focus();};hud.append(button);
const cycleCamera=(key:KeyboardEvent)=>{if(key.code==='KeyT'&&!key.repeat){const mode=((world.snapshot().humanoid!.cameraMode+1)%3) as 0|1|2;void world.execute({type:'humanoid.camera',mode});}};
window.addEventListener('keydown',cycleCamera);world.onDispose(()=>window.removeEventListener('keydown',cycleCamera));
await world.start();presentation.focus();
