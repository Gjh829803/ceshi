import records from '../../config/generated/dragon-variants.json';
import specs from '../../config/generated/dragon-specs.json';
import type {humanoid} from '@worldkit/three';

export interface DragonVariant {
  id:string;name:string;file:string;
  ground?:humanoid.VehicleSpec['flyingCreatureGround'];
  seat?:[number,number,number];
  collisionProbes?:humanoid.VehicleSpec['flyingCreatureCollision'];
  envelope?:humanoid.VehicleSpec['envelope'];
}
export const DRAGON_VARIANTS=records as unknown as DragonVariant[];
export type DragonSpec=Omit<humanoid.VehicleSpec,'spawn'|'yaw'|'color'>;
/** Full library tuning; callers provide scene placement, color and instance ID. */
export function readDragonSpec(id:string):DragonSpec {
  const spec=(specs as unknown as Record<string,DragonSpec>)[id];
  if(!spec)throw new Error(`Unknown dragon variant: ${id}`);
  return structuredClone(spec);
}
export function readDragonVariant(search:string):DragonVariant {
  const id=new URLSearchParams(search).get('dragon');
  return DRAGON_VARIANTS.find(variant=>variant.id===id)??DRAGON_VARIANTS[0]!;
}
