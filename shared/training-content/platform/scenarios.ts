import { Quaternion, Vector3 } from 'three';
import { training } from '@worldkit/three';
const { createVehicle }=training;
type Simulation=training.Simulation;
import { getMap } from '../environment/maps';
import { SPECS } from '../config';

const { vehicleBody }=training;
import type { MapDefinition, MapSpawn } from '../environment/types';
/** Map entry follows authored spawn priority, not the region display order. */
export function defaultRegion(map:MapDefinition,assetId:string){
 const mode=assetId==='person'?'character':SPECS.find(s=>s.id===assetId)?.mode;
 const compatible=(spawn:MapSpawn)=>map.regions.find(r=>r.id===spawn.regionId&&!!mode&&r.modes.includes(mode));
 const spawn=map.spawns.find(s=>s.vehicleId===assetId&&compatible(s))??map.spawns.find(s=>!s.vehicleId&&compatible(s));
 const region=spawn&&compatible(spawn);if(!region)throw new Error('地图没有适用出生区');return region;
}
export interface Scenario { id:string; name:string; description:string; vehicleId:string|null; position:readonly[number,number,number]; yaw:number; status:'available'|'planned'; regionId?:string }
const aliases=[['campus','staging',null],['track','circuit','rover'],['slope','grades','hover'],['water','water','boat'],['underwater','water','sub'],['airfield','airfield','plane'],['space','six-dof','space'],['indoor','indoor',null]] as const;
export const SCENARIOS:readonly Scenario[]=aliases.map(([id,regionId,vehicleId])=>{const map=getMap('campus'),region=map.regions.find(r=>r.id===regionId)!,spawn=map.spawns.find(s=>s.regionId===regionId&&s.vehicleId===vehicleId)??map.spawns.find(s=>s.regionId===regionId&&!s.vehicleId)!;return {id,regionId,name:region.name,description:region.description,vehicleId,position:spawn.position,yaw:spawn.yaw,status:'available'};});
/** Call after TrainingSession switches maps. A course resets only the selected asset. */
export function prepareCourse(sim:Simulation,map:MapDefinition,regionId:string,assetId:string):void{
 const region=map.regions.find(r=>r.id===regionId),q=sim.environment;
 if(!q||q.map.id!==map.id)throw new Error('请先切换到对应地图');
 if(!region)throw new Error('未找到训练区域');
 const isCharacter=assetId==='person'||assetId==='character',index=sim.vehicles.findIndex(v=>v.spec.id===assetId),vehicle=sim.vehicles[index];
 if(!isCharacter&&!vehicle)throw new Error('未找到载具');
 if(!region.modes.includes(isCharacter?'character':vehicle!.spec.mode))throw new Error('此区域不支持当前运动类别');
 const spawns=map.spawns.filter(s=>s.regionId===regionId);
 const spawn=(vehicle&&spawns.find(s=>s.vehicleId===assetId))??(vehicle&&spawns.find(s=>s.vehicleId===vehicle.spec.archetype))??spawns.find(s=>!s.vehicleId);
 if(!spawn)throw new Error('该区域没有准备点');
 const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spawn.yaw);
 const offsets=[[0,0],[0,-10],[0,10],[-10,0],[10,0],[0,-20],[0,20],[-20,0],[20,0],[-10,-10],[10,-10]];
 for(const [dx=0,dz=0] of offsets){
  const position=new Vector3(...spawn.position).add(new Vector3(dx,0,dz)),water=q.waterAt(position),floor=q.support(position,150,.5);
  if(isCharacter){
   position.y=water?water.surface-1.25:floor?.height??position.y;
   const safe=q.safeSpawn(position);if(!safe||sim.vehicles.some(v=>v.position.distanceTo(safe)<v.spec.radius+1))continue;
   if(sim.humanoid){if(!sim.prepareCharacter(safe,spawn.yaw))continue;sim.message=`已准备 ${region.name} · WASD 自由探索`;return;}
   sim.active=-1;sim.transition=0;sim.transitionKind='';sim.teleportRevision++;sim.player.position.copy(safe);sim.player.velocity.set(0,0,0);
   Object.assign(sim.player,{yaw:spawn.yaw,grounded:!water,swimming:!!water,coyote:water?0:.1,jumpBuffer:0,landTimer:0,animation:water?'Swim_Idle_Loop':'Idle_Loop'});
   sim.message=`已准备 ${region.name} · WASD 自由探索`;return;
  }
  const v=vehicle!,body=vehicleBody(v.spec),mode=v.spec.mode;
  const clearance=body.kind==='box'?Math.max(0,body.halfExtents[1]-body.offset[1]):0;
  if(mode==='boat'||mode==='sub'){if(!water)continue;position.y=water.surface+(mode==='boat'?.1:-1.1);}
  else if(mode==='hover')position.y=(water?.surface??floor?.height??position.y)+1.3;
  else position.y=(floor?.height??position.y)+Math.max(mode==='space'?.8:0,clearance)+.025;
  const safe=q.safeSpawn(position,body,rotation);if(!safe)continue;
  // Avoid occupying an archetype's parked instance when staging one of its variants.
  const radius=body.kind==='box'?Math.hypot(body.halfExtents[0],body.halfExtents[2]):body.radius;
  if(sim.vehicles.some(other=>other!==v&&Math.hypot(other.position.x-safe.x,other.position.z-safe.z)<radius+other.spec.radius+1))continue;
  const prepared:MapSpawn={...spawn,id:`${spawn.id}:${assetId}`,vehicleId:assetId,position:[safe.x,safe.y,safe.z]};
  if(sim.prepare(index,prepared)){sim.message=`已准备 ${region.name} / ${v.spec.name} · 按 F 驾驶`;return;}
 }
 throw new Error('该区域没有足够的安全准备空间');
}
/** Legacy callers use the same campus descriptions; production resolves the active map's regions. */
export function applyScenario(sim:Simulation,id:string):Scenario{
 const scenario=SCENARIOS.find(s=>s.id===id);if(!scenario)throw new Error('未找到训练场景');
 if(sim.environment){prepareCourse(sim,sim.environment.map,scenario.regionId!,scenario.vehicleId??'character');return scenario;}
 if(scenario.vehicleId){const vehicle=sim.vehicles.find(v=>v.spec.id===scenario.vehicleId);if(!vehicle)throw new Error('场景所需载具未加载');Object.assign(vehicle,createVehicle(vehicle.spec));vehicle.position.set(...scenario.position);if(vehicle.spec.mode==='hover')vehicle.position.y+=1.3;vehicle.yaw=scenario.yaw;vehicle.rotation.setFromAxisAngle(new Vector3(0,1,0),scenario.yaw);if(!sim.approach(scenario.vehicleId))throw new Error(sim.message);}
 else{sim.active=-1;sim.transition=0;sim.transitionKind='';sim.teleportRevision++;sim.player.position.set(...scenario.position);sim.player.velocity.set(0,0,0);Object.assign(sim.player,{grounded:true,swimming:false,coyote:.1,jumpBuffer:0,landTimer:0,animation:'Idle_Loop',yaw:scenario.yaw});}
 sim.message=`已准备 ${scenario.name}`;return scenario;
}
