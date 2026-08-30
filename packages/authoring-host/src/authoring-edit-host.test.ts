import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { hashAuthoringDocumentV4 } from "@whitebox-world/authoring";
import canonicalAuthoringSchema from "@whitebox-world/authoring/schema";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  AUTHORING_EDIT_SCOPES_V1,
  FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1,
  hashCapabilitySetV1,
  hashRegistryLockEntriesV1,
  hashWorldChangeReceiptV1,
  parseAuthoringEditPolicyProjectionV1,
  parseWorldChangeCleanupReportQueryV1,
  parseWorldChangeDiffRequestV1,
  parseWorldChangeExplainRequestV1,
  parseWorldChangeReceiptQueryV1,
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  type AuthoringEditPolicyProjectionV1,
  type AuthoringEditScopeV1,
  type RegistrySearchResultV1,
  type WorldChangeOperationV1,
  type WorldChangeSetV1,
  type WorldPreconditionV1,
} from "@whitebox-world/authoring-edit";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  createInMemoryWorldPackageStoreV1,
  createCanonicalWorldPackageBuildContextFixtureV1,
} from "@whitebox-world/world-package/testing";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  AuthoringEditHostErrorV1,
  createAuthoringEditHostV1,
  createPreparedCandidateLeaseStoreV1,
  createWorldChangeJournalV1,
  getAuthoringRevisionHeadV1,
  seedAuthoringRevisionHeadV1,
} from "./index.js";
import type {
  AuthoringEditSessionV1,
  PublishRuntimeReplacementV1,
} from "./journal/index.js";

const NOW = 1_700_000_000_000;
const SESSION_ID = "edit-session-17";
const PROFILE_REF = "worldkit://ai-schema-projection-profile/constrained-json@1";
const SUBJECT_REF = "worldkit://subject-definition/humanoid.g-bot@2";
const CAPABILITY_REF = "worldkit://capability/locomotion.ground@1";

const HOUSE_PROTOTYPE = {
  id: "house-blockout",
  version: 1,
  kind: "primitive",
  primitive: "box",
  sizeMetersXYZ: [8, 5, 10],
  collisionEnabled: true,
  semantic: { classId: "structure.house" },
} as const;

const HOUSE_NODE = {
  id: "house-north",
  kind: "object",
  prototypeRef: "package://prototype/house-blockout@1",
  placement: {
    kind: "fixed",
    transform: { positionMetersXYZ: [18, 2.5, -24] },
  },
} as const;

const ADD_HOUSE_OPERATIONS: readonly WorldChangeOperationV1[] = [
  {
    id: "operation.add-house-prototype",
    type: "resource-upsert",
    resourceKind: "prototype",
    prototype: HOUSE_PROTOTYPE,
  },
  {
    id: "operation.add-house-node",
    type: "node-upsert",
    node: HOUSE_NODE,
  },
];

const ADD_HOUSE_PRECONDITIONS: readonly WorldPreconditionV1[] = [
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
    target: { kind: "node", nodeEntityId: "house-north" },
  },
];

function generousBudget(overrides: { readonly maximumOperationCount?: number } = {}) {
  return {
    maximumChangeSetBytes: 1_000_000,
    maximumPreconditionCount: 64,
    maximumOperationCount: overrides.maximumOperationCount ?? 64,
    maximumConcurrentNonTerminalRequestCount: 8,
    maximumPreparedCandidateCount: 8,
    maximumPreparedCandidateBytes: 2_000_000,
    maximumPreparedCandidateRetentionMilliseconds: 3_600_000,
  };
}

function lockEntry(resourceRef: string, resourceKind: RegistrySearchResultV1["resourceKind"]): RegistrySearchResultV1 {
  return {
    resourceRef,
    resourceKind,
    version: 1,
    contentHash: sha256CanonicalJson({ resourceRef }) as Sha256HashV1,
    authoringAvailability: "recommended",
    requiredCapabilityRefs: resourceKind === "subject-definition" ? [CAPABILITY_REF] : [],
    aiMetadata: {
      displayName: resourceRef,
      description: "Locked Registry resource.",
      semanticTags: [resourceKind],
    },
  };
}

