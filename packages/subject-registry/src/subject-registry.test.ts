import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
} from "./index";

describe("subject resource registry", () => {
  it("exposes canonical subject-definition resource refs", () => {
    expect(
      builtInSubjectResourceRegistry
        .listSubjectDefinitions()
        .map((definition) => definition.resourceRef),
    ).toEqual([
      "worldkit://subject-definition/humanoid.third-person@1",
      "worldkit://subject-definition/quadruped.ground-proxy@1",
    ]);
  });

  it("locks every immutable manifest with a canonical content hash", () => {
    for (const resource of builtInSubjectResourceRegistry.listResources()) {
      const { contentHash, ...hashInput } = resource;
      expect(contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(contentHash).toBe(sha256CanonicalJson(hashInput));
      expect(Object.isFrozen(resource)).toBe(true);
      expect(Object.isFrozen(resource.aiMetadata)).toBe(true);
      expect(Object.isFrozen(resource.aiMetadata.semanticTags)).toBe(true);
    }
  });

  it("lists every resource in stable resourceRef order", () => {
    const refs = builtInSubjectResourceRegistry
      .listResources()
      .map((resource) => resource.resourceRef);
    expect(refs).toEqual([...refs].sort((left, right) => left.localeCompare(right)));
  });

  it("resolves exact capability and profile manifests", () => {
    expect(
      builtInSubjectResourceRegistry.resolveCapability(
        "worldkit://capability/locomotion.ground@1",
      ),
    ).toMatchObject({
      kind: "capability",
      id: "locomotion.ground",
      providedFeatures: ["ground-locomotion"],
    });
    expect(
      builtInSubjectResourceRegistry.resolvePhysicsBodyProfile(
        "worldkit://physics-body-profile/character.medium@1",
      ),
    ).toMatchObject({
      kind: "physics-body-profile",
      physicsBody: {
        mode: "character",
        massKilograms: 75,
        maxSlopeDegrees: 42,
        maxStepHeightMeters: 0.3,
      },
    });
    expect(
      builtInSubjectResourceRegistry.resolveLocomotionProfile(
        "worldkit://locomotion-profile/ground.standard@1",
      ),
    ).toMatchObject({
      kind: "locomotion-profile",
      locomotion: {
        mode: "ground",
        groundSpeedMetersPerSecond: 4,
        waterSpeedMetersPerSecond: 2.2,
        jumpSpeedMetersPerSecond: 5.5,
      },
    });
    expect(
      builtInSubjectResourceRegistry.resolveColliderDerivationProfile(
        "worldkit://collider-derivation-profile/vertical-character-capsule@1",
      ),
    ).toMatchObject({
      kind: "collider-derivation-profile",
      colliderDerivation: {
        algorithm: "vertical-character-capsule",
        supportOriginToleranceMeters: 0.01,
      },
    });
  });

  it("does not resolve aliases, unversioned refs, or old Kit refs", () => {
    expect(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        "worldkit://subject-definition/humanoid.third-person@latest",
      ),
    ).toBeUndefined();
    expect(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        "worldkit://subject-definition/humanoid.third-person",
      ),
    ).toBeUndefined();
    expect(
      builtInSubjectResourceRegistry.resolveSubjectDefinition(
        "worldkit://kit/humanoid.third-person@1",
      ),
    ).toBeUndefined();
  });

  it("rejects a duplicate resourceRef even when resource kinds differ", () => {
    const definition = builtInSubjectResourceRegistry.listSubjectDefinitions()[0];
    const capability = builtInSubjectResourceRegistry.resolveCapability(
      "worldkit://capability/locomotion.ground@1",
    );
    expect(definition).toBeDefined();
    expect(capability).toBeDefined();

    expect(() =>
      createSubjectResourceRegistry([
        definition!,
        { ...capability!, resourceRef: definition!.resourceRef },
      ]),
    ).toThrowError(/SUBJECT_REGISTRY_DUPLICATE_REF/);
  });
});
