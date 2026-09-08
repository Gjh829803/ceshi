import * as THREE from 'three';
import {createWorld,TrainingCharacter,type TrainingMap,type TrainingVehicleSpec} from '@worldkit/three';
// Asset discovery supplies IDs; compiler closes primary models, clips, notices and hashes.
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map((a:{id:string})=>[a.id,a]));
const selected=catalog.assets.find((a:{id:string})=>a.id==='training.rover');
const resources=new Map<string,string>(catalog.assets.flatMap((a:any)=>a.resources??[]).map((r:any)=>[r.path,r.uri]));
const character=new TrainingCharacter();
await character.load((logicalPath:string)=>{const uri=resources.get(logicalPath);if(!uri)throw new Error(`Missing resource ${logicalPath}`);return new URL(uri,document.baseURI).href;});
const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight('#ffffff','#aaaaaa',2.4));
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,500);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const map:TrainingMap={id:'independent-course',name:'Independent asset course',description:'Not coupled to the training campus',bounds:{min:[-120,-10,-120],max:[120,100,120]},
  boxes:[{id:'ground',position:[0,-.5,0],size:[240,1,240],color:'#cccccc'},{id:'wall',position:[20,2,20],size:[20,4,1],color:'#eeeeee'}],
  water:[],regions:[{id:'road',name:'Course',description:'A reusable map module',center:[0,0,0],size:[200,200],color:'#e8be73',modes:['character','wheeled']}],
  spawns:[{id:'rover-start',vehicleId:'rover-instance-1',name:'Rover',position:[7,0,0],yaw:0,regionId:'road'}],playerSpawn:[0,0,0]};
for(const box of map.boxes){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),new THREE.MeshStandardMaterial({color:box.color??'#eeeeee'}));mesh.position.set(...box.position);scene.add(mesh);}
const vehicleObject=new THREE.Group();
const spec=structuredClone(selected.training.spec) as TrainingVehicleSpec;
const world=await createWorld({scene,camera,canvas,assetDefinitions:definitions,training:{map,vehicles:[{instanceId:'rover-instance-1',assetId:selected.id,spec,object:vehicleObject}],character:{instanceId:'person',object:character.root,animation:character}}});
// The same catalog asset can be loaded/cloned into additional independent instance roots.
const model=await world.assets.load(selected.id);vehicleObject.add(model.object);
world.training!.applyProfile({vehicles:{'rover-instance-1':{speed:22,accel:8,grip:11,steer:1}}});
world.setCaptureTargets([{entityId:'person'},{entityId:'rover-instance-1'}]);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;background:#102c35d9;color:white;padding:12px;font:14px sans-serif';
hud.textContent='独立资产世界 · WASD 移动 · F 上下车 · Space 越障';presentation.ui.mount(hud);
const button=document.createElement('button');button.textContent='前往越野车';button.onclick=async()=>{await world.execute({type:'training.approach',instanceId:'rover-instance-1'});presentation.focus();};hud.append(button);
await world.start();presentation.focus();
