import {resolvePresetResource} from '@worldkit/preset-content/assets/resources';
import * as THREE from 'three';
import {humanoid} from '@worldkit/three';
import {SPECS,type VehicleSpec} from '@worldkit/preset-content/config';
import {DRAGON_VARIANTS,type DragonVariant} from '@worldkit/preset-content/dragon-variants';
import {buildVehicle,labelSprite,type VehicleVisual} from '@worldkit/preset-content/models';
import {getMap} from '@worldkit/preset-content/environment/maps';
import {assetIdForPreset} from '@worldkit/preset-content/platform/catalog';

export const map=structuredClone(getMap('campus'));
// Keep the opening rover's established identity; all other instances are loaded on demand.
map.spawns=map.spawns.map(spawn=>spawn.vehicleId==='rover'?{...spawn,vehicleId:'car'}:spawn);
export const choices=SPECS.flatMap(spec=>spec.id==='dragon'
 ?DRAGON_VARIANTS.map(dragon=>({id:`dragon-${dragon.id}`,name:dragon.name,spec,dragon}))
 :[{id:spec.id,name:spec.name,spec,dragon:undefined as DragonVariant|undefined}]);
export type Choice=typeof choices[number];
export type LoadedVehicle={id:string;choice:Choice;spec:VehicleSpec;visual:VehicleVisual;flyingVisual?:humanoid.FlyingCreatureVisual;adopt:()=>void;dispose:()=>void};
export function instanceId(choice:Choice){return choice.id==='rover'?'car':`lab-${choice.id}`;}
export async function loadVehicle(choice:Choice):Promise<LoadedVehicle>{
 const dragon=choice.dragon;
 const spec:VehicleSpec=dragon?{...humanoid.createFlyingCreatureSpec('dragon'),name:dragon.name,
  ...(dragon.ground?{flyingCreatureGround:dragon.ground}:{}),...(dragon.seat?{seat:dragon.seat}:{}),
  ...(dragon.envelope?{envelope:dragon.envelope}:{}),...(dragon.collisionProbes?{flyingCreatureCollision:dragon.collisionProbes}:{}),spawn:[80,.225,35]}:structuredClone(choice.spec);
 // Flying creatures initialize airborne; their existing summon flow provides safe landing.
 if(dragon){spec.spawn=[-420,22,-360+DRAGON_VARIANTS.indexOf(dragon)*60];}
 const spawn=map.spawns.find(s=>s.vehicleId===(choice.id==='rover'?'car':choice.id));
 if(spawn){spec.spawn=[...spawn.position];spec.yaw=spawn.yaw;}
 let flyingVisual:humanoid.FlyingCreatureVisual|undefined;
 let visual:VehicleVisual;
 if(dragon){flyingVisual=new humanoid.FlyingCreatureVisual();const seat=new THREE.Group(),label=labelSprite(dragon.name);flyingVisual.root.add(label);visual={root:flyingVisual.root,seat,label,wheels:[],wheelRigs:[],rotors:[],steering:[],engine:[]};}
 else visual=buildVehicle(spec);
 visual.label.visible=false;
 let released=false,transferred=false;
 const dispose=()=>{
  if(released)return;released=true;visual.creature?.dispose();if(!transferred)flyingVisual?.dispose();
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>([visual.label.material]),textures=new Set<THREE.Texture>();
  // Creature owners remove shared/imported parts before releasing the page-owned shell.
  if(!flyingVisual)visual.root.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}});
  for(const m of materials)for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);
  for(const resource of [...geometries,...materials,...textures])resource.dispose();visual.root.removeFromParent();
 };
 try{
  if(flyingVisual&&dragon)await flyingVisual.load({dragonUrl:resolvePresetResource('flying-creatures/'+dragon.id+'/model.glb'),loadTextures:true,animationPrefix:dragon.id,flameTextureUrl:resolvePresetResource('flying-creatures/flame.png')});
  await visual.creature?.load();
  return {id:instanceId(choice),choice,spec,visual,...(flyingVisual?{flyingVisual}:{}),adopt:()=>{transferred=true;},dispose};
 }catch(error){dispose();throw error;}
}
export function vehicleBinding(entry:LoadedVehicle){return {instanceId:entry.id,assetId:assetIdForPreset(entry.spec,entry.choice.dragon?.id),spec:entry.spec,object:entry.visual.root,...(entry.flyingVisual?{flyingVisual:entry.flyingVisual}:{})};}
