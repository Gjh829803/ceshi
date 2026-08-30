import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { hashAuthoringDocumentV4, type AuthoringSpecV4 } from "@whitebox-world/authoring";
import canonicalAuthoringSchema from "@whitebox-world/authoring/schema";
import {
  AUTHORING_EDIT_SCOPES_V1,
  FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  hashCapabilitySetV1,
  hashRegistryLockEntriesV1,
  parseAuthoringEditPolicyProjectionV1,
  parseAiSchemaProjectionProfileSourceV1,
  parseWorldChangeDiagnosticV1,
  type AuthoringEditScopeV1,
  type RegistrySearchResultV1,
  type WorldChangeDiagnosticV1,
} from "@whitebox-world/authoring-edit";
import {
  createAuthoringEditHostV1,
  createPreparedCandidateLeaseStoreV1,
  createWorldChangeJournalV1,
  getAuthoringRevisionHeadV1,
  seedAuthoringRevisionHeadV1,
  type AuthoringEditHostV1,
  type AuthoringEditSessionV1,
  type PublishRuntimeReplacementResultV1,
  type PublishRuntimeReplacementV1,
  type PreparedCandidateLeaseStoreV1,
  type EvaluateRequiredGatesV1,
  type WorldChangeJournalV1,
} from "@whitebox-world/authoring-host";
import type {
  PublishWorldReplacementResultV1,
  RuntimeHost,
} from "@whitebox-world/runtime-host";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
  type ResolvedCanonicalWorldPackageResourceArtifactV1,
  type CanonicalWorldPackageBuildContextV1,
  type WorldPackageStoreV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil } from "lodash-es";

import {
  CONSTRAINED_JSON_PROFILE_REF,
  builtInRegistryLockEntriesV1,
} from "./authoring-edit-cli";

export const AUTHORING_EDIT_HOST_BRIDGE_KIND =
  "worldkit-authoring-edit-host-bridge" as const;

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

