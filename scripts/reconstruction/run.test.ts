import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isEmpty, isNil } from "lodash-es";
import type { Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashWorldReconstructionEvaluationResultV1,
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionDiagnosticV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionRunReceiptV1,
  type WorldReconstructionDiagnosticCodeV1,
  type WorldReconstructionDiagnosticV1,
  type WorldReconstructionDimensionIdV1,
  type WorldReconstructionEvaluationResultV1,
  type WorldReconstructionOutcomeV1,
} from "@whitebox-world/validation";

import {
  WorldReconstructionRunClosedErrorV1,
  runWorldReconstructionV1,
  type WorldReconstructionGeneratePortResultV1,
  type WorldReconstructionRunPortsV1,
} from "./run.js";

const H = (character: string): Sha256HashV1 =>
  `sha256:${character.repeat(64)}` as Sha256HashV1;

const DIMENSIONS = [
  "collider",
  "critical-traversal",
  "deterministic-build",
  "opening-composition",
  "semantic-silhouette",
  "spawn-support",
  "topology",
] as const;

const CASE_REF = "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/case.json";

const OWNER = Object.freeze({
  caseHash: hashWorldReconstructionCaseV1(reconstructionCase()),
  evaluationProfileHash: hashWorldReconstructionEvaluationProfileV1(profile()),
  gameplayBootstrapHash: H("3"),
  worldRuntimeBootstrapHash: H("4"),
  worldBoundsHash: H("5"),
  bootstrapInputHash: H("6"),
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directoryPath) =>
    rm(directoryPath, { recursive: true, force: true })));
});

async function outputRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "nbr60-run-"));
  temporaryDirectories.push(root);
  return root;
}

function taggedHash(tag: string): Sha256HashV1 {
  const hex = Array.from(tag, (character) =>
    character.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex.padEnd(64, "0").slice(0, 64)}` as Sha256HashV1;
}

function packageRef(rootHash: Sha256HashV1): string {
  return `package://world-package/${rootHash.slice("sha256:".length)}`.replace(
    /package:\/\/world-package\//,
    "package://world-package/sha256/",
  );
}

function identities(attemptIndex: 0 | 1) {
  const prefix = attemptIndex === 0 ? "a0" : "a1";
  const worldPackageRootHash = taggedHash(`${prefix}pkg`);
  return Object.freeze({
    generationRequestRef: `artifact://run/attempts/${attemptIndex}/generation-request.json`,
    generationRequestHash: taggedHash(`${prefix}req`),
    routerTaskPayloadHash: taggedHash(`${prefix}router`),
    generationReceiptRef: `artifact://run/attempts/${attemptIndex}/generation-receipt.json`,
    generationReceiptHash: taggedHash(`${prefix}grc`),
    sceneAuthoringAttemptRef: `artifact://run/attempts/${attemptIndex}/attempt.json`,
    sceneAuthoringAttemptHash: taggedHash(`${prefix}att`),
    sceneAuthoringAttemptResultRef:
      `artifact://run/attempts/${attemptIndex}/attempt-result.json`,
    sceneAuthoringAttemptResultHash: taggedHash(`${prefix}res`),
    authoredSourceRef: `artifact://run/attempts/${attemptIndex}/source`,
    authoredSourceHash: taggedHash(`${prefix}src`),
    worldPackageRef: packageRef(worldPackageRootHash),
    worldPackageRootHash,
    worldPackagePath: `/attempts/${attemptIndex}/world-package`,
    worldPackageBuildReceiptRef:
      `artifact://run/attempts/${attemptIndex}/build-receipt.json`,
    worldPackageBuildReceiptHash: taggedHash(`${prefix}brc`),
    worldBuildIdentityRef:
      `artifact://run/attempts/${attemptIndex}/world-build-identity.json`,
    worldBuildIdentityHash: taggedHash(`${prefix}bid`),
    captureReceiptRef: `artifact://run/attempts/${attemptIndex}/capture-receipt.json`,
    captureReceiptHash: taggedHash(`${prefix}cap`),
    captureReceiptPath: `/attempts/${attemptIndex}/capture-receipt.json`,
    evaluationResultRef: `artifact://run/attempts/${attemptIndex}/evaluation.json`,
    evaluationPath: `/attempts/${attemptIndex}/evaluation.json`,
  });
}

