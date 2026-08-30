import type { BabylonNativeSceneBootstrapV1 } from
  "@whitebox-world/runtime-contracts";
import { isEmpty, isNil } from "lodash-es";

import type { BabylonNativeLockedAssetResolverV1 } from "./assets.js";
import {
  admitBabylonNativeSceneCandidateV1,
  type BabylonNativeSceneAdmissionBudgetV1,
  type BabylonNativeSceneCandidateAdmissionResultV1,
  type BabylonNativeSceneCandidateV1,
} from "./candidate-admission.js";
import {
  canonicalBabylonNativeSceneContributionBytesV1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeSceneContributionV1,
  type BabylonNativeSceneContributionV1,
} from "./contribution.js";
import {
  parseNativeSceneCheckResultV1,
  parseNativeSceneDiagnosticV1,
  type NativeSceneCheckResultV1,
  type NativeSceneDiagnosticV1,
} from "./diagnostics.js";
import type { BabylonNativeSceneModuleV1 } from "./module.js";

export interface BabylonNativeSceneCandidateLeaseV1
  extends BabylonNativeSceneCandidateV1 {
  dispose(): void | Promise<void>;
}

export interface BabylonNativeSceneCandidateFactoryV1 {
  createCandidate():
    | BabylonNativeSceneCandidateLeaseV1
    | Promise<BabylonNativeSceneCandidateLeaseV1>;
}

export interface ReplayBabylonNativeSceneModuleInputV1 {
  readonly candidateFactory: BabylonNativeSceneCandidateFactoryV1;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly module: BabylonNativeSceneModuleV1;
  readonly assets: BabylonNativeLockedAssetResolverV1;
  readonly budget: BabylonNativeSceneAdmissionBudgetV1;
}

type PassedNativeSceneCheckResultV1 = NativeSceneCheckResultV1 &
  Readonly<{ outcome: "passed" }>;
type FailedNativeSceneCheckResultV1 = NativeSceneCheckResultV1 &
  Readonly<{ outcome: "rejected" | "tool-error" }>;

export type ReplayBabylonNativeSceneModuleResultV1 =
  | Readonly<{
      checkResult: PassedNativeSceneCheckResultV1;
      contribution: BabylonNativeSceneContributionV1;
      contributionHash: `sha256:${string}`;
    }>
  | Readonly<{
      checkResult: FailedNativeSceneCheckResultV1;
    }>;

interface CandidateRunV1 {
  readonly admission: BabylonNativeSceneCandidateAdmissionResultV1 | undefined;
  readonly toolingDiagnostics: readonly NativeSceneDiagnosticV1[];
}

function replayDiagnostic(
  bootstrap: BabylonNativeSceneBootstrapV1,
  input: Readonly<{
    code: string;
    stage: "runtime-replay" | "tooling";
    message: string;
    repairHint: string;
  }>,
): NativeSceneDiagnosticV1 {
  return parseNativeSceneDiagnosticV1({
    kind: "native-scene-diagnostic",
    schemaVersion: 1,
    id: `${bootstrap.id}.${input.code.toLowerCase()}`,
    severity: "error",
    stage: input.stage,
    code: input.code,
    location: { kind: "none" },
    measurement: { kind: "none" },
    message: input.message,
    repairHint: input.repairHint,
  });
}

function candidateCreateDiagnostic(
  bootstrap: BabylonNativeSceneBootstrapV1,
): NativeSceneDiagnosticV1 {
  return replayDiagnostic(bootstrap, {
    code: "WORLDKIT_NATIVE_SCENE_CANDIDATE_CREATE_FAILED",
    stage: "tooling",
    message: "Native Scene Candidate creation failed.",
    repairHint: "Repair the trusted Host Candidate factory.",
  });
}

function candidateCleanupDiagnostic(
  bootstrap: BabylonNativeSceneBootstrapV1,
): NativeSceneDiagnosticV1 {
  return replayDiagnostic(bootstrap, {
    code: "WORLDKIT_NATIVE_SCENE_CANDIDATE_CLEANUP_FAILED",
    stage: "tooling",
    message: "Native Scene Candidate cleanup failed.",
    repairHint: "Repair the trusted Host Candidate disposer.",
  });
}

function internalReplayDiagnostic(
  bootstrap: BabylonNativeSceneBootstrapV1,
): NativeSceneDiagnosticV1 {
  return replayDiagnostic(bootstrap, {
    code: "WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED",
    stage: "tooling",
    message: "Native Scene replay encountered an internal tooling failure.",
    repairHint: "Repair the trusted Host replay implementation.",
  });
}

function mismatchDiagnostic(
  bootstrap: BabylonNativeSceneBootstrapV1,
): NativeSceneDiagnosticV1 {
  return replayDiagnostic(bootstrap, {
    code: "WORLDKIT_NATIVE_SCENE_RUNTIME_REPLAY_MISMATCH",
    stage: "runtime-replay",
    message: "Native Scene Contribution changed across isolated runtime replay.",
    repairHint: "Remove retained state and make Module output deterministic.",
  });
}

