import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  hashWorldChangeRequestV1,
  hashWorldChangeSetV1,
  parseAiSchemaProjectionProfileV1,
  parseRuntimeStateEffectV1,
  parseWorldChangeDiagnosticV1,
  parseWorldChangeReceiptV1,
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  RUNTIME_STATE_KINDS_V1,
  type RuntimeStateEffectV1,
  type WorldChangeReceiptV1,
  type WorldChangeSetV1,
} from "./index.js";

const HASH_A = `sha256:${"1".repeat(64)}` as Sha256HashV1;
const HASH_B = `sha256:${"2".repeat(64)}` as Sha256HashV1;
const HASH_C = `sha256:${"3".repeat(64)}` as Sha256HashV1;
const HASH_D = `sha256:${"4".repeat(64)}` as Sha256HashV1;
const HASH_E = `sha256:${"5".repeat(64)}` as Sha256HashV1;
const HASH_F = `sha256:${"6".repeat(64)}` as Sha256HashV1;
const HASH_G = `sha256:${"7".repeat(64)}` as Sha256HashV1;
const HASH_H = `sha256:${"8".repeat(64)}` as Sha256HashV1;
const HASH_I = `sha256:${"9".repeat(64)}` as Sha256HashV1;
const HASH_A_HEX = `sha256:${"a".repeat(64)}` as Sha256HashV1;
const HASH_B_HEX = `sha256:${"b".repeat(64)}` as Sha256HashV1;

const addHouseChangeSet = {
  kind: "worldkit-world-change-set",
  schemaVersion: 1,
  id: "change.add-house.001",
  baseAuthoringSpecHash: HASH_A,
  preconditions: [
    {
      id: "precondition.house-prototype-absent",
      type: "target-absent",
      target: {
        kind: "resource",
        resourceKind: "prototype",
        resourceId: "house-blockout",
      },
    },
    {
      id: "precondition.house-node-absent",
      type: "target-absent",
      target: {
        kind: "node",
        nodeEntityId: "house-north",
      },
    },
  ],
  operations: [
    {
      id: "operation.add-house-prototype",
      type: "resource-upsert",
      resourceKind: "prototype",
      prototype: {
        id: "house-blockout",
        version: 1,
        kind: "primitive",
        primitive: "box",
        sizeMetersXYZ: [8, 5, 10],
        collisionEnabled: true,
        semantic: { classId: "structure.house" },
      },
    },
    {
      id: "operation.add-house-node",
      type: "node-upsert",
      node: {
        id: "house-north",
        kind: "object",
        prototypeRef: "package://prototype/house-blockout@1",
        placement: {
          kind: "fixed",
          transform: {
            positionMetersXYZ: [18, 2.5, -24],
          },
        },
      },
    },
  ],
  provenance: {
    sourceType: "user",
    sourceId: "studio-user-7",
  },
} as const satisfies WorldChangeSetV1;

const receiptBase = {
  kind: "worldkit-world-change-receipt",
  schemaVersion: 1,
  id: "receipt.dry-run.add-house.001",
  requestId: "request.dry-run.add-house.001",
  requestHash: HASH_B,
  authoringEditSessionId: "edit-session-17",
  authoringEditPolicyHash: HASH_C,
  worldId: "basic-world",
  changeSetId: "change.add-house.001",
  changeSetHash: HASH_D,
  baseAuthoringSpecHash: HASH_A,
  diagnostics: [],
} as const;

const candidateFields = {
  buildIdentity: {
    resultAuthoringSpecHash: HASH_E,
    registryLockHash: HASH_F,
    normalizedWorldIrHash: HASH_G,
    executionPlanHash: HASH_H,
    worldPackageRootHash: HASH_I,
  },
  affectedIds: {
    resourceIds: ["house-blockout"],
    nodeEntityIds: ["house-north"],
    relationshipIds: [],
    spatialFeatureIds: [],
    constraintIds: [],
    overrideIds: [],
  },
  operationResults: [
    {
      operationId: "operation.add-house-prototype",
      operationType: "resource-upsert",
      target: {
        kind: "resource",
        resourceKind: "prototype",
        resourceId: "house-blockout",
      },
      status: "applied",
      currentTargetHash: HASH_A_HEX,
    },
    {
      operationId: "operation.add-house-node",
      operationType: "node-upsert",
      target: {
        kind: "node",
        nodeEntityId: "house-north",
      },
      status: "applied",
      currentTargetHash: HASH_B_HEX,
    },
  ],
  validationReports: [
    {
      validationReportRef: "worldkit://validation-report/add-house-required-gates@1",
      validationReportHash: `sha256:${"c".repeat(64)}`,
      status: "passed",
    },
  ],
  appliedMigrations: [],
  appliedSafetyFixes: [],
} as const;

