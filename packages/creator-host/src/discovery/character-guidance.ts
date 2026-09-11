import {humanoid} from '@worldkit/three';
import type {AssetCatalogEntry} from '../compiler/compiler';
import type {CreatorProfile} from '../contracts';
import type {AssetPolicy} from '../assets/asset-policy.mjs';
const {SKILL_DEFINITIONS,HUMANOID_BINDINGS,HUMANOID_CONTROL_HINTS,CHARACTER_CAPABILITIES,ANIMATION_ONLY_CLIP_IDS}=humanoid;

/** Authoring requirements remain Host-owned even when a project edits its SDK. */
export function humanAuthoringGuidance(policy:AssetPolicy,profile:CreatorProfile){
 return {
  authority:'host-authoring-requirement',humanAssetId:policy.defaultHumanoidAssetId,
  requirement:'Humans use the permitted supplied visible model, rig and motions, keeping one instance across movement and riding. Select a human only when the task needs one.',
  vehicleComposition:'Author vehicle geometry separately; select handling and bind the same rider. Read assets for binding paths.',
  customAssetScope:policy.allowCustomAssets?'External nonhuman resources permitted; authored Three geometry allowed.':'External custom resources disabled; authored Three geometry allowed.',
  details:{tool:'creator_get_authoring_schema',arguments:{topic:'assets'}},
  ...(profile==='three-sdk'?{exampleTopic:'getting-started'}:{}),
 };
}

export function characterUsage(asset:AssetCatalogEntry,profile:CreatorProfile,_allowedIds:readonly string[],workspaceRuntime=false){
 if(asset.id!=='humanoid.uefn-mannequin')return undefined;
 const sdk=profile==='three-sdk',hostSdk=sdk&&!workspaceRuntime;
 return {
  assetId:asset.id,integration:workspaceRuntime?'workspace-sdk':sdk?'createHumanoidWorld':'three-model-and-clips',runtimeAuthority:workspaceRuntime?'workspace-sdk-source':sdk?'host-sdk-baseline':'raw-author',clipCount:asset.animationClips.length,
  useWhen:workspaceRuntime?'人形模型与动画资源；实际动作、按键和触发条件以当前项目 SDK 为准。':'推荐人形主体；移动、攀爬、翻越、游泳、翻滚、滑铲、蹲伏、匍匐、拾取、放下、搬运、坐下、起身、切换泳姿。',
  ...(hostSdk?{schemaTopic:'character-actions',exampleTopic:'getting-started',skillRequests:SKILL_DEFINITIONS,
    controlBindings:HUMANOID_BINDINGS,controlHints:HUMANOID_CONTROL_HINTS,capabilities:CHARACTER_CAPABILITIES,
    animationOnlyClipIds:ANIMATION_ONLY_CLIP_IDS,
    layers:[{id:'reuse',entry:'createHumanoidWorld({scene,camera,map,...})'},
      {id:'scene',entry:'EnvironmentDefinition: boxes, water, climbSurfaces, interactions'},
      {id:'parameters',entry:'humanoid.apply-profile + character capability parameters'},
      {id:'source',entry:'creator_materialize_runtime → sdk/three-world/src/humanoid-runtime → world_validate'}]}:{}),
  ...(workspaceRuntime?{schemaTopic:'character-actions',exampleTopic:'getting-started',runtimeDefinitionsTool:{tool:'creator_get_authoring_schema',arguments:{topic:'character-actions',sections:['humanoid']}}}:{}),
  mesh:'All humans must retain the supplied visible model, rig and motions, without added clothing or accessories. Keep the same human instance when mounting and dismounting; never draw a replacement rider inside a vehicle Group. For nonhuman creatures, reuse permitted assets first; vehicles use model-free configurations and authored Mesh/Group geometry and bind via addCharacter({object,body,movement}), registerMovement or VehicleInstance {object,spec}. Skeletal clips require a compatible rig.',
  limitations:[
   'Implement only prompt-requested gameplay; these are optional capabilities. Animation clips are playback assets; executable skills, input-driven states and automatic transitions are listed separately.',
   sdk?'Use capability scene conditions and current snapshot eligibility. An accepted receipt starts an operation; query its completion and resulting state.':'The raw profile loads models/clips with Three and supplies its own movement/physics implementation.',
  ],
 };
}
