import {
  parseAiSchemaProjectionRequestV1,
  parseRegistrySearchRequestV1,
  parseWorldChangeCleanupReportQueryV1,
  parseWorldChangeDiffRequestV1,
  parseWorldChangeExplainRequestV1,
  parseWorldChangeReceiptQueryV1,
  parseWorldChangeRequestV1,
  projectAiSchemaV1,
  searchRegistryV1,
  type AiSchemaProjectionRequestV1,
  type AiSchemaProjectionV1,
  type RegistrySearchRequestV1,
  type RegistrySearchReceiptV1,
  type WorldChangeApplyRequestV1,
  type WorldChangeCleanupReportQueryV1,
  type WorldChangeCleanupReportV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeDiffRequestV1,
  type WorldChangeDiffV1,
  type WorldChangeDryRunRequestV1,
  type WorldChangeExplainRequestV1,
  type WorldChangeExplainV1,
  type WorldChangeOperationTypeV1,
  type DefinitionOverrideLockEntryV1,
  type DefinitionOverrideOwnerV1,
  type WorldChangeReceiptQueryV1,
  type WorldChangeReceiptV1,
  type WorldChangeValidateRequestV1,
  type WorldkitAuthoringEditApiV1,
} from "@whitebox-world/authoring-edit";
import { isNil } from "lodash-es";
import type {
  ResolvedWorldPackageResourceArtifactV2,
  WorldPackageBuildContextV2,
  WorldPackageStoreV1,
} from "@whitebox-world/world-package";

import { worldChangeDiagnostic } from "./diagnostics.js";
import {
  journalArtifactIdV1,
  getDurableRequestRecordV1,
  queryWorldChangeCleanupReportV1,
  queryWorldChangeDiffV1,
  queryWorldChangeExplainV1,
  queryWorldChangeReceiptV1,
  recoverWorldChangeRequestV1,
  sessionAuthorizationDiagnosticV1,
  submitWorldChangeRequestV1,
} from "./journal/index.js";
import type {
  AuthoringEditSessionV1,
  PublishRuntimeReplacementV1,
  WorldChangeJournalV1,
} from "./journal/index.js";
import type {
  EvaluateRequiredGatesV1,
  PreparedCandidateLeaseStoreV1,
} from "./types.js";

export class AuthoringEditHostErrorV1 extends Error {
  readonly name = "AuthoringEditHostErrorV1";
  readonly code: string;
  readonly diagnostics: readonly WorldChangeDiagnosticV1[];

