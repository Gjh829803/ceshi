import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  resolveTraversalDriverProfileV1,
  resolveTraversalGraphBuilderProfileV1,
  validateTraversalDriverProfileV1,
  validateTraversalGraphBuilderProfileV1,
} from "./index.js";
import type {
  ResolvedTraversalLockReceiptV1,
  ResolvedTraversalLockV1,
  TraversalDriverProfileV1,
  TraversalGraphBuilderProfileV1,
  TraversalSurfaceIdentityV1,
} from "./index.js";

const CLOSED_DRIVER_PROFILE: TraversalDriverProfileV1 = {
  kind: "traversal-driver-profile",
  schemaVersion: 1,
  pathLookaheadMeters: 2.4,
  cornerSelectionMode: "next-visible-segment",
  intentDirectionQuantizationRatio: 0.001,
  locomotionIntentMode: "walk",
};

const CLOSED_GRAPH_BUILDER_PROFILE: TraversalGraphBuilderProfileV1 = {
  kind: "traversal-graph-builder-profile",
  schemaVersion: 1,
  clearanceMarginMeters: 0.05,
  positionQuantizationMeters: 0.001,
  slopeCostWeight: 1,
  stepCostWeight: 1,
  maximumNodes: 100000,
  maximumEdges: 200000,
  maximumTiles: 1024,
  maximumSearchSteps: 100000,
};

const FORBIDDEN_DRIVER_FIELDS: Readonly<Record<string, unknown>> = {
  walkSpeedMetersPerSecond: 3,
  runSpeedMetersPerSecond: 5,
  accelerationMetersPerSecondSquared: 10,
  decelerationMetersPerSecondSquared: 12,
  turnRateRadiansPerSecond: 1.5,
  jumpHeightMeters: 1,
  maxSlopeDegrees: 42,
  maxStepHeightMeters: 0.3,
  gravityMetersPerSecondSquared: 9.81,
  capsuleRadiusMeters: 0.35,
  capsuleHeightMeters: 1.8,
  supportedMediums: ["ground"],
  mediumProfileRef: "worldkit://medium-profile/ground@1",
  gravityScale: 1,
  destinationToleranceMeters: 0.5,
  maximumRouteDeviationMeters: 1,
  stalledWindowTicks: 30,
  maximumProbeTicks: 600,
};

describe("traversal driver profile registry", () => {
  it("resolves the versioned walk-hard-ribbon driver with a canonical content hash", () => {
    expect(resolveTraversalDriverProfileV1(
      "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1",
    )).toMatchObject({
      resolvedVersion: "1",
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      profile: {
        kind: "traversal-driver-profile",
        schemaVersion: 1,
        pathLookaheadMeters: expect.any(Number),
        cornerSelectionMode: "next-visible-segment",
        intentDirectionQuantizationRatio: expect.any(Number),
        locomotionIntentMode: "walk",
      },
    });

    const resolved = resolveTraversalDriverProfileV1(BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF);

    expect(BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF).toBe(
      "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@1",
    );
    expect(resolved).toEqual({
      resourceRef: BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
      resolvedVersion: "1",
      contentHash: sha256CanonicalJson(resolved.profile),
      profile: CLOSED_DRIVER_PROFILE,
    });
  });

  it("rejects unregistered and floating driver profile refs with a stable code", () => {
    for (const resourceRef of [
      "worldkit://traversal-driver-profile/walk-hard-ribbon.r1@latest",
      "worldkit://traversal-driver-profile/unknown@1",
    ]) {
      expect(() => resolveTraversalDriverProfileV1(resourceRef)).toThrow(
        "TRAVERSAL_DRIVER_PROFILE_NOT_FOUND",
      );
    }
  });

  it("returns a fresh deeply frozen driver projection on every resolve", () => {
    const first = resolveTraversalDriverProfileV1(BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF);
    const second = resolveTraversalDriverProfileV1(BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF);

    expect(first).not.toBe(second);
    expect(first.profile).not.toBe(second.profile);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.profile)).toBe(true);
    expect(() => {
      (first.profile as { pathLookaheadMeters: number }).pathLookaheadMeters = 1;
    }).toThrow(TypeError);
    expect(second.profile.pathLookaheadMeters).toBe(2.4);
  });

  it("rejects unknown driver fields including movement, physics, and medium authorities", () => {
    expect(() => validateTraversalDriverProfileV1({
      kind: "traversal-driver-profile",
      schemaVersion: 1,
      walkSpeedMetersPerSecond: 3,
    })).toThrow("TRAVERSAL_DRIVER_FIELD_FORBIDDEN");

    for (const [key, value] of Object.entries(FORBIDDEN_DRIVER_FIELDS)) {
      expect(() =>
        validateTraversalDriverProfileV1({
          ...CLOSED_DRIVER_PROFILE,
          [key]: value,
        }),
      ).toThrow("TRAVERSAL_DRIVER_FIELD_FORBIDDEN");
    }

    expect(() => validateTraversalDriverProfileV1(CLOSED_DRIVER_PROFILE)).not.toThrow();
  });

  it("rejects empty objects, wrong discriminators, missing fields, and invalid numbers", () => {
    expect(() => validateTraversalDriverProfileV1({})).toThrow(
      "TRAVERSAL_DRIVER_FIELD_MISSING",
    );
    expect(() => validateTraversalDriverProfileV1([])).toThrow(
      "TRAVERSAL_DRIVER_PROFILE_NOT_PLAIN",
    );
    expect(() => validateTraversalDriverProfileV1(Object.create(null))).toThrow(
      "TRAVERSAL_DRIVER_PROFILE_NOT_PLAIN",
    );
    expect(() => validateTraversalDriverProfileV1({
      ...CLOSED_DRIVER_PROFILE,
      kind: "locomotion-profile",
    })).toThrow("TRAVERSAL_DRIVER_KIND_MISMATCH");
    expect(() => validateTraversalDriverProfileV1({
      ...CLOSED_DRIVER_PROFILE,
      schemaVersion: 2,
    })).toThrow("TRAVERSAL_DRIVER_SCHEMA_VERSION_MISMATCH");
    expect(() => validateTraversalDriverProfileV1({
      ...CLOSED_DRIVER_PROFILE,
      pathLookaheadMeters: -1,
    })).toThrow("TRAVERSAL_DRIVER_NUMBER_INVALID");
    expect(() => validateTraversalDriverProfileV1({
      ...CLOSED_DRIVER_PROFILE,
      pathLookaheadMeters: Number.NaN,
    })).toThrow("TRAVERSAL_DRIVER_NUMBER_INVALID");
    expect(() => validateTraversalDriverProfileV1({
      ...CLOSED_DRIVER_PROFILE,
      cornerSelectionMode: "shortest-path",
    })).toThrow("TRAVERSAL_DRIVER_ENUM_INVALID");
    expect(() => validateTraversalDriverProfileV1({
      kind: "traversal-driver-profile",
      schemaVersion: 1,
      pathLookaheadMeters: 2.4,
    })).toThrow("TRAVERSAL_DRIVER_FIELD_MISSING");
  });
});

