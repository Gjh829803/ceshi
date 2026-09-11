import type RAPIER from '@dimforge/rapier3d-compat';
import type {Vector3} from 'three';
import type {HumanoidLevel} from './level-adapter';
import type {ActionSystem} from './action-system';
import type {SurfaceActions} from './surface-actions';
import type {AnimationEvent,Block,Probe,Traversal} from './controller';

/** Mutable actor data and collision services used by optional actions, without a Simulation dependency. */
export interface HumanoidActionContext {
  readonly actorId:string|null;
  world:RAPIER.World;body:RAPIER.RigidBody;capsule:RAPIER.Collider;controller:RAPIER.KinematicCharacterController;
  level:HumanoidLevel;blocks:Block[];position:Vector3;velocity:Vector3;facing:Vector3;
  readonly isMounted:boolean;grounded:boolean;vertical:number;speed:number;collisions:number;state:string;stance:'stand'|'crouch';swimming:boolean;
  capsuleHalf:number;capsuleHeight:number;actionCapsuleHalf:number|null;
  skills:ActionSystem;surface:SurfaceActions;traversal:Traversal|null;probe:Probe|null;
  elapsed:number;cooldown:number;jumpBuffer:number;lastResult:string;
  animationEvent:AnimationEvent|null;completedMotion:{sourceId:string;sourceTime:number;serial:number}|null;
  ray(origin:Vector3,direction:Vector3,length:number,predicate?:(collider:RAPIER.Collider)=>boolean):RAPIER.RayColliderIntersection|null;
  detect(direction:Vector3,airborne?:boolean):Probe|null;begin(probe:Probe,airborne?:boolean):boolean;
  commitPose():void;sync():void;
}