function profile() {
  return parseWorldReconstructionEvaluationProfileV1({
    kind: "world-reconstruction-evaluation-profile",
    schemaVersion: 1,
    id: "cloud-temple.profile",
    dimensionIds: [...DIMENSIONS],
    maximumRepairAttemptCount: 1,
    builderSelfRepairAttemptCount: 0,
    thresholds: {
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        maximumBoundsDriftBasisPoints: 100,
        maximumCenterDriftBasisPoints: 100,
        maximumCoverageDriftBasisPoints: 100,
      }],
      openingComposition: {
        regions: [{
          targetRef: "worldkit://composition-target/opening@1",
          maximumDriftBasisPoints: 100,
        }],
        anchors: [{
          targetRef: "worldkit://composition-target/opening@1",
          maximumDriftBasisPoints: 100,
        }],
        maximumOrderDistanceBasisPoints: 100,
      },
      spawnSupport: {
        maximumPositionDriftMillimeters: 100,
        maximumSupportGapMillimeters: 10,
      },
    },
    requiredEvidenceByDimension: DIMENSIONS.map((dimensionId) => ({
      dimensionId,
      evidenceProfileRefs: [`worldkit://evidence-profile/${dimensionId}@1`],
    })),
  });
}

function reconstructionCase() {
  return {
    kind: "world-reconstruction-case" as const,
    schemaVersion: 1 as const,
    id: "cloud-temple-t-gate-native-block",
    sceneBriefRef: "scene-brief.md",
    sceneBriefHash: H("a"),
    referenceInputs: [{
      inputRef: "reference-0.png",
      contentHash: H("b"),
      mediaType: "image/png" as const,
    }],
    evaluationProfileRef: "evaluation-profile.json",
    evaluationProfileHash: hashWorldReconstructionEvaluationProfileV1(profile()),
    formalCaptureIntentRef: "inputs/formal-world-capture-intent.json" as const,
    formalCaptureIntentHash: H("c"),
    acceptanceTargetRefs: [
      "worldkit://acceptance-target/central-ascent@1",
      "worldkit://acceptance-target/upper-t-junction@1",
    ],
    requiredEvidenceProfileRefs: profile().requiredEvidenceByDimension
      .flatMap(({ evidenceProfileRefs }) => evidenceProfileRefs)
      .sort(),
    expected: {
      topology: {
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        nodeIds: ["central-ascent", "upper-t-junction"],
        relations: [{
          fromNodeId: "central-ascent",
          relation: "connects-to" as const,
          toNodeId: "upper-t-junction",
        }],
        layerIds: ["ground", "upper"],
      },
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        visualGroupId: "central-ascent-group",
        normalizedBounds: {
          minXBasisPoints: 100,
          minYBasisPoints: 200,
          maxXBasisPoints: 500,
          maxYBasisPoints: 800,
        },
        normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
        coverageBasisPoints: 2_400,
      }],
      openingComposition: {
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        targetRefs: ["worldkit://composition-target/opening@1"],
        regions: [{
          targetRef: "worldkit://composition-target/opening@1",
          normalizedBounds: {
            minXBasisPoints: 100,
            minYBasisPoints: 200,
            maxXBasisPoints: 500,
            maxYBasisPoints: 800,
          },
        }],
        anchors: [{
          targetRef: "worldkit://composition-target/opening@1",
          normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
        }],
        orderedTargetRefs: ["worldkit://composition-target/opening@1"],
      },
      spawnSupport: {
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        spawnMarkerId: "player-spawn",
        supportColliderId: "spawn-ground",
        expectedMedium: "ground" as const,
        expectedPositionXYZMeters: { xMeters: 0, yMeters: 1, zMeters: 0 },
      },
      colliders: [
        {
          acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
          contributionId: "spawn-ground-contribution",
          colliderId: "spawn-ground",
          role: "ground" as const,
          requiresOverlay: true,
        },
        {
          acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
          contributionId: "west-wall-contribution",
          colliderId: "west-wall",
          role: "blocker" as const,
          requiresOverlay: true,
        },
      ],
      criticalTraversalChecks: [{
        acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
        id: "reach-junction",
        evidenceKind: "scripted-fixed-input" as const,
        expectation: "pass" as const,
        checkpointIds: ["junction", "spawn"],
        fixedInputSequence: [
          { actions: ["move-forward"], axes: { moveYRatio: 1 }, ticks: 12 },
          { actions: ["jump"], ticks: 1 },
          { actions: ["move-forward"], ticks: 8 },
        ],
      }],
      deterministicBuild: {
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        requiresCandidateReplay: true as const,
        requiresWorldPackageIdentityAgreement: true as const,
        requiresBuildIdentityAgreement: true as const,
        requiresCaptureIdentityAgreement: true as const,
      },
    },
  };
}