describe("traversal graph builder profile registry", () => {
  it("resolves the versioned outdoor-humanoid builder with a canonical content hash", () => {
    const resolved = resolveTraversalGraphBuilderProfileV1(
      BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );

    expect(BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF).toBe(
      "worldkit://traversal-graph-builder-profile/outdoor-humanoid.r1@1",
    );
    expect(resolved).toEqual({
      resourceRef: BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
      resolvedVersion: "1",
      contentHash: sha256CanonicalJson(resolved.profile),
      profile: CLOSED_GRAPH_BUILDER_PROFILE,
    });
  });

  it("rejects unregistered and floating graph builder profile refs with a stable code", () => {
    for (const resourceRef of [
      "worldkit://traversal-graph-builder-profile/outdoor-humanoid.r1@latest",
      "worldkit://traversal-graph-builder-profile/unknown@1",
    ]) {
      expect(() => resolveTraversalGraphBuilderProfileV1(resourceRef)).toThrow(
        "TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_FOUND",
      );
    }
  });

  it("returns a fresh deeply frozen graph builder projection on every resolve", () => {
    const first = resolveTraversalGraphBuilderProfileV1(
      BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
    const second = resolveTraversalGraphBuilderProfileV1(
      BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );

    expect(first).not.toBe(second);
    expect(first.profile).not.toBe(second.profile);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.profile)).toBe(true);
    expect(() => {
      (first.profile as { maximumNodes: number }).maximumNodes = 1;
    }).toThrow(TypeError);
    expect(second.profile.maximumNodes).toBe(100000);
  });

  it("rejects empty objects, wrong discriminators, missing fields, and invalid numbers", () => {
    expect(() => validateTraversalGraphBuilderProfileV1({})).toThrow(
      "TRAVERSAL_GRAPH_BUILDER_FIELD_MISSING",
    );
    expect(() => validateTraversalGraphBuilderProfileV1([])).toThrow(
      "TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_PLAIN",
    );
    expect(() => validateTraversalGraphBuilderProfileV1(Object.create(null))).toThrow(
      "TRAVERSAL_GRAPH_BUILDER_PROFILE_NOT_PLAIN",
    );
    expect(() => validateTraversalGraphBuilderProfileV1({
      ...CLOSED_GRAPH_BUILDER_PROFILE,
      kind: "traversal-driver-profile",
    })).toThrow("TRAVERSAL_GRAPH_BUILDER_KIND_MISMATCH");
    expect(() => validateTraversalGraphBuilderProfileV1({
      ...CLOSED_GRAPH_BUILDER_PROFILE,
      schemaVersion: 2,
    })).toThrow("TRAVERSAL_GRAPH_BUILDER_SCHEMA_VERSION_MISMATCH");
    expect(() => validateTraversalGraphBuilderProfileV1({
      ...CLOSED_GRAPH_BUILDER_PROFILE,
      clearanceMarginMeters: -0.1,
    })).toThrow("TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID");
    expect(() => validateTraversalGraphBuilderProfileV1({
      ...CLOSED_GRAPH_BUILDER_PROFILE,
      maximumNodes: 1.5,
    })).toThrow("TRAVERSAL_GRAPH_BUILDER_NUMBER_INVALID");
    expect(() => validateTraversalGraphBuilderProfileV1({
      ...CLOSED_GRAPH_BUILDER_PROFILE,
      walkSpeedMetersPerSecond: 3,
    })).toThrow("TRAVERSAL_GRAPH_BUILDER_FIELD_FORBIDDEN");
    expect(() => validateTraversalGraphBuilderProfileV1(CLOSED_GRAPH_BUILDER_PROFILE))
      .not.toThrow();
  });
});

