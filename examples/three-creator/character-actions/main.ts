import * as THREE from 'three';
import {createWorld,TrainingCharacter,type TrainingMap} from '@worldkit/three';

// The Host supplies these exact resources after project.json passes asset policy.
const catalog=await (await fetch('./asset-definitions.json')).json();
const definitions=Object.fromEntries(catalog.assets.map((asset:{id:string})=>[asset.id,asset]));
const resources=new Map<string,string>(catalog.assets.flatMap((asset:any)=>asset.resources??[]).map((r:any)=>[r.path,r.uri]));
const character=new TrainingCharacter();
await character.load(logicalPath=>{
 const uri=resources.get(logicalPath);if(!uri)throw new Error(`Missing character resource: ${logicalPath}`);
 return new URL(uri,document.baseURI).href;
});
const scene=new THREE.Scene();scene.background=new THREE.Color('#9ec8dc');
scene.add(new THREE.HemisphereLight('#ffffff','#52604e',2.5));
const sun=new THREE.DirectionalLight('#fff1d7',3);sun.position.set(8,15,10);scene.add(sun);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.05,150);
camera.position.set(3.5,3.8,8);camera.lookAt(3.5,1,0);
const canvas=document.createElement('canvas');document.body.append(canvas);

// Water is a declared volume AND a visual plane. The actual pool floor is 2 m
// below its surface; extending a ground collider across it would prevent swimming.
const map:TrainingMap={
 id:'character-actions',name:'人物与深水',description:'Character-only integration example',
 bounds:{min:[-25,-5,-20],max:[40,30,20]},
 boxes:[
  {id:'near-bank',position:[-10,-.5,0],size:[30,1,40],color:'#889e73'},
  {id:'pool-floor',position:[10.5,-2.5,0],size:[11,1,40],color:'#a4b8b1'},
  {id:'far-bank',position:[28,-.5,0],size:[24,1,40],color:'#889e73'},
 ],
 water:[{id:'pool',min:[5,-2,-20],max:[16,0,20],surface:0}],
 regions:[],spawns:[],playerSpawn:[3.5,.04,0],characterCameraDistanceMeters:7,
};
for(const box of map.boxes){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...box.size),new THREE.MeshStandardMaterial({color:box.color}));
 mesh.position.set(...box.position);scene.add(mesh);
}
const water=new THREE.Mesh(new THREE.PlaneGeometry(11,40),new THREE.MeshStandardMaterial({color:'#3997ba',transparent:true,opacity:.55,roughness:.3,side:THREE.DoubleSide}));
water.rotation.x=-Math.PI/2;water.position.set(10.5,0,0);scene.add(water);

// Select the Training backend at initialization: one SDK clock/physics/animation
// owner. Do not also addCharacter or run character.update/another AnimationMixer.
const world=await createWorld({scene,camera,canvas,assetDefinitions:definitions,training:{
 map,vehicles:[],character:{instanceId:'person',object:character.root,animation:character},
}});
world.setCaptureTargets(['person']);
const presentation=world.createPresentation();
const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;max-width:460px;padding:12px;background:#16313ddd;color:white;font:14px sans-serif';
const help=document.createElement('p');help.textContent='V 翻滚 · Q 助跑后滑铲 · C 蹲伏 · Z 匍匐。朝水池方向走入深水自动游泳，N 切换泳姿；靠岸朝向岸边 + Space 尝试上岸。';
const button=document.createElement('button');button.textContent='通过 SDK 命令翻滚';
const result=document.createElement('pre'),status=document.createElement('pre');
button.onclick=async()=>{
 const receipt=await world.execute({type:'training.action',request:{requestId:crypto.randomUUID(),action:'roll'}});
 result.textContent=JSON.stringify(receipt,null,2);presentation.focus();
 // An accepted receipt is not completion. A model uses the returned operationId
 // with world_get_operation; a page can query world.operations.get(operationId).
};
hud.append(help,button,result,status);presentation.ui.mount(hud);
world.training!.onVisualUpdate(()=>{status.textContent=JSON.stringify(world.snapshot().training?.character,null,2);});
await world.start();presentation.focus();
