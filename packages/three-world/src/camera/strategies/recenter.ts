import { Quaternion, Vector3 } from 'three';
import type { CameraOrientation } from '../../config/camera';
import type { CameraSubjectFacts } from '../subject';
import { cameraReferenceRotation } from './heading';

/** Intersect the orbit cone at the current pitch with the target's world vertical
 * plane. Projecting a direction onto the local XZ plane changes its world azimuth. */
export function worldDirectionYaw(direction:Vector3,reference:Quaternion,currentYaw:number,pitch:number,limits:CameraOrientation['yawLimitsRadians']):number {
  const normal=new Vector3(direction.z,0,-direction.x).applyQuaternion(reference.clone().invert());
  const cosine=Math.cos(pitch),sine=Math.sin(pitch);
  // n dot (-sin(yaw)*cos(pitch), -sin(pitch), -cos(yaw)*cos(pitch)) = 0.
  const a=cosine*normal.x,b=cosine*normal.z,c=-sine*normal.y,radius=Math.hypot(a,b);
  if(radius<1e-10||Math.abs(c)>radius+1e-10)return currentYaw;
  const angle=Math.asin(Math.max(-1,Math.min(1,c/radius))),phase=Math.atan2(b,a),turn=2*Math.PI;
  const candidates:number[]=[];
  for(const root of [angle-phase,Math.PI-angle-phase]){
    const forward=new Vector3(-Math.sin(root)*cosine,-sine,-Math.cos(root)*cosine).applyQuaternion(reference);
    const horizontal=Math.hypot(forward.x,forward.z);
    // The vertical plane also contains the opposite heading and the vertical pole.
    if(horizontal<1e-8||(forward.x*direction.x+forward.z*direction.z)/horizontal<1-1e-8)continue;
    let turns=Math.round((currentYaw-root)/turn);
    if(limits.kind==='bounded'){
      const first=Math.ceil((limits.minimumRadians-root-1e-10)/turn),last=Math.floor((limits.maximumRadians-root+1e-10)/turn);
      if(first>last)continue;
      turns=Math.max(first,Math.min(last,turns));
    }
    candidates.push(root+turns*turn);
  }
  // Some tilted cones cannot reach a horizontal bearing at this pitch. Preserve
  // the orbit rather than choosing the opposite direction or changing pitch.
  return candidates.sort((a,b)=>Math.abs(a-currentYaw)-Math.abs(b-currentYaw))[0]??currentYaw;
}

/** A direction is a world fact. Convert it into orbit coordinates only at the
 * strategy boundary; movement never overwrites the subject's semantic heading. */
export function recenterYaw(
  orientation: CameraOrientation,
  subject: CameraSubjectFacts,
  measuredHeading: number | undefined,
  referenceHeading: number,
  currentYaw: number,
  pitch: number,
): { yawRadians: number; speedMetersPerSecond: number } | undefined {
  const target = orientation.recenter.yawTarget ?? { kind: 'subject-forward' };
  if (target.kind === 'subject-forward') {
    if (measuredHeading === undefined) return undefined;
    // Preserve the calibrated path, including continuous aircraft heading.
    return {
      yawRadians: orientation.referenceFrame !== 'world-up' && orientation.inheritSubjectYaw ? 0 : referenceHeading,
      speedMetersPerSecond: subject.speedMetersPerSecond,
    };
  }
  let direction: Vector3;
  let speed = subject.speedMetersPerSecond;
  if (target.kind === 'movement-direction') {
    const velocity = subject.velocityWorldMetersPerSecondXYZ;
    if (!velocity) return undefined;
    speed = Math.hypot(velocity[0], velocity[2]);
    // No direction exists at rest or during pure vertical motion, even with a
    // zero admission threshold. Retain the player's current orbit in that case.
    if (speed <= 1e-8) return undefined;
    direction = new Vector3(velocity[0] / speed, 0, velocity[2] / speed);
  } else {
    direction = new Vector3(-Math.sin(target.yawRadians), 0, -Math.cos(target.yawRadians));
  }
  const reference=cameraReferenceRotation(subject, orientation.referenceFrame, referenceHeading, orientation.inheritSubjectYaw);
  return { yawRadians: worldDirectionYaw(direction,reference,currentYaw,pitch,orientation.yawLimitsRadians), speedMetersPerSecond: speed };
}
