import type RAPIER from '@dimforge/rapier3d-compat';
import type {ThreePhysics} from './physics';
import type {CharacterDrive,CharacterOptions} from './engine-contracts';

/** Internal borrowing contract; not exported by the author-facing SDK barrel. */
export interface BorrowedPhysicsWorld {
  world:RAPIER.World;
  colliderAdded?(id:string,collider:RAPIER.Collider):void;
  colliderRemoved?(id:string,collider:RAPIER.Collider):void;
  colliderChanged?(id:string,colliders:readonly RAPIER.Collider[]):void;
  colliderOwner?(handle:number):string|undefined;
  characterSettings?(handle:number):Required<CharacterOptions>|undefined;
}
export interface PhysicsHostAccess {
  prepareStep(dt:number,drives:Readonly<Record<string,CharacterDrive>>):void;
  prepareSubstep(fraction:number):void;
  finishStep():void;
  fork(binding:BorrowedPhysicsWorld):ThreePhysics;
}
const hosts=new WeakMap<ThreePhysics,PhysicsHostAccess>();
export function registerPhysicsHost(physics:ThreePhysics,host:PhysicsHostAccess){hosts.set(physics,host);}
export function physicsHost(physics:ThreePhysics):PhysicsHostAccess {
  const host=hosts.get(physics);if(!host)throw new Error('PHYSICS_HOST_UNAVAILABLE');return host;
}
