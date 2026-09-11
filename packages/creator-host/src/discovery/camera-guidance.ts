import {humanoid} from '@worldkit/three';
import type {CreatorProfile} from '../contracts.js';

/** Shared discovery advice; workspace runtime values must come from its source and live inspection. */
export function cameraAuthoringGuidance(profile:CreatorProfile,workspaceRuntime=false,subject:'humanoid'|'nonhuman'='humanoid') {
  if(profile==='three-raw')return undefined;
  const runtimeAuthority=workspaceRuntime?'workspace-sdk-source':'host-sdk-baseline';
  const root=workspaceRuntime?'sdk/three-world/src':'packages/three-world/src';
  if(subject==='nonhuman')return {
    scope:'ordinary-sdk-follow',runtimeAuthority,
    source:[`${root}/contracts.ts`,`${root}/camera-subject.ts`,`${root}/camera.ts`],
    authoring:{tool:'creator_get_authoring_schema',arguments:{topic:'programming'},section:'Initial state and camera',entry:'world.setCameraFollow'},
    verify:'Use current-view pixels when needed to judge requested camera behavior or diagnose a problem. world_preview({view:"opening"}) resets to the opening; no fixed perspective/reset checklist is required.',
  };
  return {
    scope:'humanoid-only',runtimeAuthority,
    source:[`${root}/config/camera.ts`,`${root}/camera-subject.ts`,`${root}/camera.ts`],
    startWithDefaults:'Keep tuned defaults; override observed defects. Whitebox size does not set eye height.',
    ...(workspaceRuntime?{
      currentContract:'Read current workspace source via topic:humanoid, sections:[humanoid]. Host example values are not runtime authority. Rebuild with world_validate and match runtimeSourceHash in world_inspect.',
    }:{parameters:{
      targetHeightOffset:{default:humanoid.CAMERA_PARAMETERS.targetHeightOffset.defaultValue,description:humanoid.CAMERA_PARAMETERS.targetHeightOffset.description},
      horizontalOffset:{default:humanoid.CAMERA_PARAMETERS.horizontalOffset.defaultValue,description:humanoid.CAMERA_PARAMETERS.horizontalOffset.description},
      cameraDistanceMeters:{description:humanoid.CAMERA_DISTANCE_METERS_SCHEMA.description},
    }}),
    opening:{tool:'creator_get_authoring_schema',arguments:{topic:'programming'},section:'Initial state and camera',entry:'world.setCameraFollow'},
    characterFacing:workspaceRuntime?'Read current humanoid factory options for initial facing; match the rebuilt runtime.':'Default: back to opening camera. Override characterFacingYawRadians at creation: 0=-Z, PI/2=-X, PI=+Z. Reset restores it; never rotate the managed root.',
    followTarget:'setCameraFollow accepts targetEntityId and shared framing/follow parameters for ordinary and full humanoid actors. Input selection is independent. Use explicit humanoid modes/profile for tuned views; inspect settingsApplied before interpreting those settings.',
    openingExample:{tool:'creator_get_examples',arguments:{topic:'getting-started',files:['main.ts']},
      scope:'Human binding with authored camera follow.'},
    verify:{
      viewChanges:'Exercise perspective changes only when the request or observed problem calls for them; use the selected subject’s current camera contract.',
      currentView:{tool:'world_preview',arguments:{view:'current'}},
      read:'cameraObservation: cameraOverrides (explicit), cameraSettings (tuned modes only; otherwise null), framing. Shared follow uses camera state and pixels.',
      opening:'opening resets, unlike current.',
      playtest:'Compare opening and first-input pixels; movement must retain authored framing/FOV. Check requested view and subject transitions within Creator self-check.',
    },
    inspect:{
      tool:'world_inspect',arguments:{sections:['description']},
      path:'observation.description.humanoid.configuration.effective.camera.framing',
      meaning:'Check sampledOffsets/offsetsPending. Projection is advisory, not pixel visibility or acceptance.',
    },
  };
}
