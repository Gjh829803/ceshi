import { describe, expect, it } from "vitest";

import {
  assertTraversalRuntimeWorldIdentityMatchesGraphV1,
  canonicalCharacterSupportEvidenceV1,
  canonicalTraversalRuntimeTickEvidenceV1,
  TraversalRuntimeErrorV1,
  type CharacterSupportEvidenceV1,
  type TraversalRuntimeImplementationIdentityV1,
  type TraversalRuntimeTickEvidenceV1,
} from "./runtime-evidence.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;

const RUNTIME_IDENTITY: TraversalRuntimeImplementationIdentityV1 = {
  runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
  runtimeBackendResolvedVersion: "9.21.2+1.3.14",
  runtimeBackendHash: HASH_A,
  runtimeAdapterRef: "worldkit://runtime-adapter/babylon.character-controller@1",
  runtimeAdapterResolvedVersion: "1",
  runtimeAdapterHash: HASH_B,
};

function resolvedSupport(
  overrides: Partial<CharacterSupportEvidenceV1> = {},
): CharacterSupportEvidenceV1 {
  return {
    kind: "character-support-evidence",
    schemaVersion: 1,
    supportState: "supported",
    supportNormalWorldXYZ: [0, 1, 0],
    sampledFootPositionMetersXYZ: [2, 0, -3],
    isSupportSurfaceDynamic: false,
    surfaceResolution: {
      mode: "resolved",
      traversalSurfaceId: "surface:terrain-main",
      surfaceEntityId: "terrain-main",
      colliderSubshapeId: "terrain-main:heightfield",
      resourceRef: "worldkit://terrain-surface/terrain-main@1",
      resolvedVersion: "1",
      resourceHash: HASH_C,
    },
    ...overrides,
  };
}

function validTick(
  overrides: Partial<TraversalRuntimeTickEvidenceV1> = {},
): TraversalRuntimeTickEvidenceV1 {
  return {
    kind: "traversal-runtime-tick-evidence",
    schemaVersion: 1,
    tick: 7,
    traversingEntityId: "player",
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_B,
    resourceLockHash: HASH_C,
    executionPlanHash: HASH_B,
    resolvedTraversalLockHash: HASH_A,
    runtimeImplementationIdentity: RUNTIME_IDENTITY,
    fixedTimeStepSeconds: 1 / 60,
    subjectPositionMetersXYZ: [2, 1, -3],
    velocityMetersPerSecondXYZ: [0, 0, -2],
    movementMedium: "ground",
    locomotionMode: "walk",
    characterSupport: resolvedSupport(),
    ...overrides,
  };
}

describe("CharacterSupportEvidenceV1", () => {
  it("canonicalizes a complete resolved identity and deeply freezes a defensive copy", () => {
    const source = resolvedSupport();
    const canonical = canonicalCharacterSupportEvidenceV1(source);

    expect(canonical).toEqual(source);
    expect(canonical).not.toBe(source);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.supportNormalWorldXYZ)).toBe(true);
    expect(Object.isFrozen(canonical.sampledFootPositionMetersXYZ)).toBe(true);
    expect(Object.isFrozen(canonical.surfaceResolution)).toBe(true);
  });

  it("keeps sliding distinct and permits only unresolved static-surface modes", () => {
    expect(canonicalCharacterSupportEvidenceV1(resolvedSupport({
      supportState: "sliding",
      surfaceResolution: { mode: "unmatched" },
    }))).toMatchObject({
      supportState: "sliding",
      surfaceResolution: { mode: "unmatched" },
    });

    expect(() => canonicalCharacterSupportEvidenceV1(resolvedSupport({
      supportState: "unsupported",
      surfaceResolution: { mode: "unmatched" },
    }))).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
    expect(() => canonicalCharacterSupportEvidenceV1(resolvedSupport({
      isSupportSurfaceDynamic: true,
    }))).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
  });

  it("rejects partial identities, provider fields, invalid tuples, and non-lowercase hashes", () => {
    expect(() => canonicalCharacterSupportEvidenceV1({
      ...resolvedSupport(),
      havokBodyHandle: 17,
    })).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
    expect(() => canonicalCharacterSupportEvidenceV1({
      ...resolvedSupport(),
      supportNormalWorldXYZ: [0, Number.NaN, 0],
    })).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
    expect(() => canonicalCharacterSupportEvidenceV1({
      ...resolvedSupport(),
      surfaceResolution: {
        mode: "resolved",
        traversalSurfaceId: "surface:terrain-main",
      },
    })).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
    expect(() => canonicalCharacterSupportEvidenceV1({
      ...resolvedSupport(),
      surfaceResolution: {
        ...resolvedSupport().surfaceResolution,
        resourceHash: `sha256:${"A".repeat(64)}`,
      },
    })).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
  });
});