function diagnostic(input: {
  readonly id: string;
  readonly code: WorldReconstructionDiagnosticCodeV1;
  readonly dimensionId: WorldReconstructionDimensionIdV1;
}): WorldReconstructionDiagnosticV1 {
  return parseWorldReconstructionDiagnosticV1({
    kind: "world-reconstruction-diagnostic",
    schemaVersion: 1,
    id: input.id,
    code: input.code,
    dimensionId: input.dimensionId,
    acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
    evidenceRefs: input.code === "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING" ||
        input.code === "WORLD_RECONSTRUCTION_EVIDENCE_STALE"
      ? []
      : [`artifact://case/cloud-temple/evidence/${input.dimensionId}.json`],
    message: `${input.code} on ${input.dimensionId}.`,
    repairAction: { kind: "revise-native-source" },
  });
}

function evaluationResult(input: {
  readonly attemptIndex: 0 | 1;
  readonly outcome: WorldReconstructionOutcomeV1;
  readonly diagnostics?: readonly WorldReconstructionDiagnosticV1[];
}): WorldReconstructionEvaluationResultV1 {
  const ids = identities(input.attemptIndex);
  const diagnostics = [...(input.diagnostics ?? [])].sort((left, right) => {
    const key = (value: WorldReconstructionDiagnosticV1) =>
      `${value.dimensionId}\0${value.code}\0${value.acceptanceTargetRef}`;
    return key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0;
  });
  const failedIds = new Set(
    diagnostics
      .filter((entry) =>
        entry.code !== "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING" &&
        entry.code !== "WORLD_RECONSTRUCTION_EVIDENCE_STALE"
      )
      .map(({ dimensionId }) => dimensionId),
  );
  const incompleteIds = new Set(
    diagnostics
      .filter((entry) =>
        entry.code === "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING" ||
        entry.code === "WORLD_RECONSTRUCTION_EVIDENCE_STALE"
      )
      .map(({ dimensionId }) => dimensionId),
  );
  return parseWorldReconstructionEvaluationResultV1({
    kind: "world-reconstruction-evaluation-result",
    schemaVersion: 1,
    id: `cloud-temple.attempt-${input.attemptIndex}.result`,
    caseRef: "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/case.json",
    caseHash: H("d"),
    evaluationProfileRef: "artifact://case/cloud-temple/evaluation-profile.json",
    evaluationProfileHash: H("e"),
    evidenceSetRef: `artifact://run/attempts/${input.attemptIndex}/evidence-set.json`,
    evidenceSetHash: taggedHash(`e${input.attemptIndex}set`),
    attemptRef: ids.sceneAuthoringAttemptRef,
    attemptHash: ids.sceneAuthoringAttemptHash,
    worldPackageRef: ids.worldPackageRef,
    worldPackageRootHash: ids.worldPackageRootHash,
    worldBuildIdentityRef: ids.worldBuildIdentityRef,
    worldBuildIdentityHash: ids.worldBuildIdentityHash,
    captureReceiptRef: ids.captureReceiptRef,
    captureReceiptHash: ids.captureReceiptHash,
    outcome: input.outcome,
    diagnostics,
    dimensions: DIMENSIONS.map((dimensionId) => {
      const dimensionDiagnostics = diagnostics.filter(
        (entry) => entry.dimensionId === dimensionId,
      );
      const isFailed = failedIds.has(dimensionId);
      const isIncomplete = incompleteIds.has(dimensionId);
      return {
        dimensionId,
        status: isIncomplete ? "incomplete" : isFailed ? "failed" : "passed",
        metrics: isIncomplete
          ? []
          : isFailed && dimensionId === "deterministic-build"
            ? [{ kind: "identity-match", isMatch: false }]
            : [{ kind: "boolean-presence", isPresent: !isFailed }],
        evidenceRefs: isIncomplete
          ? []
          : [`artifact://case/cloud-temple/evidence/${dimensionId}.json`],
        diagnosticIds: dimensionDiagnostics.map(({ id }) => id).sort(),
        identity: {
          attemptHash: ids.sceneAuthoringAttemptHash,
          worldPackageRootHash: ids.worldPackageRootHash,
          worldBuildIdentityHash: ids.worldBuildIdentityHash,
          captureReceiptHash: ids.captureReceiptHash,
        },
      };
    }),
  });
}

