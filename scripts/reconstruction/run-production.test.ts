import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  formalWorldCaptureIntentCanonicalBytesV1,
  hashFormalWorldCaptureIntentV1,
  parseFormalWorldCaptureIntentV1,
} from "@whitebox-world/runtime-contracts";
import {
  decideSceneAuthoringRouteV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionEvaluationResultV1,
  hashWorldReconstructionRunReceiptV1,
  getWorldReconstructionFinalEvaluatedAttemptV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionRunReceiptV1,
  worldReconstructionCaseCanonicalBytesV1,
  worldReconstructionEvaluationProfileCanonicalBytesV1,
  worldReconstructionEvaluationResultCanonicalBytesV1,
  worldReconstructionRunReceiptCanonicalBytesV1,
  type WorldReconstructionOutcomeV1,
  type WorldReconstructionRunReceiptV1,
} from "@whitebox-world/validation";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runWorldReconstructionProductionV1,
  createWorldReconstructionInputFreezerTestAdapterV1,
  type WorldReconstructionProductionOwnersV1,
} from "./run-production.js";
import type { WorldReconstructionCleanupOutcomesV1 } from "./run-journal.js";
import { NativeBlockFinalArtifactPublicationClosedErrorV1 } from
  "./final-artifact-publisher.js";
import { NativeBlockReconstructionVerificationClosedErrorV1 } from
  "../verification/verify-native-block-reconstruction-e2e.js";
import {
  decideNativeBlockReconstructionRouteV1,
  type WorldReconstructionHostRoutePolicyV1,
} from "./generation-request.js";
import { WorldReconstructionRunClosedErrorV1 } from "./run.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const REAL_CASE_ROOT = path.join(
  REPOSITORY_ROOT,
  "artifacts",
  "scenes",
  "cloud-temple-t-gate-native-block",
);
const REAL_HOST_CLOSURE_ROOT = path.join(
  REPOSITORY_ROOT,
  "apps",
  "playground",
  "public",
  "world-packages",
  "cloud-ridge",
);
const CASE_ID = "cloud-temple-t-gate-native-block";
const RUN_ID = "p-test-run";
const CASE_REF =
  `artifact://world-reconstruction-case/${CASE_ID}/case.json` as const;
const CASE_ARTIFACT_ROOT = CASE_REF.slice(0, -"/case.json".length);
const SCENE_BRIEF_HASH =
  "sha256:c1299a6f991a8292daf86fd7168213084e020bcb1d797429b049934544d5fce9" as const;

const H = (character: string): Sha256HashV1 =>
  `sha256:${character.repeat(64)}` as Sha256HashV1;

const COMPLETED_CLEANUP = Object.freeze({
  providerTask: "completed",
  candidate: "completed",
  hostedBrowserSession: "completed",
  viteServer: "completed",
  temporaryDirectories: "completed",
  outputPromotion: "completed",
}) satisfies WorldReconstructionCleanupOutcomesV1;

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

interface ProductionFixtureV1 {
  readonly repositoryRoot: string;
  readonly caseRoot: string;
  readonly casePath: string;
  readonly outputDirectoryPath: string;
}

async function fixture(): Promise<ProductionFixtureV1> {
  const requestedRepositoryRoot = await mkdtemp(
    path.join(tmpdir(), "worldkit-run-production-"),
  );
  const repositoryRoot = await realpath(requestedRepositoryRoot);
  temporaryRoots.push(repositoryRoot);
  const caseRoot = path.join(
    repositoryRoot,
    "artifacts",
    "scenes",
    CASE_ID,
  );
  await mkdir(path.dirname(caseRoot), { recursive: true });
  await cp(REAL_CASE_ROOT, caseRoot, { recursive: true });
  await rm(path.join(caseRoot, "runs"), { recursive: true, force: true });
  const hostClosureRoot = path.join(
    repositoryRoot,
    "apps",
    "playground",
    "public",
    "world-packages",
    "cloud-ridge",
  );
  await mkdir(path.dirname(hostClosureRoot), { recursive: true });
  await cp(REAL_HOST_CLOSURE_ROOT, hostClosureRoot, { recursive: true });
  return Object.freeze({
    repositoryRoot,
    caseRoot,
    casePath: path.join(caseRoot, "case.json"),
    outputDirectoryPath: path.join(caseRoot, "runs", RUN_ID),
  });
}

async function setQualityGateMode(
  value: ProductionFixtureV1,
  qualityGateMode: "report-only" | "required-for-publication",
): Promise<void> {
  const caseValue = parseWorldReconstructionCaseV1(JSON.parse(
    await readFile(value.casePath, "utf8"),
  ));
  const profilePath = path.join(
    value.caseRoot,
    caseValue.evaluationProfileRef,
  );
  const profile = parseWorldReconstructionEvaluationProfileV1({
    ...JSON.parse(await readFile(profilePath, "utf8")),
    qualityGateMode,
  });
  const joinedCase = parseWorldReconstructionCaseV1({
    ...caseValue,
    evaluationProfileHash:
      hashWorldReconstructionEvaluationProfileV1(profile),
  });
  await Promise.all([
    writeFile(
      profilePath,
      worldReconstructionEvaluationProfileCanonicalBytesV1(profile),
    ),
    writeFile(
      value.casePath,
      worldReconstructionCaseCanonicalBytesV1(joinedCase),
    ),
  ]);
}

function nativeRoute(): SceneAuthoringRouteDecisionV1 {
  return decideSceneAuthoringRouteV1({
    id: `${CASE_ID}-route`,
    sceneBriefRef: "scene-brief.md",
    sceneBriefHash: SCENE_BRIEF_HASH,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: sha256CanonicalJson({
      id: "trusted-local",
      version: 1,
    }) as Sha256HashV1,
    requiredCapabilityRefs: [],
    requestedSourceKind: "babylon-native",
    nativeTrustAdmitted: true,
    referenceDrivenDistinctiveSilhouette: true,
  });
}

async function receiptFor(
  value: ProductionFixtureV1,
  options: Readonly<{
    outcome?: WorldReconstructionOutcomeV1;
    cleanupOutcome?: "completed" | "failed";
  }> = {},
): Promise<WorldReconstructionRunReceiptV1> {
  const reconstructionCase = parseWorldReconstructionCaseV1(
    JSON.parse(await readFile(value.casePath, "utf8")),
  );
  const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(
    JSON.parse(await readFile(
      path.join(value.caseRoot, reconstructionCase.evaluationProfileRef),
      "utf8",
    )),
  );
  const requestedOutcome = options.outcome ?? "passed";
  const cleanupOutcome = options.cleanupOutcome ?? "completed";
  const terminalOutcome = cleanupOutcome === "failed"
    ? "incomplete"
    : requestedOutcome;
  const worldPackageRootHash = H("1");
  const evaluationResultRef =
    `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/0/evaluation.json`;
  return parseWorldReconstructionRunReceiptV1({
    kind: "world-reconstruction-run-receipt",
    schemaVersion: 1,
    id: `${CASE_ID}.${RUN_ID}`,
    caseRef: CASE_REF,
    caseHash: hashWorldReconstructionCaseV1(reconstructionCase),
    evaluationProfileRef: reconstructionCase.evaluationProfileRef,
    evaluationProfileHash:
      hashWorldReconstructionEvaluationProfileV1(evaluationProfile),
    outcome: terminalOutcome,
    diagnosticCodes: terminalOutcome === "passed"
      ? []
      : terminalOutcome === "failed"
        ? ["WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT"]
        : cleanupOutcome === "failed"
          ? ["WORLD_RECONSTRUCTION_CLEANUP_FAILED"]
          : ["WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING"],
    attempts: [{
      kind: "evaluated",
      attemptIndex: 0,
      generationRequestRef:
        `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/0/generation-request.json`,
      generationRequestHash: H("2"),
      generationReceiptRef:
        `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/0/generation-receipt.json`,
      generationReceiptHash: H("3"),
      sceneAuthoringAttemptRef:
        `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/0/attempt.json`,
      sceneAuthoringAttemptHash: H("4"),
      sceneAuthoringAttemptResultRef:
        `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/0/attempt-result.json`,
      sceneAuthoringAttemptResultHash: H("5"),
      worldPackageRef:
        `package://world-package/sha256/${worldPackageRootHash.slice("sha256:".length)}`,
      worldPackageRootHash,
      worldPackageBuildReceiptRef:
        "world-package://world-package-build-receipt.json",
      worldPackageBuildReceiptHash: H("6"),
      worldBuildIdentityRef: "world-package://world-build-identity.json",
      worldBuildIdentityHash: H("7"),
      captureReceiptRef:
        `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/0/capture/formal-world-capture-receipt.json`,
      captureReceiptHash: H("8"),
      evaluationResultRef,
      evaluationResultHash: H("9"),
      outcome: requestedOutcome,
    }],
    finalAttemptIndex: 0,
    finalEvaluationResultRef: evaluationResultRef,
    finalEvaluationResultHash: H("9"),
    cleanupOutcome,
  });
}

