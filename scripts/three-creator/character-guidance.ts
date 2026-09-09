import {training} from '@worldkit/three';
import type {AssetCatalogEntry} from './compiler';
import type {CreatorProfile} from './contracts';
import type {AssetPolicy} from './asset-policy.mjs';
const {SKILL_DEFINITIONS,HUMANOID_BINDINGS,HUMANOID_CONTROL_HINTS,CHARACTER_CAPABILITIES,ANIMATION_ONLY_CLIP_IDS}=training;

/** Authoring requirements remain Host-owned even when a project edits its SDK. */
export function humanAuthoringGuidance(policy:AssetPolicy,profile:CreatorProfile){
 return {
  authority:'host-authoring-requirement',humanAssetId:policy.defaultHumanoidAssetId,
  requirement:'This requirement applies when humans appear; do not add a human to a nonhuman protagonist scene. Every human, including NPCs and riders, must use the permitted preset visible model, compatible skeleton and supplied motions. Each person keeps one instance across walking, entering, riding, exiting and reset. Never hide or replace that person with a primitive rider or a combined vehicle-and-human model.',
  vehicleComposition:profile==='three-raw'
   ? 'Author vehicle geometry yourself; do not load supplied or external vehicle models. Keep the preset human model/rig and implement attachment, movement and observation in the raw profile. Select three-sdk to use the model-free road configurations and custom-vehicle example.'
   : 'Author vehicle geometry yourself; do not load supplied or external vehicle models. Select a model-free handling configuration first (car or motorcycle via training.createRoadVehicleSpec), then draw the vehicle Mesh/Group to its dimensions and supply object/spec through TrainingVehicleInstance to createHumanoidWorld. Keep the preset person separate; the SDK attaches and poses that same person. Custom geometry permission is not permission to redraw a human.',
  customAssetScope:policy.allowCustomAssets?'Custom external nonhuman resources are allowed by this policy.':'Custom external asset files are disabled; ordinary authored Three geometry remains allowed.',
  poseLimits:'Seat anchors and supported mounted poses use the same skeleton. Do not invent a supported action from a clip name or replace the rider to hide a pose limitation. Report unsupported hand/foot contact or fit; consult the current SDK contracts before adapting parameters.',
  verification:'Use the existing real-input self-check to demonstrate the task’s requested outcomes. Production does not require a separate vehicle regression or a fixed steering, slope, collision, boarding, exit and reset checklist. Inspect continuity or seat fit when relevant to the requested outcome or an observed problem; structural continuity remains advisory.',
  ...(profile==='three-sdk'?{exampleTopic:'custom-vehicle'}:{}),
 };
}

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
  mesh:'All humans must retain the supplied visible model, rig and motions, without added clothing or accessories. Keep the same human instance when mounting and dismounting; never draw a replacement rider inside a vehicle Group. For nonhuman creatures, reuse permitted assets first; vehicles use model-free configurations and authored Mesh/Group geometry and bind via addCharacter({object,body,movement}), registerMovement or TrainingVehicleInstance {object,spec}. Skeletal clips require a compatible rig.',
  limitations:[
   'Animation clips are playback assets; executable skills, input-driven states and automatic transitions are listed separately.',
   sdk?'Use capability scene conditions and current snapshot eligibility. An accepted receipt starts an operation; query its completion and resulting state.':'The raw profile loads models/clips with Three and supplies its own movement/physics implementation.',
  ],
 };
}
