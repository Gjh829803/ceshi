export interface CameraRouteFrame {
  readonly tick: number;
  readonly collisionPhase?: string | null;
  readonly position: readonly number[];
  readonly quaternion: readonly number[];
  readonly actor: readonly number[];
  readonly viewId: string | null;
  readonly verticalFovDegrees: number;
  readonly controlForward: readonly number[];
}
/** Compare matching inputs and sample ticks, not screenshots from unrelated runs. */
export function compareCameraRoute(actual: readonly CameraRouteFrame[], baseline: readonly CameraRouteFrame[]) {
  if(actual.length!==baseline.length)throw Error('CAMERA_ROUTE_SAMPLE_COUNT_MISMATCH');
  let maximumPositionErrorMeters=0,maximumActorErrorMeters=0,maximumOrientationErrorRadians=0,maximumControlDirectionError=0,maximumFovErrorDegrees=0;
  const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(...a.map((value,index)=>value-b[index]!));
  for(let n=0;n<actual.length;n++){
    const a=actual[n]!,b=baseline[n]!;
    if(a.tick!==b.tick||a.viewId!==b.viewId)throw Error(`CAMERA_ROUTE_IDENTITY_MISMATCH: sample ${n}`);
    maximumFovErrorDegrees=Math.max(maximumFovErrorDegrees,Math.abs(a.verticalFovDegrees-b.verticalFovDegrees));
    maximumPositionErrorMeters=Math.max(maximumPositionErrorMeters,distance(a.position,b.position));
    maximumActorErrorMeters=Math.max(maximumActorErrorMeters,distance(a.actor,b.actor));
    maximumControlDirectionError=Math.max(maximumControlDirectionError,distance(a.controlForward,b.controlForward));
    const dot=Math.abs(a.quaternion.reduce((sum,value,index)=>sum+value*b.quaternion[index]!,0));
    maximumOrientationErrorRadians=Math.max(maximumOrientationErrorRadians,2*Math.acos(Math.min(1,dot)));
  }
  return {maximumPositionErrorMeters,maximumActorErrorMeters,maximumOrientationErrorRadians,maximumControlDirectionError,maximumFovErrorDegrees};
}
