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
/** Adapter owns filtering and returns unpadded distances. Radius zero means a real ray; positive radius means a sphere sweep. */
export type CameraCollisionProbe = (from: Vec3, to: Vec3, radius: number) => CameraCollisionProbeResult;
export interface CameraCollisionRequest {
  readonly target: Vec3;
  readonly eye: Vec3;
  /** Optional actual subject point, independent of the framing pivot. */
  readonly visibilityTarget?: Vec3;
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
  /** Safe eye-space contraction damping. Omission preserves immediate retraction. */
  readonly retractionHalfLifeSeconds?: number;
  /** Positive speed cap for retraction and collision recovery's angular catch-up; omission is unlimited.
   * Safety escapes may exceed it when no validated intermediate pose exists. */
  readonly maximumRetractionMetersPerSecond?: number | 'unlimited';
  /** Explicit unlimited recovery keeps exponential damping without a speed cap. */
  readonly maximumRecoveryMetersPerSecond: number | "unlimited";
  readonly releaseDeadbandMeters?: number;
  /** Framing already smooths unconstrained zoom in the ordinary/vehicle rigs. */
  readonly resetWhenClear?: boolean;
}
/** Visibility ray from the final safe eye to the actual target; no path search. */
export interface CameraVisibilityResult {
  readonly status: 'clear' | 'occluded';
  readonly targetWorldMetersXYZ: Vec3;
  readonly eyeWorldMetersXYZ: Vec3;
  readonly probeRadiusMeters: number;
  readonly targetDistanceMeters: number;
  /** Travel from the eye to the first obstruction or target. */
  readonly unobstructedDistanceMeters: number;
  readonly colliderEntityId?: string;
  readonly startedOverlapping: boolean;
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
  readonly visibility?: CameraVisibilityResult;
}
const copy = (a: Vec3): Vec3 => [a[0],a[1],a[2]];
const sub = (a: Vec3,b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add = (a: Vec3,b: Vec3,s=1): Vec3 => [a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
const length = (a: Vec3) => Math.hypot(...a);
const distance = (a: Vec3,b: Vec3) => length(sub(a,b));
const unit = (a: Vec3): Vec3 => { const n=length(a); return n>1e-12 ? [a[0]/n,a[1]/n,a[2]/n] : [0,0,0]; };
const along = (a: Vec3,b: Vec3,d: number) => add(a,unit(sub(b,a)),d);
const blocked = (hit: CameraCollisionProbeResult, arm: number) => !!hit.startedOverlapping || hit.colliderEntityId!==undefined || hit.distanceMeters<arm-1e-8;
// Keep contact points representably outside float32 query surfaces. Authored
// clearance remains a minimum; this numerical margin is shared by every path.
const separationDistance = (point: Vec3,radius: number,clearance: number) =>
  Math.max(clearance,4*2**-23*Math.max(1,radius,...point.map(Math.abs)));

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
  private separateOrigin(point: Vec3,radius: number,clearance: number,probe: (point:Vec3)=>CameraCollisionProbeResult) {
    let position=copy(point),hit=probe(position);
    const overlapHit=hit.startedOverlapping?hit:undefined;
    const overlapId=hit.startedOverlapping?hit.colliderEntityId:undefined;
    for(let attempt=0;(hit.startedOverlapping||(hit.colliderEntityId!==undefined&&hit.distanceMeters===0))&&attempt<8;attempt++){
      // A cast may report touching at TOI zero without the overlap flag. It
      // still needs a representable origin before the remaining arm is tested.
      const depth=hit.startedOverlapping?hit.penetrationDepthMeters:0;
      if(!hit.normalWorldXYZ||!Number.isFinite(depth))break;
      position=add(position,unit(hit.normalWorldXYZ),depth!+separationDistance(position,radius,clearance));
      hit=probe(position);
    }
    return {position,hit,overlapId,overlapHit};
  }
  private geometry(input: CameraCollisionRequest) {
    if(![...input.target,...input.eye,...input.current,...(input.pivotOrigin??[]),...(input.visibilityTarget??[]),...(input.sweepFrom??[]),input.radius,input.armClearance??.02,input.pivotClearance??.02].every(Number.isFinite)||input.radius<=0||(input.armClearance??0)<0||(input.pivotClearance??0)<0)throw new Error('CAMERA_COLLISION_INPUT_INVALID');
    let target=copy(input.target), eye=copy(input.eye);
    const clearance=input.pivotClearance??.02;
    if(input.pivotOrigin){
      const origin=input.pivotOrigin, travel=distance(origin,target);
      if(travel>1e-5){
        const hit=this.query(origin,target,input.radius);
        if(blocked(hit,travel)){
          const contact=along(origin,target,hit.distanceMeters);
          target=along(origin,target,Math.max(0,hit.distanceMeters-clearance));
          // Backing off only along a grazing cast can still leave a tangent
          // origin. Prefer the measured surface normal, then re-query below.
          if(hit.normalWorldXYZ&&!hit.startedOverlapping)target=add(target,unit(hit.normalWorldXYZ),separationDistance(contact,input.radius,0));
          else target=along(origin,target,Math.max(0,distance(origin,target)-separationDistance(contact,input.radius,0)));
        }
      }
    }
    const separated=this.separateOrigin(target,input.radius,clearance,point=>this.query(point,input.preserveArmDirection?add(input.eye,sub(point,input.target)):input.eye,input.radius));
    target=separated.position;
    if(input.preserveArmDirection)eye=add(input.eye,sub(target,input.target));
    const {hit,overlapId}=separated;
    const arm=distance(target,eye);
    let obstructed=blocked(hit,arm);
    if(obstructed&&!hit.startedOverlapping&&input.canIgnoreArmObstruction){
      const eyeBlocked=this.query(eye,eye,input.radius).startedOverlapping;
      if(!eyeBlocked&&input.canIgnoreArmObstruction(eye))obstructed=false;
    }
    const safeDistance=obstructed?Math.max(0,hit.distanceMeters-separationDistance(along(target,eye,hit.distanceMeters),input.radius,input.armClearance??.02)):arm;
    return {target,eye,hit,overlapId,arm,safeDistance,obstructed};
  }
  private clearPath(from: Vec3,to: Vec3,radius: number): boolean {
    const hit=this.query(from,to,radius);
    return !hit.startedOverlapping&&hit.distanceMeters>=distance(from,to)-1e-6;
  }
  private validEye(input: CameraCollisionRequest,target: Vec3,eye: Vec3): boolean {
    if(this.query(eye,eye,input.radius).startedOverlapping)return false;
    const arm=this.query(target,eye,input.radius);
    if(arm.startedOverlapping)return false;
    if(arm.distanceMeters>=distance(target,eye)-1e-6)return true;
    return input.canIgnoreArmObstruction?.(eye)===true;
  }
  private constrainEye(input: CameraCollisionRequest, eye: Vec3, target: Vec3, invalidatedCommittedArm=false, timing?: CameraCollisionTiming): {position:Vec3;hit?:CameraCollisionProbeResult;retractionApplied?:boolean} {
    let position=eye,trajectoryHit:CameraCollisionProbeResult|undefined;
    let hardEscape=invalidatedCommittedArm;
    if(input.sweepFrom&&distance(input.sweepFrom,eye)>1e-5){
      const origin=this.separateOrigin(input.sweepFrom,input.radius,input.pivotClearance??.02,point=>this.query(point,point,input.radius));
      hardEscape ||= (origin.overlapHit?.penetrationDepthMeters??0)>separationDistance(input.sweepFrom,input.radius,0);
      if(origin.hit.startedOverlapping){
        // An obstacle can move across the old eye even when the desired arm is
        // clear. Measured penetration permits an independently safe hard exit.
        if(!hardEscape||!this.validEye(input,target,eye))throw new Error('CAMERA_COLLISION_NO_SAFE_POSE');
      }else{
        const from=origin.position,hit=this.query(from,eye,input.radius);
        if(blocked(hit,distance(from,eye))){
          position=along(from,eye,Math.max(0,hit.distanceMeters-separationDistance(along(from,eye,hit.distanceMeters),input.radius,input.pivotClearance??.02)));
          trajectoryHit=hit;
        }
      }
    }
    // Cast TOI is approximate. Confirm the final sphere even when there was no
    // trajectory (cut/first-person) or the arm was already constrained.
    const final=this.separateOrigin(position,input.radius,input.pivotClearance??.02,point=>this.query(point,point,input.radius));
    if(final.hit.startedOverlapping)throw new Error('CAMERA_COLLISION_NO_SAFE_POSE');
    const step=timing?this.retractionStep(timing,distance(input.current,eye)):undefined;
    const trajectoryStalled=trajectoryHit&&step!==undefined&&distance(input.current,final.position)<=step;
    if(trajectoryStalled||(distance(final.position,eye)>1e-10&&!this.validEye(input,target,final.position))){
      // A clipped orbit may be sphere-safe yet lie behind the focus obstacle.
      // Keep a still-visible previous eye when possible. If the focus crossed a
      // static wall, visibility is advisory: stay on the reachable side rather
      // than teleporting through that wall to a clear but unreachable endpoint.
      if(this.validEye(input,target,input.current)&&
        (!input.sweepFrom||this.clearPath(input.sweepFrom,input.current,input.radius))){
        const hit=trajectoryHit??final.overlapHit;
        // A blocked recovery sweep must make bounded inward progress too;
        // repeatedly returning the same visible eye can strand it at a column.
        if(step!==undefined){
          const inward=along(input.current,target,Math.min(step,distance(input.current,target)));
          if(this.validEye(input,target,inward)&&this.clearPath(input.current,inward,input.radius)&&
            (!input.sweepFrom||this.clearPath(input.sweepFrom,inward,input.radius)))return {position:inward,...(hit?{hit}:{}),retractionApplied:true};
        }
        return {position:input.current,...(hit?{hit}:{})};
      }
      if(hardEscape&&this.validEye(input,target,eye))return {position:eye};
    }
    const hit=trajectoryHit??final.overlapHit;
    return {position:final.position,...(hit?{hit}:{})};
  }
  private retractionStep(timing: CameraCollisionTiming,travel: number): number|undefined {
    const halfLife=timing.retractionHalfLifeSeconds??0,maximumSpeed=timing.maximumRetractionMetersPerSecond??'unlimited';
    const dt=timing.deltaSeconds;
    if(dt<=0||travel<=1e-6||(halfLife===0&&maximumSpeed==='unlimited'))return undefined;
    const exponentialTravel=halfLife===0?travel:travel*(1-Math.pow(.5,dt/halfLife));
    return Math.min(exponentialTravel,maximumSpeed==='unlimited'?travel:maximumSpeed*dt);
  }
  private transitionEye(input: CameraCollisionRequest,timing: CameraCollisionTiming,target: Vec3,eye: Vec3): Vec3 {
    const travel=distance(input.current,eye),arm=distance(target,eye);
    const contracting=arm<distance(target,input.current)-1e-6;
    const turning=distance(along(target,input.current,arm),eye)>1e-6;
    if(timing.deltaSeconds<=0||(!contracting&&!turning))return eye;
    // Existing radial contraction retains its half-life. Angular catch-up in a
    // collision episode only uses the speed cap, so moving orbit input can catch
    // up without acquiring permanent exponential lag. Pure radial recovery is
    // already owned by the hard decollider and passes through unchanged.
    const maximumSpeed=timing.maximumRetractionMetersPerSecond??'unlimited';
    const step=contracting?this.retractionStep(timing,travel):maximumSpeed==='unlimited'?undefined:Math.min(travel,maximumSpeed*timing.deltaSeconds);
    if(step===undefined||step>=travel)return eye;
    const candidate=along(input.current,eye,step);
    // The previous pose must still be safe in the current geometry. A dynamic
    // obstacle or moving focus can invalidate it and requires immediate escape.
    if(!this.validEye(input,target,input.current))return eye;
    const valid=(point:Vec3)=>this.validEye(input,target,point)&&this.clearPath(input.current,point,input.radius)&&
      (!input.sweepFrom||this.clearPath(input.sweepFrom,point,input.radius));
    if(valid(candidate))return candidate;
    // Around a corner the straight eye-space chord can briefly hide the focus
    // even when both endpoints are valid. The current clear arm provides one
    // bounded inward waypoint; subsequent solves can turn from the shorter arm.
    const inward=along(input.current,target,Math.min(step,distance(input.current,target)));
    return valid(inward)?inward:eye;
  }
  private solution(g: ReturnType<CameraCollisionSolver['geometry']>,position: Vec3,phase: CameraCollisionSolution['phase'],entityId?: string): CameraCollisionSolution {
    return {position:copy(position),target:copy(g.target),desiredPosition:copy(g.eye),safeDistance:g.safeDistance,
      effectiveDistance:distance(g.target,position),phase,...(entityId?{entityId}:{}),limited:distance(position,g.eye)>1e-6};
  }
  private withVisibility(input: CameraCollisionRequest,result: CameraCollisionSolution): CameraCollisionSolution {
    if(!input.visibilityTarget)return result;
    const target=input.visibilityTarget,eye=result.position,travel=distance(target,eye);
    const hit=this.query(eye,target,0);
    // The target may lie exactly on its support surface; only intervening hits occlude it.
    const occluded=!!hit.startedOverlapping||hit.distanceMeters<travel-Math.max(1e-6,travel*1e-6);
    return {
      ...result,
      ...(occluded?{
        limited:true,
        phase:result.phase==='clear'?'constrained' as const:result.phase,
        ...(!result.entityId&&hit.colliderEntityId?{entityId:hit.colliderEntityId}:{}),
      }:{}),
      visibility:{
        status:occluded?'occluded':'clear',
        targetWorldMetersXYZ:copy(target),eyeWorldMetersXYZ:copy(eye),
        probeRadiusMeters:0,targetDistanceMeters:travel,
        unobstructedDistanceMeters:hit.distanceMeters,startedOverlapping:!!hit.startedOverlapping,
        ...(occluded&&hit.colliderEntityId?{colliderEntityId:hit.colliderEntityId}:{}),
      },
    };
  }
  /** Safety and visibility projection. Never reads or commits temporal memory. */
  project(input: CameraCollisionRequest): CameraCollisionSolution {
    return this.withVisibility(input,this.projectSpatial(input));
  }
  private projectSpatial(input: CameraCollisionRequest): CameraCollisionSolution {
    const g=this.geometry(input);
    if(g.hit.startedOverlapping&&!this.query(input.current,input.current,input.radius).startedOverlapping) {
      return this.solution(g,input.current,'emergency-inside',g.hit.colliderEntityId??g.overlapId);
    }
    const eye=g.hit.startedOverlapping ? this.emergency(input,g.target,g.hit,input.current) : along(g.target,g.eye,g.safeDistance);
    const swept=this.constrainEye(input,eye,g.target);
    return this.solution(g,swept.position,g.overlapId?'emergency-inside':g.obstructed||swept.hit?'constrained':'clear',swept.hit?.colliderEntityId??(g.obstructed?g.hit.colliderEntityId:undefined));
  }
  /** Fixed-step solve. Query callbacks never receive or modify temporal state. */
  solve(input: CameraCollisionRequest,timing: CameraCollisionTiming): CameraCollisionSolution {
    const previous=this.temporal.captureTransactionState();
    try {return this.withVisibility(input,this.solveCommitted(input,timing));}
    catch(error){this.temporal.restoreTransactionState(previous);throw error;}
  }
  private solveCommitted(input: CameraCollisionRequest,timing: CameraCollisionTiming): CameraCollisionSolution {
    const halfLife=timing.retractionHalfLifeSeconds??0,maximumSpeed=timing.maximumRetractionMetersPerSecond??'unlimited';
    if(!Number.isFinite(halfLife)||halfLife<0||
      (maximumSpeed!=='unlimited'&&(!Number.isFinite(maximumSpeed)||maximumSpeed<=0)))throw new RangeError('CAMERA_COLLISION_INPUT_INVALID');
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
    const collisionHistory=previous.phase!=='clear';
    if(g.obstructed||collisionHistory)eye=this.transitionEye(input,timing,g.target,eye);
    // Only a previously committed clear arm with an unchanged focus/eye proves
    // a new obstruction invalidated that pose. A moving focus is not evidence
    // that crossing a static wall is an allowed safety escape.
    const invalidatedCommittedArm=g.obstructed&&previous.phase==='clear'&&
      previous.lastSafeTargetPositionMetersXYZ!==undefined&&previous.lastSafePositionMetersXYZ!==undefined&&
      distance(previous.lastSafeTargetPositionMetersXYZ,g.target)<1e-6&&
      distance(previous.lastSafePositionMetersXYZ,input.current)<1e-6&&
      !this.validEye(input,g.target,input.current);
    const swept=this.constrainEye(input,eye,g.target,invalidatedCommittedArm,timing);
    eye=!g.obstructed&&!collisionHistory&&swept.hit&&!swept.retractionApplied?this.transitionEye(input,timing,g.target,swept.position):swept.position;
    const phase=g.overlapId?'emergency-inside':swept.hit?'constrained':
      !g.obstructed&&collisionHistory&&distance(eye,result.positionMetersXYZ)>1e-6?'recovering':result.phase;
    // A trajectory correction is part of this same commit, including its actual
    // safe arm length. Future recovery must not resume from the unswept proposal.
    if(distance(eye,result.positionMetersXYZ)>1e-10||phase!==result.phase)this.temporal.restoreTransactionState({
      ...this.temporal.captureTransactionState(),phase,constrainedArmLengthMeters:distance(g.target,eye),
      ...(swept.hit?{stableHitEntityId:swept.hit.colliderEntityId,stableHitNormalXYZ:swept.hit.normalWorldXYZ,clearHoldRemainingSeconds:timing.clearHoldSeconds}:{}),
      lastSafePositionMetersXYZ:eye,lastSafeTargetPositionMetersXYZ:g.target,
    });
    return this.solution(g,eye,phase,swept.hit?.colliderEntityId??result.stableHitEntityId??g.overlapId);
  }
  private emergency(input: CameraCollisionRequest,target: Vec3,hit: CameraCollisionProbeResult,proposal: Vec3): Vec3 {
    const valid=(eye: Vec3)=>{const q=this.query(target,eye,input.radius);return !q.startedOverlapping&&q.distanceMeters>=distance(target,eye)-1e-6;};
    if(valid(proposal))return proposal;
    const candidate=add(target,hit.normalWorldXYZ??[0,1,0],Math.max(.3,input.radius));
    if(!valid(candidate))throw new Error('CAMERA_COLLISION_NO_SAFE_POSE');
    return candidate;
  }
}
