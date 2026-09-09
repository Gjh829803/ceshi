import {training} from '@worldkit/three';
import type {CreatorProfile} from './contracts.js';

/** Shared discovery advice; workspace runtime values must come from its source and live inspection. */
export function cameraAuthoringGuidance(profile:CreatorProfile,workspaceRuntime=false,subject:'training'|'nonhuman'='training') {
  if(profile==='three-raw')return undefined;
  const runtimeAuthority=workspaceRuntime?'workspace-sdk-source':'host-sdk-baseline';
  const root=workspaceRuntime?'sdk/three-world/src':'packages/three-world/src';
  if(subject==='nonhuman')return {
    scope:'ordinary-sdk-follow',runtimeAuthority,
    source:[`${root}/contracts.ts`,`${root}/world.ts`],
    authoring:'Use setCameraFollow({view}) for the actual subject and rig; inspect current source and world.snapshot().camera. Do not copy humanoid eye heights into an independent subject.',
    verify:'Use current-view pixels when needed to judge requested camera behavior or diagnose a problem. world_preview({view:"opening"}) resets to the opening; no fixed perspective/reset checklist is required.',
  };
  return {
    scope:'training-only',runtimeAuthority,
    source:[`${root}/config/camera.ts`],
    startWithDefaults:'Omit camera/cameraDistanceMeters to reuse tuned defaults. Whitebox scale is not eye height. Override only observed defects.',
    ...(workspaceRuntime?{
      currentContract:'Read current workspace source via topic:training, sections:[training]. Host example values are not runtime authority. Rebuild with world_validate and match runtimeSourceHash in world_inspect.',
    }:{parameters:{
      targetHeightOffset:{default:training.CAMERA_PARAMETERS.targetHeightOffset.defaultValue,description:training.CAMERA_PARAMETERS.targetHeightOffset.description},
      horizontalOffset:{default:training.CAMERA_PARAMETERS.horizontalOffset.defaultValue,description:training.CAMERA_PARAMETERS.horizontalOffset.description},
      cameraDistanceMeters:{description:training.CAMERA_DISTANCE_METERS_SCHEMA.description},
    }}),
    opening:'Opening: world.useAuthoredCamera(); play: training.camera. Avoid onReset camera takeovers in Episode.',
    verify:{
      selectView:{tool:'world_execute_command',arguments:{command:{type:'training.camera',mode:2}}},
      currentView:{tool:'world_preview',arguments:{view:'current'}},
      read:'cameraObservation: cameraOverrides (explicit), cameraSettings, framing, alongside pixels.',
      opening:'opening resets, unlike current.',
      playtest:'Cover requested camera behavior in the task self-check; inspect other views or lifecycle transitions only when relevant to an observed problem.',
    },
    inspect:{
      tool:'world_inspect',arguments:{sections:['description']},
      path:'observation.description.training.configuration.effective.camera.framing',
      meaning:'Check sampledOffsets/offsetsPending for old-frame/new-config mismatch. Projection is advisory, not pixel visibility or visual acceptance.',
    },
  };
}
