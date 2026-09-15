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
  /** Optional measured visibility; does not steer the camera. */
  readonly visibilityTarget?: Vec3;
  readonly current: Vec3;
  readonly radius: number;
  readonly pivotOrigin?: Vec3;
  readonly preserveArmDirection?: boolean;
  readonly armClearance?: number;
  readonly pivotClearance?: number;
  readonly canIgnoreArmObstruction?: (eye: Vec3) => boolean;
  /** Native framing may retract before only a sliver of the subject remains.
   * The ratio is geometric clearance, not temporal smoothing or a safety bypass. */
  readonly subjectVisibilityClearance?: {
    readonly marginMeters: number;
    readonly measureRatio: (eye: Vec3, minimumClearanceMeters: number) => number;
  };
  readonly sweepFrom?: Vec3;
}
export interface CameraCollisionTiming {
  readonly authorityTick: number;
  readonly deltaSeconds: number;
  readonly clearHoldSeconds: number;
  readonly recoveryHalfLifeSeconds: number;
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
const MAX_SWEEP_SLIDES = 3;

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
      (hit.normalWorldXYZ&&(hit.normalWorldXYZ.length!==3||!hit.normalWorldXYZ.every(Number.isFinite)||
        !Number.isFinite(length(hit.normalWorldXYZ))||length(hit.normalWorldXYZ)<.5))) {
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
  private geometry(input: CameraCollisionRequest, anticipateVisibility=false) {
    if(![...input.target,...input.eye,...input.current,...(input.pivotOrigin??[]),...(input.sweepFrom??[]),...(input.visibilityTarget??[]),input.radius,input.armClearance??.02,input.pivotClearance??.02].every(Number.isFinite)||input.radius<=0||(input.armClearance??0)<0||(input.pivotClearance??0)<0)throw new Error('CAMERA_COLLISION_INPUT_INVALID');
    let target=copy(input.target), eye=copy(input.eye);
    const clearance=input.pivotClearance??.02;
    if(input.pivotOrigin){
      const origin=input.pivotOrigin, travel=distance(origin,target);
      if(travel>1e-5){
        const hit=this.query(origin,target,input.radius);
        if(blocked(hit,travel))target=along(origin,target,Math.max(0,hit.distanceMeters-clearance));
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
    const hardDistance=Math.max(0,hit.distanceMeters-separationDistance(along(target,eye,hit.distanceMeters),input.radius,input.armClearance??.02));
    let safeDistance=obstructed?hardDistance:arm;
    let armBlocked=obstructed,constraintHit=hit;
    const visibility=input.subjectVisibilityClearance;
    if(visibility&&(!Number.isFinite(visibility.marginMeters)||visibility.marginMeters<=0))throw new Error('CAMERA_COLLISION_INPUT_INVALID');
    if(anticipateVisibility&&visibility&&!hit.startedOverlapping&&visibility.marginMeters>input.radius){
      // A wider arm detects approaching occlusion. An already occupied wide
      // origin (for example a narrow corridor) is not an approaching boundary.
      const soft=this.query(target,eye,input.radius+visibility.marginMeters);
      if(!soft.startedOverlapping&&blocked(soft,arm)){
        // Convert the expanded contact back along the arm, not by a fixed
        // radial offset. A grazing wall can be metres along the arm despite
        // only a small perpendicular clearance; treating those as equal
        // creates a false, abruptly short framing target during orbit.
        const direction=unit(sub(eye,target)),normal=soft.normalWorldXYZ&&unit(soft.normalWorldXYZ);
        const incidence=normal?-(direction[0]*normal[0]+direction[1]*normal[1]+direction[2]*normal[2]):0;
        const preferred=incidence>1e-8?Math.min(arm,Math.max(0,soft.distanceMeters+visibility.marginMeters/incidence-(input.armClearance??.02))):arm;
        const ratio=visibility.measureRatio(eye,input.radius);
        if(!Number.isFinite(ratio)||ratio<0||ratio>1)throw new Error('CAMERA_COLLISION_PROBE_INVALID');
        const candidateDistance=preferred+(arm-preferred)*ratio;
        if(candidateDistance<safeDistance){
          const candidate=along(target,eye,candidateDistance);
          // A soft preference can never keep an eye inside the occluder. Some
          // disconnected free regions still require immediate hard retraction.
          const occupied=this.query(candidate,candidate,input.radius).startedOverlapping;
          safeDistance=occupied?hardDistance:candidateDistance;
          armBlocked=armBlocked||!!occupied;
          constraintHit=occupied?hit:soft;
          obstructed=true;
        }
      }
    }
    return {target,eye,hit,constraintHit,overlapId,arm,safeDistance,obstructed,armBlocked};
  }
  private sweepSegment(input: CameraCollisionRequest, from: Vec3, eye: Vec3): {position:Vec3;hit?:CameraCollisionProbeResult} {
    const hit=this.query(from,eye,input.radius);
    if(!blocked(hit,distance(from,eye)))return {position:eye};
    const contact=along(from,eye,Math.max(0,hit.distanceMeters-separationDistance(along(from,eye,hit.distanceMeters),input.radius,input.pivotClearance??.02)));
    // Native cast TOI is approximate; keep the returned sphere outside the wall.
    const final=this.separateOrigin(contact,input.radius,input.pivotClearance??.02,point=>this.query(point,point,input.radius));
    if(final.hit.startedOverlapping)throw new Error('CAMERA_COLLISION_NO_SAFE_POSE');
    return {position:final.position,hit};
  }
  private sweep(input: CameraCollisionRequest, eye: Vec3, armBlocked: boolean): {position:Vec3;hit?:CameraCollisionProbeResult} {
    if(!input.sweepFrom||armBlocked||distance(input.sweepFrom,eye)<=1e-5)return {position:eye};
    // Separate touching support before sweeping, so a zero-TOI floor cannot
    // hide the wall farther along the trajectory. Deeply embedded old eyes
    // still use the established immediate safe-arm escape.
    const origin=this.separateOrigin(input.sweepFrom,input.radius,input.pivotClearance??.02,point=>this.query(point,point,input.radius));
    if(origin.hit.startedOverlapping||(origin.overlapHit?.penetrationDepthMeters??0)>separationDistance(input.sweepFrom,input.radius,0))return {position:eye};
    let result=this.sweepSegment(input,origin.position,eye);
    let constraintHit=result.hit;
    // Keep following along a wing or wall instead of pinning the eye to its
    // first contact. Every tangent is another swept segment, never a jump to
    // an otherwise visible endpoint. Radial obstruction still takes priority.
    for(let attempt=0;attempt<MAX_SWEEP_SLIDES&&result.hit?.normalWorldXYZ;attempt++){
      const normal=unit(result.hit.normalWorldXYZ),remaining=sub(eye,result.position);
      const inward=remaining[0]*normal[0]+remaining[1]*normal[1]+remaining[2]*normal[2];
      if(inward>=0)break;
      const tangent=add(eye,normal,-inward);
      if(distance(result.position,tangent)<=1e-5)break;
      const next=this.sweepSegment(input,result.position,tangent);
      if(this.query(next.position,next.position,input.radius).startedOverlapping)throw new Error('CAMERA_COLLISION_NO_SAFE_POSE');
      if(distance(next.position,eye)>=distance(result.position,eye)-1e-8)break;
      result=next;
      constraintHit=next.hit??constraintHit;
    }
    return {position:result.position,...(constraintHit?{hit:constraintHit}:{})};
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
  /** Safety projection for a display sample. Never reads or commits temporal memory. */
  project(input: CameraCollisionRequest): CameraCollisionSolution {
    return this.withVisibility(input,this.projectSpatial(input));
  }
  private projectSpatial(input: CameraCollisionRequest): CameraCollisionSolution {
    const g=this.geometry(input);
    if(g.hit.startedOverlapping&&!this.query(input.current,input.current,input.radius).startedOverlapping) {
      return this.solution(g,input.current,'emergency-inside',g.hit.colliderEntityId??g.overlapId);
    }
    const eye=g.hit.startedOverlapping ? this.emergency(input,g.target,g.hit,input.current) : along(g.target,g.eye,g.safeDistance);
    const swept=this.sweep(input,eye,g.armBlocked);
    return this.solution(g,swept.position,g.overlapId?'emergency-inside':g.obstructed||swept.hit?'constrained':'clear',swept.hit?.colliderEntityId??(g.obstructed?g.hit.colliderEntityId:undefined));
  }
  /** Fixed-step solve. Query callbacks never receive or modify temporal state. */
  solve(input: CameraCollisionRequest,timing: CameraCollisionTiming): CameraCollisionSolution {
    const previous=this.temporal.captureTransactionState();
    try {return this.withVisibility(input,this.solveCommitted(input,timing));}
    catch(error){this.temporal.restoreTransactionState(previous);throw error;}
  }
  private solveCommitted(input: CameraCollisionRequest,timing: CameraCollisionTiming): CameraCollisionSolution {
    const g=this.geometry(input,true),previous=this.temporal.captureTransactionState();
    if(g.hit.startedOverlapping&&!this.query(input.current,input.current,input.radius).startedOverlapping){
      // Retain an actually clear committed eye while no bounded pivot is available.
      return this.solution(g,input.current,'emergency-inside',g.hit.colliderEntityId??g.overlapId);
    }
    if(timing.resetWhenClear!==false&&previous.phase==='clear'&&!g.hit.startedOverlapping)this.temporal.reset();
    if(g.hit.colliderEntityId&&previous.constrainedArmLengthMeters!==undefined&&g.safeDistance>previous.constrainedArmLengthMeters&&
      g.safeDistance-previous.constrainedArmLengthMeters<(timing.releaseDeadbandMeters??0))g.safeDistance=previous.constrainedArmLengthMeters;
    const geometryHit: CameraGeometryHitV2|undefined=g.obstructed?{
      schemaVersion:2,travelDistanceMeters:g.safeDistance,travelFraction:g.arm===0?0:g.safeDistance/g.arm,
      hitPointMetersXYZ:g.constraintHit.hitPositionWorldMetersXYZ??g.target,hitNormalXYZ:g.constraintHit.normalWorldXYZ??unit(sub(g.target,g.eye)),
      ...(g.constraintHit.colliderEntityId?{hitEntityId:g.constraintHit.colliderEntityId}:{}),startedOverlapping:!!g.hit.startedOverlapping,
      penetrationDepthMeters:g.hit.penetrationDepthMeters??0,obstructionClass:'hard',
    }:undefined;
    const result=this.temporal.solve({ ...timing,desiredTargetPositionMetersXYZ:g.target,desiredPositionMetersXYZ:g.eye,
      currentCommittedPositionMetersXYZ:input.current,minimumUsableArmLengthMeters:Math.min(.3,g.arm),...(geometryHit?{geometryHit}:{}) });
    let eye=result.positionMetersXYZ;
    g.target=result.resolvedTargetPositionMetersXYZ;
    if(g.hit.startedOverlapping)eye=this.emergency(input,g.target,g.hit,eye);
    const swept=this.sweep(input,eye,g.armBlocked);
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
