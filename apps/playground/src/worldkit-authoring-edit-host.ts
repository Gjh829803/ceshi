import { hashAuthoringDocumentV4, type AuthoringSpecV4 } from "@whitebox-world/authoring";
import canonicalAuthoringSchema from "@whitebox-world/authoring/schema";
import {
  AUTHORING_EDIT_SCOPES_V1,
  REGISTRY_RESOURCE_KINDS_V1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  hashCapabilitySetV1,
  hashRegistryLockEntriesV1,
  parseAiSchemaProjectionProfileSourceV1,
  parseAuthoringEditPolicyProjectionV1,
  parseRegistrySearchResultV1,
  parseWorldChangeDiagnosticV1,
  type AuthoringEditScopeV1,
  type RegistrySearchResultV1,
  type Sha256HashV1,
  type WorldChangeDiagnosticV1,
  type WorldkitAuthoringEditApiV1,
} from "@whitebox-world/authoring-edit";
import {
  createAuthoringEditHostV1,
  createPreparedCandidateLeaseStoreV1,
  createWorldChangeJournalV1,
  seedAuthoringRevisionHeadV1,
  type AuthoringEditHostV1,
  type AuthoringEditSessionV1,
  type PublishRuntimeReplacementV1,
} from "@whitebox-world/authoring-host";
import type { PublishWorldReplacementResultV1 } from "@whitebox-world/runtime-host";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import { isNil } from "lodash-es";

export const PLAYGROUND_AUTHORING_EDIT_PROFILE_REF =
  "worldkit://ai-schema-projection-profile/constrained-json@1";

