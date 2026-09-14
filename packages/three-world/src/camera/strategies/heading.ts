import {Quaternion} from 'three';
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