export function bindRuntimeHostPublicationPortV1(
  runtimeHost: Pick<RuntimeHost, "publishWorldReplacementV1">,
): PublishRuntimeReplacementV1 {
  return async (input) => {
    const result = await runtimeHost.publishWorldReplacementV1({
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
    } satisfies PublishRuntimeReplacementResultV1;
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

export function createAuthoringEditHostSessionV1(input: {
  readonly worldId: string;
  readonly nowUnixMilliseconds: number;
  readonly lockEntries?: readonly RegistrySearchResultV1[];
  readonly scopes?: readonly AuthoringEditScopeV1[];
  readonly hasActiveRuntimeBinding?: boolean;
  readonly authoringEditSessionId?: string;
}): AuthoringEditSessionV1 {
  const lockEntries = input.lockEntries ?? builtInRegistryLockEntriesV1();
  const capabilityRefs = lockEntries
    .filter((entry) => entry.resourceKind === "capability")
    .map((entry) => entry.resourceRef);
  return {
    authoringEditSessionId: input.authoringEditSessionId ?? "session.authoring-edit.host",
    authorizationEpoch: 1,
    isActive: true,
    expiresAtUnixMilliseconds: input.nowUnixMilliseconds + 86_400_000,
    scopes: input.scopes ?? [...AUTHORING_EDIT_SCOPES_V1],
    policy: parseAuthoringEditPolicyProjectionV1({
      allowedWorldIds: [input.worldId],
      registryLockHash: hashRegistryLockEntriesV1(lockEntries),
      capabilitySetHash: hashCapabilitySetV1(capabilityRefs),
      projectionProfileRef: CONSTRAINED_JSON_PROFILE_REF,
      allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
      allowedOverridePaths: [],
      requiredGateProfileRefs: [],
      workloadBudget: generousBudget(),
    }),
    hasActiveRuntimeBinding: isNil(input.hasActiveRuntimeBinding)
      ? true
      : input.hasActiveRuntimeBinding,
  };
}

export interface AuthoringEditHostBridgeV1 {
  readonly kind: typeof AUTHORING_EDIT_HOST_BRIDGE_KIND;
  readonly host: AuthoringEditHostV1;
  readonly journal: WorldChangeJournalV1;
}

export function createAuthoringEditHostBridgeV1(input: {
  readonly authoringSpec: AuthoringSpecV4;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly worldPackageBuildContext: CanonicalWorldPackageBuildContextV1;
  readonly resourceArtifacts: readonly ResolvedCanonicalWorldPackageResourceArtifactV1[];
  readonly nowUnixMilliseconds?: () => number;
  readonly runtimeHost?: Pick<RuntimeHost, "publishWorldReplacementV1">;
  readonly publishRuntimeReplacement?: PublishRuntimeReplacementV1;
  readonly leaseStore?: PreparedCandidateLeaseStoreV1;
  readonly evaluateRequiredGates?: EvaluateRequiredGatesV1;
  readonly session?: AuthoringEditSessionV1;
  readonly journal?: WorldChangeJournalV1;
}): AuthoringEditHostBridgeV1 {
  if (
    !isEqual(
      input.worldPackageBuildContext.hostCompatibility,
      BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
    )
  ) {
    throw new Error("WORLD_PACKAGE_HOST_INCOMPATIBLE: RuntimeHost profile mismatch");
  }
  const lockEntries = builtInRegistryLockEntriesV1();
  if (!isNil(input.runtimeHost) && !isNil(input.publishRuntimeReplacement)) {
    throw new Error(
      "WORLD_CHANGE_RUNTIME_PUBLICATION_PORT_CONFLICT: Bind exactly one Runtime publication port.",
    );
  }
  const nowUnixMilliseconds = isNil(input.nowUnixMilliseconds)
    ? () => Date.now()
    : input.nowUnixMilliseconds;
  const journal = isNil(input.journal)
    ? createWorldChangeJournalV1()
    : input.journal;
  const authoringSpecHash = hashAuthoringDocumentV4(input.authoringSpec) as Sha256HashV1;
  const existingHead = getAuthoringRevisionHeadV1(journal, input.authoringSpec.id);
  if (isNil(existingHead)) {
    seedAuthoringRevisionHeadV1(journal, {
      worldId: input.authoringSpec.id,
      revisionRef: `revision://${input.authoringSpec.id}/1`,
      authoringSpec: input.authoringSpec,
      authoringSpecHash,
    });
  } else if (existingHead.authoringSpecHash !== authoringSpecHash) {
    throw new Error(
      "WORLD_CHANGE_JOURNAL_HEAD_MISMATCH: Injected journal head does not match the Host AuthoringSpec.",
    );
  }
  const resolved = builtInSubjectResourceRegistry.resolveAiSchemaProjectionProfile(
    CONSTRAINED_JSON_PROFILE_REF,
  );
  if (isNil(resolved)) {
    throw new RangeError("Constrained JSON AI Schema projection profile is not registered.");
  }
  const host = createAuthoringEditHostV1({
    journal,
    leaseStore: isNil(input.leaseStore)
      ? createPreparedCandidateLeaseStoreV1()
      : input.leaseStore,
    worldPackageStore: input.worldPackageStore,
    worldPackageBuildContext: input.worldPackageBuildContext,
    resourceArtifacts: input.resourceArtifacts,
    session: isNil(input.session)
      ? createAuthoringEditHostSessionV1({
        worldId: input.authoringSpec.id,
        nowUnixMilliseconds: nowUnixMilliseconds(),
        lockEntries,
      })
      : input.session,
    nowUnixMilliseconds,
    projectionProfile: parseAiSchemaProjectionProfileSourceV1(resolved),
    canonicalAuthoringSchema,
    registryLockEntries: lockEntries,
    allowedCapabilityRefs: lockEntries
      .filter((entry) => entry.resourceKind === "capability")
      .map((entry) => entry.resourceRef),
    definitionOverrideOwners: [],
    definitionOverrideLockEntries: [],
    projectionAllowedOverridePaths: [...FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1],
    allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
    ...(isNil(input.evaluateRequiredGates)
      ? {}
      : { evaluateRequiredGates: input.evaluateRequiredGates }),
    ...(!isNil(input.publishRuntimeReplacement)
      ? { publishRuntimeReplacement: input.publishRuntimeReplacement }
      : !isNil(input.runtimeHost)
      ? { publishRuntimeReplacement: bindRuntimeHostPublicationPortV1(input.runtimeHost) }
      : {}),
  });
  return {
    kind: AUTHORING_EDIT_HOST_BRIDGE_KIND,
    host,
    journal,
  };
}
