import * as THREE from 'three';
import {createHumanoidWorld,humanoid,type EnvironmentDefinition,type HumanoidAssetDefinition} from '@worldkit/three';

// To select D02–D11, change this ID and the matching project.json assetIds entry.
// The selected asset supplies its own model, clips, core collision and ground calibration.
const assetId='creature.dragon.d01';
type FlyingAsset=HumanoidAssetDefinition & {
  vehicle:{spec:humanoid.VehicleSpec};
  integrationMetadata:{visual:{animationPrefix:string;modelResource:string;flameResource:string}};
};
const response=await fetch('./asset-definitions.json');
if(!response.ok)throw new Error(`ASSET_DEFINITIONS_FAILED: ${response.status}`);
const catalog=await response.json() as {assets:HumanoidAssetDefinition[]};
const asset=catalog.assets.find(asset=>asset.id===assetId) as FlyingAsset|undefined;
if(!asset)throw new Error(`FLYING_CREATURE_ASSET_MISSING: ${assetId}`);
const resources=new Map((asset.resources??[]).map(resource=>[resource.path,resource.uri]));
function resourceUrl(logicalPath:string):string{
  const uri=resources.get(logicalPath);
  if(!uri)throw new Error(`FLYING_CREATURE_RESOURCE_MISSING: ${logicalPath}`);
  return new URL(uri,document.baseURI).href;
}
const spec=structuredClone(asset.vehicle.spec);spec.id='training-dragon';
const ground=spec.flyingCreatureGround;
if(!ground)throw new Error('FLYING_CREATURE_GROUND_REQUIRED');
const visual=new humanoid.FlyingCreatureVisual();
const binding=asset.integrationMetadata.visual;

const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
scene.add(new THREE.HemisphereLight(0xffffff,0xbbbbbb,2));
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,2000);
const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100vw;height:100vh';document.body.append(canvas);
// The native controller starts airborne. H summons this existing instance to a
// validated landing beside the ground character; F only boards after it arrives.
spec.spawn=[0,40,0];spec.yaw=0;
const map:EnvironmentDefinition={id:'flying-creature',name:'Native dragon flight',
 description:'Ground boarding, takeoff, flight, flame and landing with one supplied humanoid',
 bounds:{min:[-600,-20,-600],max:[600,600,600]},
 boxes:[{id:'ground',position:[0,-1,0],size:[1200,2,1200],color:'#dddddd'}],water:[],
 regions:[{id:'flight-field',name:'Flight field',description:'Walking and dragon flight',center:[0,0,0],size:[1100,1100],color:'#9daaa5',modes:['character','dragon']}],
 spawns:[{id:'dragon-start',vehicleId:spec.id,name:spec.name,position:spec.spawn,yaw:0,regionId:'flight-field'}],
 playerSpawn:[0,.025,0]};
const geometry=new THREE.BoxGeometry(1200,2,1200),material=new THREE.MeshStandardMaterial({color:'#dddddd',roughness:1});
const floor=new THREE.Mesh(geometry,material);floor.position.set(0,-1,0);scene.add(floor);
const disposeScene=()=>{floor.removeFromParent();geometry.dispose();material.dispose();canvas.remove();};
let world:Awaited<ReturnType<typeof createHumanoidWorld>>|undefined;
try{
  await visual.load({dragonUrl:resourceUrl(binding.modelResource),
    flameTextureUrl:resourceUrl(binding.flameResource),animationPrefix:binding.animationPrefix});
  world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'person',
   assetDefinitions:Object.fromEntries(catalog.assets.map(asset=>[asset.id,asset])),
   vehicles:[{instanceId:spec.id,assetId,object:visual.root,spec,flyingVisual:visual}],
   profile:{view:{defaultPerspective:'third-person',keyboardToggleEnabled:true}}});
  world.onDispose(disposeScene);
  world.setCaptureTargets(['person',spec.id]);
  const presentation=world.createPresentation();
  const hud=document.createElement('div');hud.style.cssText='position:absolute;left:16px;top:16px;padding:12px;background:#333c;color:white;font:14px sans-serif;white-space:pre-line';
  hud.textContent='先按 H 召唤并等待落稳。\nF 登乘/着陆/下龙 · Space 起飞/滑翔 · WASD 飞行 · E 喷火 · H 召唤 · T 镜头\n落稳后在鞍侧登乘，起降与上下龙以运行时状态为准。';presentation.ui.mount(hud);
  // createHumanoidWorld owns visual.root, its mixer, particles and disposal.
  await world.start();presentation.focus();
}catch(error){
  // Before transfer, the author owns the loaded visual. After creation the World
  // owns it, including failures while mounting Presentation or starting rendering.
  try{if(world)world.dispose();else{try{visual.dispose();}finally{disposeScene();}}}
  catch{/* Keep the initialization failure as the reported cause. */}
  throw error;
}