function lockEntries(): readonly RegistrySearchResultV1[] {
  return [
    lockEntry(SUBJECT_REF, "subject-definition"),
    lockEntry(CAPABILITY_REF, "capability"),
  ];
}

function profileSource(): Record<string, unknown> {
  return {
    kind: "ai-schema-projection-profile",
    schemaVersion: 1,
    id: "constrained-json",
    version: 1,
    resourceRef: PROFILE_REF,
    authoringAvailability: "recommended",
    maximumPropertyCount: 512,
    maximumNestingDepth: 8,
    maximumEnumValueCount: 32,
    maximumSchemaBytes: 65_536,
    maximumRegistrySearchResultCount: 32,
    optionalFieldMode: "native-optional",
    aiMetadata: {
      displayName: "Constrained JSON Schema Projection",
      description: "Provider-neutral JSON Schema projection.",
      semanticTags: ["ai-schema", "constrained-json"],
    },
  };
}

function policy(
  entries: readonly RegistrySearchResultV1[],
  extras: { readonly maximumOperationCount?: number } = {},
): AuthoringEditPolicyProjectionV1 {
  const capabilityRefs = entries
    .filter((entry) => entry.resourceKind === "capability")
    .map((entry) => entry.resourceRef);
  return parseAuthoringEditPolicyProjectionV1({
    allowedWorldIds: ["basic-world"],
    registryLockHash: hashRegistryLockEntriesV1(entries),
    capabilitySetHash: hashCapabilitySetV1(capabilityRefs),
    projectionProfileRef: PROFILE_REF,
    allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
    allowedOverridePaths: [],
    requiredGateProfileRefs: [],
    workloadBudget: generousBudget(extras),
  });
}

function sessionFor(
  entries: readonly RegistrySearchResultV1[],
  extras: {
    readonly scopes?: readonly AuthoringEditScopeV1[];
    readonly authorizationEpoch?: number;
    readonly isActive?: boolean;
    readonly maximumOperationCount?: number;
    readonly hasActiveRuntimeBinding?: boolean;
  } = {},
): AuthoringEditSessionV1 {
  return {
    authoringEditSessionId: SESSION_ID,
    authorizationEpoch: extras.authorizationEpoch ?? 1,
    isActive: extras.isActive ?? true,
    expiresAtUnixMilliseconds: NOW + 3_600_000,
    scopes: extras.scopes ?? [...AUTHORING_EDIT_SCOPES_V1],
    policy: policy(entries, extras),
    hasActiveRuntimeBinding: extras.hasActiveRuntimeBinding ?? true,
  };
}

function addHouseChangeSet(specHash: Sha256HashV1): WorldChangeSetV1 {
  return parseWorldChangeSetV1({
    kind: "worldkit-world-change-set",
    schemaVersion: 1,
    id: "change.add-house.001",
    baseAuthoringSpecHash: specHash,
    preconditions: ADD_HOUSE_PRECONDITIONS,
    operations: ADD_HOUSE_OPERATIONS,
  });
}

