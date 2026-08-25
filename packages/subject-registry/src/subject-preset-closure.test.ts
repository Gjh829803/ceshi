import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  builtInSubjectResourceRegistry,
  resolveSubjectPresetClosureV1,
} from "./index";

const VEHICLE_DEFINITION_REF =
  "worldkit://subject-definition/vehicle.four-wheel.arcade@1";
const G_BOT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.g-bot@2";

describe("subject preset resource closure", () => {
  it("returns the complete sorted exact dependency closure", () => {
    const closure = resolveSubjectPresetClosureV1(
      builtInSubjectResourceRegistry,
      VEHICLE_DEFINITION_REF,
    );

    const resourceRefs = closure.entries.map((entry) => entry.resourceRef);
    expect(resourceRefs).toEqual([...resourceRefs].sort());
    expect(new Set(resourceRefs).size).toBe(resourceRefs.length);
    expect(closure).toMatchObject({
      subjectDefinitionId: "vehicle.four-wheel.arcade",
      subjectDefinitionRef: VEHICLE_DEFINITION_REF,
      subjectDefinitionContentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(closure.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceRef: VEHICLE_DEFINITION_REF,
        resourceKind: "subject-definition",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
        resourceKind: "motion-profile",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
        resourceKind: "control-feel-profile",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://motion-kernel/free-ground@1",
        resourceKind: "motion-kernel",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://camera-context/capability-driven.default@1",
        resourceKind: "camera-context-profile",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://camera-profile/flight.glide@1",
        resourceKind: "camera-rig-profile",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://camera-rig/flight-horizon@1",
        resourceKind: "camera-rig-algorithm",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://camera-modifier/water-stability@1",
        resourceKind: "camera-modifier-profile",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://medium-profile/ground-air.standard@1",
        resourceKind: "medium-profile",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://pose-set/static.whitebox@1",
        resourceKind: "pose-set-profile",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://collider-derivation-profile/vertical-capability-capsule@1",
        resourceKind: "collider-derivation-profile",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://capability/locomotion.wheeled@1",
        resourceKind: "capability",
        version: 1,
      }),
      expect.objectContaining({
        resourceRef: "worldkit://relationship-profile/seat.driver@1",
        resourceKind: "relationship-profile",
        version: 1,
      }),
    ]));
    expect(closure.contentHash).toBe(sha256CanonicalJson(closure.entries));
  });

  it("locks rigged visual, animation, rig and collider dependencies", () => {
    const closure = resolveSubjectPresetClosureV1(
      builtInSubjectResourceRegistry,
      G_BOT_DEFINITION_REF,
    );

    expect(closure.entries.map((entry) => entry.resourceRef)).toEqual(
      expect.arrayContaining([
        "worldkit://subject-asset/actor.humanoid.g-bot@2",
        "worldkit://rig-profile/biped.mixamo-g-bot@2",
        "worldkit://animation-set/humanoid.ground.g-bot@2",
        "worldkit://collider-profile/humanoid.g-bot-capsule@1",
      ]),
    );
    expect(Object.isFrozen(closure)).toBe(true);
    expect(Object.isFrozen(closure.entries)).toBe(true);
    expect(closure.entries.every(Object.isFrozen)).toBe(true);
  });

  it("rejects missing reachable resources with a stable diagnostic", () => {
    const registry = {
      ...builtInSubjectResourceRegistry,
      resolveMediumProfile(resourceRef: string) {
        if (resourceRef === "worldkit://medium-profile/ground-air.standard@1") {
          return undefined;
        }
        return builtInSubjectResourceRegistry.resolveMediumProfile(resourceRef);
      },
    };

    expect(() => resolveSubjectPresetClosureV1(registry, VEHICLE_DEFINITION_REF))
      .toThrow("SUBJECT_PRESET_CLOSURE_MISSING_RESOURCE");
  });

  it("rejects a resource whose locked version disagrees with its exact ref", () => {
    const registry = {
      ...builtInSubjectResourceRegistry,
      resolveMotionProfile(resourceRef: string) {
        const resolved = builtInSubjectResourceRegistry.resolveMotionProfile(resourceRef);
        return resolved === undefined ? undefined : { ...resolved, version: 99 };
      },
    };

    expect(() => resolveSubjectPresetClosureV1(registry, VEHICLE_DEFINITION_REF))
      .toThrow("SUBJECT_PRESET_CLOSURE_VERSION_MISMATCH");
  });

  it("rejects a resource whose canonical content hash is forged", () => {
    const registry = {
      ...builtInSubjectResourceRegistry,
      resolveMotionProfile(resourceRef: string) {
        const resolved = builtInSubjectResourceRegistry.resolveMotionProfile(resourceRef);
        return resolved === undefined
          ? undefined
          : { ...resolved, contentHash: `sha256:${"0".repeat(64)}` };
      },
    };

    expect(() => resolveSubjectPresetClosureV1(registry, VEHICLE_DEFINITION_REF))
      .toThrow("SUBJECT_PRESET_CLOSURE_CONTENT_HASH_MISMATCH");
  });

  it("rejects a cycle in reachable resource dependencies", () => {
    const capabilityRef = "worldkit://capability/locomotion.wheeled@1";
    const source = builtInSubjectResourceRegistry.resolveCapability(capabilityRef);
    if (source === undefined) throw new Error("Fixture capability is missing.");
    const hashInput = {
      ...source,
      requiredCapabilityRefs: [capabilityRef],
    };
    const { contentHash: _oldContentHash, ...resourceWithoutHash } = hashInput;
    const cyclicCapability = {
      ...resourceWithoutHash,
      contentHash: sha256CanonicalJson(resourceWithoutHash),
    };
    const registry = {
      ...builtInSubjectResourceRegistry,
      resolveCapability(resourceRef: string) {
        if (resourceRef === capabilityRef) return cyclicCapability;
        return builtInSubjectResourceRegistry.resolveCapability(resourceRef);
      },
    };

    expect(() => resolveSubjectPresetClosureV1(registry, VEHICLE_DEFINITION_REF))
      .toThrow("SUBJECT_PRESET_CLOSURE_CYCLE");
  });
});