function requiredCapabilityRefsOf(resource: object): readonly string[] {
  if (!("requiredCapabilityRefs" in resource)) return [];
  const value = resource.requiredCapabilityRefs;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function authoringAvailabilityOf(
  resource: object,
): "recommended" | "advanced" | "experimental" | undefined {
  if (!("authoringAvailability" in resource)) return "recommended";
  const value = resource.authoringAvailability;
  if (value === "internal") return undefined;
  if (value === "recommended" || value === "advanced" || value === "experimental") {
    return value;
  }
  return "recommended";
}

export function playgroundRegistryLockEntriesV1(): readonly RegistrySearchResultV1[] {
  return builtInSubjectResourceRegistry.listDiscoverableResources().flatMap((resource) => {
    if (
      !("kind" in resource) ||
      !("resourceRef" in resource) ||
      !("version" in resource) ||
      !("contentHash" in resource) ||
      !("aiMetadata" in resource)
    ) {
      return [];
    }
    if (
      typeof resource.kind !== "string" ||
      !(REGISTRY_RESOURCE_KINDS_V1 as readonly string[]).includes(resource.kind)
    ) {
      return [];
    }
    const authoringAvailability = authoringAvailabilityOf(resource);
    if (isNil(authoringAvailability)) return [];
    try {
      return [parseRegistrySearchResultV1({
        resourceRef: resource.resourceRef,
        resourceKind: resource.kind,
        version: resource.version,
        contentHash: resource.contentHash,
        authoringAvailability,
        requiredCapabilityRefs: requiredCapabilityRefsOf(resource),
        aiMetadata: resource.aiMetadata,
      })];
    } catch {
      return [];
    }
  });
}

function cleanupDiagnosticsFor(
  result: Extract<PublishWorldReplacementResultV1, { status: "published" }>,
): readonly WorldChangeDiagnosticV1[] {
  if (result.cleanup.status !== "quarantined") return [];
  return [
    parseWorldChangeDiagnosticV1({
      severity: "error",
      code: "WORLD_CHANGE_CLEANUP_QUARANTINED",
      instancePath: "/runtimeCleanup",
      message: "Runtime cleanup entered quarantine and must be repaired by a trusted Host.",
    }),
  ];
}

export function bindPlaygroundRuntimePublicationPortV1(
  publishWorldReplacementV1: (
    input: unknown,
  ) => Promise<PublishWorldReplacementResultV1>,
): PublishRuntimeReplacementV1 {
  return async (input) => {
    const result = await publishWorldReplacementV1({
      worldConfiguration: input.worldConfiguration,
      publication: input.publication,
      persistDurableCommit: input.persistDurableCommit,
    });
    if (result.status === "rejected") {
      return {
        status: "rejected",
        failureKind: result.failureKind,
        message: result.message,
      };
    }
    return {
      status: "published",
      previous: result.previous,
      current: result.current,
      cleanupStatus: result.cleanup.status,
      cleanupDiagnostics: cleanupDiagnosticsFor(result),
    };
  };
}

function generousBudget() {
  return {
    maximumChangeSetBytes: 1_048_576,
    maximumPreconditionCount: 64,
    maximumOperationCount: 64,
    maximumConcurrentNonTerminalRequestCount: 8,
    maximumPreparedCandidateCount: 8,
    maximumPreparedCandidateBytes: 2_000_000,
    maximumPreparedCandidateRetentionMilliseconds: 3_600_000,
  };
}

export function createPlaygroundAuthoringEditSessionV1(input: {
  readonly worldId: string;
  readonly nowUnixMilliseconds: number;
  readonly lockEntries?: readonly RegistrySearchResultV1[];
  readonly scopes?: readonly AuthoringEditScopeV1[];
}): AuthoringEditSessionV1 {
  const lockEntries = input.lockEntries ?? playgroundRegistryLockEntriesV1();
  const capabilityRefs = lockEntries
    .filter((entry) => entry.resourceKind === "capability")
    .map((entry) => entry.resourceRef);
  return {
    authoringEditSessionId: "session.playground.authoring-edit",
    authorizationEpoch: 1,
    isActive: true,
    expiresAtUnixMilliseconds: input.nowUnixMilliseconds + 86_400_000,
    scopes: input.scopes ?? [...AUTHORING_EDIT_SCOPES_V1],
    policy: parseAuthoringEditPolicyProjectionV1({
      allowedWorldIds: [input.worldId],
      registryLockHash: hashRegistryLockEntriesV1(lockEntries),
      capabilitySetHash: hashCapabilitySetV1(capabilityRefs),
      projectionProfileRef: PLAYGROUND_AUTHORING_EDIT_PROFILE_REF,
      allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
      allowedOverridePaths: [],
      requiredGateProfileRefs: [],
      workloadBudget: generousBudget(),
    }),
    hasActiveRuntimeBinding: true,
  };
}

export function createPlaygroundAuthoringEditHostV1(input: {
  readonly authoringSpec: AuthoringSpecV4;
  readonly nowUnixMilliseconds?: () => number;
  readonly publishWorldReplacement?: (
    value: unknown,
  ) => Promise<PublishWorldReplacementResultV1>;
  readonly session?: AuthoringEditSessionV1;
}): AuthoringEditHostV1 & WorldkitAuthoringEditApiV1 {
  const lockEntries = playgroundRegistryLockEntriesV1();
  const nowUnixMilliseconds = input.nowUnixMilliseconds ?? (() => Date.now());
  const journal = createWorldChangeJournalV1();
  seedAuthoringRevisionHeadV1(journal, {
    worldId: input.authoringSpec.id,
    revisionRef: `revision://${input.authoringSpec.id}/1`,
    authoringSpec: input.authoringSpec,
    authoringSpecHash: hashAuthoringDocumentV4(input.authoringSpec) as Sha256HashV1,
  });
  const resolved = builtInSubjectResourceRegistry.resolveAiSchemaProjectionProfile(
    PLAYGROUND_AUTHORING_EDIT_PROFILE_REF,
  );
  if (isNil(resolved)) {
    throw new RangeError("Constrained JSON AI Schema projection profile is not registered.");
  }
  return createAuthoringEditHostV1({
    journal,
    leaseStore: createPreparedCandidateLeaseStoreV1(),
    session: input.session ?? createPlaygroundAuthoringEditSessionV1({
      worldId: input.authoringSpec.id,
      nowUnixMilliseconds: nowUnixMilliseconds(),
      lockEntries,
    }),
    nowUnixMilliseconds,
    projectionProfile: parseAiSchemaProjectionProfileSourceV1(resolved),
    canonicalAuthoringSchema,
    registryLockEntries: lockEntries,
    allowedCapabilityRefs: lockEntries
      .filter((entry) => entry.resourceKind === "capability")
      .map((entry) => entry.resourceRef),
    allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
    ...(isNil(input.publishWorldReplacement)
      ? {}
      : {
          publishRuntimeReplacement: bindPlaygroundRuntimePublicationPortV1(
            input.publishWorldReplacement,
          ),
        }),
  });
}
