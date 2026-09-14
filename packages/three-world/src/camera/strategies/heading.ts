import {Quaternion,Vector3} from 'three';
import {subjectHeading, type CameraSubjectFacts} from '../subject';
import type {CameraStrategyHistory} from './types';
/** Pure evaluation from the last committed pose; prediction and display never integrate state. */
export function cameraSubjectHeading(subject:CameraSubjectFacts, history?:CameraStrategyHistory):number|undefined {
  if(subject.continuousHeadingSeedRadians === undefined) return subjectHeading(subject);
  const rotation = subject.semanticQuaternionWorldXYZW;
  if(!rotation || !history?.headingQuaternionWorldXYZW || history.subjectId !== subject.id || history.subjectGeneration !== subject.generation)
    return subject.continuousHeadingSeedRadians;
  const delta = new Quaternion(...rotation).multiply(new Quaternion(...history.headingQuaternionWorldXYZW).invert());
  if(delta.w < 0) delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
  return history.headingRadians + (Math.hypot(delta.y,delta.w)>1e-8 ? 2*Math.atan2(delta.y,delta.w) : 0);
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
