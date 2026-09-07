import type { MapDefinition } from '../environment/types';
import type { InteractionTarget } from './action-schema';
import type { ClimbSurface } from './surface-types';

/** The controller consumes geometry metadata; EnvironmentQueries owns all colliders. */
export interface LevelBox {
  id:string;x:number;y:number;z:number;w:number;h:number;d:number;
  rotation?:[number,number,number]|undefined;
}
export interface HumanoidLevel {
  boxes:LevelBox[];
  waters:{id:string;x:number;z:number;w:number;d:number;surfaceY:number;bottomY:number}[];
  interactions:InteractionTarget[];
  climbSurfaces:ClimbSurface[];
  crates:{x:number;y:number;z:number;size:number}[];
  bounds:{minX:number;maxX:number;minZ:number;maxZ:number;killY:number};
}
export function humanoidLevel(map:MapDefinition):HumanoidLevel {
  return {
    boxes:map.boxes.filter(b=>b.collision!==false).map(b=>({id:b.id,x:b.position[0],y:b.position[1]-b.size[1]/2,z:b.position[2],w:b.size[0],h:b.size[1],d:b.size[2],rotation:b.rotation?[...b.rotation]:undefined})),
    waters:map.water.map(w=>({id:w.id,x:(w.min[0]+w.max[0])/2,z:(w.min[2]+w.max[2])/2,w:w.max[0]-w.min[0],d:w.max[2]-w.min[2],surfaceY:w.surface,bottomY:w.min[1]})),
    interactions:structuredClone([...(map.interactions??[])]),climbSurfaces:structuredClone([...(map.climbSurfaces??[])]),
    crates:(map.looseCrates??[]).map(c=>({x:c.position[0],y:c.position[1],z:c.position[2],size:c.size})),
    bounds:{minX:map.bounds.min[0],maxX:map.bounds.max[0],minZ:map.bounds.min[2],maxZ:map.bounds.max[2],killY:map.bounds.min[1]},
  };
}