function fullReloadEffects(): RuntimeStateEffectV1[] {
  return RUNTIME_STATE_KINDS_V1.map((runtimeStateKind) => ({
    runtimeStateKind,
    defaultDisposition: "reset",
    defaultReasonCode: "runtime-state-not-transferred",
    exceptions: [],
  }));
}

function withoutKey(
  value: Readonly<Record<string, unknown>>,
  omittedKey: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omittedKey),
  );
}

describe("P16-A0 WorldChangeSet parser", () => {
  it("parses the frozen add-house ChangeSet example and hashes Canonical bytes", () => {
    const parsed = parseWorldChangeSetV1(addHouseChangeSet);
    expect(parsed.id).toBe("change.add-house.001");
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.operations[0])).toBe(true);
    expect(hashWorldChangeSetV1(addHouseChangeSet)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashWorldChangeSetV1(structuredClone(addHouseChangeSet))).toBe(
      hashWorldChangeSetV1(addHouseChangeSet),
    );
  });

  it("keeps object-key order out of the ChangeSet hash and treats array order as content", () => {
    const reorderedKeys = {
      schemaVersion: 1,
      kind: "worldkit-world-change-set",
      operations: addHouseChangeSet.operations,
      preconditions: addHouseChangeSet.preconditions,
      baseAuthoringSpecHash: HASH_A,
      id: "change.add-house.001",
      provenance: addHouseChangeSet.provenance,
    };
    const reversedOperations = {
      ...addHouseChangeSet,
      operations: [...addHouseChangeSet.operations].reverse(),
    };
    expect(hashWorldChangeSetV1(reorderedKeys)).toBe(hashWorldChangeSetV1(addHouseChangeSet));
    expect(hashWorldChangeSetV1(reversedOperations)).not.toBe(
      hashWorldChangeSetV1(addHouseChangeSet),
    );
  });

  it("rejects unknown keys, aliases, and negative zero", () => {
    expect(() => parseWorldChangeSetV1({
      ...addHouseChangeSet,
      debug: true,
    })).toThrow(/WorldChangeSetV1/);
    expect(() => parseWorldChangeSetV1({
      ...addHouseChangeSet,
      changeSetId: "change.add-house.001",
    })).toThrow(/WorldChangeSetV1/);
    expect(() => parseWorldChangeSetV1({
      ...withoutKey(addHouseChangeSet, "id"),
      changeSetId: "change.add-house.001",
    })).toThrow(/WorldChangeSetV1/);
    expect(() => parseWorldChangeSetV1({
      ...withoutKey(addHouseChangeSet, "baseAuthoringSpecHash"),
      baseHash: HASH_A,
    })).toThrow(/WorldChangeSetV1/);
    const poisoned = structuredClone(addHouseChangeSet) as unknown as {
      operations: Array<{ prototype?: { sizeMetersXYZ: number[] } }>;
    };
    const prototype = poisoned.operations[0]?.prototype;
    if (!isNil(prototype)) prototype.sizeMetersXYZ = [-0, 5, 10];
    expect(() => parseWorldChangeSetV1(poisoned)).toThrow(/WorldChangeSetV1/);
  });

  it("parses the frozen add-companion and terrain-replace examples", () => {
    const companion = {
      kind: "worldkit-world-change-set",
      schemaVersion: 1,
      id: "change.add-companion.001",
      baseAuthoringSpecHash: HASH_A,
      preconditions: [
        {
          id: "precondition.companion-anchor-absent",
          type: "target-absent",
          target: { kind: "node", nodeEntityId: "companion-spawn" },
        },
        {
          id: "precondition.companion-absent",
          type: "target-absent",
          target: { kind: "node", nodeEntityId: "companion" },
        },
      ],
      operations: [
        {
          id: "operation.add-companion-anchor",
          type: "node-upsert",
          node: {
            id: "companion-spawn",
            kind: "anchor",
            semantic: { classId: "spawn.companion" },
            placement: {
              kind: "fixed",
              transform: { positionMetersXYZ: [4, 0, 2] },
            },
          },
        },
        {
          id: "operation.add-companion",
          type: "node-upsert",
          node: {
            id: "companion",
            kind: "subject",
            subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
            spawnAnchorEntityId: "companion-spawn",
          },
        },
      ],
      provenance: {
        sourceType: "agent",
        sourceId: "builder-session-42",
      },
    } as const satisfies WorldChangeSetV1;
    const terrain = {
      kind: "worldkit-world-change-set",
      schemaVersion: 1,
      id: "change.replace-terrain-mountains.001",
      baseAuthoringSpecHash: HASH_A,
      preconditions: [
        {
          id: "precondition.terrain-main-exists",
          type: "target-exists",
          target: { kind: "node", nodeEntityId: "terrain-main" },
        },
      ],
      operations: [
        {
          id: "operation.replace-terrain-source",
          type: "terrain-source-replace",
          terrainEntityId: "terrain-main",
          terrainSource: {
            kind: "procedural",
            relief: "mountains",
            baseHeightMeters: 0,
            amplitudeMeters: 18,
            frequencyPerMeter: 0.018,
            octaves: 5,
            lacunarityRatio: 2,
            persistenceRatio: 0.5,
          },
        },
      ],
      provenance: {
        sourceType: "agent",
        sourceId: "terrain-revision-agent-3",
      },
    } as const satisfies WorldChangeSetV1;
    expect(parseWorldChangeSetV1(companion).operations).toHaveLength(2);
    expect(parseWorldChangeSetV1(terrain).operations[0]?.type).toBe(
      "terrain-source-replace",
    );
  });

  it("rejects duplicate operation IDs", () => {
    expect(() => parseWorldChangeSetV1({
      ...addHouseChangeSet,
      operations: [
        addHouseChangeSet.operations[0],
        {
          ...addHouseChangeSet.operations[1],
          id: addHouseChangeSet.operations[0].id,
        },
      ],
    })).toThrow(/WorldChangeSetV1/);
  });
});

