import {Vector3} from 'three';
import type {ResolvedCameraConfiguration} from '../config/camera/index';
import {cameraPositionAnchor,type CameraSubjectFacts} from './subject';
import {cameraReferenceRotation} from './strategies/heading';
/** Unsmoothed anchor fact only; display correction preserves committed damping. */
export function cameraDisplayAnchor(subject:CameraSubjectFacts,configuration:ResolvedCameraConfiguration,fallbackHeading?:number,orbitYawRadians?:number):Vector3 {
 return cameraPositionAnchor(subject,configuration.values.position,fallbackHeading,orbitYawRadians===undefined?undefined:{yawRadians:orbitYawRadians,referenceQuaternionWorldXYZW:cameraReferenceRotation(subject,configuration.values.orientation.referenceFrame,fallbackHeading,configuration.values.orientation.inheritSubjectYaw).toArray()});
}
/** On-foot posture is sampled from the same fixed frames as the displayed pose.
 * Mounted eyes retain their measured driver/seat presentation coordinates. */
export function cameraDisplaySubject(previous:CameraSubjectFacts,current:CameraSubjectFacts,display:CameraSubjectFacts,alpha:number):CameraSubjectFacts {
 const onFoot=display.kind==='humanoid'&&!display.seatWorldMetersXYZ;
 if(!onFoot&&!display.followPivotWorldMetersXYZ)return display;
 const points:Partial<CameraSubjectFacts>={};
 for(const key of ['eyeWorldMetersXYZ','shoulderEyeWorldMetersXYZ','followPivotWorldMetersXYZ'] as const){
  if(!onFoot&&key!=='followPivotWorldMetersXYZ')continue;
  const a=previous[key],b=current[key];if(!a||!b)continue;
  const height=a[1]-previous.positionWorldMetersXYZ[1]+((b[1]-current.positionWorldMetersXYZ[1])-(a[1]-previous.positionWorldMetersXYZ[1]))*alpha;
  const point=new Vector3(...(display[key]??b));point.y=display.positionWorldMetersXYZ[1]+height;
  Object.assign(points,{[key]:point.toArray()});
 }
 return {...display,...points,...(onFoot&&previous.body&&current.body?{body:{minimumHeightMeters:previous.body.minimumHeightMeters+(current.body.minimumHeightMeters-previous.body.minimumHeightMeters)*alpha,maximumHeightMeters:previous.body.maximumHeightMeters+(current.body.maximumHeightMeters-previous.body.maximumHeightMeters)*alpha}}:{})};
}