function checkResult(
  bootstrap: BabylonNativeSceneBootstrapV1,
  outcome: NativeSceneCheckResultV1["outcome"],
  diagnostics: readonly NativeSceneDiagnosticV1[],
): NativeSceneCheckResultV1 {
  return parseNativeSceneCheckResultV1({
    kind: "native-scene-check-result",
    schemaVersion: 1,
    id: `${bootstrap.id}.runtime-replay-check`,
    checkedInput: {
      kind: "native-scene-module",
      sceneModuleRef: bootstrap.sceneModuleRef,
    },
    outcome,
    diagnostics,
  });
}

function failedResult(
  bootstrap: BabylonNativeSceneBootstrapV1,
  diagnostics: readonly NativeSceneDiagnosticV1[],
): ReplayBabylonNativeSceneModuleResultV1 {
  const outcome = diagnostics.some(({ stage }) => stage === "tooling")
    ? "tool-error"
    : "rejected";
  return Object.freeze({
    checkResult: checkResult(bootstrap, outcome, diagnostics) as
      FailedNativeSceneCheckResultV1,
  });
}

function isCandidateLease(
  input: unknown,
): input is BabylonNativeSceneCandidateLeaseV1 {
  if (typeof input !== "object" || isNil(input)) return false;
  const source = input as Partial<BabylonNativeSceneCandidateLeaseV1>;
  return typeof source.dispose === "function" &&
    typeof source.scene === "object" && !isNil(source.scene) &&
    typeof source.engine === "object" && !isNil(source.engine) &&
    source.scene.getEngine() === source.engine;
}

async function runCandidate(
  input: ReplayBabylonNativeSceneModuleInputV1,
): Promise<CandidateRunV1> {
  let lease: BabylonNativeSceneCandidateLeaseV1 | undefined;
  let admission: BabylonNativeSceneCandidateAdmissionResultV1 | undefined;
  const toolingDiagnostics: NativeSceneDiagnosticV1[] = [];
  try {
    try {
      const created = await input.candidateFactory.createCandidate();
      if (!isCandidateLease(created)) throw new TypeError("Invalid Candidate lease.");
      lease = created;
    } catch {
      toolingDiagnostics.push(candidateCreateDiagnostic(input.bootstrap));
      return Object.freeze({
        admission: undefined,
        toolingDiagnostics: Object.freeze(toolingDiagnostics),
      });
    }
    try {
      admission = await admitBabylonNativeSceneCandidateV1({
        candidate: lease,
        bootstrap: input.bootstrap,
        module: input.module,
        assets: input.assets,
        budget: input.budget,
      });
    } catch {
      toolingDiagnostics.push(internalReplayDiagnostic(input.bootstrap));
    }
  } finally {
    if (!isNil(lease)) {
      try {
        await lease.dispose();
      } catch {
        toolingDiagnostics.push(candidateCleanupDiagnostic(input.bootstrap));
      }
    }
  }
  return Object.freeze({
    admission,
    toolingDiagnostics: Object.freeze(toolingDiagnostics),
  });
}

function failureDiagnostics(run: CandidateRunV1): readonly NativeSceneDiagnosticV1[] {
  return Object.freeze([
    ...(run.admission?.outcome === "rejected"
      ? run.admission.diagnostics
      : []),
    ...run.toolingDiagnostics,
  ]);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export async function replayBabylonNativeSceneModuleV1(
  input: ReplayBabylonNativeSceneModuleInputV1,
): Promise<ReplayBabylonNativeSceneModuleResultV1> {
  const first = await runCandidate(input);
  const firstFailureDiagnostics = failureDiagnostics(first);
  if (!isEmpty(firstFailureDiagnostics)) {
    return failedResult(input.bootstrap, firstFailureDiagnostics);
  }
  if (first.admission?.outcome !== "passed") {
    return failedResult(input.bootstrap, [internalReplayDiagnostic(input.bootstrap)]);
  }

  const second = await runCandidate(input);
  const secondFailureDiagnostics = failureDiagnostics(second);
  if (!isEmpty(secondFailureDiagnostics)) {
    return failedResult(input.bootstrap, secondFailureDiagnostics);
  }
  if (second.admission?.outcome !== "passed") {
    return failedResult(input.bootstrap, [internalReplayDiagnostic(input.bootstrap)]);
  }

  try {
    const firstContribution = parseBabylonNativeSceneContributionV1(
      first.admission.contribution,
    );
    const secondContribution = parseBabylonNativeSceneContributionV1(
      second.admission.contribution,
    );
    const firstBytes = canonicalBabylonNativeSceneContributionBytesV1(
      firstContribution,
    );
    const secondBytes = canonicalBabylonNativeSceneContributionBytesV1(
      secondContribution,
    );
    if (!bytesEqual(firstBytes, secondBytes)) {
      return failedResult(input.bootstrap, [mismatchDiagnostic(input.bootstrap)]);
    }
    const contributionHash = hashBabylonNativeSceneContributionV1(
      firstContribution,
    );
    return Object.freeze({
      checkResult: checkResult(input.bootstrap, "passed", []) as
        PassedNativeSceneCheckResultV1,
      contribution: firstContribution,
      contributionHash,
    });
  } catch {
    return failedResult(input.bootstrap, [internalReplayDiagnostic(input.bootstrap)]);
  }
}