describe("P16-A0 WorldChangeRequest parser", () => {
  it("requires preparedCandidateRef and runtimeExpectation for publish-runtime", () => {
    const publish = {
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.apply.add-house.001",
      authoringEditSessionId: "edit-session-17",
      worldId: "basic-world",
      mode: "apply",
      requestedOutcome: "publish-runtime",
      changeSet: addHouseChangeSet,
      preparedCandidateRef: "candidate://basic-world/add-house/7f23a9",
      runtimeExpectation: {
        runtimeSessionId: "runtime-session-9",
        expectedWorldSessionId: "world-session-31",
        expectedWorldPackageRootHash: `sha256:${"d".repeat(64)}`,
        targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
      },
    };
    const parsed = parseWorldChangeRequestV1(publish);
    expect(parsed.mode).toBe("apply");
    if (parsed.mode === "apply") {
      expect(parsed.requestedOutcome).toBe("publish-runtime");
    }
    expect(hashWorldChangeRequestV1(publish)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => parseWorldChangeRequestV1(withoutKey(publish, "preparedCandidateRef")))
      .toThrow(/WorldChangeRequestV1/);
    expect(() => parseWorldChangeRequestV1(withoutKey(publish, "runtimeExpectation")))
      .toThrow(/WorldChangeRequestV1/);
  });

  it("rejects runtimeExpectation on authoring-only Apply", () => {
    expect(() => parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.apply.authoring-only.001",
      authoringEditSessionId: "edit-session-17",
      worldId: "basic-world",
      mode: "apply",
      requestedOutcome: "authoring-only",
      changeSet: addHouseChangeSet,
      runtimeExpectation: {
        runtimeSessionId: "runtime-session-9",
        expectedWorldSessionId: "world-session-31",
        expectedWorldPackageRootHash: HASH_D,
        targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
      },
    })).toThrow(/WorldChangeRequestV1/);
  });

  it("rejects requestedOutcome on validate and dry-run requests", () => {
    expect(() => parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.validate.add-house.001",
      authoringEditSessionId: "edit-session-17",
      worldId: "basic-world",
      mode: "validate",
      requestedOutcome: "authoring-only",
      changeSet: addHouseChangeSet,
    })).toThrow(/WorldChangeRequestV1/);
  });
});

