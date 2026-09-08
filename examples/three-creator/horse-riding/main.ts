import * as THREE from 'three';
import {createWorld,TrainingCharacter,TrainingHorse,type TrainingMap,type TrainingVehicleSpec} from '@worldkit/three';
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map((a:{id:string})=>[a.id,a]));
const resources=new Map<string,string>(catalog.assets.flatMap((a:any)=>a.resources??[]).map((r:any)=>[r.path,r.uri]));
const resolve=(logicalPath:string)=>{const uri=resources.get(logicalPath);if(!uri)throw new Error(`Missing permitted resource ${logicalPath}`);return new URL(uri,document.baseURI).href;};
const character=new TrainingCharacter();await character.load(resolve);
const horses=[new TrainingHorse(),new TrainingHorse()];await Promise.all(horses.map(horse=>horse.load(resolve)));
const scene=new THREE.Scene();scene.background=new THREE.Color('#adcbd4');
scene.add(new THREE.HemisphereLight('#ffffff','#6c7652',2.4));
const sun=new THREE.DirectionalLight('#fff2d8',3);sun.position.set(-30,60,25);scene.add(sun);
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,900);camera.position.set(10,6,-12);camera.lookAt(0,1,0);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
const map:TrainingMap={id:'horse-course',name:'Two horses',description:'Walk to a safe side, ride, brake and dismount',bounds:{min:[-400,-10,-400],max:[400,100,400]},
 boxes:[{id:'ground',position:[0,-.5,0],size:[800,1,800],color:'#a7b58a'},{id:'obstacle',position:[-8,.7,12],size:[4,1.4,2],color:'#b47e58'}],water:[],
 regions:[{id:'course',name:'Open course',description:'Flat supported riding course',center:[0,0,0],size:[780,780],color:'#a7b58a',modes:['character','mount']}],
 spawns:[{id:'first',vehicleId:'horse-1',name:'First horse',position:[0,0,0],yaw:0,regionId:'course'},{id:'second',vehicleId:'horse-2',name:'Second horse',position:[9,0,0],yaw:Math.PI/2,regionId:'course'}],playerSpawn:[2,0,-4]};
for(const box of map.boxes){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),new THREE.MeshStandardMaterial({color:box.color}));mesh.position.set(...box.position);scene.add(mesh);}
const patch=new THREE.Mesh(new THREE.PlaneGeometry(4,5),new THREE.MeshStandardMaterial({color:'#dfcc92',roughness:1}));patch.rotation.x=-Math.PI/2;patch.position.set(2.5,.005,0);scene.add(patch);
const vehicles=horses.map((horse,index)=>({instanceId:`horse-${index+1}`,assetId:'training.horse',spec:structuredClone(definitions['training.horse'].training.spec) as TrainingVehicleSpec,object:horse.root,visual:horse,seatAnchor:{nodeName:'Body',maximumOffsetMeters:.145579,maximumRotationRadians:.122951}}));
const world=await createWorld({scene,camera,canvas,assetDefinitions:definitions,training:{map,vehicles,character:{instanceId:'person',object:character.root,animation:character}}});
// Unit identity group preserves both SDK-owned roots and their world-space transforms.
const assembly=new THREE.Group();assembly.add(horses[0]!.root,character.root);
world.addEntity({id:'horse-rider-assembly',object:assembly,role:'decoration',frontYawRadians:Math.PI});
world.setCaptureTargets([{entityId:'horse-rider-assembly'},{entityId:'horse-2'}]);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;background:#19352ddb;color:white;padding:12px;font:14px sans-serif;white-space:pre';
presentation.ui.mount(hud);
world.onUpdate(()=>{const s=world.snapshot().training;hud.textContent=`骑马 · WASD 移动 / 转向 · F 上下马 · Shift 疾驰 · Space 制动\n${s?.mountedInstanceId??'步行'} · ${s?.transition.kind??''} ${s?.transition.remainingSeconds.toFixed(2)??''}s\n${s?.message??''}`;});
const controls=document.createElement('div');presentation.ui.mount(controls);
const button=document.createElement('button');button.textContent='请求上第一匹马';button.onclick=async()=>{const receipt=await world.execute({type:'training.enter',instanceId:'horse-1'});result.textContent=JSON.stringify(receipt,null,2);presentation.focus();};controls.append(button);
const result=document.createElement('pre');controls.append(result);
// Read-only acceptance diagnostics. These never advance animation or alter logical state.
(window as any).__MOUNTED_DIAGNOSTICS__=()=>{
 const snapshot=world.snapshot(),id=snapshot.training?.mountedInstanceId,index=vehicles.findIndex(v=>v.instanceId===id);
 if(index<0)return {mountedInstanceId:null,pelvisErrorMeters:null};
 const horse=horses[index]!,vehicle=vehicles[index]!;
 horse.root.updateWorldMatrix(true,true);
 const anchor=horse.root.matrixWorld.clone().multiply(horse.readSeatAnchor(vehicle.spec.seat,vehicle.seatAnchor));
 const actual=character.hip?.getWorldPosition(new THREE.Vector3());
 return {mountedInstanceId:id,pelvisErrorMeters:actual?actual.distanceTo(new THREE.Vector3().setFromMatrixPosition(anchor)):null,logicalRootScales:horses.map(h=>h.root.scale.toArray()),loaded:horses.map(h=>h.loaded)};
};
await world.start();presentation.focus();
