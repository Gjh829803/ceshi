import {Quaternion,Vector3} from 'three';
import {subjectHeading, type CameraSubjectFacts} from '../subject';
import type {CameraStrategyHistory} from './types';
/** Pure evaluation from the last committed pose; input preparation and display never integrate state. */
export function cameraSubjectHeading(subject:CameraSubjectFacts, history?:CameraStrategyHistory):number|undefined {
  if(subject.continuousHeadingSeedRadians === undefined) return subjectHeading(subject);
  const rotation = subject.semanticQuaternionWorldXYZW;
  if(!rotation || !history?.headingQuaternionWorldXYZW || history.subjectId !== subject.id || history.subjectGeneration !== subject.generation)
    return subject.continuousHeadingSeedRadians;
  const delta = new Quaternion(...rotation).multiply(new Quaternion(...history.headingQuaternionWorldXYZW).invert());
  if(delta.w < 0) delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
  const predicted=history.headingRadians + (Math.hypot(delta.y,delta.w)>1e-8 ? 2*Math.atan2(delta.y,delta.w) : 0);
  // A world-Y twist is only a continuity predictor, not an absolute heading:
  // integrating it around a closed pitch/bank path accumulates false yaw.
  const orientation=new Quaternion(...rotation);
  const forward=new Vector3(0,0,-1).applyQuaternion(orientation);
  if(Math.hypot(forward.x,forward.z)<1e-4)return predicted;
  const measured=Math.atan2(-forward.x,-forward.z);
  // Keep the continuous branch while inverted (a pitch loop must not force a
  // half-turn at its pole). Once upright, the real forward is authoritative,
  // including recovery by a half-roll after an inverted half-loop.
  const period=new Vector3(0,1,0).applyQuaternion(orientation).y>=0?2*Math.PI:Math.PI;
  return measured+Math.round((predicted-measured)/period)*period;
}

/** Independent world horizon, full subject orientation, or its continuous heading. */
export function cameraReferenceRotation(subject:CameraSubjectFacts,frame:import('../../config/camera').CameraOrientation['referenceFrame'],heading=cameraSubjectHeading(subject)??0,inheritSubjectYaw=true):Quaternion {
 if(frame==='world-up')return new Quaternion();
 const rotation=frame==='subject-heading'?new Quaternion().setFromAxisAngle(new Vector3(0,1,0),heading):new Quaternion(...(subject.semanticQuaternionWorldXYZW??[0,0,0,1]));
 return inheritSubjectYaw?rotation:rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-heading));
}

export function sameCameraReference(a:import('../../config/camera').CameraOrientation,b:import('../../config/camera').CameraOrientation):boolean {
 return a.referenceFrame===b.referenceFrame&&(a.referenceFrame==='world-up'||a.inheritSubjectYaw===b.inheritSubjectYaw);
}