function generateResult(
  attemptIndex: 0 | 1,
  outcome: WorldReconstructionGeneratePortResultV1["outcome"] = "completed",
): WorldReconstructionGeneratePortResultV1 {
  const ids = identities(attemptIndex);
  return Object.freeze({
    outcome,
    requestId: `native-block-generation-cloud-temple-t-gate-native-block-formal-20260831-attempt-${attemptIndex}`,
    requestHash: ids.routerTaskPayloadHash,
    generationRequestRef: ids.generationRequestRef,
    generationRequestHash: ids.generationRequestHash,
    generationReceiptRef: ids.generationReceiptRef,
    generationReceiptHash: ids.generationReceiptHash,
    sceneAuthoringAttemptRef: ids.sceneAuthoringAttemptRef,
    sceneAuthoringAttemptHash: ids.sceneAuthoringAttemptHash,
    diagnosticCodes: outcome === "completed" ? [] : [outcome],
  });
}

interface FakePortOptions {
  readonly generateOutcomeByAttempt?:
    readonly WorldReconstructionGeneratePortResultV1["outcome"][];
  readonly generateHashOverrideByAttempt?: readonly (Sha256HashV1 | undefined)[];
  readonly packageOutcomeByAttempt?: readonly ("completed" | "check-failed" | "package-failed")[];
  readonly captureOutcomeByAttempt?:
    readonly ("completed" | "failed" | "camera-rollback-failed")[];
  readonly evaluationByAttempt?: readonly WorldReconstructionEvaluationResultV1[];
  readonly evaluateThrows?: boolean;
  readonly cleanup?: WorldReconstructionRunPortsV1["cleanup"];
  readonly rehash?: WorldReconstructionRunPortsV1["rehashOwnerIdentities"];
}