describe("traversal contract type exports", () => {
  it("keeps surface identity and lock receipt fields distinct", () => {
    const identity: TraversalSurfaceIdentityV1 = {
      traversalSurfaceId: "spawn-apron-surface",
      surfaceEntityId: "spawn-apron",
      colliderSubshapeId: "spawn-apron-top",
      resourceRef: "worldkit://traversal-surface/spawn-apron@1",
      resolvedVersion: "1",
      resourceHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const lock: ResolvedTraversalLockV1 = {
      kind: "resolved-traversal-lock",
      schemaVersion: 1,
      subjectEntityId: "player",
      subjectDefinitionRef: "worldkit://subject-definition/player@1",
      subjectDefinitionHash: identity.resourceHash,
      colliderProfileRef: "worldkit://collider-profile/humanoid@1",
      colliderProfileHash: identity.resourceHash,
      physicsBodyProfileRef: "worldkit://physics-body-profile/humanoid@1",
      physicsBodyProfileHash: identity.resourceHash,
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      locomotionProfileHash: identity.resourceHash,
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
      locomotionCapabilityHash: identity.resourceHash,
      controlFeelProfileRef: "worldkit://control-feel-profile/ground@1",
      controlFeelProfileHash: identity.resourceHash,
      controlProfileRef: "worldkit://control-profile/ground@1",
      controlProfileHash: identity.resourceHash,
      motionProfileRef: "worldkit://motion-profile/ground@1",
      motionProfileHash: identity.resourceHash,
      motionKernelRef: "worldkit://motion-kernel/ground@1",
      motionKernelHash: identity.resourceHash,
      mediumProfileRef: "worldkit://medium-profile/ground@1",
      mediumProfileHash: identity.resourceHash,
      runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
      runtimeBackendResolvedVersion: "1",
      runtimeBackendHash: identity.resourceHash,
      runtimeAdapterRef: "worldkit://runtime-adapter/babylon-world-runtime@1",
      runtimeAdapterResolvedVersion: "1",
      runtimeAdapterHash: identity.resourceHash,
      capsuleRadiusMeters: 0.35,
      capsuleHeightMeters: 1.8,
      colliderCenterOffsetMetersXYZ: [0, 0.9, 0],
      maxSlopeDegrees: 42,
      maxStepHeightMeters: 0.3,
    };
    const receipt: ResolvedTraversalLockReceiptV1 = {
      lock,
      resolvedTraversalLockHash: identity.resourceHash,
    };

    expect(identity.traversalSurfaceId).not.toBe(identity.surfaceEntityId);
    expect(identity.surfaceEntityId).not.toBe(identity.colliderSubshapeId);
    expect(receipt.lock.kind).toBe("resolved-traversal-lock");
    expect(receipt.lock.schemaVersion).toBe(1);
    expect(receipt.lock.locomotionCapabilityRef).toBe(
      "worldkit://capability/locomotion.ground@1",
    );
    expect(receipt.lock.runtimeAdapterRef).toBe(
      "worldkit://runtime-adapter/babylon-world-runtime@1",
    );
    const capabilityMismatch: ResolvedTraversalLockV1 = {
      ...lock,
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@2",
    };
    const adapterMismatch: ResolvedTraversalLockV1 = {
      ...lock,
      runtimeAdapterHash:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    expect(sha256CanonicalJson(capabilityMismatch)).not.toBe(sha256CanonicalJson(lock));
    expect(sha256CanonicalJson(adapterMismatch)).not.toBe(sha256CanonicalJson(lock));
  });
});
