import {Vector3} from 'three';
import type {EnvironmentQueries} from '../environment/queries';
import type {Input,PlayerState} from '../simulation';
import {HumanoidController} from './controller';

export interface ActorInput {readonly input:Input;readonly yaw:number}

export function syncPlayer(controller:HumanoidController,player:PlayerState):void{
  player.position.copy(controller.position);player.velocity.copy(controller.velocity);player.velocity.y=controller.vertical;
  player.yaw=Math.atan2(controller.facing.x,controller.facing.z);player.grounded=controller.grounded;player.swimming=controller.swimming;
  player.coyote=controller.coyote;player.jumpBuffer=controller.jumpBuffer;player.animation=controller.state;
  player.landTimer=controller.animationEvent?.kind==='land'?Math.max(0,.45-controller.animationEvent.elapsed):0;
}

/** Shared input interpretation; controller.step commits this actor, never the world clock. */
export function stepHumanoidInput(controller:HumanoidController,input:Input,yaw:number):boolean{
  const surface=controller.surface.surface;
  const direction=surface?new Vector3(input.steer,0,-input.forward).applyAxisAngle(new Vector3(0,1,0),Math.atan2(surface.normal[0],surface.normal[2])):new Vector3(-input.steer,0,input.forward).applyAxisAngle(new Vector3(0,1,0),yaw);
  if(direction.lengthSq()>1)direction.normalize();
  if(input.actions?.toggleSwimStyle&&controller.swimming)controller.swimStyle=controller.swimStyle==='freestyle'?'breaststroke':'freestyle';
  if(input.actions?.cancel&&controller.skills.active)controller.skills.cancel(controller.skills.active.requestId);
  const serial=controller.motionSerial;controller.step(direction,input.boost,input.slow,input.jump,input.actions);
  return controller.motionSerial!==serial&&!controller.traversal&&!controller.completedMotion;
}

/** Independent actor state borrowing the environment's shared physical and interaction owners. */
export class HumanoidActor {
  readonly controller:HumanoidController;
  readonly player:PlayerState={position:new Vector3(),velocity:new Vector3(),yaw:0,grounded:false,swimming:false,coyote:0,jumpBuffer:0,animation:'Idle_Loop',landTimer:0};
  teleportRevision=0;
  constructor(environment:EnvironmentQueries,position:Vector3,yaw=0){
    this.controller=new HumanoidController(environment);
    try{this.resetAt(position,yaw);}catch(error){this.controller.dispose();throw error;}
  }
  resetAt(position:Vector3,yaw:number):void{this.controller.resetAt(position,yaw);syncPlayer(this.controller,this.player);this.teleportRevision++;}
  step(input:Input,yaw:number):void{if(stepHumanoidInput(this.controller,input,yaw))this.teleportRevision++;syncPlayer(this.controller,this.player);}
  dispose():void{this.controller.dispose();}
}