describe("TraversalRuntimeTickEvidenceV1", () => {
  it("canonicalizes immutable provider-neutral tick evidence", () => {
    const canonical = canonicalTraversalRuntimeTickEvidenceV1(validTick());

    expect(canonical.tick).toBe(7);
    expect(canonical).toMatchObject({
      authoringSpecHash: HASH_A,
      layoutSolveReportHash: HASH_B,
      resourceLockHash: HASH_C,
      executionPlanHash: HASH_B,
    });
    expect(canonical.characterSupport.surfaceResolution.mode).toBe("resolved");
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.runtimeImplementationIdentity)).toBe(true);
    expect(Object.isFrozen(canonical.characterSupport)).toBe(true);
  });

  it("rejects Graph and Runtime evidence from different canonical worlds", () => {
    const runtimeEvidence = validTick();
    expect(() => assertTraversalRuntimeWorldIdentityMatchesGraphV1({
      traversalGraph: {
        authoringSpecHash: HASH_B,
        layoutSolveReportHash: runtimeEvidence.layoutSolveReportHash,
        resourceLockHash: runtimeEvidence.resourceLockHash,
      },
      runtimeWorldIdentity: runtimeEvidence,
    })).toThrow("TRAVERSAL_RUNTIME_WORLD_IDENTITY_MISMATCH");
  });

  it("closes support, medium, and locomotion cross-field invariants", () => {
    const unsupported = resolvedSupport({
      supportState: "unsupported",
      supportNormalWorldXYZ: [0, 0, 0],
      surfaceResolution: { mode: "unsupported" },
    });

    expect(canonicalTraversalRuntimeTickEvidenceV1(validTick({
      movementMedium: "air",
      locomotionMode: "airborne",
      characterSupport: unsupported,
    }))).toMatchObject({
      movementMedium: "air",
      locomotionMode: "airborne",
      characterSupport: { supportState: "unsupported" },
    });

    expect(() => canonicalTraversalRuntimeTickEvidenceV1(validTick({
      movementMedium: "ground",
      locomotionMode: "idle",
      characterSupport: unsupported,
    }))).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
    expect(() => canonicalTraversalRuntimeTickEvidenceV1(validTick({
      movementMedium: "air",
      locomotionMode: "airborne",
    }))).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
  });

  it("rejects unknown fields, invalid ticks, time steps, and implementation identities", () => {
    expect(() => canonicalTraversalRuntimeTickEvidenceV1({
      ...validTick(),
      providerContactManifold: [],
    })).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
    expect(() => canonicalTraversalRuntimeTickEvidenceV1(validTick({ tick: -1 })))
      .toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
    expect(() => canonicalTraversalRuntimeTickEvidenceV1(validTick({
      fixedTimeStepSeconds: 0,
    }))).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
    expect(() => canonicalTraversalRuntimeTickEvidenceV1({
      ...validTick(),
      runtimeImplementationIdentity: {
        ...RUNTIME_IDENTITY,
        runtimeBackendHash: "sha256:not-a-hash",
      },
    })).toThrow("TRAVERSAL_RUNTIME_EVIDENCE_INVALID");
  });
});

describe("TraversalRuntimeErrorV1", () => {
  it("exposes only a stable provider-neutral code and message", () => {
    const error = new TraversalRuntimeErrorV1(
      "TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE",
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TraversalRuntimeErrorV1");
    expect(error.code).toBe("TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE");
    expect(error.message).toBe("TRAVERSAL_RUNTIME_EVIDENCE_UNAVAILABLE");
    expect(error).not.toHaveProperty("cause");
  });
});