describe("P16-A0 Receipt and Diagnostic parser", () => {
  it("parses a successful Dry Run Receipt", () => {
    const receipt = {
      ...receiptBase,
      ...candidateFields,
      status: "succeeded",
      mode: "dry-run",
      publicationMode: "none",
      preparedCandidateRef: "candidate://basic-world/add-house/7f23a9",
      preparedCandidateExpiresAtUnixMilliseconds: 1_787_713_200_000,
    };
    const parsed = parseWorldChangeReceiptV1(receipt);
    expect(parsed.status).toBe("succeeded");
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("keeps requestedOutcome off validate/dry-run rejection and required on apply rejection", () => {
    const validateRejected = {
      ...receiptBase,
      status: "rejected",
      mode: "validate",
      publicationMode: "none",
      failurePhase: "admission",
      diagnostics: [
        {
          severity: "error",
          code: "WORLD_CHANGE_SET_SCHEMA_INVALID",
          instancePath: "/",
          message: "ChangeSet schema is invalid.",
        },
      ],
    };
    expect(parseWorldChangeReceiptV1(validateRejected).status).toBe("rejected");
    expect(() => parseWorldChangeReceiptV1({
      ...validateRejected,
      requestedOutcome: "authoring-only",
    })).toThrow(/WorldChangeReceiptV1/);
    const applyRejected = {
      ...receiptBase,
      status: "rejected",
      mode: "apply",
      requestedOutcome: "publish-runtime",
      publicationMode: "none",
      failurePhase: "runtime-preflight",
      diagnostics: [
        {
          severity: "error",
          code: "WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED",
          instancePath: "/preparedCandidateRef",
          message: "Prepared Candidate does not exist or its lease expired.",
        },
      ],
    };
    const parsedApply = parseWorldChangeReceiptV1(applyRejected);
    expect(parsedApply.status).toBe("rejected");
    if (parsedApply.status === "rejected" && parsedApply.mode === "apply") {
      expect(parsedApply.requestedOutcome).toBe("publish-runtime");
    }
    expect(() => parseWorldChangeReceiptV1(
      withoutKey(applyRejected, "requestedOutcome"),
    )).toThrow(/WorldChangeReceiptV1/);
  });

  it("accepts base-mismatch fields and rejects rebaseRequired on Receipt", () => {
    const baseMismatch = {
      ...receiptBase,
      status: "rejected",
      mode: "validate",
      publicationMode: "none",
      failurePhase: "base-check",
      currentAuthoringSpecHash: HASH_E,
      conflictingIds: {
        resourceIds: [],
        nodeEntityIds: ["house-north"],
        relationshipIds: [],
        spatialFeatureIds: [],
        constraintIds: [],
        overrideIds: [],
      },
      diagnostics: [
        {
          severity: "error",
          code: "WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH",
          instancePath: "/baseAuthoringSpecHash",
          message: "ChangeSet baseAuthoringSpecHash does not match the provided AuthoringSpec.",
          details: {
            kind: "hash-mismatch",
            expectedHash: HASH_A,
            actualHash: HASH_E,
          },
        },
      ],
    };
    const parsed = parseWorldChangeReceiptV1(baseMismatch);
    expect(parsed.status).toBe("rejected");
    if (parsed.status === "rejected") {
      expect(parsed.failurePhase).toBe("base-check");
      expect(parsed.currentAuthoringSpecHash).toBe(HASH_E);
      expect(parsed.conflictingIds?.nodeEntityIds).toEqual(["house-north"]);
      expect(parsed).not.toHaveProperty("rebaseRequired");
    }
    expect(() => parseWorldChangeReceiptV1({
      ...baseMismatch,
      rebaseRequired: true,
    })).toThrow(/WorldChangeReceiptV1/);
  });

  it("rejects unknown Diagnostic codes, aliases, and open details", () => {
    expect(() => parseWorldChangeDiagnosticV1({
      severity: "error",
      code: "PROVIDER_TIMEOUT",
      instancePath: "/",
      message: "timeout",
    })).toThrow(/WorldChangeReceiptV1/);
    expect(() => parseWorldChangeDiagnosticV1({
      severity: "error",
      code: "WORLD_CHANGE_SET_SCHEMA_INVALID",
      instancePath: "/",
      message: "invalid",
      details: { kind: "stack", stack: "Error" },
    })).toThrow(/WorldChangeReceiptV1/);
    expect(() => parseWorldChangeDiagnosticV1({
      severity: "error",
      code: "WORLD_CHANGE_SET_SCHEMA_INVALID",
      instancePath: "/",
      message: "invalid",
      extra: true,
    })).toThrow(/WorldChangeReceiptV1/);
  });

  it("requires Full Reload runtimeStateEffects to list every kind with empty exceptions", () => {
    const committed: WorldChangeReceiptV1 = parseWorldChangeReceiptV1({
      ...receiptBase,
      ...candidateFields,
      id: "receipt.apply.add-house.001",
      requestId: "request.apply.add-house.001",
      status: "committed",
      mode: "apply",
      requestedOutcome: "publish-runtime",
      publicationMode: "full-reload",
      committedRevisionRef: "revision://basic-world/2",
      previousRuntimeIdentity: {
        runtimeSessionId: "runtime-session-9",
        worldSessionId: "world-session-31",
        worldPackageRootHash: HASH_I,
        simulationTick: 12,
      },
      currentRuntimeIdentity: {
        runtimeSessionId: "runtime-session-9",
        worldSessionId: "world-session-32",
        worldPackageRootHash: HASH_E,
        simulationTick: 0,
      },
      runtimeStateEffects: fullReloadEffects(),
      runtimeCleanup: {
        cleanupOperationId: "cleanup.replace-runtime.001",
        type: "replaced-runtime",
        previousWorldSessionId: "world-session-31",
        statusAtCommit: "scheduled",
      },
    });
    expect(committed.status).toBe("committed");
    const withException = fullReloadEffects();
    withException[3] = {
      ...withException[3]!,
      exceptions: [{
        id: "keep-player",
        scope: { kind: "entity-ids", ids: ["player"] },
        disposition: "preserved",
        reasonCode: "incremental-state-unaffected",
      }],
    };
    expect(() => parseWorldChangeReceiptV1({
      ...receiptBase,
      ...candidateFields,
      id: "receipt.apply.add-house.001",
      requestId: "request.apply.add-house.001",
      status: "committed",
      mode: "apply",
      requestedOutcome: "publish-runtime",
      publicationMode: "full-reload",
      committedRevisionRef: "revision://basic-world/2",
      previousRuntimeIdentity: {
        runtimeSessionId: "runtime-session-9",
        worldSessionId: "world-session-31",
        worldPackageRootHash: HASH_I,
        simulationTick: 12,
      },
      currentRuntimeIdentity: {
        runtimeSessionId: "runtime-session-9",
        worldSessionId: "world-session-32",
        worldPackageRootHash: HASH_E,
        simulationTick: 0,
      },
      runtimeStateEffects: withException,
      runtimeCleanup: {
        cleanupOperationId: "cleanup.replace-runtime.001",
        type: "replaced-runtime",
        previousWorldSessionId: "world-session-31",
        statusAtCommit: "scheduled",
      },
    })).toThrow(/WorldChangeReceiptV1/);
  });

  it("rejects a runtime-state exception whose scope is incompatible with the state kind", () => {
    expect(() => parseRuntimeStateEffectV1({
      runtimeStateKind: "relationship-state",
      defaultDisposition: "preserved",
      defaultReasonCode: "incremental-state-unaffected",
      exceptions: [{
        id: "rel-1",
        scope: { kind: "entity-ids", ids: ["player"] },
        disposition: "replaced",
        reasonCode: "incremental-target-replaced",
      }],
    }, { requireEmptyExceptions: false })).toThrow(/WorldChangeReceiptV1/);
  });
});

describe("P16-A0 AI Schema Profile parser", () => {
  it("binds contentHash to the profile body and rejects aliases", () => {
    const body = {
      kind: "ai-schema-projection-profile",
      schemaVersion: 1,
      id: "constrained-json",
      version: 1,
      resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
      maximumPropertyCount: 256,
      maximumNestingDepth: 8,
      maximumEnumValueCount: 32,
      maximumSchemaBytes: 65_536,
      maximumRegistrySearchResultCount: 32,
      optionalFieldMode: "native-optional" as const,
    };
    const profile = {
      ...body,
      contentHash: sha256CanonicalJson(body),
    };
    expect(parseAiSchemaProjectionProfileV1(profile).id).toBe("constrained-json");
    expect(() => parseAiSchemaProjectionProfileV1({
      ...profile,
      contentHash: HASH_A,
    })).toThrow(/AiSchemaProjectionProfileV1/);
    expect(() => parseAiSchemaProjectionProfileV1({
      ...profile,
      provider: "openai",
    })).toThrow(/AiSchemaProjectionProfileV1/);
  });
});
