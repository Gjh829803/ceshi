import * as THREE from 'three';
import type {WorldObservation,WorldSnapshot} from '@worldkit/three';
import {inspectSurfaceOverlaps,type SurfaceOverlapOptions} from './surface-overlap-geometry.js';

export type SurfaceOverlapQuery=Pick<SurfaceOverlapOptions,'maxTriangles'|'maxPairTests'|'maxFindings'|'toleranceMeters'> & {highlight?:boolean};
export const unavailableSurfaceOverlaps=(reason:string)=>({advisory:true as const,status:'unavailable' as const,reason,
 scope:'Visible undeformed mesh geometry at the sampled pose; geometric risk, not observed flicker.',findings:[]});

/** Resolve SDK IDs through the registry, never by guessing mesh names. */
export function inspectWorldSurfaceOverlaps(world:WorldObservation,snapshot:WorldSnapshot|null,
 selection:{query?:string;entityIds?:string[]},options:SurfaceOverlapQuery={}){
 try{
  const targets=world.targets,lookup=(id:string)=>world.getEntityGeometry?.(id)?.object??(Object.hasOwn(targets,id)?targets[id]:undefined);
  const ownerIds=new Map<THREE.Object3D,string>();
  const excludeRoots:THREE.Object3D[]=[world.controlledObject];
  const states=snapshot?.entities??[];
  const unresolved:string[]=[];
  for(const state of states.slice(0,2048)){
   const object=lookup(state.id);if(!object){unresolved.push(state.id);continue;}
   ownerIds.set(object,state.id);
   if(['kinematic','dynamic','character'].includes(world.getEntityGeometry?.(state.id)?.physicsKind??'')||state.role==='actor'||state.motion||state.animation||state.controlOwners.some(owner=>['position','rotation','scale'].includes(owner.channel)&&['physics','parameter','action','relationship'].includes(owner.ownerKind)))excludeRoots.push(object);
  }
  for(const [id,object] of Object.entries(targets))if(!ownerIds.has(object))ownerIds.set(object,id);
  let roots:THREE.Object3D[]|undefined;
  if(selection.entityIds!==undefined||selection.query!==undefined){
   if(selection.entityIds?.length===0)roots=[];
   else if(world.capabilities){
    const selected=world.capabilities(selection).entities;
    if(selected.length>2048)return unavailableSurfaceOverlaps('selection-limit');
    roots=[];for(const {state} of selected){const object=lookup(state.id);if(!object)return unavailableSurfaceOverlaps('selected-entity-object-unavailable');roots.push(object);}
   }else if(selection.query===undefined){
    roots=[];for(const id of selection.entityIds??[]){const object=lookup(id);if(!object)return unavailableSurfaceOverlaps('selected-entity-object-unavailable');roots.push(object);}
   }else return unavailableSurfaceOverlaps('selection-unavailable');
  }
  const result=inspectSurfaceOverlaps(world.scene,{...options,...(roots?{roots}:{}),excludeRoots,ownerIds});
  if(states.length>2048||unresolved.length){
   result.status='partial';result.coverage.truncated.push(states.length>2048?'entity-mapping-limit':'entity-mapping-unavailable');
  }
  return result;
 }catch{return unavailableSurfaceOverlaps('inspection-failed');}
}
