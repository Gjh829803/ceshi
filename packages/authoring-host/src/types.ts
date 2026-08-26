import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import type {
  AuthoringEditPolicyProjectionV1,
  PreparedCandidatePinV1,
  Sha256HashV1,
  WorldChangeBuildIdentityV1,
  WorldChangeDiagnosticV1,
  WorldChangeFailurePhaseV1,
  WorldChangeValidationReportBindingV1,
} from "@whitebox-world/authoring-edit";
import type {
  ResolvedWorldPackageResourceArtifactV1,
  WorldPackageBuildReceiptV1,
} from "@whitebox-world/world-package";

export interface PreparedCandidateLeaseStoreV1 {
  readonly brand: "PreparedCandidateLeaseStoreV1";
}

export interface PreparedCandidateLeaseUsageV1 {
  readonly count: number;
  readonly bytes: number;
}

export interface RequiredGateEvaluationInputV1 {
  readonly requiredGateProfileRefs: readonly string[];
  readonly authoringSpec: AuthoringSpecV4;
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
}

export type RequiredGateEvaluationResultV1 =
  | {
      readonly status: "passed";
      readonly validationReports: readonly WorldChangeValidationReportBindingV1[];
    }
  | {
      readonly status: "failed";
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };

export type EvaluateRequiredGatesV1 = (
  input: RequiredGateEvaluationInputV1,
) => RequiredGateEvaluationResultV1;

export interface PrepareTrustedCandidateInputV1 {
  readonly candidateAuthoringSpec: AuthoringSpecV4;
  readonly policy: AuthoringEditPolicyProjectionV1;
  readonly store: PreparedCandidateLeaseStoreV1;
  readonly nowUnixMilliseconds: number;
  readonly resourceArtifacts?: readonly ResolvedWorldPackageResourceArtifactV1[];
  readonly evaluateRequiredGates?: EvaluateRequiredGatesV1;
}

export type PrepareTrustedCandidateResultV1 =
  | {
      readonly status: "prepared";
      readonly preparedCandidateRef: string;
      readonly preparedCandidateExpiresAtUnixMilliseconds: number;
      readonly authoringEditPolicyHash: Sha256HashV1;
      readonly buildIdentity: WorldChangeBuildIdentityV1;
      readonly sizeBytes: number;
    }
  | {
      readonly status: "rejected";
      readonly failurePhase: WorldChangeFailurePhaseV1;
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };

export interface PreparedCandidateLeaseV1 {
  readonly preparedCandidateRef: string;
  readonly worldId: string;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly requiredGateProfileRefs: readonly string[];
  readonly buildIdentity: WorldChangeBuildIdentityV1;
  readonly candidateAuthoringSpec: AuthoringSpecV4;
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
  readonly sizeBytes: number;
  readonly createdAtUnixMilliseconds: number;
  readonly expiresAtUnixMilliseconds: number;
  readonly pin?: PreparedCandidatePinV1;
}

export interface PinPreparedCandidateInputV1 {
  readonly store: PreparedCandidateLeaseStoreV1;
  readonly preparedCandidateRef: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
  readonly requestHash: Sha256HashV1;
  readonly authoringEditPolicyHash: Sha256HashV1;
  readonly nowUnixMilliseconds: number;
}

export type PinPreparedCandidateResultV1 =
  | {
      readonly status: "pinned";
      readonly pin: PreparedCandidatePinV1;
    }
  | {
      readonly status: "rejected";
      readonly failurePhase: WorldChangeFailurePhaseV1;
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };

export interface ReleasePreparedCandidatePinInputV1 {
  readonly store: PreparedCandidateLeaseStoreV1;
  readonly preparedCandidateRef: string;
  readonly requestId: string;
  readonly nowUnixMilliseconds: number;
}

export type LookupPreparedCandidateResultV1 =
  | {
      readonly status: "found";
      readonly lease: PreparedCandidateLeaseV1;
    }
  | {
      readonly status: "missing";
    };
