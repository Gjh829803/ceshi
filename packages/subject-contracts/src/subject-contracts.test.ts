import { describe, expect, it } from "vitest";

import {
  BIPED_BONE_IDS_V1,
  GROUND_HUMANOID_ACTION_IDS_V1,
  SUBJECT_BODY_TOPOLOGIES_V2,
  SUBJECT_RESOURCE_KINDS_V1,
  isBipedBoneIdV1,
  isGroundHumanoidActionIdV1,
  isSubjectBodyTopologyV2,
  isSubjectResourceKindV1,
} from "./index";

const EXPECTED_SUBJECT_RESOURCE_KINDS = [
  "subject-definition",
  "subject-asset",
  "rig-profile",
  "animation-set",
  "collider-profile",
  "capability",
  "physics-body-profile",
  "locomotion-profile",
  "control-feel-profile",
  "collider-derivation-profile",
  "motion-kernel",
  "motion-profile",
  "control-profile",
  "camera-rig-algorithm",
  "camera-rig-profile",
  "camera-modifier-profile",
  "camera-context-profile",
  "medium-profile",
  "relationship-profile",
  "harness-profile",
  "pose-set-profile",
  "render-binding-profile",
] as const;

const EXPECTED_GROUND_HUMANOID_ACTION_IDS = [
  "idle",
  "idle.gaming",
  "walk",
  "walk.step",
  "run",
  "jump",
  "fall",
  "land.hard",
  "land.hard.alt",
  "fly",
  "float",
  "swim.surface",
  "swim.tread",
  "swim.exit",
  "sit",
  "sit.idle",
  "sit.ground.idle",
  "sit.toStand",
  "stand",
  "lay.idle",
  "roll.toRun",
  "fight.enter",
  "emote.salute",
  "emote.angry",
  "dance.rumba",
] as const;

const EXPECTED_BIPED_BONE_IDS = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "upper-arm.left",
  "lower-arm.left",
  "hand.left",
  "upper-arm.right",
  "lower-arm.right",
  "hand.right",
  "upper-leg.left",
  "lower-leg.left",
  "foot.left",
  "upper-leg.right",
  "lower-leg.right",
  "foot.right",
] as const;

const EXPECTED_SUBJECT_BODY_TOPOLOGIES = [
  "biped",
  "quadruped",
  "four-wheel",
  "surface-craft",
  "watercraft",
  "glider",
  "composite",
  "custom",
] as const;

function expectFrozenUniqueExact(
  actual: readonly string[],
  expected: readonly string[],
): void {
  expect(Object.isFrozen(actual)).toBe(true);
  expect(new Set(actual).size).toBe(actual.length);
  expect(actual).toEqual(expected);
}

describe("canonical Subject serialized vocabularies", () => {
  it("publishes frozen, unique, exact constants", () => {
    expectFrozenUniqueExact(
      SUBJECT_RESOURCE_KINDS_V1,
      EXPECTED_SUBJECT_RESOURCE_KINDS,
    );
    expectFrozenUniqueExact(
      GROUND_HUMANOID_ACTION_IDS_V1,
      EXPECTED_GROUND_HUMANOID_ACTION_IDS,
    );
    expectFrozenUniqueExact(BIPED_BONE_IDS_V1, EXPECTED_BIPED_BONE_IDS);
    expectFrozenUniqueExact(
      SUBJECT_BODY_TOPOLOGIES_V2,
      EXPECTED_SUBJECT_BODY_TOPOLOGIES,
    );
  });

  it("guards every admitted value and rejects unknown serialized terms", () => {
    for (const value of EXPECTED_SUBJECT_RESOURCE_KINDS) {
      expect(isSubjectResourceKindV1(value)).toBe(true);
    }
    for (const value of EXPECTED_GROUND_HUMANOID_ACTION_IDS) {
      expect(isGroundHumanoidActionIdV1(value)).toBe(true);
    }
    for (const value of EXPECTED_BIPED_BONE_IDS) {
      expect(isBipedBoneIdV1(value)).toBe(true);
    }
    for (const value of EXPECTED_SUBJECT_BODY_TOPOLOGIES) {
      expect(isSubjectBodyTopologyV2(value)).toBe(true);
    }

    expect(isSubjectResourceKindV1("provider-handle")).toBe(false);
    expect(isGroundHumanoidActionIdV1("teleport")).toBe(false);
    expect(isBipedBoneIdV1("root")).toBe(false);
    expect(isSubjectBodyTopologyV2("hoverboard")).toBe(false);
    expect(isSubjectResourceKindV1(1)).toBe(false);
  });
});