function fakePorts(options: FakePortOptions = {}) {
  const calls = {
    generate: [] as number[],
    package: [] as number[],
    capture: [] as number[],
    evaluate: [] as number[],
    cleanup: 0,
    generateInputs: [] as Readonly<{
      attemptIndex: 0 | 1;
      requestId: string;
      frozenOwnerIdentities: typeof OWNER;
      repairInstruction?: unknown;
    }>[],
  };
  const ports: WorldReconstructionRunPortsV1 = {
    generate: async (input) => {
      calls.generate.push(input.attemptIndex);
      calls.generateInputs.push({
        attemptIndex: input.attemptIndex,
        requestId: input.requestId,
        frozenOwnerIdentities: input.frozenOwnerIdentities,
        ...(isNil(input.repairInstruction)
          ? {}
          : { repairInstruction: input.repairInstruction }),
      });
      const result = generateResult(
        input.attemptIndex,
        options.generateOutcomeByAttempt?.[input.attemptIndex] ?? "completed",
      );
      const override = options.generateHashOverrideByAttempt?.[input.attemptIndex];
      return isNil(override)
        ? result
        : Object.freeze({ ...result, requestHash: override });
    },
    package: async (input) => {
      calls.package.push(input.attemptIndex);
      const ids = identities(input.attemptIndex);
      const outcome = options.packageOutcomeByAttempt?.[input.attemptIndex] ??
        "completed";
      return Object.freeze({
        outcome,
        sceneAuthoringAttemptResultRef: ids.sceneAuthoringAttemptResultRef,
        sceneAuthoringAttemptResultHash: ids.sceneAuthoringAttemptResultHash,
        authoredSourceRef: ids.authoredSourceRef,
        authoredSourceHash: ids.authoredSourceHash,
        worldPackageRef: ids.worldPackageRef,
        worldPackageRootHash: ids.worldPackageRootHash,
        worldPackagePath: ids.worldPackagePath,
        worldPackageBuildReceiptRef: ids.worldPackageBuildReceiptRef,
        worldPackageBuildReceiptHash: ids.worldPackageBuildReceiptHash,
        worldBuildIdentityRef: ids.worldBuildIdentityRef,
        worldBuildIdentityHash: ids.worldBuildIdentityHash,
        diagnosticCodes: outcome === "completed" ? [] : [outcome],
      });
    },
    capture: async (input) => {
      calls.capture.push(input.attemptIndex);
      const ids = identities(input.attemptIndex);
      const outcome = options.captureOutcomeByAttempt?.[input.attemptIndex] ??
        "completed";
      if (outcome === "completed") {
        return Object.freeze({
          outcome,
          captureReceiptRef: ids.captureReceiptRef,
          captureReceiptHash: ids.captureReceiptHash,
          captureReceiptPath: ids.captureReceiptPath,
          cameraRollbackOutcome: "completed" as const,
          diagnosticCodes: Object.freeze([]),
        });
      }
      return Object.freeze({
        outcome,
        cameraRollbackOutcome: outcome === "camera-rollback-failed"
          ? "failed" as const
          : "completed" as const,
        diagnosticCodes: Object.freeze([outcome]),
      });
    },
    evaluate: async (input) => {
      calls.evaluate.push(input.attemptIndex);
      if (options.evaluateThrows === true) {
        throw new Error("WORLD_RECONSTRUCTION_EVALUATION_FAILED");
      }
      const evaluation = options.evaluationByAttempt?.[input.attemptIndex] ??
        evaluationResult({ attemptIndex: input.attemptIndex, outcome: "passed" });
      return Object.freeze({
        outcome: evaluation.outcome,
        evaluation,
        evaluationPath: identities(input.attemptIndex).evaluationPath,
        evaluationHash: hashWorldReconstructionEvaluationResultV1(evaluation),
        diagnosticCodes: evaluation.diagnostics.map(({ code }) => code),
      });
    },
    rehashOwnerIdentities: options.rehash ?? (async () => OWNER),
    cleanup: options.cleanup ?? (async () => {
      calls.cleanup += 1;
      return Object.freeze({
        providerTask: "completed" as const,
        candidate: "completed" as const,
        hostedBrowserSession: "completed" as const,
        viteServer: "completed" as const,
        temporaryDirectories: "completed" as const,
        outputPromotion: "completed" as const,
      });
    }),
  };
  return { ports, calls };
}

function runInput(
  outputDirectoryPath: string,
  caseRef = CASE_REF,
) {
  return {
    runId: "formal-20260831",
    backend: "local" as const,
    outputDirectoryPath,
    caseRef,
    reconstructionCase: reconstructionCase(),
    evaluationProfile: profile(),
    frozenOwnerIdentities: OWNER,
  };
}

