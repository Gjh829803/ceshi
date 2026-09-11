import { describe, expect, it } from 'vitest';
import { assertPreSeedanceProfile, canonicalHash, PRE_SEEDANCE_PROFILE, segmentRecipeHash, validateEpisodePlan, type EpisodePlan } from '../../src/contracts.js';

const hash = 'a'.repeat(64);
const plan = (): EpisodePlan => ({ kind: 'worldkit-three-episode-plan', schemaVersion: 2, worldBuildHash: hash,
  segments: Array.from({ length: 6 }, (_, i) => ({ id: `segment-0${i}`, start: { positionWorldMetersXYZ: [i, i % 2, 0], facingYawRadians: .37 },
    waypoints: [{ positionWorldMetersXYZ: [i + .13, i % 2, -20.57], gait: 'walk' }], endBehavior: 'stop', purpose: 'Observe the world' })) });
describe('Three Episode agent plan and production boundary', () => {
  it('rejects removed coverage annotations instead of accepting an unused contract',()=>{
    const value=plan();Object.assign(value.segments[0]!,{coverageTargetIds:['unused-label']});
    expect(()=>validateEpisodePlan(value,{worldBuildHash:hash})).toThrow('PLAN_INVALID');
  });
  it('accepts free metric coordinates without a navigation catalog or region extraction', () => {
    expect(validateEpisodePlan(plan(), { worldBuildHash: hash }).segments).toHaveLength(6);
  });
  it('rejects stale world identity, duplicate starts, raw key instructions and incomplete production plans', () => {
    expect(() => validateEpisodePlan(plan(), { worldBuildHash: 'b'.repeat(64) })).toThrow('STALE_WORLD');
    const duplicate = plan(); duplicate.segments[1]!.start = duplicate.segments[0]!.start;
    expect(() => validateEpisodePlan(duplicate, { worldBuildHash: hash })).toThrow('DISTINCT_STARTS');
    expect(() => validateEpisodePlan({ ...plan(), rawKeys: ['w'] }, { worldBuildHash: hash })).toThrow('PLAN_INVALID');
    expect(() => validateEpisodePlan({ ...plan(), segments: plan().segments.slice(0, 5) }, { worldBuildHash: hash })).toThrow('SIX_ORDERED');
    const invalid = plan(); invalid.segments[0]!.start = {...invalid.segments[0]!.start,facingYawRadians:Infinity};
    expect(() => validateEpisodePlan(invalid, { worldBuildHash: hash })).toThrow('PLAN_INVALID');
  });
  it('does not invalidate passing segment recipes when a sibling changes', () => {
    const input = plan(), source = { worldBuildHash: hash, runtimeHash: hash };
    const first = segmentRecipeHash(source, input.segments[0]!); const aggregate = canonicalHash(input);
    input.segments[3]!.waypoints[0]!.positionWorldMetersXYZ = [50, 1, 25];
    expect(segmentRecipeHash(source, input.segments[0]!)).toBe(first);
    expect(canonicalHash(input)).not.toBe(aggregate);
  });
  it('enforces the user stop even if a caller changes the stage/profile', () => {
    assertPreSeedanceProfile(structuredClone(PRE_SEEDANCE_PROFILE));
    expect(() => assertPreSeedanceProfile({ ...PRE_SEEDANCE_PROFILE, stopBeforeSeedance: false })).toThrow('VIDEO_NOT_AUTHORIZED');
    expect(() => assertPreSeedanceProfile({ ...PRE_SEEDANCE_PROFILE, model: 'gpt-5.6-sol' })).toThrow('PROFILE_CHANGED');
  });
  it('validates ordered bounded action goals and hashes their actual completion contract', () => {
    const input = plan(), segment = input.segments[0]!;
    const before = segmentRecipeHash({ worldBuildHash: hash, runtimeHash: hash }, segment);
    segment.actionGoals = [{ id: 'sit', trigger: { waypointIndex: 0, radiusMeters: .6 }, targetId: 'seat', intent: { kind: 'skill', action: 'sit' }, completion: { kind: 'settled', holdSeconds: 2 }, timeoutSeconds: 5 }];
    expect(validateEpisodePlan(input, { worldBuildHash: hash }).segments[0]!.actionGoals).toHaveLength(1);
    expect(segmentRecipeHash({ worldBuildHash: hash, runtimeHash: hash }, segment)).not.toBe(before);
    segment.actionGoals[0]!.trigger.waypointIndex = 1;
    expect(() => validateEpisodePlan(input, { worldBuildHash: hash })).toThrow('ORDER_INVALID');
    segment.actionGoals[0]!.trigger.waypointIndex = 0;
    delete segment.actionGoals[0]!.targetId;
    expect(() => validateEpisodePlan(input, { worldBuildHash: hash })).toThrow('TARGET_REQUIRED');
    segment.actionGoals[0]!.intent = { kind: 'climb', direction: 'up' };
    expect(() => validateEpisodePlan(input, { worldBuildHash: hash })).toThrow('DISPLACEMENT_REQUIRED');
  });
});

it('accepts mount and view settled goals and requires a boarding instance target', () => {
  const input = plan(), segment = input.segments[0]!;
  segment.actionGoals = [
    { id: 'board', trigger: { waypointIndex: 0, radiusMeters: .6 }, targetId: 'car', intent: { kind: 'mount', action: 'enter' }, completion: { kind: 'settled', holdSeconds: .2 }, timeoutSeconds: 4 },
    { id: 'view', trigger: { waypointIndex: 0, radiusMeters: .6 }, intent: { kind: 'view', perspective: 'first-person' }, completion: { kind: 'settled', holdSeconds: .2 }, timeoutSeconds: 4 },
    { id: 'exit', trigger: { waypointIndex: 0, radiusMeters: .6 }, intent: { kind: 'mount', action: 'exit' }, completion: { kind: 'settled', holdSeconds: .2 }, timeoutSeconds: 4 },
  ];
  expect(validateEpisodePlan(input, { worldBuildHash: hash }).segments[0]!.actionGoals).toEqual(segment.actionGoals);
  delete segment.actionGoals[0]!.targetId;
  expect(() => validateEpisodePlan(input, { worldBuildHash: hash })).toThrow('TARGET_REQUIRED');
  segment.actionGoals.shift();
  segment.actionGoals[0]!.completion = { kind: 'displacement', minimumMeters: 1 };
  expect(() => validateEpisodePlan(input, { worldBuildHash: hash })).toThrow('DISPLACEMENT_UNSUPPORTED');
});

it('accepts explicit interaction slots and rejects slots unrelated to an interaction entity', () => {
  const input = plan(), segment = input.segments[0]!;
  const goal = { id: 'sit-right', trigger: { waypointIndex: 0, radiusMeters: .6 }, targetId: 'bench', slotId: 'right', intent: { kind: 'skill', action: 'sit' }, completion: { kind: 'settled', holdSeconds: 1 }, timeoutSeconds: 5 } as const;
  segment.actionGoals = [goal];
  expect(validateEpisodePlan(input, { worldBuildHash: hash }).segments[0]!.actionGoals![0]!.slotId).toBe('right');
  const recipe = segmentRecipeHash({ worldBuildHash: hash, runtimeHash: hash }, segment);
  segment.actionGoals = [{ ...goal, slotId: 'left' }];
  expect(segmentRecipeHash({ worldBuildHash: hash, runtimeHash: hash }, segment)).not.toBe(recipe);
  segment.actionGoals = [{ ...goal, intent: { kind: 'mount', action: 'enter' } }];
  expect(() => validateEpisodePlan(input, { worldBuildHash: hash })).toThrow('SLOT_INVALID');
});
