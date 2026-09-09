import {Vector3} from 'three';
import {CAMERA_EFFECTS} from '../config/presentation';

/** Adjust camera roll around its existing sight line. Eye and vehicle pose are untouched. */
export function applyVehicleCameraRoll(
  up:Vector3,direction:Vector3,
  tuning:Readonly<{enabled:boolean;strength:number}>=CAMERA_EFFECTS.vehicleTurnLean,
):void {
  const strength=tuning.enabled?tuning.strength:0;
  if(strength===1)return; // Preserve the original first-person frame exactly by default.
  const forward=direction.clone().normalize();
  const level=new Vector3(0,1,0).addScaledVector(forward,-forward.y);
  // A vertical sight line has no unique horizon. Keep the existing deterministic up.
  if(level.lengthSq()<1e-8)return;
  level.normalize();
  const inherited=up.clone().addScaledVector(forward,-up.dot(forward)).normalize();
  const angle=Math.atan2(forward.dot(level.clone().cross(inherited)),level.dot(inherited));
  up.copy(level).applyAxisAngle(forward,angle*strength);
}
