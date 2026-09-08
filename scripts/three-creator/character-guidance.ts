import {training} from '@worldkit/three';
import type {AssetCatalogEntry} from './compiler';
import type {CreatorProfile} from './contracts';
const {SKILL_DEFINITIONS,HUMANOID_BINDINGS,HUMANOID_CONTROL_HINTS,CHARACTER_CAPABILITIES,ANIMATION_ONLY_CLIP_IDS}=training;

export function characterUsage(asset:AssetCatalogEntry,profile:CreatorProfile,_allowedIds:readonly string[],workspaceRuntime=false){
 if(asset.id!=='humanoid.source-101')return undefined;
 const sdk=profile==='three-sdk',hostSdk=sdk&&!workspaceRuntime;
 return {
  assetId:asset.id,integration:workspaceRuntime?'workspace-sdk':sdk?'createHumanoidWorld':'three-model-and-clips',runtimeAuthority:workspaceRuntime?'workspace-sdk-source':sdk?'host-sdk-baseline':'raw-author',clipCount:asset.runtimeActions.length,
  useWhen:workspaceRuntime?'人形模型与动画资源；实际动作、按键和触发条件以当前项目 SDK 为准。':'推荐人形主体；移动、攀爬、翻越、游泳、翻滚、滑铲、蹲伏、匍匐、拾取、放下、搬运、坐下、起身、切换泳姿。',
  ...(hostSdk?{schemaTopic:'character-actions',exampleTopic:'character-actions',skillRequests:SKILL_DEFINITIONS,
    controlBindings:HUMANOID_BINDINGS,controlHints:HUMANOID_CONTROL_HINTS,capabilities:CHARACTER_CAPABILITIES,
    animationOnlyClipIds:ANIMATION_ONLY_CLIP_IDS,
    layers:[{id:'reuse',entry:'createHumanoidWorld({scene,camera,map,...})'},
      {id:'scene',entry:'TrainingMap: boxes, water, climbSurfaces, interactions'},
      {id:'parameters',entry:'training.profile + character capability parameters'},
      {id:'source',entry:'creator_materialize_runtime → sdk/three-world/src/training → world_validate'}]}:{}),
  ...(workspaceRuntime?{schemaTopic:'character-actions',exampleTopic:'character-actions',runtimeDefinitionsTool:{tool:'creator_get_authoring_schema',arguments:{topic:'character-actions',sections:['training']}}}:{}),
  mesh:'Reuse supplied subjects where suitable. For humans, keep the supplied visible model, rig and actions together; use it directly without added clothing or accessories. If no suitable subject is provided, draw a simple Mesh/Group and bind via createWorld/addCharacter({object,body,movement}), registerMovement, or TrainingVehicleInstance {object,spec}. Use white/light-gray geometry with accent colors only for key landmarks. Skeletal clips require a compatible rig.',
  limitations:[
   'Animation clips are playback assets; executable skills, input-driven states and automatic transitions are listed separately.',
   sdk?'Use capability scene conditions and current snapshot eligibility. An accepted receipt starts an operation; query its completion and resulting state.':'The raw profile loads models/clips with Three and supplies its own movement/physics implementation.',
  ],
 };
}
