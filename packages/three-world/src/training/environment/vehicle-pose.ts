import { Quaternion, Vector3 } from 'three';
import type { QueryBody } from './queries';

/** Keep the complete visual hull inside a yaw-aligned box. Rapier's ground
 * controller then rests on a flat face instead of a decorative banked corner. */
export function groundVehiclePose(body:QueryBody,visualRotation:Quaternion,yaw:number){
  const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw);
  if(body.kind!=='box')return {body,rotation:visualRotation};
  const lean=rotation.clone().invert().multiply(visualRotation);
  const halfExtents=new Vector3();
  for(let axis=0;axis<3;axis++){
    const extent=new Vector3().setComponent(axis,body.halfExtents[axis]!).applyQuaternion(lean);
    halfExtents.add(new Vector3(Math.abs(extent.x),Math.abs(extent.y),Math.abs(extent.z)));
  }
  const offset=new Vector3(...body.offset).applyQuaternion(lean);
  return {body:{kind:'box' as const,halfExtents:halfExtents.toArray(),offset:offset.toArray()},rotation};
}
