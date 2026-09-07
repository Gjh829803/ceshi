import Ajv from 'ajv';
import type { Vec3 } from '@worldkit/three';
import { sha256Canonical } from '../lib/canonical-json.mjs';

export const EPISODE_VERSION = 'three-episode-agent@1';
export const SEGMENT_IDS = Array.from({ length: 6 }, (_, i) => `segment-0${i}`);
export const PRE_SEEDANCE_PROFILE = Object.freeze({
  kind: 'three-episode-production-profile', schemaVersion: 1, version: EPISODE_VERSION,
  segmentCount: 6, segmentSeconds: 30, captureFps: 24, captureFrameCount: 720,
  widthPixels: 1280, heightPixels: 720, simulationTickRate: 60, styleCount: 10,
  maximumPlanRepairsPerSegment: 2, stopBeforeSeedance: true,
  model: 'gpt-6-astra', reasoningEffort: 'xhigh', navigationPolicy: 'agent-local-observation',
});

export interface EpisodeWaypoint { positionWorldMetersXYZ: Vec3; gait: 'walk' | 'run' }
export interface EpisodeSegmentPlan {
  id: string;
  start: { positionWorldMetersXYZ: Vec3; facingYawRadians: number };
  waypoints: EpisodeWaypoint[];
  endBehavior: 'stop' | 'reverse' | 'loop';
  coverageTargetIds?: string[];
  purpose: string;
}
export interface EpisodePlan {
  kind: 'worldkit-three-episode-plan'; schemaVersion: 1;
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
  sourceRoot: string; playableRoot: string; sourceFiles: Record<string, string>;
  playableFiles: Record<string, string>; opening: EpisodeFile;
  targets: EpisodeVisualTarget[]; referenceImage?: EpisodeFile; worldPlan?: EpisodeFile;
  contextPath?: string; sourceUrl?: string;
}
const vec3 = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
export const SEGMENT_SCHEMA = object({
  id: { enum: SEGMENT_IDS },
  start: object({ positionWorldMetersXYZ: vec3, facingYawRadians: { type: 'number' } }),
  waypoints: { type: 'array', minItems: 1, maxItems: 256, items: object({ positionWorldMetersXYZ: vec3, gait: { enum: ['walk', 'run'] } }) },
  endBehavior: { enum: ['stop', 'reverse', 'loop'] },
  coverageTargetIds: { type: 'array', maxItems: 128, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 256 } },
  purpose: { type: 'string', minLength: 1, maxLength: 2000 },
}, ['id', 'start', 'waypoints', 'endBehavior', 'purpose']);
export const EPISODE_PLAN_SCHEMA = object({
  kind: { const: 'worldkit-three-episode-plan' }, schemaVersion: { const: 1 },
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
  return structuredClone(plan);
}
/** This run's explicit user stop is durable; a caller cannot bypass it with a stage option. */
export function assertPreSeedanceProfile(value: unknown): asserts value is typeof PRE_SEEDANCE_PROFILE {
  if (canonicalHash(value) !== canonicalHash(PRE_SEEDANCE_PROFILE)) throw new Error('EPISODE_PROFILE_CHANGED_OR_VIDEO_NOT_AUTHORIZED');
}
export function segmentRecipeHash(source: Pick<EpisodeSourceManifest, 'worldBuildHash' | 'runtimeHash'>, segment: EpisodeSegmentPlan): string {
  return canonicalHash({ worldBuildHash: source.worldBuildHash, runtimeHash: source.runtimeHash, segment, profile: PRE_SEEDANCE_PROFILE });
}
