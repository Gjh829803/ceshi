import { type WorldBuildIdentityV1 } from "@whitebox-world/world-identity";

import type { Sha256HashV1 } from "@whitebox-world/protocol";

import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import type { ApplyWorldChangeSetResultV1 } from "@whitebox-world/authoring-edit";
import type {
  AuthoringEditPolicyProjectionV1,
  AuthoringEditScopeV1,
  PreparedCandidatePinV1,
  RuntimePublicationExpectationV1,
  RuntimePublicationIdentityV1,
  WorldChangeCleanupReportQueryV1,
  WorldChangeCleanupReportV1,
  WorldChangeDiagnosticV1,
  WorldChangeDiffRequestV1,
  WorldChangeDiffV1,
  WorldChangeExplainRequestV1,
  WorldChangeExplainV1,
  WorldChangeBuildIdentityV1,
  WorldChangeReceiptQueryV1,
  WorldChangeReceiptV1,
  WorldChangeRequestV1,
  WorldChangeOverrideValidationContextV1,
  WorldChangeValidationReportBindingV1,
} from "@whitebox-world/authoring-edit";
import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import type {
  CanonicalSceneExecutionPlanV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type {
  ResolvedCanonicalWorldPackageResourceArtifactV1,
  CanonicalWorldPackageBuildContextV1,
  WorldPackageStoreV1,
} from "@whitebox-world/world-package";

import type {
  EvaluateRequiredGatesV1,
  PreparedCandidateLeaseStoreV1,
} from "../types.js";

export const DURABLE_REQUEST_STATES_V1 = [
  "received",
  "validating",
  "building-candidate",
  "candidate-ready",
  "committing",
  "preparing-runtime",
  "validated",
  "dry-run-succeeded",
  "committed",
  "rejected",
] as const;

export type DurableRequestStateV1 = (typeof DURABLE_REQUEST_STATES_V1)[number];

export const TERMINAL_REQUEST_STATES_V1 = [
  "validated",
  "dry-run-succeeded",
  "committed",
  "rejected",
] as const;

export type TerminalRequestStateV1 = (typeof TERMINAL_REQUEST_STATES_V1)[number];

export interface AuthoringEditSessionV1 {
  readonly authoringEditSessionId: string;
  readonly authorizationEpoch: number;
  readonly isActive: boolean;
  readonly expiresAtUnixMilliseconds: number;
  readonly scopes: readonly AuthoringEditScopeV1[];
  readonly policy: AuthoringEditPolicyProjectionV1;
  readonly hasActiveRuntimeBinding: boolean;
}

export interface AuthoringRevisionHeadV1 {
  readonly worldId: string;
  readonly revisionRef: string;
  readonly authoringSpec: AuthoringSpecV4;
  readonly authoringSpecHash: Sha256HashV1;
}

export type AppliedWorldChangeV1 = Extract<
  ApplyWorldChangeSetResultV1,
  { status: "applied" }
>;

export interface DurableRequestRecordV1 {
  readonly request: WorldChangeRequestV1;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly authorizationEpoch: number;
  readonly changeSetHash: Sha256HashV1;
  readonly state: DurableRequestStateV1;
  readonly fencingToken: string;
  readonly pin?: PreparedCandidatePinV1;
  readonly preparedCandidateRef?: string;
  readonly applied?: AppliedWorldChangeV1;
  readonly buildIdentity?: WorldChangeBuildIdentityV1;
  readonly validationReports?: readonly WorldChangeValidationReportBindingV1[];
  readonly validationReportsHash?: Sha256HashV1;
  readonly requiredGateProfileRefs?: readonly string[];
  readonly preparedCandidateCreatedAtUnixMilliseconds?: number;
  readonly preparedCandidateSizeBytes?: number;
  readonly expiresAtUnixMilliseconds?: number;
  readonly receipt?: WorldChangeReceiptV1;
  readonly pendingRevisionRef?: string;
  readonly commitRecord?: Readonly<{
    readonly revisionRef: string;
    readonly authoringSpecHash: Sha256HashV1;
  }>;
  readonly diff?: WorldChangeDiffV1;
}

export interface WorldChangeJournalV1 {
  readonly brand: "WorldChangeJournalV1";
}

export type WorldPublicationRecoveryStatusV1 = "pending" | "recovered";

export type WorldChangeJournalTransactionOperationV1 =
  | {
      readonly type: "request-record-put";
      readonly key: string;
      readonly record: DurableRequestRecordV1;
    }
  | {
      readonly type: "change-set-hash-lock";
      readonly key: string;
      readonly changeSetHash: Sha256HashV1;
    }
  | {
      readonly type: "revision-head-put";
      readonly key: string;
      readonly head: AuthoringRevisionHeadV1;
    }
  | {
      readonly type: "revision-sequence-set";
      readonly revisionSequence: number;
    }
  | {
      readonly type: "cleanup-report-put";
      readonly key: string;
      readonly report: WorldChangeCleanupReportV1;
    }
  | {
      readonly type: "publication-recovery-state-put";
      readonly worldId: string;
      readonly requestId: string;
      readonly status: WorldPublicationRecoveryStatusV1;
    }
  | {
      readonly type: "recovery-fencing-token-set";
      readonly fencingToken: string;
    };

export interface WorldChangeJournalTransactionV1 {
  readonly kind: "worldkit-world-change-journal-transaction";
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly previousTransactionHash: Sha256HashV1;
  readonly operations: readonly WorldChangeJournalTransactionOperationV1[];
  readonly transactionHash: Sha256HashV1;
}

export interface WorldChangeJournalWalV1 {
  readonly brand: "WorldChangeJournalWalV1";
  readTransactions(): readonly WorldChangeJournalTransactionV1[];
  appendTransaction(transaction: WorldChangeJournalTransactionV1): void;
}

export interface CreateWorldChangeJournalInputV1 {
  readonly wal?: WorldChangeJournalWalV1;
}

export type DurableCrashAfterStateV1 =
  | "received"
  | "validating"
  | "building-candidate"
  | "candidate-ready"
  | "committing"
  | "preparing-runtime";

export type PublishRuntimeReplacementFailureKindV1 =
  | "expectation-stale"
  | "publication-mode-unsupported"
  | "capacity-exceeded"
  | "prepare-failed"
  | "publication-conflict"
  | "commit-failed";

export interface TrustedRuntimeWorldConfigurationV1 {
  readonly worldBuildIdentity: WorldBuildIdentityV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly sceneSource: Readonly<{
    readonly kind: "canonical-execution-plan";
    readonly executionPlan: CanonicalSceneExecutionPlanV1;
    readonly executionPlanHash: Sha256HashV1;
  }>;
}

export type PublishRuntimeReplacementResultV1 =
  | {
      readonly status: "published";
      readonly previous: RuntimePublicationIdentityV1;
      readonly current: RuntimePublicationIdentityV1;
      readonly cleanupStatus: "released" | "quarantined";
      readonly cleanupDiagnostics: readonly WorldChangeDiagnosticV1[];
    }
  | {
      readonly status: "rejected";
      readonly failureKind: PublishRuntimeReplacementFailureKindV1;
      readonly message: string;
    };

export type PublishRuntimeReplacementV1 = (input: {
  readonly worldConfiguration: TrustedRuntimeWorldConfigurationV1;
  readonly publication: {
    readonly requestId: string;
    readonly requestHash: Sha256HashV1;
    readonly fencingToken: string;
    readonly runtimeExpectation: RuntimePublicationExpectationV1;
  };
  readonly persistDurableCommit: (identities: {
    readonly previous: RuntimePublicationIdentityV1;
    readonly current: RuntimePublicationIdentityV1;
  }) => () => void;
}) => Promise<PublishRuntimeReplacementResultV1>;

export interface RecoverCommittedRuntimePublicationPortV1 {
  recover(input: {
    readonly worldId: string;
    readonly requestId: string;
    readonly requestHash: Sha256HashV1;
    readonly worldConfiguration: TrustedRuntimeWorldConfigurationV1;
    readonly committedIdentity: RuntimePublicationIdentityV1;
  }): Promise<
    | {
        readonly status: "recovered";
        readonly identity: RuntimePublicationIdentityV1;
      }
    | {
        readonly status: "retryable" | "quarantined";
        readonly diagnostics: readonly WorldChangeDiagnosticV1[];
      }
  >;
  retryCleanup(input: {
    readonly cleanupOperationId: string;
    readonly previousWorldSessionId: string;
    readonly attemptCount: number;
  }): Promise<
    | { readonly status: "released" }
    | {
        readonly status: "retryable" | "quarantined";
        readonly diagnostics: readonly WorldChangeDiagnosticV1[];
      }
  >;
}

export interface SubmitWorldChangeRequestInputV1 {
  readonly journal: WorldChangeJournalV1;
  readonly leaseStore: PreparedCandidateLeaseStoreV1;
  readonly worldPackageStore: WorldPackageStoreV1;
  readonly worldPackageBuildContext: CanonicalWorldPackageBuildContextV1;
  readonly resourceArtifacts: readonly ResolvedCanonicalWorldPackageResourceArtifactV1[];
  readonly request: WorldChangeRequestV1;
  readonly session: AuthoringEditSessionV1;
  readonly nowUnixMilliseconds: number;
  readonly overrideValidation?: WorldChangeOverrideValidationContextV1;
  readonly evaluateRequiredGates?: EvaluateRequiredGatesV1;
  readonly publishRuntimeReplacement?: PublishRuntimeReplacementV1;
  readonly crashAfterState?: DurableCrashAfterStateV1;
}

export type SubmitWorldChangeRequestResultV1 =
  | {
      readonly status: "accepted";
      readonly receipt: WorldChangeReceiptV1;
    }
  | {
      readonly status: "crashed";
      readonly state: DurableRequestStateV1;
    };

export interface QueryWorldChangeReceiptInputV1 {
  readonly journal: WorldChangeJournalV1;
  readonly session: AuthoringEditSessionV1;
  readonly query: WorldChangeReceiptQueryV1;
  readonly nowUnixMilliseconds: number;
}

export type QueryWorldChangeReceiptResultV1 =
  | {
      readonly status: "found";
      readonly receipt: WorldChangeReceiptV1;
    }
  | {
      readonly status: "pending";
      readonly state: DurableRequestStateV1;
    }
  | {
      readonly status: "missing";
    }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };

export interface QueryWorldChangeExplainInputV1 {
  readonly journal: WorldChangeJournalV1;
  readonly session: AuthoringEditSessionV1;
  readonly request: WorldChangeExplainRequestV1;
  readonly nowUnixMilliseconds: number;
}

export type QueryWorldChangeExplainResultV1 =
  | {
      readonly status: "found";
      readonly explain: WorldChangeExplainV1;
    }
  | {
      readonly status: "pending";
      readonly state: DurableRequestStateV1;
    }
  | {
      readonly status: "missing";
    }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };

export interface QueryWorldChangeDiffInputV1 {
  readonly journal: WorldChangeJournalV1;
  readonly session: AuthoringEditSessionV1;
  readonly request: WorldChangeDiffRequestV1;
  readonly nowUnixMilliseconds: number;
}

export type QueryWorldChangeDiffResultV1 =
  | {
      readonly status: "found";
      readonly diff: WorldChangeDiffV1;
    }
  | {
      readonly status: "pending";
      readonly state: DurableRequestStateV1;
    }
  | {
      readonly status: "missing";
    }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };

export interface QueryWorldChangeCleanupReportInputV1 {
  readonly journal: WorldChangeJournalV1;
  readonly session: AuthoringEditSessionV1;
  readonly query: WorldChangeCleanupReportQueryV1;
  readonly nowUnixMilliseconds: number;
}

export type QueryWorldChangeCleanupReportResultV1 =
  | {
      readonly status: "found";
      readonly report: WorldChangeCleanupReportV1;
    }
  | {
      readonly status: "missing";
    }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };
