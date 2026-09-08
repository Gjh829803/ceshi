import { CameraHardDecolliderV1, type CameraHardDecolliderTransactionStateV1 } from './camera-hard-decollider.js';
import type { CameraGeometryHitV2 } from './geometry-hit.js';

type Vec3 = readonly [number, number, number];
export interface CameraCollisionProbeResult {
  readonly distanceMeters: number;
  readonly colliderEntityId?: string;
  readonly normalWorldXYZ?: Vec3;
  readonly hitPositionWorldMetersXYZ?: Vec3;
  readonly startedOverlapping?: boolean;
  readonly penetrationDepthMeters?: number;
}
/** Adapter owns native filtering and returns unpadded world-space distances. */
export type CameraCollisionProbe = (from: Vec3, to: Vec3, radius: number) => CameraCollisionProbeResult;
export interface CameraCollisionRequest {
  readonly target: Vec3;
  readonly eye: Vec3;
  readonly current: Vec3;
  readonly radius: number;
  readonly pivotOrigin?: Vec3;
  readonly preserveArmDirection?: boolean;
  readonly armClearance?: number;
  readonly pivotClearance?: number;
  readonly canIgnoreArmObstruction?: (eye: Vec3) => boolean;
  readonly sweepFrom?: Vec3;
}
export interface CameraCollisionTiming {
  readonly authorityTick: number;
  readonly deltaSeconds: number;
  readonly clearHoldSeconds: number;
  readonly recoveryHalfLifeSeconds: number;
  readonly maximumRecoveryMetersPerSecond: number;
  readonly releaseDeadbandMeters?: number;
  /** Framing already smooths unconstrained zoom in the ordinary/vehicle rigs. */
  readonly resetWhenClear?: boolean;
}
export interface CameraCollisionSolution {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly desiredPosition: Vec3;
  readonly safeDistance: number;
  readonly effectiveDistance: number;
  readonly phase: CameraHardDecolliderTransactionStateV1['phase'];
  readonly entityId?: string;
  readonly limited: boolean;
}
const copy = (a: Vec3): Vec3 => [a[0],a[1],a[2]];
const sub = (a: Vec3,b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add = (a: Vec3,b: Vec3,s=1): Vec3 => [a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
const length = (a: Vec3) => Math.hypot(...a);
const distance = (a: Vec3,b: Vec3) => length(sub(a,b));
const unit = (a: Vec3): Vec3 => { const n=length(a); return n>1e-12 ? [a[0]/n,a[1]/n,a[2]/n] : [0,0,0]; };
const along = (a: Vec3,b: Vec3,d: number) => add(a,unit(sub(b,a)),d);
const blocked = (hit: CameraCollisionProbeResult, arm: number) => !!hit.startedOverlapping || hit.colliderEntityId!==undefined || hit.distanceMeters<arm-1e-8;

/** Geometry and temporal collision owner; no Three camera, physics world or timer. */
export class CameraCollisionSolver {
  private readonly temporal = new CameraHardDecolliderV1();
  constructor(private readonly probe: CameraCollisionProbe) {}
  reset(): void { this.temporal.reset(); }
  captureTransactionState(): CameraHardDecolliderTransactionStateV1 { return this.temporal.captureTransactionState(); }
  restoreTransactionState(state: CameraHardDecolliderTransactionStateV1): void { this.temporal.restoreTransactionState(state); }

  private query(a: Vec3,b: Vec3,radius: number): CameraCollisionProbeResult {
    const hit=this.probe(a,b,radius);
    if(!Number.isFinite(hit.distanceMeters)||hit.distanceMeters<0||
      (hit.normalWorldXYZ&&(!hit.normalWorldXYZ.every(Number.isFinite)||length(hit.normalWorldXYZ)<.5))) {
      throw new Error('CAMERA_COLLISION_PROBE_INVALID');
    }
    return {...hit,distanceMeters:Math.min(distance(a,b),hit.distanceMeters)};
  }
  private geometry(input: CameraCollisionRequest) {
    if(![...input.target,...input.eye,...input.current,...(input.pivotOrigin??[]),...(input.sweepFrom??[]),input.radius,input.armClearance??.02,input.pivotClearance??.02].every(Number.isFinite)||input.radius<=0||(input.armClearance??0)<0||(input.pivotClearance??0)<0)throw new Error('CAMERA_COLLISION_INPUT_INVALID');
    let target=copy(input.target), eye=copy(input.eye);
    const clearance=input.pivotClearance??.02;
    if(input.pivotOrigin){
      const origin=input.pivotOrigin, travel=distance(origin,target);
      if(travel>1e-5){
        const hit=this.query(origin,target,input.radius);
        if(blocked(hit,travel))target=along(origin,target,Math.max(0,hit.distanceMeters-clearance));
      }
    }
    if(input.preserveArmDirection)eye=add(input.eye,sub(target,input.target));
    let hit=this.query(target,eye,input.radius);
    const overlapId=hit.startedOverlapping?hit.colliderEntityId:undefined;
    for(let attempt=0;hit.startedOverlapping&&attempt<8;attempt++){
      if(!hit.normalWorldXYZ||!Number.isFinite(hit.penetrationDepthMeters))break;
      const shift=add([0,0,0],unit(hit.normalWorldXYZ),hit.penetrationDepthMeters!+clearance);
      target=add(target,shift);if(input.preserveArmDirection)eye=add(eye,shift);
      hit=this.query(target,eye,input.radius);
    }
    const arm=distance(target,eye);
    let obstructed=blocked(hit,arm);
    if(obstructed&&!hit.startedOverlapping&&input.canIgnoreArmObstruction){
      const eyeBlocked=this.query(eye,eye,input.radius).startedOverlapping;
      if(!eyeBlocked&&input.canIgnoreArmObstruction(eye))obstructed=false;
    }
    const safeDistance=obstructed?Math.max(0,hit.distanceMeters-(input.armClearance??.02)):arm;
    return {target,eye,hit,overlapId,arm,safeDistance,obstructed};
  }
  private sweep(input: CameraCollisionRequest, eye: Vec3, armBlocked: boolean): {position:Vec3;hit?:CameraCollisionProbeResult} {
    const from=input.sweepFrom;
    if(!from||armBlocked||distance(from,eye)<=1e-5||this.query(from,from,input.radius).startedOverlapping)return {position:eye};
    const hit=this.query(from,eye,input.radius);
    return blocked(hit,distance(from,eye))
      ? {position:along(from,eye,Math.max(0,hit.distanceMeters-(input.pivotClearance??.02))),hit}
      : {position:eye};
  }
  private solution(g: ReturnType<CameraCollisionSolver['geometry']>,position: Vec3,phase: CameraCollisionSolution['phase'],entityId?: string): CameraCollisionSolution {
    return {position:copy(position),target:copy(g.target),desiredPosition:copy(g.eye),safeDistance:g.safeDistance,
      effectiveDistance:distance(g.target,position),phase,...(entityId?{entityId}:{}),limited:distance(position,g.eye)>1e-6};
  }
  /** Safety projection for a display sample. Never reads or commits temporal memory. */
  project(input: CameraCollisionRequest): CameraCollisionSolution {
    const g=this.geometry(input);
    if(g.hit.startedOverlapping&&!this.query(input.current,input.current,input.radius).startedOverlapping) {
      return this.solution(g,input.current,'emergency-inside',g.hit.colliderEntityId??g.overlapId);
    }
    const eye=g.hit.startedOverlapping ? this.emergency(input,g.target,g.hit,input.current) : along(g.target,g.eye,g.safeDistance);
    const swept=this.sweep(input,eye,g.obstructed);
    return this.solution(g,swept.position,g.overlapId?'emergency-inside':g.obstructed||swept.hit?'constrained':'clear',swept.hit?.colliderEntityId??(g.obstructed?g.hit.colliderEntityId:undefined));
  }
  /** Fixed-step solve. Query callbacks never receive or modify temporal state. */
  solve(input: CameraCollisionRequest,timing: CameraCollisionTiming): CameraCollisionSolution {
    const previous=this.temporal.captureTransactionState();
    try {return this.solveCommitted(input,timing);}
    catch(error){this.temporal.restoreTransactionState(previous);throw error;}
  }
  private solveCommitted(input: CameraCollisionRequest,timing: CameraCollisionTiming): CameraCollisionSolution {
    const g=this.geometry(input),previous=this.temporal.captureTransactionState();
    if(g.hit.startedOverlapping&&!this.query(input.current,input.current,input.radius).startedOverlapping){
      // Retain an actually clear committed eye while no bounded pivot is available.
      return this.solution(g,input.current,'emergency-inside',g.hit.colliderEntityId??g.overlapId);
    }
    if(timing.resetWhenClear!==false&&previous.phase==='clear'&&!g.hit.startedOverlapping)this.temporal.reset();
    if(g.hit.colliderEntityId&&previous.constrainedArmLengthMeters!==undefined&&g.safeDistance>previous.constrainedArmLengthMeters&&
      g.safeDistance-previous.constrainedArmLengthMeters<(timing.releaseDeadbandMeters??0))g.safeDistance=previous.constrainedArmLengthMeters;
    const geometryHit: CameraGeometryHitV2|undefined=g.obstructed?{
      schemaVersion:2,travelDistanceMeters:g.safeDistance,travelFraction:g.arm===0?0:g.safeDistance/g.arm,
      hitPointMetersXYZ:g.hit.hitPositionWorldMetersXYZ??g.target,hitNormalXYZ:g.hit.normalWorldXYZ??unit(sub(g.target,g.eye)),
      ...(g.hit.colliderEntityId?{hitEntityId:g.hit.colliderEntityId}:{}),startedOverlapping:!!g.hit.startedOverlapping,
      penetrationDepthMeters:g.hit.penetrationDepthMeters??0,obstructionClass:'hard',
    }:undefined;
    const result=this.temporal.solve({ ...timing,desiredTargetPositionMetersXYZ:g.target,desiredPositionMetersXYZ:g.eye,
      currentCommittedPositionMetersXYZ:input.current,minimumUsableArmLengthMeters:Math.min(.3,g.arm),...(geometryHit?{geometryHit}:{}) });
    let eye=result.positionMetersXYZ;
    g.target=result.resolvedTargetPositionMetersXYZ;
    if(g.hit.startedOverlapping)eye=this.emergency(input,g.target,g.hit,eye);
    const swept=this.sweep(input,eye,g.obstructed);
    eye=swept.position;
    // A trajectory correction is part of this same commit, including its actual
    // safe arm length. Future recovery must not resume from the unswept proposal.
    if(distance(eye,result.positionMetersXYZ)>1e-10)this.temporal.restoreTransactionState({
      ...this.temporal.captureTransactionState(),constrainedArmLengthMeters:distance(g.target,eye),
      ...(swept.hit?{phase:'constrained',stableHitEntityId:swept.hit.colliderEntityId,stableHitNormalXYZ:swept.hit.normalWorldXYZ,clearHoldRemainingSeconds:timing.clearHoldSeconds}:{}),
      lastSafePositionMetersXYZ:eye,lastSafeTargetPositionMetersXYZ:g.target,
    });
    return this.solution(g,eye,g.overlapId?'emergency-inside':swept.hit?'constrained':result.phase,swept.hit?.colliderEntityId??result.stableHitEntityId??g.overlapId);
  }
  private emergency(input: CameraCollisionRequest,target: Vec3,hit: CameraCollisionProbeResult,proposal: Vec3): Vec3 {
    const valid=(eye: Vec3)=>{const q=this.query(target,eye,input.radius);return !q.startedOverlapping&&q.distanceMeters>=distance(target,eye)-1e-6;};
    if(valid(proposal))return proposal;
    const candidate=add(target,hit.normalWorldXYZ??[0,1,0],Math.max(.3,input.radius));
    if(!valid(candidate))throw new Error('CAMERA_COLLISION_NO_SAFE_POSE');
    return candidate;
  }
}
