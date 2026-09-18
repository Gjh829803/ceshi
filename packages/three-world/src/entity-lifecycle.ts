import type * as THREE from 'three';
import type {AssetInstance,CharacterOptions,EntityOptions} from './engine-contracts';
import {setEntityBoundary} from './geometry';

export interface EngineEntityBinding {
  releaseHumanoid?:()=>void;
  options:EntityOptions;object:THREE.Object3D;character?:CharacterOptions;asset?:AssetInstance;
  initialParent:THREE.Object3D|null;initialPosition:THREE.Vector3;initialQuaternion:THREE.Quaternion;
  initialScale:THREE.Vector3;initialVisible:boolean;initialMatrix:THREE.Matrix4;initialMatrixAutoUpdate:boolean;
}

/** Internal entity membership, activation and reset ownership. Effects stay with their existing owners.
 * This is the engine's only registry, not a second entity table or simulation loop.
 */
export class EngineEntityLifecycle {
  private readonly entities=new Map<string,EngineEntityBinding>();
  private readonly retiredEntities=new Set<EngineEntityBinding>();
  private initialEntities:Map<string,EngineEntityBinding>|undefined;
  private readonly inactive=new Set<THREE.Object3D>();
  private initialInactive=new Set<THREE.Object3D>();

  get current():ReadonlyMap<string,EngineEntityBinding>{return this.entities;}
  get retired():ReadonlySet<EngineEntityBinding>{return this.retiredEntities;}
  get baseline():ReadonlyMap<string,EngineEntityBinding>|undefined{return this.initialEntities;}
  require(id:string):EngineEntityBinding{const entry=this.entities.get(id);if(!entry)throw new Error(`WORLD_ENTITY_NOT_FOUND: ${id}`);return entry;}
  register(entry:EngineEntityBinding):void{this.entities.set(entry.options.id,entry);}
  unregister(id:string):void{this.entities.delete(id);}
  retire(entry:EngineEntityBinding):void{this.retiredEntities.add(entry);}
  discardTransient(entry:EngineEntityBinding):void{
    this.retiredEntities.delete(entry);this.inactive.delete(entry.object);this.initialInactive.delete(entry.object);
  }
  /** Return whether permanent destruction removed this object's reset baseline. */
  forgetDestroyed(entry:EngineEntityBinding):boolean{
    this.discardTransient(entry);
    if(this.initialEntities?.get(entry.options.id)?.object!==entry.object)return false;
    this.initialEntities.delete(entry.options.id);return true;
  }
  isLocallyActive(id:string):boolean{return !this.inactive.has(this.require(id).object);}
  isActive(id:string):boolean{
    if(!this.inactive.size)return this.entities.has(id);
    for(let object:THREE.Object3D|null=this.require(id).object;object;object=object.parent)if(this.inactive.has(object))return false;
    return true;
  }
  /** Group policy comes from the owner; apply effects at the original per-entity boundary. */
  setActive(roots:readonly THREE.Object3D[],active:boolean,apply:(id:string,enabled:boolean)=>void):boolean{
    if(roots.every(root=>this.inactive.has(root)!==active))return false;
    const affected=[...this.entities].filter(([,entry])=>{for(let object:THREE.Object3D|null=entry.object;object;object=object.parent)if(roots.includes(object))return true;return false;}).map(([id])=>({id,active:this.isActive(id)}));
    for(const root of roots){if(active)this.inactive.delete(root);else this.inactive.add(root);}
    for(const before of affected){const enabled=this.isActive(before.id);if(enabled!==before.active)apply(before.id,enabled);}
    return true;
  }
  seal(preserveInitialPose:(entry:EngineEntityBinding)=>boolean):void{
    if(this.initialEntities)return;
    this.initialEntities=new Map(this.entities);this.initialInactive=new Set(this.inactive);
    for(const entry of this.entities.values()){
      entry.initialParent=entry.object.parent;
      if(!preserveInitialPose(entry)){entry.initialPosition.copy(entry.object.position);entry.initialQuaternion.copy(entry.object.quaternion);}
      entry.initialScale.copy(entry.object.scale);entry.initialVisible=entry.object.visible;
      entry.initialMatrix.copy(entry.object.matrix);entry.initialMatrixAutoUpdate=entry.object.matrixAutoUpdate;
    }
  }
  /** Restore membership and authored transforms between physical removal and physical rebinding. */
  restore(removePhysical:(id:string)=>void,retire:(entry:EngineEntityBinding)=>void):void{
    for(const [id,entry] of this.entities){
      removePhysical(id);setEntityBoundary(entry.object,false);
      if(this.initialEntities!.get(id)!==entry){entry.object.removeFromParent();retire(entry);}
    }
    this.entities.clear();this.inactive.clear();for(const object of this.initialInactive)this.inactive.add(object);
    for(const [id,entry] of this.initialEntities!){
      entry.initialParent?.add(entry.object);entry.object.position.copy(entry.initialPosition);entry.object.quaternion.copy(entry.initialQuaternion);entry.object.scale.copy(entry.initialScale);entry.object.visible=entry.initialVisible;
      entry.object.matrixAutoUpdate=entry.initialMatrixAutoUpdate;entry.object.matrix.copy(entry.initialMatrix);entry.object.matrixWorldNeedsUpdate=true;
      setEntityBoundary(entry.object,true);this.entities.set(id,entry);this.retiredEntities.delete(entry);
    }
  }
  clear():void{this.entities.clear();this.retiredEntities.clear();this.inactive.clear();this.initialInactive.clear();this.initialEntities?.clear();}
}
