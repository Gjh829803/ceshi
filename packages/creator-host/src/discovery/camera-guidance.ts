import type {CreatorProfile} from '../contracts.js';

/** Values are discovered from the selected runtime, never copied from Host defaults. */
export function cameraAuthoringGuidance(profile:CreatorProfile,workspaceRuntime=false,subject:'humanoid'|'nonhuman'='humanoid') {
  if(profile==='three-raw')return undefined;
  const root=workspaceRuntime?'sdk/three-world/src':'packages/three-world/src';
  return {
    scope:'named-camera-views',subject,runtimeAuthority:workspaceRuntime?'workspace-sdk-source':'host-sdk-baseline',
    source:[`${root}/config/camera/index.ts`,`${root}/camera/state.ts`,`${root}/camera/subject.ts`],
    authoring:{tool:'creator_get_authoring_schema',arguments:{topic:'programming'},section:'Initial state and camera',entry:'world.setCameraFollow'},
    configuration:{tool:'creator_get_authoring_schema',arguments:{topic:subject==='nonhuman'?'nonhuman-subject':'getting-started',sections:['contracts']},fields:['cameraConfiguration','cameraSourceContracts']},
    binding:'Import config/camera.json relatively; parseCameraDocument(data), then world.setCameraFollow({configuration:document}). Select named views with world.setCameraView(viewId). Embed referenced preset snapshots in document.presets; author imports do not allow preset-content.',
    subjectCapability:'Ordinary addCharacter accepts optional eyePositionLocalMetersXYZ for first-person and shoulder views; camera subjects expose actual eye support. Read the selected SDK declarations.',
    inspect:{tool:'world_inspect',arguments:{sections:['camera']},path:'observation.camera',meaning:'Committed configuration hash, revisions, view, subject, effective values and field provenance. Unavailable is not a configuration match.'},
    verify:{currentView:{tool:'world_preview',arguments:{view:'current'}},read:'cameraObservation.camera is the same committed inspection. Playtest samples carry snapshot.camera summaries; full provenance is on demand.',opening:'opening resets, unlike current.'},
  };
}
