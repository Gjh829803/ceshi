import { Quaternion, Vector3 } from 'three';
import { humanoid } from '@worldkit/three';
type Simulation=humanoid.Simulation;
import { SPECS } from '../config';

const { vehicleBody }=humanoid;
import type { EnvironmentDefinition, MapSpawn } from '../environment/types';
// Course preparation relocates the selected vehicle; it must not create a second initial spawn.
const campusGradePreparations:readonly MapSpawn[]=SPECS.filter(spec=>spec.wheelPhysics).map(spec=>({
 id:`powertrain-grade-${spec.id}`,vehicleId:spec.id,name:'12° 坡道起步',position:[27,0,139],yaw:0,regionId:'grades',
}));
/** Map entry follows authored spawn priority, not the region display order. */
export function defaultRegion(map:EnvironmentDefinition,assetId:string){
 const mode=assetId==='person'?'character':SPECS.find(s=>s.id===assetId)?.mode;
 const compatible=(spawn:MapSpawn)=>map.regions.find(r=>r.id===spawn.regionId&&!!mode&&r.modes.includes(mode));
 const spawn=map.spawns.find(s=>s.vehicleId===assetId&&compatible(s))??map.spawns.find(s=>!s.vehicleId&&compatible(s));
 const region=spawn&&compatible(spawn);if(!region)throw new Error('地图没有适用出生区');return region;
}
/** Call after the runtime switches maps. A course resets only the selected asset. */
export function prepareCourse(sim:Simulation,map:EnvironmentDefinition,regionId:string,assetId:string):void{
 const region=map.regions.find(r=>r.id===regionId),q=sim.environment;
 if(!q||q.map.id!==map.id)throw new Error('请先切换到对应地图');
 if(!region)throw new Error('未找到训练区域');
 const isCharacter=assetId==='person',index=sim.vehicles.findIndex(v=>v.spec.id===assetId),vehicle=sim.vehicles[index];
 if(!isCharacter&&!vehicle)throw new Error('未找到载具');
 if(!region.modes.includes(isCharacter?'character':vehicle!.spec.mode))throw new Error('此区域不支持当前运动类别');
 const spawns=[...(map.id==='campus'?campusGradePreparations:[]),...map.spawns].filter(s=>s.regionId===regionId);
 const spawn=(vehicle&&spawns.find(s=>s.vehicleId===assetId))??(vehicle&&spawns.find(s=>s.vehicleId===vehicle.spec.archetype))??spawns.find(s=>!s.vehicleId);
 if(!spawn)throw new Error('该区域没有准备点');
 const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spawn.yaw);
 const offsets=[[0,0],[0,-10],[0,10],[-10,0],[10,0],[0,-20],[0,20],[-20,0],[20,0],[-10,-10],[10,-10]];
 for(const [dx=0,dz=0] of offsets){
  const position=new Vector3(...spawn.position).add(new Vector3(dx,0,dz)),water=q.waterAt(position),floor=q.support(position,150,.5);
  if(isCharacter){
   position.y=water?water.surface-1.25:floor?.height??position.y;
   const safe=q.safeSpawn(position);if(!safe||sim.vehicles.some(v=>v.position.distanceTo(safe)<v.spec.radius+1))continue;
   if(!sim.controlledActor.prepareCharacter(safe,spawn.yaw))continue;
   sim.controlledActor.message=`已准备 ${region.name} · WASD 自由探索`;return;
  }
  const v=vehicle!,body=vehicleBody(v.spec),mode=v.spec.mode;
  const clearance=body.kind==='box'?Math.max(0,body.halfExtents[1]-body.offset[1]):0;
  if(mode==='boat'||mode==='submarine'){if(!water)continue;position.y=water.surface+(mode==='boat'?.1:-1.1);}
  else if(mode==='hover')position.y=(water?.surface??floor?.height??position.y)+1.3;
  else position.y=(floor?.height??position.y)+Math.max(mode==='spacecraft'?.8:0,clearance)+.025;
  const safe=q.safeSpawn(position,body,rotation);if(!safe)continue;
  // Avoid occupying an archetype's parked instance when staging one of its variants.
  const radius=body.kind==='box'?Math.hypot(body.halfExtents[0],body.halfExtents[2]):body.radius;
  if(sim.vehicles.some(other=>other!==v&&Math.hypot(other.position.x-safe.x,other.position.z-safe.z)<radius+other.spec.radius+1))continue;
  const prepared:MapSpawn={...spawn,id:`${spawn.id}:${assetId}`,vehicleId:assetId,position:[safe.x,safe.y,safe.z]};
  if(sim.controlledActor.prepare(index,prepared)){sim.controlledActor.message=`已准备 ${region.name} / ${v.spec.name} · 按 F 驾驶`;return;}
 }
 throw new Error('该区域没有足够的安全准备空间');
}
