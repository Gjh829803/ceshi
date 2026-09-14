import Ajv from 'ajv';
import type { Vec3, EpisodeStart, EpisodeCapabilities } from '@worldkit/three';
import { sha256Canonical } from './serialization/canonical-json.mjs';

export const EPISODE_VERSION = 'three-episode-agent@2';
export const SEGMENT_IDS = Array.from({ length: 6 }, (_, i) => `segment-0${i}`);
export const PRE_SEEDANCE_PROFILE = Object.freeze({
  kind: 'three-episode-production-profile', schemaVersion: 1, version: EPISODE_VERSION,
  segmentCount: 6, segmentSeconds: 30, captureFps: 24, captureFrameCount: 720,
  widthPixels: 1280, heightPixels: 720, simulationTickRate: 60, styleCount: 10,
  maximumPlanRepairsPerSegment: 2, stopBeforeSeedance: true,
  model: 'gpt-6-astra', reasoningEffort: 'xhigh', navigationPolicy: 'agent-local-observation',
});

export interface EpisodeWaypoint { positionWorldMetersXYZ: Vec3; gait: 'walk' | 'run' }
export type EpisodeActionIntent =
  | { kind: 'skill'; action: 'roll' | 'slide' | 'pickup' | 'putDown' | 'sit' | 'standUp' }
  | { kind: 'posture'; stance: 'stand' | 'crouch' | 'prone' }
  | { kind: 'climb'; direction: 'enter' | 'exit' | 'up' | 'down' | 'left' | 'right' }
  | { kind: 'swim-style'; style: 'freestyle' | 'breaststroke' }
  | { kind: 'mount'; action: 'enter' | 'exit' }
  | { kind: 'view'; viewId: string };
export interface EpisodeActionGoal {
  id: string;
  trigger: { waypointIndex: number; radiusMeters: number };
  targetId?: string;
  slotId?: string;
  intent: EpisodeActionIntent;
  /** The intent's actual state (and terminal operation for skills) must match first. */
  completion: { kind: 'settled'; holdSeconds: number } | { kind: 'displacement'; minimumMeters: number };
  timeoutSeconds: number;
}
export interface EpisodeSegmentPlan {
  id: string;
  start: EpisodeStart;
  waypoints: EpisodeWaypoint[];
  endBehavior: 'stop' | 'reverse' | 'loop';
  purpose: string;
  actionGoals?: EpisodeActionGoal[];
}
export interface EpisodePlan {
  kind: 'worldkit-three-episode-plan'; schemaVersion: 2;
  worldBuildHash: string; segments: EpisodeSegmentPlan[];
}
export interface EpisodeFile { path: string; sha256: string; byteLength?: number }
export interface EpisodeVisualTarget {
  id: string; name: string; role: string; appearancePrompt?: string;
  entityId?: string; whiteboxTriview: EpisodeFile;
}
export interface EpisodeSourceManifest {
  kind: 'three-episode-source'; schemaVersion: 1;
  worldId: string; sourceHash: string; worldBuildHash: string; runtimeHash: string;
  sourceWorldBuildHash: string; sourceRuntimeHash: string; sourceDeliveryManifestSha256: string;
  runtimeSourceHash?: string | null;
  /** Hash of the Creator asset policy snapshot carried by every source bundle. */
  assetPolicySha256: string;
  sourceRoot: string; playableRoot: string; sourceFiles: Record<string, string>;
  playableFiles: Record<string, string>; opening: EpisodeFile;
  targets: EpisodeVisualTarget[]; referenceImage?: EpisodeFile; worldPlan?: EpisodeFile;
  contextPath?: string; sourceUrl?: string;
}
const vec3 = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
export const ACTION_GOAL_SCHEMA = object({
  id: { type: 'string', minLength: 1, maxLength: 80 },
  trigger: object({ waypointIndex: { type: 'integer', minimum: 0, maximum: 255 }, radiusMeters: { type: 'number', minimum: 0.2, maximum: 2 } }),
  targetId: { type: 'string', minLength: 1, maxLength: 256 },
  slotId: { type: 'string', minLength: 1, maxLength: 256 },
  intent: { oneOf: [
    object({ kind: { const: 'skill' }, action: { enum: ['roll', 'slide', 'pickup', 'putDown', 'sit', 'standUp'] } }),
    object({ kind: { const: 'posture' }, stance: { enum: ['stand', 'crouch', 'prone'] } }),
    object({ kind: { const: 'climb' }, direction: { enum: ['enter', 'exit', 'up', 'down', 'left', 'right'] } }),
    object({ kind: { const: 'swim-style' }, style: { enum: ['freestyle', 'breaststroke'] } }),
    object({ kind: { const: 'mount' }, action: { enum: ['enter', 'exit'] } }),
    object({ kind: { const: 'view' }, viewId: {type:'string',minLength:1} }),
  ] },
  completion: { oneOf: [
    object({ kind: { const: 'settled' }, holdSeconds: { type: 'number', minimum: 0, maximum: 20 } }),
    object({ kind: { const: 'displacement' }, minimumMeters: { type: 'number', exclusiveMinimum: 0, maximum: 20 } }),
  ] },
  timeoutSeconds: { type: 'number', minimum: 0.1, maximum: 25 },
}, ['id', 'trigger', 'intent', 'completion', 'timeoutSeconds']);
export const EPISODE_START_SCHEMA = object({ positionWorldMetersXYZ: vec3, facingYawRadians: { type: 'number' },cameraViewId:{type:'string',minLength:1},cameraViewSelection:{const:'automatic'},humanoid:object({
    vehicleInstanceId:{type:'string',minLength:1},mounted:{type:'boolean'},
    velocityWorldMetersPerSecondXYZ:vec3,pitchRadians:{type:'number'},rollRadians:{type:'number'},throttle:{type:'number',minimum:0,maximum:1},launched:{type:'boolean'},
  },[]) },['positionWorldMetersXYZ','facingYawRadians']);
