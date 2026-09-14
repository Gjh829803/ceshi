import {resolve} from './configuration-state';
import * as THREE from 'three';
import type { CameraDocument } from '../config/camera/index';
import type { CameraProposal } from './strategies/types';
import { readCameraWorldPose } from '../camera-observation';
import { validateCameraParent } from './presentation';

/** Explicit one-time adoption. Off-axis author lenses cannot be represented by CameraLens. */
export function authoredCameraProposal(camera: THREE.Camera): CameraProposal {
 if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error('CAMERA_PERSPECTIVE_REQUIRED');
 validateCameraParent(camera);
 if (camera.filmOffset !== 0 || camera.view?.enabled) throw new Error('CAMERA_OFF_AXIS_PROJECTION_UNSUPPORTED');
 const {position,rotation}=readCameraWorldPose(camera);
 const look=position.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(rotation));
 return {positionWorldMetersXYZ:position.toArray(),quaternionWorldXYZW:rotation.toArray(),lookAtWorldMetersXYZ:look.toArray(),pivotWorldMetersXYZ:look.toArray(),upWorldXYZ:new THREE.Vector3(0,1,0).applyQuaternion(rotation).toArray(),nominalDistanceMeters:1,visibility:'safety-only',lens:{verticalFovDegrees:camera.getEffectiveFOV(),nearMeters:camera.near,farMeters:camera.far}};
}
/** Query the existing layered resolver; activation timing does not remove preserve-opening adoption. */
export function immediateOpeningNeedsAdoption(document:CameraDocument,subject:import('./subject').CameraSubjectFacts|undefined,camera:THREE.Camera):boolean {
 if(!subject)return false;
 const resolved=resolve(document,document.defaultViewId,subject,{distanceMeters:readCameraWorldPose(camera).position.distanceTo(new THREE.Vector3(...subject.positionWorldMetersXYZ))});
 return resolved.kind==='third-person'&&resolved.values.framing.kind==='preserve-opening';
}
