import {Vector3} from 'three';
import type {ResolvedCameraConfiguration} from '../config/camera/index';
import {cameraPositionAnchor,type CameraSubjectFacts} from './subject';
/** Unsmoothed anchor fact only; display correction preserves all committed damping. */
export function cameraDisplayAnchor(subject:CameraSubjectFacts,configuration:ResolvedCameraConfiguration,fallbackHeading=0):Vector3 {
 return cameraPositionAnchor(subject,configuration.values.position,fallbackHeading);
}