describe("runWorldReconstructionV1", () => {
  it("keeps the core unavailable from the CLI until concrete production ports exist", async () => {
    const [packageJson, cliSource, runSource, journalSource] = await Promise.all([
      readFile(path.resolve("package.json"), "utf8"),
      readFile(path.resolve("scripts/cli/worldkit.ts"), "utf8"),
      readFile(new URL("./run.ts", import.meta.url), "utf8"),
      readFile(new URL("./run-journal.ts", import.meta.url), "utf8"),
    ]);
    expect(packageJson).not.toContain('"reconstruct:run"');
    expect(cliSource).not.toContain("runWorldReconstructionV1");
    expect(cliSource).not.toContain("reconstruct run <case.json>");
    expect(runSource).not.toContain("mergeReconciledRequest");
    expect(runSource).not.toContain("readonly reconcile:");
    expect(journalSource).not.toContain("WorldReconstructionReconcileResultV1");
  });

  it("repairs WORLD_RECONSTRUCTION_COLLIDER_MISSING once and publishes distinct Attempt identities", async () => {
    const outputDirectoryPath = await outputRoot();
    const failed = evaluationResult({
      attemptIndex: 0,
      outcome: "failed",
      diagnostics: [diagnostic({
        id: "diag.collider-missing",
        code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
        dimensionId: "collider",
      })],
    });
    const passed = evaluationResult({ attemptIndex: 1, outcome: "passed" });
    const { ports, calls } = fakePorts({
      evaluationByAttempt: [failed, passed],
    });
    const receipt = await runWorldReconstructionV1(
      runInput(outputDirectoryPath),
      ports,
    );
    const parsed = parseWorldReconstructionRunReceiptV1(receipt);
    expect(parsed.outcome).toBe("passed");
    expect(parsed.attempts).toHaveLength(2);
    expect(parsed.finalAttemptIndex).toBe(1);
    expect(parsed.cleanupOutcome).toBe("completed");
    expect(failed.diagnostics[0]?.code).toBe(
      "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
    );
    expect(calls.generate).toEqual([0, 1]);
    expect(calls.package).toEqual([0, 1]);
    expect(calls.capture).toEqual([0, 1]);
    expect(calls.evaluate).toEqual([0, 1]);
    expect(parsed.attempts[0]?.generationRequestHash).not.toBe(
      parsed.attempts[1]?.generationRequestHash,
    );
    expect(parsed.attempts[0]?.sceneAuthoringAttemptHash).not.toBe(
      parsed.attempts[1]?.sceneAuthoringAttemptHash,
    );
    expect(parsed.attempts[0]?.worldPackageRootHash).not.toBe(
      parsed.attempts[1]?.worldPackageRootHash,
    );
    expect(parsed.attempts[0]?.captureReceiptHash).not.toBe(
      parsed.attempts[1]?.captureReceiptHash,
    );
    expect(parsed.attempts[0]?.evaluationResultHash).not.toBe(
      parsed.attempts[1]?.evaluationResultHash,
    );
    expect(calls.generateInputs[0]?.frozenOwnerIdentities).toEqual(OWNER);
    expect(calls.generateInputs[1]?.frozenOwnerIdentities).toEqual(OWNER);
    expect(calls.generateInputs[1]?.repairInstruction).toEqual(
      expect.objectContaining({
        priorSourceRef: identities(0).authoredSourceRef,
        priorSourceHash: identities(0).authoredSourceHash,
        declaredWritableOutputPaths: [
          "scene.ts",
          "native-block-authoring.json",
          "native-resources.json",
        ],
        frozenOwnerIdentities: OWNER,
      }),
    );
    expect(isNil(calls.generateInputs[0]?.repairInstruction)).toBe(true);
    expect(calls.generateInputs[0]?.requestId).not.toBe(
      calls.generateInputs[1]?.requestId,
    );
  });

  it("preserves the canonical Case artifact Ref through the journal and terminal receipt so Final can derive its run receipt Ref", async () => {
    const outputDirectoryPath = await outputRoot();
    const { ports } = fakePorts({
      evaluationByAttempt: [
        evaluationResult({ attemptIndex: 0, outcome: "passed" }),
      ],
    });

    const receipt = await runWorldReconstructionV1(
      runInput(outputDirectoryPath),
      ports,
    );
    const publishedReceipt = parseWorldReconstructionRunReceiptV1(JSON.parse(
      await readFile(path.join(outputDirectoryPath, "run-receipt.json"), "utf8"),
    ));
    const journalRows = (await readFile(
      path.join(outputDirectoryPath, "journal.jsonl"),
      "utf8",
    )).trim().split("\n").map((line) => JSON.parse(line) as { caseRef: string });

    expect(receipt.caseRef).toBe(CASE_REF);
    expect(publishedReceipt.caseRef).toBe(CASE_REF);
    expect(journalRows.every(({ caseRef }) => caseRef === CASE_REF)).toBe(true);
    expect(
      `${receipt.caseRef.slice(0, -"/case.json".length)}/runs/${
        path.basename(outputDirectoryPath)
      }/run-receipt.json`,
    ).toBe(
      `artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/runs/${
        path.basename(outputDirectoryPath)
      }/run-receipt.json`,
    );
  });

  it.each([
    "",
    "cloud-temple-t-gate-native-block",
    "worldkit://world-reconstruction-case/cloud-temple@1/case.json",
    "artifact:///case.json",
    "artifact://case/cloud-temple/not-case.json",
    " artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/case.json",
    "artifact://case/cloud-temple/../case.json",
  ])("rejects non-canonical Case artifact Ref %j before any stage", async (caseRef) => {
    const { ports, calls } = fakePorts();

    await expect(runWorldReconstructionV1(
      runInput(await outputRoot(), caseRef),
      ports,
    )).rejects.toMatchObject({
      diagnosticCodes: ["WORLD_RECONSTRUCTION_CASE_REF_INVALID"],
    });
    expect(calls.cleanup).toBe(1);
    expect(calls.generate).toEqual([]);
    expect(calls.package).toEqual([]);
    expect(calls.capture).toEqual([]);
    expect(calls.evaluate).toEqual([]);
  });

  it("skips repair when Attempt 0 passes", async () => {
    const outputDirectoryPath = await outputRoot();
    const { ports, calls } = fakePorts({
      evaluationByAttempt: [
        evaluationResult({ attemptIndex: 0, outcome: "passed" }),
      ],
    });
    const receipt = await runWorldReconstructionV1(
      runInput(outputDirectoryPath),
      ports,
    );
    expect(receipt.attempts).toHaveLength(1);
    expect(receipt.outcome).toBe("passed");
    expect(receipt.finalAttemptIndex).toBe(0);
    expect(calls.generate).toEqual([0]);
    expect(calls.evaluate).toEqual([0]);
  });

  it("fails closed without a passed receipt when Attempt 0 is incomplete", async () => {
    const outputDirectoryPath = await outputRoot();
    const { ports, calls } = fakePorts({
      evaluationByAttempt: [evaluationResult({
        attemptIndex: 0,
        outcome: "incomplete",
        diagnostics: [diagnostic({
          id: "diag.missing",
          code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
          dimensionId: "spawn-support",
        })],
      })],
    });
    const receipt = await runWorldReconstructionV1(
      runInput(outputDirectoryPath),
      ports,
    );
    expect(receipt.outcome).toBe("incomplete");
    expect(receipt.attempts).toHaveLength(1);
    expect(calls.generate).toEqual([0]);
    expect(calls.generate).not.toContain(1);
    const names = await readdir(outputDirectoryPath);
    expect(names).not.toContain("final");
  });

  it("fails closed on a non-repairable diagnostic without Attempt 1", async () => {
    const outputDirectoryPath = await outputRoot();
    const { ports, calls } = fakePorts({
      evaluationByAttempt: [evaluationResult({
        attemptIndex: 0,
        outcome: "failed",
        diagnostics: [diagnostic({
          id: "diag.build",
          code: "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC",
          dimensionId: "deterministic-build",
        })],
      })],
    });
    const receipt = await runWorldReconstructionV1(
      runInput(outputDirectoryPath),
      ports,
    );
    expect(receipt.outcome).toBe("failed");
    expect(receipt.attempts).toHaveLength(1);
    expect(calls.generate).toEqual([0]);
  });

  it("fails closed when a generation response pairs its request with another attempt's hash", async () => {
    const outputDirectoryPath = await outputRoot();
    const { ports, calls } = fakePorts({
      evaluationByAttempt: [evaluationResult({
        attemptIndex: 0,
        outcome: "failed",
        diagnostics: [diagnostic({
          id: "diag.collider-missing",
          code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
          dimensionId: "collider",
        })],
      })],
      generateHashOverrideByAttempt: [
        undefined,
        identities(0).routerTaskPayloadHash,
      ],
    });

    await expect(runWorldReconstructionV1(
      runInput(outputDirectoryPath),
      ports,
    )).rejects.toMatchObject({
      diagnosticCodes: ["WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH"],
    });
    expect(calls.generate).toEqual([0, 1]);
    expect(calls.package).toEqual([0]);
    expect(calls.capture).toEqual([0]);
    expect(calls.evaluate).toEqual([0]);
  });

  it("fails closed on stale Case/Profile/Gameplay/World Runtime/Bounds/Bootstrap before submission", async () => {
    const outputDirectoryPath = await outputRoot();
    const fields = [
      ["caseHash", "WORLD_RECONSTRUCTION_STALE_CASE"],
      ["evaluationProfileHash", "WORLD_RECONSTRUCTION_STALE_PROFILE"],
      ["gameplayBootstrapHash", "WORLD_RECONSTRUCTION_STALE_GAMEPLAY_BOOTSTRAP"],
      [
        "worldRuntimeBootstrapHash",
        "WORLD_RECONSTRUCTION_STALE_WORLD_RUNTIME_BOOTSTRAP",
      ],
      ["worldBoundsHash", "WORLD_RECONSTRUCTION_STALE_WORLD_BOUNDS"],
      ["bootstrapInputHash", "WORLD_RECONSTRUCTION_STALE_BOOTSTRAP"],
    ] as const;
    for (const [field, code] of fields) {
      const { ports, calls } = fakePorts({
        rehash: async () => ({ ...OWNER, [field]: H("9") }),
      });
      await expect(runWorldReconstructionV1(
        runInput(outputDirectoryPath),
        ports,
      )).rejects.toBeInstanceOf(WorldReconstructionRunClosedErrorV1);
      await expect(runWorldReconstructionV1(
        runInput(await outputRoot()),
        ports,
      )).rejects.toMatchObject({ diagnosticCodes: [code] });
      expect(calls.generate).toEqual([]);
    }
  });

  it("treats a generation-owner unknown result as terminal without a second reconcile API", async () => {
    const outputDirectoryPath = await outputRoot();
    const { ports, calls } = fakePorts({
      generateOutcomeByAttempt: ["unknown"],
    });
    await expect(runWorldReconstructionV1(
      runInput(outputDirectoryPath),
      ports,
    )).rejects.toMatchObject({
      diagnosticCodes: ["WORLD_RECONSTRUCTION_CREATION_OUTCOME_UNKNOWN"],
    });
    expect(calls.generate).toEqual([0]);
    expect(calls.package).toEqual([]);
  });

  it.each([
    ["no-output", "WORLD_RECONSTRUCTION_NO_OUTPUT"],
    ["empty-output", "WORLD_RECONSTRUCTION_EMPTY_OUTPUT"],
  ] as const)("fails closed on %s without packaging", async (outcome, code) => {
    const { ports, calls } = fakePorts({
      generateOutcomeByAttempt: [outcome],
    });
    await expect(runWorldReconstructionV1(
      runInput(await outputRoot()),
      ports,
    )).rejects.toMatchObject({ diagnosticCodes: [code] });
    expect(calls.package).toEqual([]);
    expect(calls.capture).toEqual([]);
  });

  it.each([
    ["check-failed", "WORLD_RECONSTRUCTION_CHECK_FAILED"],
    ["package-failed", "WORLD_RECONSTRUCTION_PACKAGE_FAILED"],
  ] as const)("fails closed on %s", async (outcome, code) => {
    const { ports, calls } = fakePorts({
      packageOutcomeByAttempt: [outcome],
    });
    await expect(runWorldReconstructionV1(
      runInput(await outputRoot()),
      ports,
    )).rejects.toMatchObject({ diagnosticCodes: [code] });
    expect(calls.capture).toEqual([]);
  });

  it("fails closed on capture, evaluation, and camera rollback", async () => {
    const capture = fakePorts({
      captureOutcomeByAttempt: ["failed"],
    });
    await expect(runWorldReconstructionV1(
      runInput(await outputRoot()),
      capture.ports,
    )).rejects.toMatchObject({
      diagnosticCodes: ["WORLD_RECONSTRUCTION_CAPTURE_FAILED"],
    });
    expect(capture.calls.evaluate).toEqual([]);

    const rollback = fakePorts({
      captureOutcomeByAttempt: ["camera-rollback-failed"],
    });
    await expect(runWorldReconstructionV1(
      runInput(await outputRoot()),
      rollback.ports,
    )).rejects.toMatchObject({
      diagnosticCodes: ["WORLD_RECONSTRUCTION_CAMERA_ROLLBACK_FAILED"],
    });

    const evaluation = fakePorts({ evaluateThrows: true });
    await expect(runWorldReconstructionV1(
      runInput(await outputRoot()),
      evaluation.ports,
    )).rejects.toMatchObject({
      diagnosticCodes: ["WORLD_RECONSTRUCTION_EVALUATION_FAILED"],
    });
  });

  it("publishes an incomplete receipt when cleanup fails after evaluation", async () => {
    const { ports } = fakePorts({
      evaluationByAttempt: [
        evaluationResult({ attemptIndex: 0, outcome: "passed" }),
      ],
      cleanup: async () => Object.freeze({
        providerTask: "completed" as const,
        candidate: "failed" as const,
        hostedBrowserSession: "completed" as const,
        viteServer: "completed" as const,
        temporaryDirectories: "completed" as const,
        outputPromotion: "completed" as const,
      }),
    });
    const receipt = await runWorldReconstructionV1(
      runInput(await outputRoot()),
      ports,
    );
    expect(receipt.cleanupOutcome).toBe("failed");
    expect(receipt.outcome).toBe("incomplete");
  });

});