function createHost(extras: {
  readonly scopes?: readonly AuthoringEditScopeV1[];
  readonly maximumOperationCount?: number;
  readonly publishRuntimeReplacement?: PublishRuntimeReplacementV1;
} = {}) {
  const spec = createValidAuthoringSpec();
  const authoringSpecHash = hashAuthoringDocumentV4(spec) as Sha256HashV1;
  const journal = createWorldChangeJournalV1();
  seedAuthoringRevisionHeadV1(journal, {
    worldId: spec.id,
    revisionRef: `revision://${spec.id}/1`,
    authoringSpec: spec,
    authoringSpecHash,
  });
  const entries = lockEntries();
  const now = { value: NOW };
  const host = createAuthoringEditHostV1({
    journal,
    leaseStore: createPreparedCandidateLeaseStoreV1(),
    worldPackageStore: createInMemoryWorldPackageStoreV1(),
    worldPackageBuildContext: createCanonicalWorldPackageBuildContextFixtureV1(),
    resourceArtifacts: [],
    session: sessionFor(entries, extras),
    nowUnixMilliseconds: () => now.value,
    projectionProfile: profileSource(),
    canonicalAuthoringSchema,
    registryLockEntries: entries,
    allowedCapabilityRefs: [CAPABILITY_REF],
    definitionOverrideOwners: [
      {
        definitionKind: "subject-definition",
        definitionRef: "worldkit://subject-definition/humanoid.third-person@1",
        allowedOverridePaths: [...FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1],
        bodyTopology: "biped",
        mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
      },
    ],
    definitionOverrideLockEntries: [],
    projectionAllowedOverridePaths: [...FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1],
    allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
    ...(isNil(extras.publishRuntimeReplacement)
      ? {}
      : { publishRuntimeReplacement: extras.publishRuntimeReplacement }),
  });
  return {
    host,
    journal,
    spec,
    authoringSpecHash,
    changeSet: addHouseChangeSet(authoringSpecHash),
    entries,
    now,
  };
}

async function expectHostError(
  action: () => Promise<unknown>,
  code: string,
): Promise<AuthoringEditHostErrorV1> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthoringEditHostErrorV1);
    if (!(error instanceof AuthoringEditHostErrorV1)) {
      throw new Error("expected AuthoringEditHostErrorV1");
    }
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`expected ${code}`);
}