export const SEGMENT_SCHEMA = object({
  id: { enum: SEGMENT_IDS },
  start: EPISODE_START_SCHEMA,
  waypoints: { type: 'array', minItems: 1, maxItems: 256, items: object({ positionWorldMetersXYZ: vec3, gait: { enum: ['walk', 'run'] } }) },
  endBehavior: { enum: ['stop', 'reverse', 'loop'] },
  purpose: { type: 'string', minLength: 1, maxLength: 2000 },
  actionGoals: { type: 'array', minItems: 1, maxItems: 32, items: ACTION_GOAL_SCHEMA },
}, ['id', 'start', 'waypoints', 'endBehavior', 'purpose']);
export const EPISODE_PLAN_SCHEMA = object({
  kind: { const: 'worldkit-three-episode-plan' }, schemaVersion: { const: 2 },
  worldBuildHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  segments: { type: 'array', minItems: 1, maxItems: 6, items: SEGMENT_SCHEMA },
});
const validate = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile(EPISODE_PLAN_SCHEMA);
export function canonicalHash(value: unknown): string { return sha256Canonical(value).slice(7); }
export function validateEpisodePlan(value: unknown, options: { worldBuildHash: string; requireSix?: boolean }): EpisodePlan {
  if (!validate(value)) throw new Error(`EPISODE_PLAN_INVALID: ${JSON.stringify(validate.errors)}`);
  const plan = value as unknown as EpisodePlan;
  if (plan.worldBuildHash !== options.worldBuildHash) throw new Error('EPISODE_PLAN_STALE_WORLD');
  const ids = plan.segments.map(s => s.id);
  if (new Set(ids).size !== ids.length || (options.requireSix !== false &&
      (ids.length !== 6 || SEGMENT_IDS.some((id, i) => ids[i] !== id)))) throw new Error('EPISODE_PLAN_SIX_ORDERED_SEGMENTS_REQUIRED');
  const starts = plan.segments.map(s => s.start.positionWorldMetersXYZ.join(','));
  if (new Set(starts).size !== starts.length) throw new Error('EPISODE_PLAN_DISTINCT_STARTS_REQUIRED');
  for (const segment of plan.segments) {
    if(segment.start.cameraViewSelection!==undefined&&segment.start.cameraViewId!==undefined)throw new Error('EPISODE_CAMERA_FIELDS_CONFLICT');
    const goals = segment.actionGoals ?? [];
    if (new Set(goals.map(g => g.id)).size !== goals.length) throw new Error('EPISODE_ACTION_GOAL_ID_DUPLICATED');
    goals.forEach((goal, index) => {
      if (goal.slotId && (!goal.targetId || goal.intent.kind !== 'skill' || !['pickup', 'sit', 'putDown', 'standUp'].includes(goal.intent.action))) throw new Error('EPISODE_ACTION_SLOT_INVALID');
      if (goal.trigger.waypointIndex >= segment.waypoints.length || (index && goal.trigger.waypointIndex < goals[index - 1]!.trigger.waypointIndex)) throw new Error('EPISODE_ACTION_GOAL_ORDER_INVALID');
      if (goal.intent.kind === 'skill' && ['pickup', 'sit'].includes(goal.intent.action) && !goal.targetId) throw new Error('EPISODE_ACTION_TARGET_REQUIRED');
      if (goal.intent.kind === 'mount' && goal.intent.action === 'enter' && !goal.targetId) throw new Error('EPISODE_ACTION_TARGET_REQUIRED');
      if (['mount', 'view'].includes(goal.intent.kind) && goal.completion.kind !== 'settled') throw new Error('EPISODE_ACTION_DISPLACEMENT_UNSUPPORTED');
      if (goal.intent.kind === 'climb' && !['enter', 'exit'].includes(goal.intent.direction) && goal.completion.kind !== 'displacement') throw new Error('EPISODE_CLIMB_DISPLACEMENT_REQUIRED');
      if (goal.intent.kind === 'skill' && !['roll', 'slide'].includes(goal.intent.action) && goal.completion.kind === 'displacement') throw new Error('EPISODE_ACTION_DISPLACEMENT_UNSUPPORTED');
      if (goal.completion.kind === 'settled' && goal.completion.holdSeconds >= goal.timeoutSeconds) throw new Error('EPISODE_ACTION_TIMEOUT_TOO_SHORT');
    });
  }
  return structuredClone(plan);
}
type CameraDeclaration=Pick<EpisodeCapabilities['camera'],'views'|'defaultViewId'|'automaticViewSelection'>;
/** Explicit import boundary. Returns new canonical data; never rewrites a frozen plan or receipt. */
export function importEpisodePlan(value:unknown,camera:CameraDeclaration,options:{worldBuildHash:string;requireSix?:boolean}):EpisodePlan {
 const plan=structuredClone(value) as any;
 if(!plan||!Array.isArray(plan.segments))return validateEpisodePlan(plan,options);
 const select=(kind:string)=>{
  if(!['third-person','first-person','shoulder'].includes(kind))throw new Error('EPISODE_CAMERA_VIEW_INVALID');
  const matches=camera.views.filter(v=>v.kind===kind);
  if(matches.length===1)return matches[0]!.viewId;
  if(matches.some(v=>v.viewId===camera.defaultViewId))return camera.defaultViewId!;
  throw new Error(matches.length?'EPISODE_CAMERA_VIEW_AMBIGUOUS':'EPISODE_CAMERA_VIEW_UNDECLARED');
 };
 for(const segment of plan.segments){
  const start=segment?.start;if(!start)continue;
  const legacy=start.cameraPerspective!==undefined||start.humanoid?.cameraMode!==undefined;
  if(legacy&&start.cameraViewId!==undefined)throw new Error('EPISODE_CAMERA_FIELDS_CONFLICT');
  if(legacy){
   const numeric=start.humanoid?.cameraMode;
   if(numeric!==undefined&&![0,1,2].includes(numeric))throw new Error('EPISODE_CAMERA_VIEW_INVALID');
   start.cameraViewId=select(start.cameraPerspective??(['third-person','first-person','shoulder'][numeric]));
   delete start.cameraPerspective;if(start.humanoid)delete start.humanoid.cameraMode;
  }
  for(const goal of segment.actionGoals??[])if(goal.intent?.kind==='view'&&goal.intent.perspective!==undefined){
   if(goal.intent.viewId!==undefined)throw new Error('EPISODE_CAMERA_FIELDS_CONFLICT');
   goal.intent={kind:'view',viewId:select(goal.intent.perspective)};
  }
 }
 const result=validateEpisodePlan(plan,options);validateEpisodePlanViews(result,camera);return result;
}
export function validateEpisodePlanViews(plan:EpisodePlan,camera:CameraDeclaration):void {
 for(const segment of plan.segments){
  if(segment.start.cameraViewSelection==='automatic'&&camera.automaticViewSelection!==true)throw new Error('EPISODE_CAMERA_SELECTION_UNSUPPORTED');
  const ids=[segment.start.cameraViewId,...(segment.actionGoals??[]).flatMap(goal=>goal.intent.kind==='view'?[goal.intent.viewId]:[])];
  for(const id of ids)if(id!==undefined&&!camera.views.some(view=>view.viewId===id))throw new Error('EPISODE_CAMERA_VIEW_UNDECLARED');
 }
}
/** This run's explicit user stop is durable; a caller cannot bypass it with a stage option. */
export function assertPreSeedanceProfile(value: unknown): asserts value is typeof PRE_SEEDANCE_PROFILE {
  if (canonicalHash(value) !== canonicalHash(PRE_SEEDANCE_PROFILE)) throw new Error('EPISODE_PROFILE_CHANGED_OR_VIDEO_NOT_AUTHORIZED');
}
export function segmentRecipeHash(source: Pick<EpisodeSourceManifest, 'worldBuildHash' | 'runtimeHash'>, segment: EpisodeSegmentPlan): string {
  return canonicalHash({ worldBuildHash: source.worldBuildHash, runtimeHash: source.runtimeHash, segment, profile: PRE_SEEDANCE_PROFILE });
}
