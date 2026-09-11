import records from '../../../../assets/dragon-training/__creature-assets/variants.json';
import type {humanoid} from '@worldkit/three';

export interface DragonVariant {
  id:string;name:string;file:string;camera:number;
  ground?:humanoid.VehicleSpec['flyingCreatureGround'];
  seat?:[number,number,number];
  collisionProbes?:humanoid.VehicleSpec['flyingCreatureCollision'];
  envelope?:humanoid.VehicleSpec['envelope'];
}
export const DRAGON_VARIANTS=records as unknown as DragonVariant[];
export function readDragonVariant(search:string):DragonVariant {
  const id=new URLSearchParams(search).get('dragon');
  return DRAGON_VARIANTS.find(variant=>variant.id===id)??DRAGON_VARIANTS[0]!;
}