describe("P16-B1 Authoring/Edit Host", () => {
  it("exposes the closed nine-method control surface", () => {
    const { host } = createHost();
    expect(host.version).toBe(1);
    expect(Object.keys(host).filter((key) => typeof (host as unknown as Record<string, unknown>)[key] === "function").sort())
      .toEqual([
        "advanceAuthorizationEpoch",
        "applyWorldChange",
        "currentSession",
        "diffWorldChange",
        "dryRunWorldChange",
        "explainWorldChange",
        "getWorldChangeCleanupReport",
        "getWorldChangeReceipt",
        "mutateSession",
        "projectAiSchema",
        "replaceSession",
        "revokeSession",
        "searchRegistry",
        "validateWorldChange",
      ]);
  });

  it("projects Schema and searches Registry only with the matching read scopes", async () => {
    const { host, entries } = createHost();
    const projection = await host.projectAiSchema({
      kind: "worldkit-ai-schema-projection-request",
      schemaVersion: 1,
      id: "request.project.001",
      authoringEditSessionId: SESSION_ID,
      projectionProfileRef: PROFILE_REF,
      authoringSchemaVersion: 4,
    });
    expect(projection.kind).toBe("worldkit-ai-schema-projection");
    expect(projection.projectionProfileRef).toBe(PROFILE_REF);

    const search = await host.searchRegistry({
      kind: "worldkit-registry-search-request",
      schemaVersion: 1,
      id: "request.search.001",
      authoringEditSessionId: SESSION_ID,
      registryLockHash: hashRegistryLockEntriesV1(entries),
      resourceKind: "subject-definition",
      maximumResultCount: 8,
    });
    expect(search.results.map((entry) => entry.resourceRef)).toEqual([SUBJECT_REF]);

    const denied = createHost({
      scopes: AUTHORING_EDIT_SCOPES_V1.filter((scope) => scope !== "authoring.schema.read"),
    });
    await expectHostError(
      () => denied.host.projectAiSchema({
        kind: "worldkit-ai-schema-projection-request",
        schemaVersion: 1,
        id: "request.project.002",
        authoringEditSessionId: SESSION_ID,
        projectionProfileRef: PROFILE_REF,
        authoringSchemaVersion: 4,
      }),
      "WORLD_CHANGE_PUBLICATION_SCOPE_REQUIRED",
    );
  });

  it("rejects validate, dry-run, apply, publish, and receipt reads without their scopes", async () => {
    const { changeSet } = createHost();
    const cases: readonly {
      readonly missing: AuthoringEditScopeV1;
      readonly mode: "validate" | "dry-run" | "apply-authoring" | "apply-publish";
    }[] = [
      { missing: "authoring.change.validate", mode: "validate" },
      { missing: "authoring.change.dry-run", mode: "dry-run" },
      { missing: "authoring.change.apply", mode: "apply-authoring" },
      { missing: "authoring.runtime.publish", mode: "apply-publish" },
    ];
    for (const testCase of cases) {
      const { host, changeSet: scopedChangeSet } = createHost({
        scopes: AUTHORING_EDIT_SCOPES_V1.filter((scope) => scope !== testCase.missing),
      });
      const request = testCase.mode === "validate" || testCase.mode === "dry-run"
        ? parseWorldChangeRequestV1({
            kind: "worldkit-world-change-request",
            schemaVersion: 1,
            id: `request.${testCase.mode}.scope`,
            authoringEditSessionId: SESSION_ID,
            worldId: "basic-world",
            changeSet: scopedChangeSet,
            mode: testCase.mode,
          })
        : parseWorldChangeRequestV1({
            kind: "worldkit-world-change-request",
            schemaVersion: 1,
            id: `request.${testCase.mode}.scope`,
            authoringEditSessionId: SESSION_ID,
            worldId: "basic-world",
            changeSet: scopedChangeSet,
            mode: "apply",
            requestedOutcome: testCase.mode === "apply-publish"
              ? "publish-runtime"
              : "authoring-only",
            ...(testCase.mode === "apply-publish"
              ? {
                  preparedCandidateRef: "candidate.missing",
                  runtimeExpectation: {
                    runtimeSessionId: "runtime-session-9",
                    expectedWorldSessionId: "world-session-31",
                    expectedWorldPackageRootHash: `sha256:${"d".repeat(64)}`,
                    targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
                  },
                }
              : {}),
          });
      const receipt = testCase.mode === "validate"
        ? await host.validateWorldChange(request as never)
        : testCase.mode === "dry-run"
          ? await host.dryRunWorldChange(request as never)
          : await host.applyWorldChange(request as never);
      expect(receipt.status).toBe("rejected");
      if (receipt.status !== "rejected") throw new Error("expected rejected");
      expect(receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_PUBLICATION_SCOPE_REQUIRED");
    }

    const { host, changeSet: readableChangeSet } = createHost({
      scopes: AUTHORING_EDIT_SCOPES_V1.filter((scope) => scope !== "authoring.receipt.read"),
    });
    const validated = await host.validateWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.validate.receipt-scope",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet: readableChangeSet,
      mode: "validate",
    }) as never);
    expect(validated.status).toBe("validated");
    await expectHostError(
      () => host.getWorldChangeReceipt(parseWorldChangeReceiptQueryV1({
        kind: "worldkit-world-change-receipt-query",
        schemaVersion: 1,
        id: "q.receipt.scope",
        authoringEditSessionId: SESSION_ID,
        requestId: "request.validate.receipt-scope",
      })),
      "WORLD_CHANGE_PUBLICATION_SCOPE_REQUIRED",
    );
    expect(changeSet.id).toBe("change.add-house.001");
  });

  it("rejects a ChangeSet that exceeds the Host workload budget", async () => {
    const { host, changeSet } = createHost({ maximumOperationCount: 1 });
    const receipt = await host.validateWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.validate.budget",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "validate",
    }) as never);
    expect(receipt.status).toBe("rejected");
    if (receipt.status !== "rejected") throw new Error("expected rejected");
    expect(receipt.failurePhase).toBe("admission");
    expect(receipt.diagnostics[0]?.code).toBe("WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED");
  });

  it("rejects definition-override-set outside the Host policy before Candidate build", async () => {
    const { host, authoringSpecHash } = createHost();
    const changeSet = parseWorldChangeSetV1({
      kind: "worldkit-world-change-set",
      schemaVersion: 1,
      id: "change.override.forbidden.001",
      baseAuthoringSpecHash: authoringSpecHash,
      preconditions: [],
      operations: [
        {
          id: "operation.override.feel.001",
          type: "definition-override-set",
          nodeEntityId: "player",
          override: {
            id: "override.feel.001",
            kind: "resource-ref",
            path: "profiles.controlFeelProfileRef",
            resourceRef:
              "worldkit://control-feel-profile/humanoid.heavy-ground@1",
          },
        },
      ],
    });

    const receipt = await host.validateWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.validate.override.forbidden.001",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "validate",
    }) as never);

    expect(receipt.status).toBe("rejected");
    if (receipt.status !== "rejected") throw new Error("expected rejected");
    expect(receipt.failurePhase).toBe("candidate-apply");
    expect(receipt.diagnostics[0]?.code).toBe("DEFINITION_OVERRIDE_PATH_FORBIDDEN");
    expect(receipt.diagnostics[0]?.instancePath).toBe("/operations/0/override/path");
  });

  it("keeps the old revision when authorization is revoked before publication commit", async () => {
    const previous = {
      runtimeSessionId: "runtime-session-9",
      worldSessionId: "world-session-31",
      worldPackageRootHash: `sha256:${"d".repeat(64)}` as Sha256HashV1,
      simulationTick: 12,
    };
    const { host, journal, changeSet, authoringSpecHash } = createHost({
      publishRuntimeReplacement: async ({ persistDurableCommit }) => {
        host.revokeSession();
        try {
          persistDurableCommit({
            previous,
            current: {
              ...previous,
              worldSessionId: "world-session-32",
              simulationTick: 0,
            },
          });
        } catch {
          return {
            status: "rejected",
            failureKind: "commit-failed",
            message: "WORLD_CHANGE_COMMIT_DENIED",
          };
        }
        return {
          status: "published",
          previous,
          current: {
            ...previous,
            worldSessionId: "world-session-32",
            simulationTick: 0,
          },
          cleanupStatus: "released",
          cleanupDiagnostics: [],
        };
      },
    });
    const dryRun = await host.dryRunWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.dry-run.revoke",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "dry-run",
    }) as never);
    expect(dryRun.status).toBe("succeeded");
    if (dryRun.status !== "succeeded" || dryRun.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }
    const published = await host.applyWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.apply.publish-revoke",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "apply",
      requestedOutcome: "publish-runtime",
      preparedCandidateRef: dryRun.preparedCandidateRef,
      runtimeExpectation: {
        runtimeSessionId: "runtime-session-9",
        expectedWorldSessionId: "world-session-31",
        expectedWorldPackageRootHash: `sha256:${"d".repeat(64)}`,
        targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
      },
    }) as never);
    expect(published.status).toBe("rejected");
    if (published.status !== "rejected") throw new Error("expected rejected");
    expect(published.failurePhase).toBe("authorization");
    expect(published.diagnostics[0]?.code).toBe("WORLD_CHANGE_AUTHORIZATION_STALE");
    expect(getAuthoringRevisionHeadV1(journal, "basic-world")?.authoringSpecHash).toBe(
      authoringSpecHash,
    );
  });

  it("rejects an in-flight publish when the authorization epoch advances", async () => {
    const previous = {
      runtimeSessionId: "runtime-session-9",
      worldSessionId: "world-session-31",
      worldPackageRootHash: `sha256:${"d".repeat(64)}` as Sha256HashV1,
      simulationTick: 4,
    };
    const { host, changeSet } = createHost({
      publishRuntimeReplacement: async ({ persistDurableCommit }) => {
        host.advanceAuthorizationEpoch();
        try {
          persistDurableCommit({
            previous,
            current: { ...previous, worldSessionId: "world-session-32", simulationTick: 0 },
          });
        } catch {
          return {
            status: "rejected",
            failureKind: "commit-failed",
            message: "WORLD_CHANGE_COMMIT_DENIED",
          };
        }
        return {
          status: "published",
          previous,
          current: { ...previous, worldSessionId: "world-session-32", simulationTick: 0 },
          cleanupStatus: "released",
          cleanupDiagnostics: [],
        };
      },
    });
    const dryRun = await host.dryRunWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.dry-run.epoch",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "dry-run",
    }) as never);
    if (dryRun.status !== "succeeded" || dryRun.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }
    const published = await host.applyWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.apply.publish-epoch",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "apply",
      requestedOutcome: "publish-runtime",
      preparedCandidateRef: dryRun.preparedCandidateRef,
      runtimeExpectation: {
        runtimeSessionId: "runtime-session-9",
        expectedWorldSessionId: "world-session-31",
        expectedWorldPackageRootHash: `sha256:${"d".repeat(64)}`,
        targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
      },
    }) as never);
    expect(published.status).toBe("rejected");
    if (published.status !== "rejected") throw new Error("expected rejected");
    expect(published.diagnostics[0]?.code).toBe("WORLD_CHANGE_AUTHORIZATION_STALE");
  });

  it("returns Receipt, Explain, and Diff for a terminal Request and rejects a missing query", async () => {
    const { host, changeSet } = createHost();
    const validated = await host.validateWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.validate.house",
      authoringEditSessionId: SESSION_ID,
      worldId: "basic-world",
      changeSet,
      mode: "validate",
    }) as never);
    expect(validated.status).toBe("validated");
    const receipt = await host.getWorldChangeReceipt(parseWorldChangeReceiptQueryV1({
      kind: "worldkit-world-change-receipt-query",
      schemaVersion: 1,
      id: "q.receipt.house",
      authoringEditSessionId: SESSION_ID,
      requestId: "request.validate.house",
    }));
    expect(hashWorldChangeReceiptV1(receipt)).toBe(hashWorldChangeReceiptV1(validated));
    const explained = await host.explainWorldChange(parseWorldChangeExplainRequestV1({
      kind: "worldkit-world-change-explain-request",
      schemaVersion: 1,
      id: "q.explain.house",
      authoringEditSessionId: SESSION_ID,
      requestId: "request.validate.house",
      selector: { mode: "summary" },
    }));
    expect(explained.requestId).toBe("request.validate.house");
    const diff = await host.diffWorldChange(parseWorldChangeDiffRequestV1({
      kind: "worldkit-world-change-diff-request",
      schemaVersion: 1,
      id: "q.diff.house",
      authoringEditSessionId: SESSION_ID,
      requestId: "request.validate.house",
    }));
    expect(diff.changes.some((change) => change.target.kind === "node")).toBe(true);
    await expectHostError(
      () => host.getWorldChangeReceipt(parseWorldChangeReceiptQueryV1({
        kind: "worldkit-world-change-receipt-query",
        schemaVersion: 1,
        id: "q.receipt.missing",
        authoringEditSessionId: SESSION_ID,
        requestId: "request.validate.missing",
      })),
      "WORLD_CHANGE_RECEIPT_MISSING",
    );
    await expectHostError(
      () => host.getWorldChangeCleanupReport(parseWorldChangeCleanupReportQueryV1({
        kind: "worldkit-world-change-cleanup-report-query",
        schemaVersion: 1,
        id: "q.cleanup.missing",
        authoringEditSessionId: SESSION_ID,
        cleanupOperationId: "cleanup.missing",
      })),
      "WORLD_CHANGE_CLEANUP_REPORT_MISSING",
    );
  });
});
