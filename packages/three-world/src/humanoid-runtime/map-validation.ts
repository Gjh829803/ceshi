import type {EnvironmentDefinition} from './environment/types';

/** Reject malformed physical data before allocating a Rapier world. */
export function validateEnvironment(map:EnvironmentDefinition):void{
  const fail=():never=>{throw new Error('ENVIRONMENT_INVALID');};
  const vector=(v:unknown):v is readonly number[]=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);
  const text=(v:unknown)=>typeof v==='string'&&v.trim().length>0;
  if(!map||!text(map.id)||!map.bounds||!vector(map.bounds.min)||!vector(map.bounds.max)||map.bounds.min.some((n,i)=>n>=map.bounds.max[i]!)||!vector(map.playerSpawn))fail();
  for(const list of [map.boxes,map.water,map.regions,map.spawns])if(!Array.isArray(list))fail();
  for(const list of [map.interactions,map.climbSurfaces,map.looseCrates,map.characterTrials])if(list!==undefined&&!Array.isArray(list))fail();
  const groupMasses=new Map<string,number>();for(const box of map.boxes)if(box.rigidGroup){const g=box.rigidGroup;if(!text(g.id)||!Number.isFinite(g.massKg)||g.massKg<=0||box.collision===false||(groupMasses.has(g.id)&&groupMasses.get(g.id)!==g.massKg))fail();groupMasses.set(g.id,g.massKg);}
  for(const box of map.boxes)if(!box||!text(box.id)||!vector(box.position)||!vector(box.size)||box.size.some(n=>n<=0)||(box.rotation!==undefined&&!vector(box.rotation)))fail();
  for(const water of map.water)if(!water||!text(water.id)||!vector(water.min)||!vector(water.max)||water.min.some((n,i)=>n>=water.max[i]!)||!Number.isFinite(water.surface))fail();
  for(const region of map.regions)if(!region||!text(region.id)||!vector(region.center)||!Array.isArray(region.modes)||region.modes.some(m=>!text(m)))fail();
  for(const spawn of map.spawns)if(!spawn||!text(spawn.id)||!vector(spawn.position)||!Number.isFinite(spawn.yaw))fail();
  for(const target of map.interactions??[])if(!target||!text(target.id)||!['pickup','seat'].includes(target.kind)||!vector(target.position)||!vector(target.approach)||!Number.isFinite(target.yaw)||(target.size!==undefined&&(!vector(target.size)||target.size.some(n=>n<=0)))||(target.massKg!==undefined&&(!Number.isFinite(target.massKg)||target.massKg<=0)))fail();
  for(const surface of map.climbSurfaces??[])if(!surface||!text(surface.id)||!vector(surface.center)||!vector(surface.normal)||!Number.isFinite(surface.width)||surface.width<=0||!Number.isFinite(surface.minY)||!Number.isFinite(surface.maxY)||surface.minY>=surface.maxY)fail();
  for(const crate of map.looseCrates??[])if(!crate||!text(crate.id)||!vector(crate.position)||!Number.isFinite(crate.size)||crate.size<=0)fail();
  if(map.characterCameraDistanceMeters!==undefined&&(!Number.isFinite(map.characterCameraDistanceMeters)||map.characterCameraDistanceMeters<=0))fail();
}