async function publishQualityEvaluationArtifacts(
  value: ProductionFixtureV1,
  baseReceipt: WorldReconstructionRunReceiptV1,
  qualityOutcome: "failed" | "incomplete" = "failed",
  hardFailure = false,
): Promise<Readonly<{
  receipt: WorldReconstructionRunReceiptV1;
  publishArtifacts: () => Promise<void>;
}>> {
  const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(baseReceipt);
  const acceptanceTargetRef = parseWorldReconstructionCaseV1(JSON.parse(
    await readFile(value.casePath, "utf8"),
  )).acceptanceTargetRefs[0]!;
  const failedDiagnostic = {
    kind: "world-reconstruction-diagnostic",
    schemaVersion: 1,
    id: "rejected-evaluation-opening-drift",
    code: "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
    dimensionId: "opening-composition",
    acceptanceTargetRef,
    targetRef: acceptanceTargetRef,
    targetId: "opening-target",
    metricId: "opening-region-min-x-basis-points",
    details: {
      kind: "basis-points-threshold",
      expectedBasisPoints: 1000,
      actualBasisPoints: 3000,
      maximumAllowedDriftBasisPoints: 1000,
      exceededByBasisPoints: 1000,
      correctionDirection: "decrease",
    },
    evidenceRefs: [`${CASE_ARTIFACT_ROOT}/evidence/opening.json`],
    message: "Opening target is outside the accepted region.",
    repairAction: {
      kind: "revise-native-source",
      operation: "resize",
      targetKind: "composition-target",
      targetId: "opening-target",
      instruction: "Resize the opening target.",
    },
  } as const;
  const incompleteDiagnostic = {
    kind: "world-reconstruction-diagnostic",
    schemaVersion: 1,
    id: "rejected-evaluation-critical-traversal-missing",
    code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
    dimensionId: "critical-traversal",
    acceptanceTargetRef,
    targetRef: acceptanceTargetRef,
    targetId: "opening-target",
    metricId: "critical-traversal-evidence",
    details: {
      kind: "presence-mismatch",
      expectedValue: "present",
      actualValue: "missing",
      correctionDirection: "add",
    },
    evidenceRefs: [`${CASE_ARTIFACT_ROOT}/evidence/critical-traversal.json`],
    message: "Required traversal evidence is missing.",
  } as const;
  const hardDiagnostic = {
    kind: "world-reconstruction-diagnostic",
    schemaVersion: 1,
    id: "rejected-evaluation-collider-missing",
    code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
    dimensionId: "collider",
    acceptanceTargetRef,
    targetRef: acceptanceTargetRef,
    targetId: "opening-target",
    metricId: "collider-contribution-presence",
    details: {
      kind: "presence-mismatch",
      expectedValue: "present",
      actualValue: "missing",
      correctionDirection: "add",
    },
    evidenceRefs: [`${CASE_ARTIFACT_ROOT}/evidence/collider.json`],
    message: "Required collider contribution is missing.",
    repairAction: {
      kind: "revise-native-source",
      operation: "add",
      targetKind: "static-collider",
      targetId: "opening-target",
      instruction: "Add the required explicit Collider contribution.",
    },
  } as const;
  const diagnostic = hardFailure
    ? hardDiagnostic
    : qualityOutcome === "failed"
      ? failedDiagnostic
      : incompleteDiagnostic;
  const affectedDimensionId = hardFailure
    ? "collider"
    : qualityOutcome === "failed"
      ? "opening-composition"
      : "critical-traversal";
  const dimensionIds = [
    "collider",
    "critical-traversal",
    "deterministic-build",
    "opening-composition",
    "semantic-silhouette",
    "spawn-support",
    "topology",
  ] as const;
  const evaluation = parseWorldReconstructionEvaluationResultV1({
    kind: "world-reconstruction-evaluation-result",
    schemaVersion: 1,
    id: `${CASE_ID}.attempt-0.evaluation-result`,
    caseRef: baseReceipt.caseRef,
    caseHash: baseReceipt.caseHash,
    evaluationProfileRef: baseReceipt.evaluationProfileRef,
    evaluationProfileHash: baseReceipt.evaluationProfileHash,
    evidenceSetRef: `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/0/evidence-set.json`,
    evidenceSetHash: H("a"),
    attemptRef: terminal.sceneAuthoringAttemptRef,
    attemptHash: terminal.sceneAuthoringAttemptHash,
    worldPackageRef: terminal.worldPackageRef,
    worldPackageRootHash: terminal.worldPackageRootHash,
    worldBuildIdentityRef: terminal.worldBuildIdentityRef,
    worldBuildIdentityHash: terminal.worldBuildIdentityHash,
    captureReceiptRef: terminal.captureReceiptRef,
    captureReceiptHash: terminal.captureReceiptHash,
    outcome: qualityOutcome,
    diagnostics: [diagnostic],
    dimensions: dimensionIds.map((dimensionId) => ({
      dimensionId,
      status: dimensionId === affectedDimensionId
        ? qualityOutcome
        : "passed",
      metrics: dimensionId === affectedDimensionId &&
          qualityOutcome === "incomplete"
        ? []
        : [{
            kind: "boolean-presence",
            isPresent: dimensionId !== affectedDimensionId,
          }],
      evidenceRefs: [`${CASE_ARTIFACT_ROOT}/evidence/${dimensionId}.json`],
      diagnosticIds: dimensionId === affectedDimensionId
        ? [diagnostic.id]
        : [],
      identity: {
        attemptHash: terminal.sceneAuthoringAttemptHash,
        worldPackageRootHash: terminal.worldPackageRootHash,
        worldBuildIdentityHash: terminal.worldBuildIdentityHash,
        captureReceiptHash: terminal.captureReceiptHash,
      },
    })),
  });
  const evaluationHash = hashWorldReconstructionEvaluationResultV1(evaluation);
  const receipt = parseWorldReconstructionRunReceiptV1({
    ...baseReceipt,
    outcome: qualityOutcome,
    attempts: baseReceipt.attempts.map((attempt) => ({
      ...attempt,
      outcome: qualityOutcome,
      evaluationResultHash: evaluationHash,
    })),
    finalEvaluationResultHash: evaluationHash,
  });
  const attemptDirectoryPath = path.join(
    value.outputDirectoryPath,
    "attempts",
    "0",
  );
  return Object.freeze({
    receipt,
    publishArtifacts: async () => {
      await Promise.all([
        mkdir(path.join(attemptDirectoryPath, "world-package"), { recursive: true }),
        mkdir(path.join(attemptDirectoryPath, "capture"), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(
          path.join(attemptDirectoryPath, "capture", "opening.png"),
          "opening",
        ),
        writeFile(
          path.join(
            attemptDirectoryPath,
            "capture",
            "formal-world-capture-receipt.json",
          ),
          "{}\n",
        ),
        writeFile(
          path.join(attemptDirectoryPath, "evaluation.json"),
          worldReconstructionEvaluationResultCanonicalBytesV1(evaluation),
        ),
      ]);
    },
  });
}

async function publishReceipt(
  outputDirectoryPath: string,
  receipt: WorldReconstructionRunReceiptV1,
): Promise<void> {
  await mkdir(outputDirectoryPath, { recursive: true });
  await writeFile(
    path.join(outputDirectoryPath, "run-receipt.json"),
    worldReconstructionRunReceiptCanonicalBytesV1(receipt),
  );
}

function ownersFor(
  value: ProductionFixtureV1,
  receipt: WorldReconstructionRunReceiptV1,
  overrides: Partial<WorldReconstructionProductionOwnersV1> = {},
) {
  const events: string[] = [];
  let frozenOwnerIdentities:
    Parameters<WorldReconstructionProductionOwnersV1["runCore"]>[0]["frozenOwnerIdentities"]
    | undefined;
  const corePorts = Object.freeze({
    owner: "production-core-ports",
    rehashOwnerIdentities: vi.fn(async () => {
      if (frozenOwnerIdentities === undefined) {
        throw new Error("test frozen owner identities were not captured");
      }
      return frozenOwnerIdentities;
    }),
    cleanup: vi.fn(async () => COMPLETED_CLEANUP),
  });
  const playability = Object.freeze({
    launch: vi.fn(async () => {
      throw new Error("test playability must be consumed by the verifier port");
    }),
  });
  const defaultRunCore: WorldReconstructionProductionOwnersV1["runCore"] =
    async (input, actualPorts) => {
      events.push("run-core");
      expect(actualPorts).toBe(corePorts);
      await publishReceipt(input.outputDirectoryPath, receipt);
      return receipt;
    };
  const selectedRunCore = overrides.runCore ?? defaultRunCore;
  const defaults = {
    decideReconstructionRoute: vi.fn(() => nativeRoute()),
    createRunPorts: vi.fn(async () => {
      events.push("create-run-ports");
      return corePorts as never;
    }),
    runCore: vi.fn(async (input, actualPorts) => {
      frozenOwnerIdentities = input.frozenOwnerIdentities;
      return selectedRunCore(input, actualPorts);
    }),
    verifyRun: vi.fn(async (input) => {
      events.push("verify-run");
      expect(input).toEqual({
        candidate: {
          kind: "run",
          runDirectoryPath: value.outputDirectoryPath,
        },
        playability,
      });
      const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(receipt);
      return Object.freeze({
        outcome: "verified" as const,
        candidateKind: "run" as const,
        attemptIndex: receipt.finalAttemptIndex,
        worldPackageRef: terminal.worldPackageRef,
        worldPackageRootHash: terminal.worldPackageRootHash,
        worldBuildIdentityHash: terminal.worldBuildIdentityHash,
        captureReceiptHash: terminal.captureReceiptHash,
        evaluationResultHash: terminal.evaluationResultHash,
        playability: Object.freeze({
          groundedSpawn: true as const,
          moved: true as const,
          jumped: true as const,
          reset: true as const,
          scriptedTraversalChecks: Object.freeze([]),
        }),
      });
    }),
    publishFinal: vi.fn(async (input) => {
      events.push("publish-final");
      expect(input.caseDirectoryPath).toBe(value.caseRoot);
      expect(input.runDirectoryPath).toBe(value.outputDirectoryPath);
      expect(input.playability).toBe(playability);
      const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(receipt);
      expect(input.launch).toEqual({
        kind: "native-block-reconstruction-launch",
        schemaVersion: 1,
        caseId: CASE_ID,
        runReceiptRef:
          `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/run-receipt.json`,
        runReceiptHash: hashWorldReconstructionRunReceiptV1(receipt),
        worldPackageRelativePath: "final/world-package",
        worldPackageRef: terminal.worldPackageRef,
        worldPackageRootHash: terminal.worldPackageRootHash,
        captureReceiptRelativePath:
          "final/capture/formal-world-capture-receipt.json",
        captureReceiptHash: terminal.captureReceiptHash,
        evaluationRelativePath: "final/evaluation.json",
        evaluationHash: terminal.evaluationResultHash,
        launchCommand:
          "pnpm worldkit native run final/world-package --port 5174 --json",
      });
      const finalDirectoryPath = path.join(value.caseRoot, "final");
      await mkdir(finalDirectoryPath);
      return Object.freeze({
        outcome: "published" as const,
        finalDirectoryPath,
        worldPackageRootHash:
          getWorldReconstructionFinalEvaluatedAttemptV1(receipt)
            .worldPackageRootHash,
        captureReceiptHash:
          getWorldReconstructionFinalEvaluatedAttemptV1(receipt)
            .captureReceiptHash,
        evaluationHash:
          getWorldReconstructionFinalEvaluatedAttemptV1(receipt)
            .evaluationResultHash,
      });
    }),
    playability,
  } satisfies WorldReconstructionProductionOwnersV1;
  const { runCore: _ignoredRunCore, ...remainingOverrides } = overrides;
  return {
    events,
    corePorts,
    owners: Object.freeze({ ...defaults, ...remainingOverrides }) as
      WorldReconstructionProductionOwnersV1,
  };
}

async function run(
  value: ProductionFixtureV1,
  owners: WorldReconstructionProductionOwnersV1,
) {
  return runWithBackend(value, owners, "cloud");
}

async function runWithBackend(
  value: ProductionFixtureV1,
  owners: WorldReconstructionProductionOwnersV1,
  backend: "cloud" | "local",
  routePolicy: WorldReconstructionHostRoutePolicyV1 = {
    requiredCapabilityRefs: [],
    requestedSourceKind: "babylon-native",
    nativeTrustAdmitted: true,
  },
) {
  return runWorldReconstructionProductionV1({
    repositoryRoot: value.repositoryRoot,
    casePath: value.casePath,
    outputDirectoryPath: value.outputDirectoryPath,
    backend,
    routePolicy,
  }, owners);
}

describe("runWorldReconstructionProductionV1", () => {
  it("keeps the representative Case acceptance envelope within the delivery baseline", async () => {
    const [caseValue, profileValue] = await Promise.all([
      readFile(path.join(REAL_CASE_ROOT, "case.json"), "utf8").then(JSON.parse),
      readFile(path.join(REAL_CASE_ROOT, "evaluation-profile.json"), "utf8").then(JSON.parse),
    ]);
    const reconstructionCase = parseWorldReconstructionCaseV1(caseValue);
    const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(profileValue);

    expect(reconstructionCase.expected.openingComposition.orderedTargetRefs).toEqual([
      "worldkit://composition-target/foreground-platform@1",
      "worldkit://composition-target/central-ascent@1",
      "worldkit://composition-target/mountain-cliff-layers@1",
      "worldkit://composition-target/gate-mass@1",
      "worldkit://composition-target/upper-t-junction@1",
    ]);

    const regionThresholdByTargetRef = new Map(
      evaluationProfile.thresholds.openingComposition.regions.map((threshold) =>
        [threshold.targetRef, threshold.maximumDriftBasisPoints] as const
      ),
    );
    expect(regionThresholdByTargetRef.get(
      "worldkit://composition-target/gate-mass@1",
    )).toBeGreaterThanOrEqual(1_121);
    expect(regionThresholdByTargetRef.get(
      "worldkit://composition-target/mountain-cliff-layers@1",
    )).toBeGreaterThanOrEqual(2_400);
    const mountainThreshold =
      evaluationProfile.thresholds.semanticSilhouetteTargets.find((threshold) =>
        threshold.acceptanceTargetRef ===
          "worldkit://acceptance-target/mountain-cliff-layers@1"
      );
    expect(mountainThreshold?.maximumBoundsDriftBasisPoints).toBeGreaterThanOrEqual(2_400);
    expect(mountainThreshold?.maximumCoverageDriftBasisPoints).toBeGreaterThanOrEqual(3_984);
  });

  it("freezes canonical Case/Profile/Intent identities and publishes one verified terminal transaction", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const { owners, events, corePorts } = ownersFor(value, receipt);

    const result = await run(value, owners);

    const frozenRoot = path.join(value.outputDirectoryPath, "inputs");
    const [frozenCase, frozenProfile, frozenIntent] = await Promise.all([
      readFile(path.join(frozenRoot, "case.json")),
      readFile(path.join(frozenRoot, "evaluation-profile.json")),
      readFile(path.join(frozenRoot, "formal-world-capture-intent.json")),
    ]);
    const reconstructionCase = parseWorldReconstructionCaseV1(
      JSON.parse(await readFile(value.casePath, "utf8")),
    );
    const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(
      JSON.parse(await readFile(
        path.join(value.caseRoot, reconstructionCase.evaluationProfileRef),
        "utf8",
      )),
    );
    const intent = parseFormalWorldCaptureIntentV1(JSON.parse(
      await readFile(
        path.join(value.caseRoot, reconstructionCase.formalCaptureIntentRef),
        "utf8",
      ),
    ));
    expect(new Uint8Array(frozenCase)).toEqual(
      worldReconstructionCaseCanonicalBytesV1(reconstructionCase),
    );
    expect(new Uint8Array(frozenProfile)).toEqual(
      worldReconstructionEvaluationProfileCanonicalBytesV1(evaluationProfile),
    );
    expect(new Uint8Array(frozenIntent)).toEqual(
      formalWorldCaptureIntentCanonicalBytesV1(intent),
    );
    expect(reconstructionCase.evaluationProfileHash).toBe(
      hashWorldReconstructionEvaluationProfileV1(evaluationProfile),
    );
    expect(reconstructionCase.formalCaptureIntentHash).toBe(
      hashFormalWorldCaptureIntentV1(intent),
    );
    expect(owners.createRunPorts).toHaveBeenCalledOnce();
    expect(owners.runCore).toHaveBeenCalledOnce();
    expect(owners.verifyRun).toHaveBeenCalledOnce();
    expect(owners.publishFinal).toHaveBeenCalledOnce();
    expect(corePorts.rehashOwnerIdentities).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      "create-run-ports",
      "run-core",
      "verify-run",
      "publish-final",
    ]);

    const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(receipt);
    expect(result).toEqual({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRef: CASE_REF,
      runId: RUN_ID,
      outcome: "published",
      attemptCount: 1,
      finalWorldPackagePath: path.join(value.caseRoot, "final", "world-package"),
      finalWorldPackageRef: terminal.worldPackageRef,
      finalWorldPackageRootHash: terminal.worldPackageRootHash,
      finalCaptureReceiptPath: path.join(
        value.caseRoot,
        "final",
        "capture",
        "formal-world-capture-receipt.json",
      ),
      finalCaptureReceiptHash: terminal.captureReceiptHash,
      finalEvaluationPath: path.join(value.caseRoot, "final", "evaluation.json"),
      finalEvaluationHash: terminal.evaluationResultHash,
      runReceiptPath: path.join(value.outputDirectoryPath, "run-receipt.json"),
      runReceiptRef:
        `artifact://world-reconstruction-case/${CASE_ID}/runs/${RUN_ID}/run-receipt.json`,
      runReceiptHash: hashWorldReconstructionRunReceiptV1(receipt),
      finalDirectoryPath: path.join(value.caseRoot, "final"),
    });
  });

  it("removes a promoted input freeze when the durability barrier fails", async () => {
    const value = await fixture();
    await mkdir(path.dirname(value.outputDirectoryPath), { recursive: true });
    const freeze = createWorldReconstructionInputFreezerTestAdapterV1({
      afterPromotion: async () => {
        throw new Error("WORLD_RECONSTRUCTION_TEST_PARENT_SYNC_FAILED");
      },
    });

    await expect(freeze({
      outputDirectoryPath: value.outputDirectoryPath,
      caseBytes: new TextEncoder().encode("case"),
      profileBytes: new TextEncoder().encode("profile"),
      intentBytes: new TextEncoder().encode("intent"),
    })).rejects.toMatchObject({
      message: "WORLD_RECONSTRUCTION_TEST_PARENT_SYNC_FAILED",
      cleanupOutcome: "completed",
    });
    await expect(lstat(value.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports failed cleanup when a promoted input freeze cannot be removed", async () => {
    const value = await fixture();
    await mkdir(path.dirname(value.outputDirectoryPath), { recursive: true });
    const freeze = createWorldReconstructionInputFreezerTestAdapterV1({
      afterPromotion: async () => {
        throw new Error("WORLD_RECONSTRUCTION_TEST_PARENT_SYNC_FAILED");
      },
      removeOwnedPath: async () => {
        throw new Error("WORLD_RECONSTRUCTION_TEST_FREEZE_CLEANUP_FAILED");
      },
    });

    await expect(freeze({
      outputDirectoryPath: value.outputDirectoryPath,
      caseBytes: new TextEncoder().encode("case"),
      profileBytes: new TextEncoder().encode("profile"),
      intentBytes: new TextEncoder().encode("intent"),
    })).rejects.toMatchObject({
      message: "WORLD_RECONSTRUCTION_TEST_PARENT_SYNC_FAILED",
      cleanupOutcome: "failed",
    });
    expect((await lstat(value.outputDirectoryPath)).isDirectory()).toBe(true);
  });

  it("normalizes the Host-selected Cloud root and never exposes it to local generation", async () => {
    const cloud = await fixture();
    const cloudReceipt = await receiptFor(cloud);
    const cloudOwners = ownersFor(cloud, cloudReceipt).owners;
    vi.stubEnv("WORLDKIT_LWDP_S3_ROOT", "s3://bucket/reconstruction///");
    await runWithBackend(cloud, cloudOwners, "cloud");
    expect(vi.mocked(cloudOwners.createRunPorts).mock.calls[0]![0]
      .generationInput.cloudOutputS3Root).toBe("s3://bucket/reconstruction");

    const local = await fixture();
    const localReceipt = await receiptFor(local);
    const localOwners = ownersFor(local, localReceipt).owners;
    await runWithBackend(local, localOwners, "local");
    expect(vi.mocked(localOwners.createRunPorts).mock.calls[0]![0]
      .generationInput).not.toHaveProperty("cloudOutputS3Root");
  });

  it.each([
    ["outside Case runs", (value: ProductionFixtureV1) =>
      path.join(value.repositoryRoot, "outside", RUN_ID)],
    ["normalized escape", (value: ProductionFixtureV1) =>
      path.resolve(value.caseRoot, "runs", "..", "escaped-run")],
  ])("rejects an output path outside the canonical Case runs directory: %s", async (_label, outputPath) => {
    const value = await fixture();
    const changed = { ...value, outputDirectoryPath: outputPath(value) };
    const receipt = await receiptFor(value);
    const { owners } = ownersFor(changed, receipt);

    await expect(run(changed, owners)).rejects.toThrow(
      "WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID",
    );
    expect(owners.decideReconstructionRoute).not.toHaveBeenCalled();
    expect(owners.createRunPorts).not.toHaveBeenCalled();
    expect(owners.runCore).not.toHaveBeenCalled();
  });

  it("rejects symlinked Case and output ancestors before routing or external work", async () => {
    const linkedCaseFixture = await fixture();
    const realCasePath = path.join(linkedCaseFixture.caseRoot, "case-target.json");
    await writeFile(realCasePath, await readFile(linkedCaseFixture.casePath));
    await unlink(linkedCaseFixture.casePath);
    await symlink(realCasePath, linkedCaseFixture.casePath);
    const linkedCaseReceipt = await receiptFor({
      ...linkedCaseFixture,
      casePath: realCasePath,
    });
    const linkedCase = ownersFor(linkedCaseFixture, linkedCaseReceipt);
    await expect(run(linkedCaseFixture, linkedCase.owners)).rejects.toThrow(
      "WORLD_RECONSTRUCTION_CASE_PATH_INVALID",
    );
    expect(linkedCase.owners.createRunPorts).not.toHaveBeenCalled();

    const linkedRunsFixture = await fixture();
    const outsideRuns = path.join(linkedRunsFixture.repositoryRoot, "linked-runs");
    await mkdir(outsideRuns);
    await symlink(outsideRuns, path.join(linkedRunsFixture.caseRoot, "runs"));
    const linkedRunsReceipt = await receiptFor(linkedRunsFixture);
    const linkedRuns = ownersFor(linkedRunsFixture, linkedRunsReceipt);
    await expect(run(linkedRunsFixture, linkedRuns.owners)).rejects.toThrow(
      "WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID",
    );
    expect(linkedRuns.owners.createRunPorts).not.toHaveBeenCalled();
  });

  it("rejects a Case path that escapes the repository Case corpus", async () => {
    const value = await fixture();
    const escapedCaseRoot = path.join(value.repositoryRoot, "external-case");
    await cp(value.caseRoot, escapedCaseRoot, { recursive: true });
    const escaped = {
      ...value,
      caseRoot: escapedCaseRoot,
      casePath: path.join(escapedCaseRoot, "case.json"),
      outputDirectoryPath: path.join(escapedCaseRoot, "runs", RUN_ID),
    };
    const receipt = await receiptFor(escaped);
    const { owners } = ownersFor(escaped, receipt);

    await expect(run(escaped, owners)).rejects.toThrow(
      "WORLD_RECONSTRUCTION_CASE_PATH_INVALID",
    );
    expect(owners.decideReconstructionRoute).not.toHaveBeenCalled();
    expect(owners.createRunPorts).not.toHaveBeenCalled();
    expect(owners.runCore).not.toHaveBeenCalled();
  });

  it.each([
    ["Evaluation Profile", "evaluation-profile.json"],
    ["Formal Capture Intent", "inputs/formal-world-capture-intent.json"],
  ])("rejects a symlinked %s before core construction", async (_label, relativePath) => {
    const value = await fixture();
    const inputPath = path.join(value.caseRoot, ...relativePath.split("/"));
    const targetPath = path.join(value.caseRoot, `linked-${path.basename(inputPath)}`);
    await writeFile(targetPath, await readFile(inputPath));
    await unlink(inputPath);
    await symlink(targetPath, inputPath);
    const receipt = await receiptFor({
      ...value,
      caseRoot: REAL_CASE_ROOT,
      casePath: path.join(REAL_CASE_ROOT, "case.json"),
    });
    const { owners } = ownersFor(value, receipt);

    await expect(run(value, owners)).rejects.toThrow(
      relativePath === "evaluation-profile.json"
        ? "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID"
        : "WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID",
    );
    expect(owners.createRunPorts).not.toHaveBeenCalled();
    expect(owners.runCore).not.toHaveBeenCalled();
  });

  it("rejects reuse of an existing run directory before routing or external work", async () => {
    const value = await fixture();
    await mkdir(value.outputDirectoryPath, { recursive: true });
    const receipt = await receiptFor(value);
    const { owners } = ownersFor(value, receipt);

    await expect(run(value, owners)).rejects.toThrow(
      "WORLD_RECONSTRUCTION_OUTPUT_ALREADY_EXISTS",
    );
    expect(owners.decideReconstructionRoute).not.toHaveBeenCalled();
    expect(owners.createRunPorts).not.toHaveBeenCalled();
    expect(owners.runCore).not.toHaveBeenCalled();
  });

  it("rejects stale Profile and fixed Intent identity before constructing core ports", async () => {
    const staleProfile = await fixture();
    const profilePath = path.join(staleProfile.caseRoot, "evaluation-profile.json");
    const profile = JSON.parse(await readFile(profilePath, "utf8"));
    await writeFile(profilePath, JSON.stringify({ ...profile, id: "stale-profile" }));
    const profileReceipt = await receiptFor({
      ...staleProfile,
      casePath: path.join(REAL_CASE_ROOT, "case.json"),
      caseRoot: REAL_CASE_ROOT,
    });
    const profileOwners = ownersFor(staleProfile, profileReceipt).owners;
    await expect(run(staleProfile, profileOwners)).rejects.toThrow(
      "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID",
    );
    expect(profileOwners.createRunPorts).not.toHaveBeenCalled();
    expect(profileOwners.runCore).not.toHaveBeenCalled();

    const staleIntent = await fixture();
    const intentPath = path.join(
      staleIntent.caseRoot,
      "inputs",
      "formal-world-capture-intent.json",
    );
    const intent = JSON.parse(await readFile(intentPath, "utf8"));
    await writeFile(intentPath, JSON.stringify({ ...intent, id: "stale-intent" }));
    const intentReceipt = await receiptFor({
      ...staleIntent,
      casePath: path.join(REAL_CASE_ROOT, "case.json"),
      caseRoot: REAL_CASE_ROOT,
    });
    const intentOwners = ownersFor(staleIntent, intentReceipt).owners;
    await expect(run(staleIntent, intentOwners)).rejects.toThrow(
      "WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID",
    );
    expect(intentOwners.createRunPorts).not.toHaveBeenCalled();
    expect(intentOwners.runCore).not.toHaveBeenCalled();
  });

  it("rejects non-canonical Formal Capture Intent bytes before routing or external work", async () => {
    const value = await fixture();
    const intentPath = path.join(
      value.caseRoot,
      "inputs",
      "formal-world-capture-intent.json",
    );
    const parsed = JSON.parse(await readFile(intentPath, "utf8"));
    await writeFile(intentPath, `${JSON.stringify(parsed, null, 2)}\n`);
    const receipt = await receiptFor(value);
    const { owners } = ownersFor(value, receipt);

    await expect(run(value, owners)).rejects.toThrow(
      "WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID",
    );
    expect(owners.decideReconstructionRoute).not.toHaveBeenCalled();
    expect(owners.createRunPorts).not.toHaveBeenCalled();
    expect(owners.runCore).not.toHaveBeenCalled();
    await expect(lstat(value.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("returns one stable unsupported diagnostic for a Canonical route before core construction", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const { owners: mockedOwners } = ownersFor(value, receipt);
    const owners = Object.freeze({
      ...mockedOwners,
      decideReconstructionRoute: decideNativeBlockReconstructionRouteV1,
    });

    await expect(runWithBackend(value, owners, "cloud", {
      requiredCapabilityRefs: [],
      requestedSourceKind: "canonical",
      nativeTrustAdmitted: true,
    })).resolves.toEqual({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRef: CASE_REF,
      runId: RUN_ID,
      outcome: "unsupported-route",
      diagnosticCodes: ["WORLD_RECONSTRUCTION_ROUTE_UNSUPPORTED"],
    });
    expect(owners.createRunPorts).not.toHaveBeenCalled();
    expect(owners.runCore).not.toHaveBeenCalled();
    expect(owners.verifyRun).not.toHaveBeenCalled();
    expect(owners.publishFinal).not.toHaveBeenCalled();
    await expect(lstat(path.join(value.caseRoot, "final"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("returns human-viewable rejected Capture evidence without claiming publication", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const { owners: baseOwners } = ownersFor(value, receipt);
    const rejectedCaptureDirectoryPath = path.join(
      value.outputDirectoryPath,
      "attempts",
      "0",
      "rejected-capture",
    );
    const rejectedOpeningPath = path.join(
      rejectedCaptureDirectoryPath,
      "opening.png",
    );
    const openingGateResultPath = path.join(
      rejectedCaptureDirectoryPath,
      "opening-composition-gate-result.json",
    );
    const owners = Object.freeze({
      ...baseOwners,
      runCore: vi.fn(async () => {
        throw new WorldReconstructionRunClosedErrorV1(
          [
            "WORLD_RECONSTRUCTION_CAPTURE_FAILED",
            "WORLDKIT_OPENING_GATE_REGION_DRIFT",
          ],
          "completed",
          undefined,
          {
            rejectedWorldPackagePath: path.join(
              value.outputDirectoryPath,
              "attempts",
              "0",
              "world-package",
            ),
            rejectedWorldPackageRef:
              `package://world-package/sha256/${"8".repeat(64)}`,
            rejectedWorldPackageRootHash: H("8"),
            rejectedCaptureDirectoryPath,
            rejectedOpeningPath,
            rejectedOpeningRef:
              `${CASE_REF.slice(0, -"/case.json".length)}/runs/${RUN_ID}/` +
              "attempts/0/rejected-capture/opening.png",
            openingGateResultPath,
            openingGateResultRef:
              `${CASE_REF.slice(0, -"/case.json".length)}/runs/${RUN_ID}/` +
              "attempts/0/rejected-capture/opening-composition-gate-result.json",
            openingGateResultHash: H("e"),
          },
        );
      }),
    });

    await expect(run(value, owners)).resolves.toEqual({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRef: CASE_REF,
      runId: RUN_ID,
      outcome: "rejected-capture",
      diagnosticCodes: [
        "WORLD_RECONSTRUCTION_CAPTURE_FAILED",
        "WORLDKIT_OPENING_GATE_REGION_DRIFT",
      ],
      cleanupOutcome: "completed",
      rejectedWorldPackagePath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "world-package",
      ),
      rejectedWorldPackageRef:
        `package://world-package/sha256/${"8".repeat(64)}`,
      rejectedWorldPackageRootHash: H("8"),
      rejectedCaptureDirectoryPath,
      rejectedOpeningPath,
      rejectedOpeningRef:
        `${CASE_REF.slice(0, -"/case.json".length)}/runs/${RUN_ID}/` +
        "attempts/0/rejected-capture/opening.png",
      openingGateResultPath,
      openingGateResultRef:
        `${CASE_REF.slice(0, -"/case.json".length)}/runs/${RUN_ID}/` +
        "attempts/0/rejected-capture/opening-composition-gate-result.json",
      openingGateResultHash: H("e"),
    });
    expect(owners.verifyRun).not.toHaveBeenCalled();
    expect(owners.publishFinal).not.toHaveBeenCalled();
  });

  it("delivers an admitted report-only Package after opening quality repair is exhausted", async () => {
    const value = await fixture();
    await setQualityGateMode(value, "report-only");
    const receipt = await receiptFor(value);
    const { owners: baseOwners } = ownersFor(value, receipt);
    const rejectedWorldPackagePath = path.join(
      value.outputDirectoryPath,
      "attempts",
      "3",
      "world-package",
    );
    const rejectedCaptureDirectoryPath = path.join(
      value.outputDirectoryPath,
      "attempts",
      "3",
      "rejected-capture",
    );
    const rejectedOpeningPath = path.join(
      rejectedCaptureDirectoryPath,
      "opening.png",
    );
    const openingGateResultPath = path.join(
      rejectedCaptureDirectoryPath,
      "opening-composition-gate-result.json",
    );
    const rejectedOpeningRef =
      `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/3/rejected-capture/opening.png`;
    const openingGateResultRef =
      `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/3/rejected-capture/` +
      "opening-composition-gate-result.json";
    const owners = Object.freeze({
      ...baseOwners,
      runCore: vi.fn(async () => {
        throw new WorldReconstructionRunClosedErrorV1(
          [
            "WORLD_RECONSTRUCTION_MAX_REPAIR_EXCEEDED",
            "WORLDKIT_OPENING_GATE_REGION_DRIFT",
          ],
          "completed",
          undefined,
          {
            rejectedWorldPackagePath,
            rejectedWorldPackageRef:
              `package://world-package/sha256/${"8".repeat(64)}`,
            rejectedWorldPackageRootHash: H("8"),
            rejectedCaptureDirectoryPath,
            rejectedOpeningPath,
            rejectedOpeningRef,
            openingGateResultPath,
            openingGateResultRef,
            openingGateResultHash: H("e"),
          },
        );
      }),
    });

    await expect(run(value, owners)).resolves.toEqual({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRef: CASE_REF,
      runId: RUN_ID,
      outcome: "preview-ready",
      publicationStatus: "not-accepted",
      qualityStage: "opening-composition",
      qualityOutcome: "failed",
      diagnosticCodes: [
        "WORLD_RECONSTRUCTION_MAX_REPAIR_EXCEEDED",
        "WORLDKIT_OPENING_GATE_REGION_DRIFT",
      ],
      cleanupOutcome: "completed",
      previewWorldPackagePath: rejectedWorldPackagePath,
      previewWorldPackageRef:
        `package://world-package/sha256/${"8".repeat(64)}`,
      previewWorldPackageRootHash: H("8"),
      previewCaptureDirectoryPath: rejectedCaptureDirectoryPath,
      previewOpeningPath: rejectedOpeningPath,
      previewOpeningRef: rejectedOpeningRef,
      openingGateResultPath,
      openingGateResultRef,
      openingGateResultHash: H("e"),
      launchWorkingDirectoryPath: value.outputDirectoryPath,
      launchCommand:
        "pnpm worldkit native run attempts/3/world-package --port 5174 --json",
    });
    expect(owners.verifyRun).not.toHaveBeenCalled();
    expect(owners.publishFinal).not.toHaveBeenCalled();
  });

  it("returns identity-bound playable evidence and exact diagnostics for a failed evaluation", async () => {
    const value = await fixture();
    const baseReceipt = await receiptFor(value, { outcome: "failed" });
    const failedEvaluation = await publishQualityEvaluationArtifacts(
      value,
      baseReceipt,
    );
    const { receipt } = failedEvaluation;
    const defaultOwners = ownersFor(value, receipt).owners;
    const owners = {
      ...defaultOwners,
      runCore: vi.fn(async (input, ports) => {
        await failedEvaluation.publishArtifacts();
        await publishReceipt(input.outputDirectoryPath, receipt);
        return receipt;
      }),
    };
    const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(receipt);

    await expect(run(value, owners)).resolves.toEqual({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRef: CASE_REF,
      runId: RUN_ID,
      outcome: "rejected-evaluation",
      runOutcome: "failed",
      attemptCount: 1,
      diagnosticCodes: ["WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT"],
      cleanupOutcome: "completed",
      rejectedWorldPackagePath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "world-package",
      ),
      rejectedWorldPackageRef: terminal.worldPackageRef,
      rejectedWorldPackageRootHash: terminal.worldPackageRootHash,
      rejectedCaptureDirectoryPath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "capture",
      ),
      rejectedOpeningPath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "capture",
        "opening.png",
      ),
      rejectedOpeningRef:
        `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/0/capture/opening.png`,
      rejectedCaptureReceiptPath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "capture",
        "formal-world-capture-receipt.json",
      ),
      rejectedCaptureReceiptHash: terminal.captureReceiptHash,
      rejectedEvaluationPath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "evaluation.json",
      ),
      rejectedEvaluationRef: terminal.evaluationResultRef,
      rejectedEvaluationHash: terminal.evaluationResultHash,
      runReceiptPath: path.join(value.outputDirectoryPath, "run-receipt.json"),
      runReceiptRef:
        `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/run-receipt.json`,
      runReceiptHash: hashWorldReconstructionRunReceiptV1(receipt),
    });
    expect(owners.verifyRun).not.toHaveBeenCalled();
    expect(owners.publishFinal).not.toHaveBeenCalled();
  });

  it("delivers a non-accepted report-only preview after evaluation repair is exhausted", async () => {
    const value = await fixture();
    await setQualityGateMode(value, "report-only");
    const baseReceipt = await receiptFor(value, { outcome: "failed" });
    const failedEvaluation = await publishQualityEvaluationArtifacts(
      value,
      baseReceipt,
    );
    const { receipt } = failedEvaluation;
    const defaultOwners = ownersFor(value, receipt).owners;
    const owners = {
      ...defaultOwners,
      runCore: vi.fn(async (input) => {
        await failedEvaluation.publishArtifacts();
        await publishReceipt(input.outputDirectoryPath, receipt);
        return receipt;
      }),
    };
    const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(receipt);

    await expect(run(value, owners)).resolves.toEqual({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRef: CASE_REF,
      runId: RUN_ID,
      outcome: "preview-ready",
      publicationStatus: "not-accepted",
      qualityStage: "evaluation",
      qualityOutcome: "failed",
      attemptCount: 1,
      diagnosticCodes: ["WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT"],
      cleanupOutcome: "completed",
      previewWorldPackagePath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "world-package",
      ),
      previewWorldPackageRef: terminal.worldPackageRef,
      previewWorldPackageRootHash: terminal.worldPackageRootHash,
      previewCaptureDirectoryPath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "capture",
      ),
      previewOpeningPath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "capture",
        "opening.png",
      ),
      previewOpeningRef:
        `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/attempts/0/capture/opening.png`,
      previewCaptureReceiptPath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "capture",
        "formal-world-capture-receipt.json",
      ),
      previewCaptureReceiptHash: terminal.captureReceiptHash,
      previewEvaluationPath: path.join(
        value.outputDirectoryPath,
        "attempts",
        "0",
        "evaluation.json",
      ),
      previewEvaluationRef: terminal.evaluationResultRef,
      previewEvaluationHash: terminal.evaluationResultHash,
      runReceiptPath: path.join(value.outputDirectoryPath, "run-receipt.json"),
      runReceiptRef:
        `${CASE_ARTIFACT_ROOT}/runs/${RUN_ID}/run-receipt.json`,
      runReceiptHash: hashWorldReconstructionRunReceiptV1(receipt),
      launchWorkingDirectoryPath: value.outputDirectoryPath,
      launchCommand:
        "pnpm worldkit native run attempts/0/world-package --port 5174 --json",
    });
    expect(owners.verifyRun).not.toHaveBeenCalled();
    expect(owners.publishFinal).not.toHaveBeenCalled();
  });

  it("delivers incomplete soft evidence as a report-only preview without inventing a pass", async () => {
    const value = await fixture();
    await setQualityGateMode(value, "report-only");
    const baseReceipt = await receiptFor(value, { outcome: "incomplete" });
    const incompleteEvaluation = await publishQualityEvaluationArtifacts(
      value,
      baseReceipt,
      "incomplete",
    );
    const { receipt } = incompleteEvaluation;
    const defaultOwners = ownersFor(value, receipt).owners;
    const owners = {
      ...defaultOwners,
      runCore: vi.fn(async (input) => {
        await incompleteEvaluation.publishArtifacts();
        await publishReceipt(input.outputDirectoryPath, receipt);
        return receipt;
      }),
    };

    const result = await run(value, owners);
    expect(result).toMatchObject({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRef: CASE_REF,
      runId: RUN_ID,
      outcome: "preview-ready",
      publicationStatus: "not-accepted",
      qualityStage: "evaluation",
      qualityOutcome: "incomplete",
      attemptCount: 1,
      diagnosticCodes: ["WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING"],
      cleanupOutcome: "completed",
      launchWorkingDirectoryPath: value.outputDirectoryPath,
      launchCommand:
        "pnpm worldkit native run attempts/0/world-package --port 5174 --json",
    });
    expect(result).not.toHaveProperty("finalDirectoryPath");
    expect(owners.verifyRun).not.toHaveBeenCalled();
    expect(owners.publishFinal).not.toHaveBeenCalled();
  });

  it("keeps Collider failure rejected even for a report-only Case", async () => {
    const value = await fixture();
    await setQualityGateMode(value, "report-only");
    const baseReceipt = await receiptFor(value, { outcome: "failed" });
    const failedEvaluation = await publishQualityEvaluationArtifacts(
      value,
      baseReceipt,
      "failed",
      true,
    );
    const { receipt } = failedEvaluation;
    const defaultOwners = ownersFor(value, receipt).owners;
    const owners = {
      ...defaultOwners,
      runCore: vi.fn(async (input) => {
        await failedEvaluation.publishArtifacts();
        await publishReceipt(input.outputDirectoryPath, receipt);
        return receipt;
      }),
    };

    const result = await run(value, owners);
    expect(result).toMatchObject({
      outcome: "rejected-evaluation",
      runOutcome: "failed",
      diagnosticCodes: ["WORLD_RECONSTRUCTION_COLLIDER_MISSING"],
      cleanupOutcome: "completed",
    });
    expect(result).not.toHaveProperty("launchCommand");
    expect(owners.verifyRun).not.toHaveBeenCalled();
    expect(owners.publishFinal).not.toHaveBeenCalled();
  });

  it.each([
    ["failed", "completed"],
    ["incomplete", "completed"],
    ["passed", "failed"],
  ] as const)(
    "does not verify or publish a %s run with %s cleanup",
    async (outcome, cleanupOutcome) => {
      const value = await fixture();
      const receipt = await receiptFor(value, { outcome, cleanupOutcome });
      const { owners } = ownersFor(value, receipt);

      const result = await run(value, owners);
      const diagnosticCodes = cleanupOutcome === "failed"
        ? ["WORLD_RECONSTRUCTION_CLEANUP_FAILED"]
        : receipt.outcome === "failed"
        ? ["NBR_REJECTED_EVALUATION_EVIDENCE_INVALID"]
        : ["WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING"];

      expect(result).toEqual({
        kind: "world-reconstruction-production-result",
        schemaVersion: 1,
        caseId: CASE_ID,
        caseRef: CASE_REF,
        runId: RUN_ID,
        outcome: "closed",
        runOutcome: receipt.outcome,
        attemptCount: 1,
        diagnosticCodes,
        cleanupOutcome,
      });
      expect(result).not.toHaveProperty("finalDirectoryPath");
      expect(result).not.toHaveProperty("finalWorldPackagePath");
      expect(result).not.toHaveProperty("runReceiptPath");
      expect(result).not.toHaveProperty("runReceiptRef");
      expect(result).not.toHaveProperty("runReceiptHash");
      expect(owners.runCore).toHaveBeenCalledOnce();
      expect(owners.verifyRun).not.toHaveBeenCalled();
      expect(owners.publishFinal).not.toHaveBeenCalled();
      await expect(lstat(path.join(value.caseRoot, "final"))).rejects
        .toMatchObject({ code: "ENOENT" });
    },
  );

  it.each([
    ["missing", false],
    ["different", true],
  ] as const)(
    "rejects a %s disk Run Receipt before publishing any receipt identity",
    async (_label, writeDifferentReceipt) => {
      const value = await fixture();
      const receipt = await receiptFor(value, { outcome: "failed" });
      const differentReceipt = await receiptFor(value, {
        outcome: "incomplete",
      });
      const { owners } = ownersFor(value, receipt, {
        runCore: vi.fn(async (input) => {
          if (writeDifferentReceipt) {
            await publishReceipt(input.outputDirectoryPath, differentReceipt);
          }
          return receipt;
        }),
      });

      const result = await run(value, owners);
      expect(result).toEqual({
        kind: "world-reconstruction-production-result",
        schemaVersion: 1,
        caseId: CASE_ID,
        caseRef: CASE_REF,
        runId: RUN_ID,
        outcome: "closed",
        diagnosticCodes: ["WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID"],
        cleanupOutcome: "completed",
      });
      expect(owners.verifyRun).not.toHaveBeenCalled();
      expect(owners.publishFinal).not.toHaveBeenCalled();
      await expect(lstat(path.join(value.caseRoot, "final"))).rejects
        .toMatchObject({ code: "ENOENT" });
    },
  );

  it.each(["rewrite", "delete"] as const)(
    "rejects a %s of the run-owned frozen Intent after core returns",
    async (mutation) => {
      const value = await fixture();
      const receipt = await receiptFor(value);
      const { owners } = ownersFor(value, receipt, {
        runCore: vi.fn(async (input) => {
          await publishReceipt(input.outputDirectoryPath, receipt);
          const frozenIntentPath = path.join(
            input.outputDirectoryPath,
            "inputs",
            "formal-world-capture-intent.json",
          );
          if (mutation === "rewrite") {
            await writeFile(frozenIntentPath, "{}\n");
          } else {
            await unlink(frozenIntentPath);
          }
          return receipt;
        }),
      });

      await expect(run(value, owners)).resolves.toMatchObject({
        outcome: "closed",
        diagnosticCodes: ["WORLD_RECONSTRUCTION_FROZEN_INPUT_INVALID"],
        cleanupOutcome: "completed",
      });
      expect(owners.verifyRun).not.toHaveBeenCalled();
      expect(owners.publishFinal).not.toHaveBeenCalled();
    },
  );

  it("uses the Run Ports owner rehash boundary to reject a frozen owner mutation", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const bundle = ownersFor(value, receipt);
    bundle.corePorts.rehashOwnerIdentities.mockImplementationOnce(async () => ({
      caseHash: H("a"),
      evaluationProfileHash: H("b"),
      gameplayBootstrapHash: H("c"),
      worldRuntimeBootstrapHash: H("d"),
      worldBoundsHash: H("e"),
      bootstrapInputHash: H("f"),
    }));

    await expect(run(value, bundle.owners)).resolves.toMatchObject({
      outcome: "closed",
      diagnosticCodes: ["WORLD_RECONSTRUCTION_FROZEN_OWNER_INVALID"],
      cleanupOutcome: "completed",
    });
    expect(bundle.owners.verifyRun).not.toHaveBeenCalled();
    expect(bundle.owners.publishFinal).not.toHaveBeenCalled();
  });

  it("removes the fresh run directory when production port construction fails", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const { owners } = ownersFor(value, receipt, {
      createRunPorts: vi.fn(async () => {
        throw new Error("WORLD_RECONSTRUCTION_PRODUCTION_PORTS_FAILED");
      }),
    });

    await expect(run(value, owners)).resolves.toEqual({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRef: CASE_REF,
      runId: RUN_ID,
      outcome: "closed",
      diagnosticCodes: ["WORLD_RECONSTRUCTION_PRODUCTION_PORTS_FAILED"],
      cleanupOutcome: "completed",
    });
    await expect(lstat(value.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(owners.runCore).not.toHaveBeenCalled();
  });

  it("returns one transaction-owned closed result when core fails unexpectedly", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const { owners, corePorts } = ownersFor(value, receipt, {
      runCore: vi.fn(async () => {
        throw new Error("WORLD_RECONSTRUCTION_CORE_FAILED");
      }),
    });

    await expect(run(value, owners)).resolves.toEqual({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: CASE_ID,
      caseRef: CASE_REF,
      runId: RUN_ID,
      outcome: "closed",
      diagnosticCodes: ["WORLD_RECONSTRUCTION_CORE_FAILED"],
      cleanupOutcome: "completed",
    });
    expect(corePorts.cleanup).toHaveBeenCalledOnce();
    expect(owners.verifyRun).not.toHaveBeenCalled();
    expect(owners.publishFinal).not.toHaveBeenCalled();
  });

  it("rechecks frozen source identity after verification before final publication", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const intentPath = path.join(
      value.caseRoot,
      "inputs",
      "formal-world-capture-intent.json",
    );
    const defaults = ownersFor(value, receipt);
    const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(receipt);
    vi.mocked(defaults.owners.verifyRun).mockImplementationOnce(async () => {
      const intent = JSON.parse(await readFile(intentPath, "utf8"));
      await writeFile(intentPath, JSON.stringify({
        ...intent,
        captureProfile: { ...intent.captureProfile, widthPixels: 1279 },
      }));
      return Object.freeze({
        outcome: "verified" as const,
        candidateKind: "run" as const,
        attemptIndex: 0,
        worldPackageRef: terminal.worldPackageRef,
        worldPackageRootHash: terminal.worldPackageRootHash,
        worldBuildIdentityHash: terminal.worldBuildIdentityHash,
        captureReceiptHash: terminal.captureReceiptHash,
        evaluationResultHash: terminal.evaluationResultHash,
        playability: Object.freeze({
          groundedSpawn: true as const,
          moved: true as const,
          jumped: true as const,
          reset: true as const,
          scriptedTraversalChecks: Object.freeze([]),
        }),
      });
    });

    await expect(run(value, defaults.owners)).resolves.toMatchObject({
      outcome: "closed",
      diagnosticCodes: ["WORLD_RECONSTRUCTION_STALE_FORMAL_CAPTURE_INTENT"],
      cleanupOutcome: "completed",
    });
    expect(defaults.corePorts.rehashOwnerIdentities).toHaveBeenCalledOnce();
    expect(defaults.owners.publishFinal).not.toHaveBeenCalled();
    await expect(lstat(path.join(value.caseRoot, "final"))).rejects
      .toMatchObject({ code: "ENOENT" });
  });

  it("rejoins the disk Run Receipt after verification before final publication", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const differentReceipt = await receiptFor(value, { outcome: "incomplete" });
    const defaults = ownersFor(value, receipt);
    const verify = vi.mocked(defaults.owners.verifyRun);
    const verifyImplementation = verify.getMockImplementation();
    if (verifyImplementation === undefined) {
      throw new Error("missing verifier fixture implementation");
    }
    verify.mockImplementationOnce(async (input) => {
      const verification = await verifyImplementation(input);
      await publishReceipt(value.outputDirectoryPath, differentReceipt);
      return verification;
    });

    await expect(run(value, defaults.owners)).resolves.toMatchObject({
      outcome: "closed",
      diagnosticCodes: ["WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID"],
      cleanupOutcome: "completed",
    });
    expect(defaults.owners.publishFinal).not.toHaveBeenCalled();
    await expect(lstat(path.join(value.caseRoot, "final"))).rejects
      .toMatchObject({ code: "ENOENT" });
  });

  it("removes an ambiguously published Final whose returned identity does not join", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const defaults = ownersFor(value, receipt, {
      publishFinal: vi.fn(async () => {
        const finalDirectoryPath = path.join(value.caseRoot, "final");
        await mkdir(finalDirectoryPath);
        return Object.freeze({
          outcome: "published" as const,
          finalDirectoryPath,
          worldPackageRootHash: H("a"),
          captureReceiptHash: H("b"),
          evaluationHash: H("c"),
        });
      }),
    });

    await expect(run(value, defaults.owners)).resolves.toMatchObject({
      outcome: "closed",
      diagnosticCodes: ["NBR_FINAL_ARTIFACT_PUBLICATION_INVALID"],
      cleanupOutcome: "completed",
    });
    await expect(lstat(path.join(value.caseRoot, "final"))).rejects
      .toMatchObject({ code: "ENOENT" });
  });

  it("does not create a run directory when Host closure validation fails", async () => {
    const value = await fixture();
    await writeFile(
      path.join(
        value.repositoryRoot,
        "apps",
        "playground",
        "public",
        "world-packages",
        "cloud-ridge",
        "registry-lock.json",
      ),
      "{}\n",
    );
    const receipt = await receiptFor(value);
    const { owners } = ownersFor(value, receipt);

    await expect(run(value, owners)).rejects.toThrow(
      "WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID",
    );
    await expect(lstat(value.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(owners.createRunPorts).not.toHaveBeenCalled();
    expect(owners.runCore).not.toHaveBeenCalled();
  });

  it.each([
    ["run verification", "verifyRun"],
    ["final publication", "publishFinal"],
  ] as const)(
    "does not expose final identity when %s fails",
    async (_label, failingOwner) => {
      const value = await fixture();
      const receipt = await receiptFor(value);
      const failure = new Error(
        failingOwner === "verifyRun"
          ? "NBR70_PLAYABILITY_REQUIRED_ROUTE_FAILED"
          : "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID",
      );
      const { owners } = ownersFor(value, receipt, {
        [failingOwner]: vi.fn(async () => {
          throw failingOwner === "publishFinal"
            ? new NativeBlockFinalArtifactPublicationClosedErrorV1(
              [failure.message],
              "not-started",
              failure,
            )
            : new NativeBlockReconstructionVerificationClosedErrorV1(
              [failure.message],
              "completed",
              failure,
            );
        }),
      });

      const result = await run(value, owners);
      expect(result).toEqual({
        kind: "world-reconstruction-production-result",
        schemaVersion: 1,
        caseId: CASE_ID,
        caseRef: CASE_REF,
        runId: RUN_ID,
        outcome: "closed",
        runOutcome: "passed",
        attemptCount: 1,
        diagnosticCodes: [failure.message],
        cleanupOutcome: failingOwner === "publishFinal"
          ? "not-started"
          : "completed",
      });
      expect(owners.runCore).toHaveBeenCalledOnce();
      if (failingOwner === "verifyRun") {
        expect(owners.publishFinal).not.toHaveBeenCalled();
      }
      await expect(lstat(path.join(value.caseRoot, "final"))).rejects
        .toMatchObject({ code: "ENOENT" });
      expect(result).not.toHaveProperty("runReceiptPath");
      expect(result).not.toHaveProperty("runReceiptRef");
      expect(result).not.toHaveProperty("runReceiptHash");
    },
  );

  it("keeps every accepted path canonical after publication", async () => {
    const value = await fixture();
    const receipt = await receiptFor(value);
    const { owners } = ownersFor(value, receipt);
    const result = await run(value, owners);
    if (result.outcome !== "published") {
      throw new Error("expected a published production result");
    }

    expect(await realpath(result.finalDirectoryPath)).toBe(
      result.finalDirectoryPath,
    );
    expect(path.dirname(result.finalDirectoryPath)).toBe(value.caseRoot);
    expect(path.dirname(value.outputDirectoryPath)).toBe(
      path.join(value.caseRoot, "runs"),
    );
  });
});
