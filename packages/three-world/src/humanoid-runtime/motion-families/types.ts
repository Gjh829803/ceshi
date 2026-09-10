import type { Mode,VehicleSpec } from '../config';
import type { EnvironmentQueries } from '../environment/queries';
import type { Input,VehicleState } from '../simulation';
import type { MotionFamilyState } from './state';
export type MotionFamilyId='human'|'ground-vehicle'|'surface-vessel'|'aircraft'|'flying-creature'|'underwater'|'space';
export type MotionMode=Mode|'character';
export interface MotionSubtype {id:string;name:string;mode:MotionMode|null;controlFamily:string;status:'implemented'|'reserved';description:string}
export type VehicleStep=(vehicle:VehicleState,input:Input,dt:number,time:number,environment:EnvironmentQueries)=>void;
export interface MotionFamilyModule {
  id:MotionFamilyId;name:string;description:string;modes:readonly MotionMode[];subtypes:readonly MotionSubtype[];
  resolvePhysicsSpec?:(spec:VehicleSpec)=>VehicleSpec;
  createPhysicsState?:(spec:VehicleSpec)=>MotionFamilyState;
  resetRigidState?:(v:VehicleState)=>void;
  impactMass?:(spec:VehicleSpec)=>number;
  resetAuxiliaryState?:(v:VehicleState)=>void;
  step:VehicleStep|null;
}
export const subtype=(family:MotionFamilyId,mode:MotionMode,name:string,description:string,controlFamily:string=mode):MotionSubtype=>({id:`${family}.${controlFamily}`,mode,name,description,controlFamily,status:'implemented'});
export const reserved=(family:MotionFamilyId,id:string,name:string,description:string):MotionSubtype=>({id:`${family}.${id}`,mode:null,name,description,controlFamily:id,status:'reserved'});
