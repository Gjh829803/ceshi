import type {EnvironmentDefinition} from './environment/types';

/** Physical identities must remain unambiguous across authored and shared bodies. */
export function validateEnvironmentIdentities(map:EnvironmentDefinition):void{
  const physicalIds=[...map.boxes.map(box=>box.id),...(map.interactions??[]).filter(target=>target.kind==='pickup').map(target=>target.id),...(map.looseCrates??[]).map(crate=>crate.id)];
  const targetIds=(map.interactions??[]).map(target=>target.id);
  if(new Set(physicalIds).size!==physicalIds.length||new Set(targetIds).size!==targetIds.length)throw new Error('HUMANOID_PHYSICS_ID_CONFLICT');
}

/** Reject malformed physical data before allocating a Rapier world. */
export function validateEnvironment(map:EnvironmentDefinition):void{
  const fail=():never=>{throw new Error('ENVIRONMENT_INVALID');};
  const vectorActual=(value:unknown):unknown=>{
    try{
      if(value===undefined)return 'missing';
      if(!Array.isArray(value))return typeof value;
      const actual:unknown[]=[];
      for(let i=0;i<Math.min(value.length,4);i++){
        const item=Object.getOwnPropertyDescriptor(value,String(i));
        if(!item||!('value' in item)){actual.push('unavailable');continue;}
        const entry=item.value;
        actual.push(typeof entry==='number'?(Number.isFinite(entry)?entry:String(entry)):typeof entry);
      }
      if(value.length>4)actual.push('truncated');
      return actual;
    }catch{return 'unavailable';}
  };
  const invalidVector=(path:string,value:unknown,entityId?:unknown):never=>{
    const actual=vectorActual(value),expected='three finite numbers [x,y,z], each with absolute value <= 100000';
    throw Object.assign(new Error(`ENVIRONMENT_INVALID: ${path} must contain ${expected}; inspect the bounded actual field.`),{
      code:'ENVIRONMENT_INVALID',category:'invalid-input',phase:'environment',entityIds:typeof entityId==='string'?[entityId.slice(0,256)]:[],path,actual,expected,
      suggestedAction:`Set ${path} to exactly three finite coordinates [x,y,z], each between -100000 and 100000. Region size remains the two-dimensional [width,depth] field.`,
    });
  };
  const vector=(v:unknown):v is readonly number[]=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);
  const text=(v:unknown)=>typeof v==='string'&&v.trim().length>0;
  if(!map||!text(map.id)||!map.bounds||!vector(map.bounds.min)||!vector(map.bounds.max)||map.bounds.min.some((n,i)=>n>=map.bounds.max[i]!)||!vector(map.playerSpawn))fail();
  for(const list of [map.boxes,map.water,map.regions,map.spawns])if(!Array.isArray(list))fail();
  for(const list of [map.interactions,map.climbSurfaces,map.looseCrates,map.characterTrials])if(list!==undefined&&!Array.isArray(list))fail();
  const groupMasses=new Map<string,number>();for(const box of map.boxes)if(box.rigidGroup){const g=box.rigidGroup;if(!text(g.id)||!Number.isFinite(g.massKg)||g.massKg<=0||box.collision===false||(groupMasses.has(g.id)&&groupMasses.get(g.id)!==g.massKg))fail();groupMasses.set(g.id,g.massKg);}
  for(const box of map.boxes)if(!box||!text(box.id)||!vector(box.position)||!vector(box.size)||box.size.some(n=>n<=0)||(box.rotation!==undefined&&!vector(box.rotation)))fail();
  for(const water of map.water)if(!water||!text(water.id)||!vector(water.min)||!vector(water.max)||water.min.some((n,i)=>n>=water.max[i]!)||!Number.isFinite(water.surface))fail();
  for(let i=0;i<map.regions.length;i++){
    const region=map.regions[i];if(!region)return fail();
    if(!text(region.id))fail();
    if(!vector(region.center))invalidVector(`regions[${i}].center`,region.center,region.id);
    if(!Array.isArray(region.modes)||region.modes.some(m=>!text(m)))fail();
  }
  for(const spawn of map.spawns)if(!spawn||!text(spawn.id)||!vector(spawn.position)||!Number.isFinite(spawn.yaw))fail();
  for(const target of map.interactions??[])if(!target||!text(target.id)||!['pickup','seat'].includes(target.kind)||!vector(target.position)||!vector(target.approach)||!Number.isFinite(target.yaw)||(target.size!==undefined&&(!vector(target.size)||target.size.some(n=>n<=0)))||(target.massKg!==undefined&&(!Number.isFinite(target.massKg)||target.massKg<=0)))fail();
  for(const surface of map.climbSurfaces??[])if(!surface||!text(surface.id)||!vector(surface.center)||!vector(surface.normal)||!Number.isFinite(surface.width)||surface.width<=0||!Number.isFinite(surface.minY)||!Number.isFinite(surface.maxY)||surface.minY>=surface.maxY)fail();
  for(const crate of map.looseCrates??[])if(!crate||!text(crate.id)||!vector(crate.position)||!Number.isFinite(crate.size)||crate.size<=0)fail();
  if(map.characterCameraDistanceMeters!==undefined&&(!Number.isFinite(map.characterCameraDistanceMeters)||map.characterCameraDistanceMeters<=0))fail();
  validateEnvironmentIdentities(map);
}
