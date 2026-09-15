import type {CameraCollisionProbe} from '@worldkit/camera-collision';
import type {Vec3} from '../contracts';

const HEIGHT_RATIOS=[1,0,.5,.25,.75,.125,.875,.375,.625] as const;
const CLEARANCE_REFINEMENT_STEPS=8;

/**
 * Measures free space around the best capsule centre-axis sight line. This is an
 * early framing signal, not the capsule-ring test that decides hard occlusion.
 * The caller owns subject filtering and the minimum/maximum clearance policy.
 */
export function measureSubjectVisibilityClearanceRatio(
 eye:Vec3,
 capsule:{readonly positionWorldMetersXYZ:Vec3;readonly heightMeters:number;readonly radiusMeters:number},
 minimumClearanceMeters:number,
 maximumClearanceMeters:number,
 query:CameraCollisionProbe,
):number {
 if(![...eye,...capsule.positionWorldMetersXYZ,capsule.heightMeters,capsule.radiusMeters,minimumClearanceMeters,maximumClearanceMeters].every(Number.isFinite)||
  capsule.heightMeters<=0||capsule.radiusMeters<=0||minimumClearanceMeters<0||maximumClearanceMeters<=minimumClearanceMeters)throw new Error('CAMERA_VISIBILITY_CLEARANCE_INPUT_INVALID');
 let best=minimumClearanceMeters;
 const position=capsule.positionWorldMetersXYZ;
 for(const ratio of HEIGHT_RATIOS){
  const inset=Math.min(.001,capsule.heightMeters/2);
  const target:Vec3=[position[0],position[1]+inset+(capsule.heightMeters-2*inset)*ratio,position[2]];
  const travel=Math.hypot(target[0]-eye[0],target[1]-eye[1],target[2]-eye[2]);
  const clear=(radius:number):boolean=>{
   const hit=query(eye,target,radius);
   if(!Number.isFinite(hit.distanceMeters)||hit.distanceMeters<0||
    (hit.normalWorldXYZ&&(hit.normalWorldXYZ.length!==3||!hit.normalWorldXYZ.every(Number.isFinite)||
      !Number.isFinite(Math.hypot(...hit.normalWorldXYZ))||Math.hypot(...hit.normalWorldXYZ)<.5)))throw new Error('CAMERA_COLLISION_PROBE_INVALID');
   return !hit.startedOverlapping&&hit.distanceMeters>=travel-1e-8;
  };
  if(clear(maximumClearanceMeters))return 1;
  // Once a sight line has established a usable radius, poorer lines cannot
  // improve it. Do not spend another binary search on every blocked body point.
  if(!clear(best))continue;
  let low=best,high=maximumClearanceMeters;
  for(let iteration=0;iteration<CLEARANCE_REFINEMENT_STEPS;iteration++){
   const middle=(low+high)/2;
   if(clear(middle))low=middle;else high=middle;
  }
  best=low;
 }
 return (best-minimumClearanceMeters)/(maximumClearanceMeters-minimumClearanceMeters);
}