  constructor(
    code: string,
    message: string,
    diagnostics: readonly WorldChangeDiagnosticV1[] = [],
  ) {
    super(message);
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export interface AuthoringEditHostV1 extends WorldkitAuthoringEditApiV1 {
  currentSession(): AuthoringEditSessionV1;
  replaceSession(session: AuthoringEditSessionV1): void;
  mutateSession(patch: Partial<AuthoringEditSessionV1>): void;
  advanceAuthorizationEpoch(): void;
  revokeSession(): void;
}

export interface CreateAuthoringEditHostInputV1 {
  readonly journal: WorldChangeJournalV1;
  readonly leaseStore: PreparedCandidateLeaseStoreV1;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly worldPackageBuildContext: WorldPackageBuildContextV2;
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV2[];
  readonly session: AuthoringEditSessionV1;
  readonly nowUnixMilliseconds: () => number;
  readonly projectionProfile: unknown;
  readonly canonicalAuthoringSchema: unknown;
  readonly registryLockEntries: readonly unknown[];
  readonly allowedCapabilityRefs: readonly string[];
  readonly definitionOverrideOwners: readonly DefinitionOverrideOwnerV1[];
  readonly definitionOverrideLockEntries: readonly DefinitionOverrideLockEntryV1[];
  readonly projectionAllowedOverridePaths: readonly string[];
  readonly allowedWorldChangeOperationTypes: readonly WorldChangeOperationTypeV1[];
  readonly includeExperimental?: boolean;
  readonly publishRuntimeReplacement?: PublishRuntimeReplacementV1;
  readonly evaluateRequiredGates?: EvaluateRequiredGatesV1;
}

function throwDiagnostics(
  code: string,
  message: string,
  diagnostics: readonly WorldChangeDiagnosticV1[],
): never {
  throw new AuthoringEditHostErrorV1(code, message, diagnostics);
}

function throwIfAuthorization(
  diagnostic: WorldChangeDiagnosticV1 | undefined,
): void {
  if (isNil(diagnostic)) return;
  throw new AuthoringEditHostErrorV1(diagnostic.code, diagnostic.message, [diagnostic]);
}

function authorizeRead(
  session: AuthoringEditSessionV1,
  expectedSessionId: string,
  requiredScopes: readonly AuthoringEditSessionV1["scopes"][number][],
  nowUnixMilliseconds: number,
): void {
  throwIfAuthorization(
    sessionAuthorizationDiagnosticV1({
      session,
      expectedSessionId,
      requiredScopes,
      nowUnixMilliseconds,
    }),
  );
}

export function createAuthoringEditHostV1(
  input: CreateAuthoringEditHostInputV1,
): AuthoringEditHostV1 {
  const session: AuthoringEditSessionV1 = { ...input.session };
  const includeExperimental = input.includeExperimental === true;

  const submissionInput = (
    request: ReturnType<typeof parseWorldChangeRequestV1>,
  ) => ({
      journal: input.journal,
      leaseStore: input.leaseStore,
      worldPackageStore: input.worldPackageStore,
      worldPackageBuildContext: input.worldPackageBuildContext,
      resourceArtifacts: input.resourceArtifacts,
      request,
      session,
      nowUnixMilliseconds: input.nowUnixMilliseconds(),
      overrideValidation: {
        definitionOwners: input.definitionOverrideOwners,
        projectionAllowedOverridePaths: input.projectionAllowedOverridePaths,
        hostPolicyAllowedOverridePaths: session.policy.allowedOverridePaths,
        registryLockEntries: input.definitionOverrideLockEntries,
        allowedCapabilityRefs: input.allowedCapabilityRefs,
      },
      ...(isNil(input.evaluateRequiredGates)
        ? {}
        : { evaluateRequiredGates: input.evaluateRequiredGates }),
      ...(isNil(input.publishRuntimeReplacement)
        ? {}
        : { publishRuntimeReplacement: input.publishRuntimeReplacement }),
    });

  const submit = (request: ReturnType<typeof parseWorldChangeRequestV1>) => {
    const requestInput = submissionInput(request);
    const existing = getDurableRequestRecordV1(
      input.journal,
      request.authoringEditSessionId,
      request.id,
    );
    return !isNil(existing) && isNil(existing.receipt)
      ? recoverWorldChangeRequestV1(requestInput)
      : submitWorldChangeRequestV1(requestInput);
  };

  const receiptFromSubmit = async (
    request: ReturnType<typeof parseWorldChangeRequestV1>,
  ): Promise<WorldChangeReceiptV1> => {
    const submitted = await submit(request);
    if (submitted.status === "crashed") {
      throw new AuthoringEditHostErrorV1(
        "WORLD_CHANGE_JOURNAL_CRASHED",
        `WorldChange journal crashed after '${submitted.state}'.`,
      );
    }
    return submitted.receipt;
  };

  return {
    version: 1,

    currentSession() {
      return session;
    },

    replaceSession(next) {
      Object.assign(session, next);
    },

    mutateSession(patch) {
      Object.assign(session, patch);
    },

    advanceAuthorizationEpoch() {
      Object.assign(session, {
        authorizationEpoch: session.authorizationEpoch + 1,
      });
    },

    revokeSession() {
      Object.assign(session, { isActive: false });
    },

    async projectAiSchema(
      request: AiSchemaProjectionRequestV1,
    ): Promise<AiSchemaProjectionV1> {
      const parsed = parseAiSchemaProjectionRequestV1(request);
      authorizeRead(
        session,
        parsed.authoringEditSessionId,
        ["authoring.schema.read"],
        input.nowUnixMilliseconds(),
      );
      if (parsed.projectionProfileRef !== session.policy.projectionProfileRef) {
        const diagnostic = worldChangeDiagnostic(
          "AI_SCHEMA_PROFILE_NOT_ALLOWED",
          "/projectionProfileRef",
          "Request Profile is not the Host-selected projection Profile.",
        );
        throwDiagnostics(diagnostic.code, diagnostic.message, [diagnostic]);
      }
      const projected = projectAiSchemaV1({
        projectionId: journalArtifactIdV1("projection", parsed.id),
        request: parsed,
        projectionProfile: input.projectionProfile,
        canonicalAuthoringSchema: input.canonicalAuthoringSchema,
        registryLockEntries: input.registryLockEntries,
        allowedCapabilityRefs: input.allowedCapabilityRefs,
        allowedWorldChangeOperationTypes: input.allowedWorldChangeOperationTypes,
        includeExperimental,
      });
      if (projected.status !== "accepted") {
        throwDiagnostics(
          projected.diagnostics[0]?.code ?? "AI_SCHEMA_PROFILE_NOT_ALLOWED",
          projected.diagnostics[0]?.message ?? "AI Schema projection was rejected.",
          projected.diagnostics,
        );
      }
      return projected.projection;
    },

    async searchRegistry(
      request: RegistrySearchRequestV1,
    ): Promise<RegistrySearchReceiptV1> {
      const parsed = parseRegistrySearchRequestV1(request);
      authorizeRead(
        session,
        parsed.authoringEditSessionId,
        ["authoring.registry.read"],
        input.nowUnixMilliseconds(),
      );
      if (parsed.registryLockHash !== session.policy.registryLockHash) {
        const diagnostic = worldChangeDiagnostic(
          "REGISTRY_SEARCH_LOCK_MISMATCH",
          "/registryLockHash",
          "Registry Search request is not bound to the Host-selected Registry Lock.",
        );
        throwDiagnostics(diagnostic.code, diagnostic.message, [diagnostic]);
      }
      const searched = searchRegistryV1({
        receiptId: journalArtifactIdV1("search", parsed.id),
        request: parsed,
        projectionProfile: input.projectionProfile,
        registryLockEntries: input.registryLockEntries,
        allowedCapabilityRefs: input.allowedCapabilityRefs,
        includeExperimental,
      });
      if (searched.status !== "accepted") {
        throwDiagnostics(
          searched.diagnostics[0]?.code ?? "REGISTRY_SEARCH_LOCK_MISMATCH",
          searched.diagnostics[0]?.message ?? "Registry Search was rejected.",
          searched.diagnostics,
        );
      }
      return searched.receipt;
    },

    async validateWorldChange(
      request: WorldChangeValidateRequestV1,
    ): Promise<WorldChangeReceiptV1> {
      return receiptFromSubmit(parseWorldChangeRequestV1(request));
    },

    async dryRunWorldChange(
      request: WorldChangeDryRunRequestV1,
    ): Promise<WorldChangeReceiptV1> {
      return receiptFromSubmit(parseWorldChangeRequestV1(request));
    },

    async applyWorldChange(
      request: WorldChangeApplyRequestV1,
    ): Promise<WorldChangeReceiptV1> {
      return receiptFromSubmit(parseWorldChangeRequestV1(request));
    },

    async getWorldChangeReceipt(
      request: WorldChangeReceiptQueryV1,
    ): Promise<WorldChangeReceiptV1> {
      const query = parseWorldChangeReceiptQueryV1(request);
      const result = queryWorldChangeReceiptV1({
        journal: input.journal,
        session,
        query,
        nowUnixMilliseconds: input.nowUnixMilliseconds(),
      });
      if (result.status === "found") return result.receipt;
      if (result.status === "rejected") {
        throwDiagnostics(
          result.diagnostics[0]?.code ?? "WORLD_CHANGE_AUTHORIZATION_STALE",
          result.diagnostics[0]?.message ?? "WorldChange Receipt query was rejected.",
          result.diagnostics,
        );
      }
      if (result.status === "pending") {
        throw new AuthoringEditHostErrorV1(
          "WORLD_CHANGE_RECEIPT_PENDING",
          `WorldChange Request '${query.requestId}' is still '${result.state}'.`,
        );
      }
      throw new AuthoringEditHostErrorV1(
        "WORLD_CHANGE_RECEIPT_MISSING",
        `No durable WorldChange Receipt exists for '${query.requestId}'.`,
      );
    },

    async getWorldChangeCleanupReport(
      request: WorldChangeCleanupReportQueryV1,
    ): Promise<WorldChangeCleanupReportV1> {
      const query = parseWorldChangeCleanupReportQueryV1(request);
      const result = queryWorldChangeCleanupReportV1({
        journal: input.journal,
        session,
        query,
        nowUnixMilliseconds: input.nowUnixMilliseconds(),
      });
      if (result.status === "found") return result.report;
      if (result.status === "rejected") {
        throwDiagnostics(
          result.diagnostics[0]?.code ?? "WORLD_CHANGE_AUTHORIZATION_STALE",
          result.diagnostics[0]?.message ?? "Cleanup Report query was rejected.",
          result.diagnostics,
        );
      }
      throw new AuthoringEditHostErrorV1(
        "WORLD_CHANGE_CLEANUP_REPORT_MISSING",
        `No Cleanup Report exists for '${query.cleanupOperationId}'.`,
      );
    },

    async explainWorldChange(
      request: WorldChangeExplainRequestV1,
    ): Promise<WorldChangeExplainV1> {
      const parsed = parseWorldChangeExplainRequestV1(request);
      const result = queryWorldChangeExplainV1({
        journal: input.journal,
        session,
        request: parsed,
        nowUnixMilliseconds: input.nowUnixMilliseconds(),
      });
      if (result.status === "found") return result.explain;
      if (result.status === "rejected") {
        throwDiagnostics(
          result.diagnostics[0]?.code ?? "WORLD_CHANGE_AUTHORIZATION_STALE",
          result.diagnostics[0]?.message ?? "WorldChange Explain query was rejected.",
          result.diagnostics,
        );
      }
      if (result.status === "pending") {
        throw new AuthoringEditHostErrorV1(
          "WORLD_CHANGE_RECEIPT_PENDING",
          `WorldChange Request '${parsed.requestId}' is still '${result.state}'.`,
        );
      }
      throw new AuthoringEditHostErrorV1(
        "WORLD_CHANGE_EXPLAIN_MISSING",
        `No WorldChange Explain exists for '${parsed.requestId}'.`,
      );
    },

    async diffWorldChange(
      request: WorldChangeDiffRequestV1,
    ): Promise<WorldChangeDiffV1> {
      const parsed = parseWorldChangeDiffRequestV1(request);
      const result = queryWorldChangeDiffV1({
        journal: input.journal,
        session,
        request: parsed,
        nowUnixMilliseconds: input.nowUnixMilliseconds(),
      });
      if (result.status === "found") return result.diff;
      if (result.status === "rejected") {
        throwDiagnostics(
          result.diagnostics[0]?.code ?? "WORLD_CHANGE_AUTHORIZATION_STALE",
          result.diagnostics[0]?.message ?? "WorldChange Diff query was rejected.",
          result.diagnostics,
        );
      }
      if (result.status === "pending") {
        throw new AuthoringEditHostErrorV1(
          "WORLD_CHANGE_RECEIPT_PENDING",
          `WorldChange Request '${parsed.requestId}' is still '${result.state}'.`,
        );
      }
      throw new AuthoringEditHostErrorV1(
        "WORLD_CHANGE_DIFF_MISSING",
        `No WorldChange Diff exists for '${parsed.requestId}'.`,
      );
    },
  };
}
