import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sha256Bytes, sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import { createGameplayBootstrapV1, parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { createWorldRuntimeBootstrapV1, parseWorldRuntimeBootstrapV1 } from "@whitebox-world/runtime-contracts";
import { decideSceneAuthoringRouteV1, parseSceneAuthoringRouteDecisionV1, type SceneAuthoringRouteDecisionV1 } from "@whitebox-world/scene-authoring-contracts";
import { hashWorldReconstructionEvaluationProfileV1, parseWorldReconstructionCaseV1, parseWorldReconstructionDiagnosticV1, parseWorldReconstructionEvaluationProfileV1 } from "@whitebox-world/validation";

import {
  decideNativeBlockReconstructionRouteV1,
  deriveNativeBlockGenerationBootstrapV1,
  NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1,
  NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1,
  prepareNativeBlockGenerationTaskV1,
  resolveWorldReconstructionFrozenOwnerIdentitiesV1,
} from "./generation-request.js";
import { createNativeBlockRepairInstructionV1 } from "./repair-request.js";
import { BNA2_WHITEBOX_ADMISSION_BUDGET_V1 } from
  "../native-scene/admission-budget.js";

const hash = (character: string) => `sha256:${character.repeat(64)}` as `sha256:${string}`;
const API_HASH = hash("a");
const SCENE_PROFILE_HASH = hash("b");
const BLOCK_PROFILE_HASH = hash("c");
const TRUSTED_LOCAL_HASH = sha256CanonicalJson({ id: "trusted-local", version: 1 }) as `sha256:${string}`;

function resolutionDescriptor(
  resourceKind: "native-scene-api" | "native-scene-profile" | "native-block-profile",
  resourceRef: string,
  contentHash: `sha256:${string}`,
): string {
  return stringifyCanonicalJson({
    kind: "worldkit-resolved-resource",
    schemaVersion: 1,
    resourceKind,
    resourceRef,
    resolvedVersion: "1",
    contentHash,
  });
}

async function fixture(): Promise<Readonly<{ root: string; inputDirectory: string; routeDecision: SceneAuthoringRouteDecisionV1 }>> {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-generation-request-"));
  const inputDirectory = path.join(root, "inputs");
  await Promise.all([
    mkdir(path.join(inputDirectory, "builder-skill", "references"), { recursive: true }),
    mkdir(path.join(inputDirectory, "builder-skill", "scripts"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(inputDirectory, "scene-brief.md"), "# Cloud Temple\n"),
    writeFile(path.join(inputDirectory, "reference-0.png"), "reference"),
    writeFile(path.join(inputDirectory, "native-scene-api.json"), resolutionDescriptor("native-scene-api", "worldkit://native-scene-api/babylon@1", API_HASH)),
    writeFile(path.join(inputDirectory, "native-scene-profile.json"), resolutionDescriptor("native-scene-profile", "worldkit://native-scene-profile/whitebox.blocks@1", SCENE_PROFILE_HASH)),
    writeFile(path.join(inputDirectory, "block-profile.json"), resolutionDescriptor("native-block-profile", "worldkit://native-block-profile/whitebox.blocks@1", BLOCK_PROFILE_HASH)),
    writeFile(path.join(inputDirectory, "instruction.md"), "Build exactly the declared files.\n"),
    writeFile(path.join(inputDirectory, "builder-skill", "SKILL.md"), "# Builder\n"),
    writeFile(path.join(inputDirectory, "builder-skill", "references", "native-block-output-contract.md"), "# Contract\n"),
    writeFile(path.join(inputDirectory, "builder-skill", "scripts", "self-check.mjs"), "export {};\n"),
  ]);
  const sceneBriefHash = sha256Bytes(new TextEncoder().encode("# Cloud Temple\n")) as `sha256:${string}`;
  const routeDecision = decideSceneAuthoringRouteV1({
    id: "cloud-temple-t-gate-native-block-route",
    sceneBriefRef: "scene-brief.md",
    sceneBriefHash,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: TRUSTED_LOCAL_HASH,
    requiredCapabilityRefs: [],
    requestedSourceKind: "babylon-native",
    nativeTrustAdmitted: true,
    referenceDrivenDistinctiveSilhouette: true,
  });
  return { root, inputDirectory, routeDecision };
}

async function writePriorRepairContext(
  priorAttemptRoot: string,
  input: Readonly<{
    sceneAuthoringAttemptRef: string;
    sceneAuthoringAttemptHash: `sha256:${string}`;
    priorSourceRef: string;
    priorSourceHash: `sha256:${string}`;
    evaluationText: string;
  }>,
): Promise<void> {
  await Promise.all([
    mkdir(path.join(priorAttemptRoot, "source"), { recursive: true }),
    mkdir(path.join(priorAttemptRoot, "capture"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(priorAttemptRoot, "source", "scene.ts"), "export default {}\n"),
    writeFile(path.join(priorAttemptRoot, "source", "native-block-authoring.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "source", "native-resources.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "attempt-result.json"), stringifyCanonicalJson({
      kind: "scene-authoring-attempt-result",
      schemaVersion: 1,
      id: "cloud-temple-t-gate-native-block-attempt-0-result",
      sceneAuthoringAttemptRef: input.sceneAuthoringAttemptRef,
      sceneAuthoringAttemptHash: input.sceneAuthoringAttemptHash,
      outcome: "completed",
      authoredSourceRef: input.priorSourceRef,
      authoredSourceHash: input.priorSourceHash,
      evidenceRefs: ["worldkit://native-scene-check-result/cloud-temple@1"],
    })),
    writeFile(path.join(priorAttemptRoot, "evaluation.json"), input.evaluationText),
    writeFile(path.join(priorAttemptRoot, "capture", "opening.png"), "opening"),
    writeFile(path.join(priorAttemptRoot, "capture", "opening-observation.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "capture", "collider-overlay.png"), "collider"),
    writeFile(path.join(priorAttemptRoot, "capture", "collider-overlay-observation.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "capture", "spawn-support-observation.json"), "{}"),
    writeFile(path.join(priorAttemptRoot, "capture", "scripted-traversal.json"), "{}"),
  ]);
}

function input(fixtureValue: Awaited<ReturnType<typeof fixture>>) {
  const profile = parseWorldReconstructionEvaluationProfileV1({ kind: "world-reconstruction-evaluation-profile", schemaVersion: 1, id: "cloud-temple-profile", dimensionIds: ["collider", "critical-traversal", "deterministic-build", "opening-composition", "semantic-silhouette", "spawn-support", "topology"], maximumRepairAttemptCount: 1, builderSelfRepairAttemptCount: 0, thresholds: { semanticSilhouetteTargets: [{ acceptanceTargetRef: "worldkit://acceptance-target/gate@1", maximumBoundsDriftBasisPoints: 100, maximumCenterDriftBasisPoints: 100, maximumCoverageDriftBasisPoints: 100 }], openingComposition: { regions: [{ targetRef: "worldkit://composition-target/opening@1", maximumDriftBasisPoints: 100 }], anchors: [{ targetRef: "worldkit://composition-target/opening@1", maximumDriftBasisPoints: 100 }], maximumOrderDistanceBasisPoints: 100 }, spawnSupport: { maximumPositionDriftMillimeters: 100, maximumSupportGapMillimeters: 10 } }, requiredEvidenceByDimension: ["collider", "critical-traversal", "deterministic-build", "opening-composition", "semantic-silhouette", "spawn-support", "topology"].map((dimensionId) => ({ dimensionId, evidenceProfileRefs: [`worldkit://evidence/${dimensionId}@1`] })) });
  const requiredEvidenceProfileRefs = profile.requiredEvidenceByDimension
    .flatMap((entry) => entry.evidenceProfileRefs)
    .sort();
  const reconstructionCase = parseWorldReconstructionCaseV1({
    kind: "world-reconstruction-case", schemaVersion: 1, id: "cloud-temple-t-gate-native-block", sceneBriefRef: "scene-brief.md", sceneBriefHash: fixtureValue.routeDecision.sceneBriefHash,
    referenceInputs: [{ inputRef: "reference-0.png", contentHash: sha256Bytes(new TextEncoder().encode("reference")), mediaType: "image/png" }], evaluationProfileRef: "evaluation-profile.json", evaluationProfileHash: hashWorldReconstructionEvaluationProfileV1(profile), formalCaptureIntentRef: "inputs/formal-world-capture-intent.json", formalCaptureIntentHash: sha256Bytes(new TextEncoder().encode("intent")), acceptanceTargetRefs: ["worldkit://acceptance-target/gate@1"], requiredEvidenceProfileRefs,
    expected: {
      topology: { acceptanceTargetRef: "worldkit://acceptance-target/gate@1", nodeIds: ["gate", "spawn"], relations: [{ fromNodeId: "gate", relation: "connects-to", toNodeId: "spawn" }], layerIds: ["main"] },
      semanticSilhouetteTargets: [{ acceptanceTargetRef: "worldkit://acceptance-target/gate@1", visualGroupId: "gate", normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 100, maxXBasisPoints: 900, maxYBasisPoints: 900 }, normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 }, coverageBasisPoints: 5_000 }],
      openingComposition: { acceptanceTargetRef: "worldkit://acceptance-target/gate@1", targetRefs: ["worldkit://composition-target/opening@1"], regions: [{ targetRef: "worldkit://composition-target/opening@1", normalizedBounds: { minXBasisPoints: 100, minYBasisPoints: 100, maxXBasisPoints: 900, maxYBasisPoints: 900 } }], anchors: [{ targetRef: "worldkit://composition-target/opening@1", normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 } }], orderedTargetRefs: ["worldkit://composition-target/opening@1"] },
      spawnSupport: { acceptanceTargetRef: "worldkit://acceptance-target/gate@1", spawnMarkerId: "spawn", supportColliderId: "ground", expectedMedium: "ground", expectedPositionXYZMeters: { xMeters: 0, yMeters: 0, zMeters: 0 } },
      colliders: [{ acceptanceTargetRef: "worldkit://acceptance-target/gate@1", contributionId: "ground-contribution", colliderId: "ground", role: "ground", requiresOverlay: true }],
      criticalTraversalChecks: [{ acceptanceTargetRef: "worldkit://acceptance-target/gate@1", id: "walk", evidenceKind: "scripted-fixed-input", expectation: "pass", checkpointIds: ["spawn"], fixedInputSequence: [{ actions: ["move-forward"], axes: { moveYRatio: 1 }, ticks: 1 }] }],
      deterministicBuild: { acceptanceTargetRef: "worldkit://acceptance-target/gate@1", requiresCandidateReplay: true, requiresWorldPackageIdentityAgreement: true, requiresBuildIdentityAgreement: true, requiresCaptureIdentityAgreement: true },
    },
  });
  return {
    case: reconstructionCase,
    profile,
    routeDecision: fixtureValue.routeDecision,
    runId: "initial",
    attemptIndex: 0,
    backend: "cloud" as const,
    cloudOutputS3Root: "s3://bucket/worldkit",
    runDirectoryPath: path.join(fixtureValue.root, "runs", "initial"),
    inputDirectoryPath: fixtureValue.inputDirectory,
    taskInstructionPath: path.join(fixtureValue.inputDirectory, "instruction.md"),
    builderSkillPath: path.join(fixtureValue.inputDirectory, "builder-skill", "SKILL.md"),
    nativeSceneApiPath: path.join(fixtureValue.inputDirectory, "native-scene-api.json"),
    nativeSceneProfilePath: path.join(fixtureValue.inputDirectory, "native-scene-profile.json"),
    blockProfilePath: path.join(fixtureValue.inputDirectory, "block-profile.json"),
    hostClosureRootPath: path.resolve("apps/playground/public/world-packages/cloud-ridge"),
    gameplayBootstrapPath: path.resolve("apps/playground/public/world-packages/cloud-ridge/gameplay/bootstrap.json"),
    worldRuntimeBootstrapPath: path.resolve("apps/playground/public/world-packages/cloud-ridge/runtime/world-runtime-bootstrap.json"),
    worldRuntimeBootstrapRef: "worldkit://world-runtime-bootstrap/cloud-ridge@1",
    worldBoundsPath: path.join(fixtureValue.inputDirectory, "world-bounds.json"),
    worldBounds: {
      centerMetersXZ: [0, -15],
      sizeMetersXZ: [180, 180],
      heightRangeMeters: [-40, 100],
    } as const,
    bootstrapId: "fixture-native",
    sceneModuleRef: "worldkit://native-scene/fixture@1",
    seed: 17,
    budgets: {
      maximumBlockCount: 2000,
      maximumStaticColliderCount: 500,
      maximumStaticColliderVertexCount: 200000,
      maximumStaticColliderTriangleCount: 100000,
      maximumOutputBytes: 4000000,
      timeoutSeconds: NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1,
    },
  };
}

describe("prepareNativeBlockGenerationTaskV1", () => {
  it("freezes the same static Collider budget used by Native admission", () => {
    expect({
      maximumStaticColliderCount:
        NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1.maximumStaticColliderCount,
      maximumStaticColliderVertexCount:
        NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1.maximumStaticColliderVertexCount,
      maximumStaticColliderTriangleCount:
        NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1.maximumStaticColliderTriangleCount,
    }).toEqual(BNA2_WHITEBOX_ADMISSION_BUDGET_V1);
  });

  it("resolves the Case-bound Native route through the sole Host policy owner", async () => {
    const value = await fixture();
    const preparedInput = input(value);

    expect(decideNativeBlockReconstructionRouteV1(preparedInput.case, {
      requiredCapabilityRefs: [],
      requestedSourceKind: "babylon-native",
      nativeTrustAdmitted: true,
    })).toEqual(
      value.routeDecision,
    );
  });

  it("returns real Canonical and capability-gap decisions from Host route policy input", async () => {
    const value = await fixture();
    const reconstructionCase = input(value).case;

    expect(decideNativeBlockReconstructionRouteV1(reconstructionCase, {
      requiredCapabilityRefs: [],
      requestedSourceKind: "canonical",
      nativeTrustAdmitted: true,
    }).decision).toMatchObject({ kind: "canonical" });
    expect(decideNativeBlockReconstructionRouteV1(reconstructionCase, {
      requiredCapabilityRefs: ["worldkit://capability/route.nav@1"],
      requestedSourceKind: "babylon-native",
      nativeTrustAdmitted: true,
    }).decision).toEqual({
      kind: "capability-gap",
      unsupportedCapabilityRefs: ["worldkit://capability/route.nav@1"],
      reasonCodes: ["requires-canonical-route"],
    });
  });
  it("consumes the canonical Runtime Contracts Native Scene Profile owner", async () => {
    const source = await readFile(
      new URL("./generation-request.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("BABYLON_NATIVE_BLOCK_PROFILE_REF_V1");
    expect(source).not.toContain("const CURRENT_NATIVE_SCENE_PROFILE_REF");
    expect(source).not.toContain(
      '"worldkit://native-scene-profile/whitebox.blocks@1"',
    );
  });

  it("keeps the committed reconstruction Case and resource descriptors consumable", async () => {
    const caseRoot = path.resolve(
      "artifacts/scenes/cloud-temple-t-gate-native-block",
    );
    const [caseText, profileText] = await Promise.all([
      readFile(path.join(caseRoot, "case.json"), "utf8"),
      readFile(path.join(caseRoot, "evaluation-profile.json"), "utf8"),
    ]);
    const profile = parseWorldReconstructionEvaluationProfileV1(
      JSON.parse(profileText),
    );
    const reconstructionCase = parseWorldReconstructionCaseV1(
      JSON.parse(caseText),
    );
    expect(reconstructionCase.evaluationProfileHash).toBe(
      hashWorldReconstructionEvaluationProfileV1(profile),
    );
    for (const fileName of [
      "native-scene-api.json",
      "native-scene-profile.json",
      "block-profile.json",
    ]) {
      const descriptorText = await readFile(
        path.join(caseRoot, "inputs", fileName),
        "utf8",
      );
      expect(descriptorText).toBe(
        stringifyCanonicalJson(JSON.parse(descriptorText)),
      );
    }
  });

  it("rejects a Case whose required Evidence Profiles do not exactly close the Evaluation Profile", async () => {
    const value = await fixture();
    try {
      const preparedInput = input(value);
      preparedInput.case = parseWorldReconstructionCaseV1({
        ...preparedInput.case,
        requiredEvidenceProfileRefs: preparedInput.case.requiredEvidenceProfileRefs.slice(1),
      });
      await expect(prepareNativeBlockGenerationTaskV1(preparedInput)).rejects.toThrow(
        /evidence profile closure/i,
      );
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a Case semantic target without a matching Profile threshold before generation", async () => {
    const value = await fixture();
    try {
      const preparedInput = input(value);
      const extraTargetRef = "worldkit://acceptance-target/spire@1";
      const existingTarget = preparedInput.case.expected.semanticSilhouetteTargets[0]!;
      preparedInput.case = parseWorldReconstructionCaseV1({
        ...preparedInput.case,
        acceptanceTargetRefs: [
          ...preparedInput.case.acceptanceTargetRefs,
          extraTargetRef,
        ],
        expected: {
          ...preparedInput.case.expected,
          semanticSilhouetteTargets: [
            ...preparedInput.case.expected.semanticSilhouetteTargets,
            {
              ...existingTarget,
              acceptanceTargetRef: extraTargetRef,
              visualGroupId: "spire",
            },
          ],
        },
      });
      await expect(prepareNativeBlockGenerationTaskV1(preparedInput)).rejects.toThrow(
        /evidence profile closure/i,
      );
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("freezes one canonical native request with three declared router outputs", async () => {
    const value = await fixture();
    try {
      const prepared = await prepareNativeBlockGenerationTaskV1(input(value));
      expect(prepared.routerArguments.filter((argument) => argument === "--output")).toHaveLength(3);
      expect(prepared.routerArguments).toContain(
        "s3://bucket/worldkit/cloud-temple-t-gate-native-block/initial/attempt-0",
      );
      expect(prepared.routerArguments).toEqual(expect.arrayContaining([
        "--execution-profile", "formal", "--submit-attempts", "1",
        "--timeout-seconds", "1800",
      ]));
      expect(NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1).toBe(1_800);
      expect(prepared.generationRequest.declaredOutputPaths).toEqual([
        "scene.ts", "native-block-authoring.json", "native-resources.json",
      ]);
      expect(prepared.generationRequest).toMatchObject({
        nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
        nativeSceneApiHash: API_HASH,
        nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
        nativeSceneProfileHash: SCENE_PROFILE_HASH,
        blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
        blockProfileHash: BLOCK_PROFILE_HASH,
      });
      expect(prepared.routerRequestId).toMatch(/^native-block-generation-/);
      expect(prepared.routerArguments).not.toContain(value.root);
      expect(prepared.attempt.sourceInput.kind).toBe("babylon-native");
      expect(prepared.generationRequest.bootstrapInputHash).toBe(
        sha256Bytes(prepared.bootstrapBytes),
      );
      expect(new TextDecoder().decode(prepared.bootstrapBytes)).not.toMatch(/\n$/);
      expect(prepared.bootstrap).toMatchObject({
        gameplayBootstrapRef: "worldkit://gameplay-bootstrap/g-bot-subject-world.8201@1",
        initialControlledEntityId: "g-bot-primary",
        spawnMarkerId: "spawn",
        seed: 17,
      });
      expect(prepared.generationRequest.contextInputs.map((entry) => entry.inputRef)).toEqual(
        expect.arrayContaining([
          "inputs/gameplay-bootstrap.json",
          "inputs/world-runtime-bootstrap.json",
          "inputs/world-bounds.json",
          "inputs/registry-lock.json",
        ]),
      );
      expect(prepared.frozenOwnerIdentities).toEqual(
        resolveWorldReconstructionFrozenOwnerIdentitiesV1({
          reconstructionCase: input(value).case,
          evaluationProfile: input(value).profile,
          gameplayBootstrap: JSON.parse(new TextDecoder().decode(prepared.gameplayBootstrapBytes)),
          worldRuntimeBootstrap: JSON.parse(new TextDecoder().decode(prepared.worldRuntimeBootstrapBytes)),
          worldBounds: JSON.parse(new TextDecoder().decode(prepared.worldBoundsBytes)),
          bootstrap: prepared.bootstrap,
        }),
      );
      expect(() => resolveWorldReconstructionFrozenOwnerIdentitiesV1({
        reconstructionCase: input(value).case,
        evaluationProfile: input(value).profile,
        gameplayBootstrap: JSON.parse(new TextDecoder().decode(prepared.gameplayBootstrapBytes)),
        worldRuntimeBootstrap: JSON.parse(new TextDecoder().decode(prepared.worldRuntimeBootstrapBytes)),
        worldBounds: JSON.parse(new TextDecoder().decode(prepared.worldBoundsBytes)),
        bootstrap: {
          ...prepared.bootstrap,
          gravityMetersPerSecondSquaredXYZ: [0, -1, 0],
        },
      })).toThrowError("World reconstruction frozen owner identity closure failed");
      for (const contextInput of prepared.generationRequest.contextInputs) {
        const bytes = await readFile(path.join(prepared.taskWorkspacePath, contextInput.inputRef));
        expect(sha256Bytes(bytes)).toBe(contextInput.contentHash);
      }
      const attemptRoot = path.join(value.root, "runs", "initial", "attempts", "0");
      const durableRoute = JSON.parse(await readFile(path.join(attemptRoot, "scene-authoring-route-decision.json"), "utf8"));
      const durableRequest = JSON.parse(await readFile(path.join(attemptRoot, "generation-request.json"), "utf8"));
      const durableAttempt = JSON.parse(await readFile(path.join(attemptRoot, "attempt.json"), "utf8"));
      const hostClosure = JSON.parse(await readFile(path.join(attemptRoot, "inputs", "host-closure.json"), "utf8"));
      expect(sha256CanonicalJson(durableRoute)).toBe(prepared.generationRequest.routeDecisionHash);
      expect(durableRequest).toEqual(prepared.generationRequest);
      expect(durableAttempt).toEqual(prepared.attempt);
      expect(hostClosure).toMatchObject({
        kind: "native-block-generation-host-closure",
        worldRuntimeBootstrapRef: "worldkit://world-runtime-bootstrap/cloud-ridge@1",
        worldRuntimeBootstrapResolvedVersion: "1",
        worldRuntimeBootstrapHash: prepared.hostClosure.worldRuntimeBootstrapHash,
      });
      await rm(prepared.taskWorkspacePath, { recursive: true, force: false });
      for (const [name, expectedRef, expectedHash] of [
        ["native-scene-api.json", prepared.generationRequest.nativeSceneApiRef, prepared.generationRequest.nativeSceneApiHash],
        ["native-scene-profile.json", prepared.generationRequest.nativeSceneProfileRef, prepared.generationRequest.nativeSceneProfileHash],
        ["block-profile.json", prepared.generationRequest.blockProfileRef, prepared.generationRequest.blockProfileHash],
      ] as const) {
        const durableDescriptorBytes = await readFile(path.join(attemptRoot, "inputs", name));
        expect(durableDescriptorBytes).toEqual(await readFile(path.join(value.inputDirectory, name)));
        const descriptor = JSON.parse(new TextDecoder().decode(durableDescriptorBytes));
        expect(descriptor).toMatchObject({ resourceRef: expectedRef, contentHash: expectedHash });
      }
      expect(JSON.parse(await readFile(path.join(attemptRoot, "inputs", "host-closure.json"), "utf8"))).toEqual(hostClosure);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("forbids repair context on Attempt 0 and requires a canonical manifest-bound repair instruction on Attempt 1", async () => {
    const value = await fixture();
    try {
      const attempt0 = await prepareNativeBlockGenerationTaskV1(input(value));
      const repairInstruction = createNativeBlockRepairInstructionV1({
        diagnostics: [parseWorldReconstructionDiagnosticV1({
          kind: "world-reconstruction-diagnostic",
          schemaVersion: 1,
          id: "diag.collider-missing",
          code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
          dimensionId: "collider",
          acceptanceTargetRef: "worldkit://acceptance-target/gate@1",
          targetRef: "worldkit://acceptance-target/gate@1",
          targetId: "gate-wall",
          metricId: "collider-contribution-presence",
          details: {
            kind: "presence-mismatch",
            expectedValue: "present",
            actualValue: "missing",
            correctionDirection: "add",
          },
          evidenceRefs: ["artifact://run/attempts/0/evidence-set.json"],
          message: "Collider is missing.",
          repairAction: {
            kind: "revise-native-source",
            targetKind: "static-collider",
            targetId: "gate-wall",
            operation: "add",
            instruction: "Register the missing gate-wall static collider contribution.",
          },
        })],
        priorSourceRef: "artifact://run/attempts/0/source",
        priorSourceHash: hash("d"),
        priorEvidence: {
          kind: "evaluation-result",
          resultRef: "artifact://run/attempts/0/evaluation.json",
          resultHash: sha256Bytes(
            new TextEncoder().encode("{}"),
          ) as `sha256:${string}`,
        },
        priorGenerationRequestRef: "artifact://run/attempts/0/generation-request.json",
        priorGenerationRequestHash: attempt0.generationRequestHash,
        frozenOwnerIdentities: attempt0.frozenOwnerIdentities,
      });
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId: "attempt-zero-reject",
        runDirectoryPath: path.join(value.root, "runs", "attempt-zero-reject"),
        repairInstruction,
      })).rejects.toThrowError("Initial generation attempt must not declare a repair instruction");
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 1,
        runId: "attempt-one-missing",
        runDirectoryPath: path.join(value.root, "runs", "attempt-one-missing"),
      })).rejects.toThrowError("Repair generation attempt requires one repair instruction");

      const priorAttemptRoot = path.join(value.root, "runs", "initial", "attempts", "0");
      await writePriorRepairContext(priorAttemptRoot, {
        sceneAuthoringAttemptRef: `worldkit://scene-authoring-attempt/${attempt0.attempt.id}@1`,
        sceneAuthoringAttemptHash: attempt0.attemptHash,
        priorSourceRef: repairInstruction.priorSourceRef,
        priorSourceHash: repairInstruction.priorSourceHash,
        evaluationText: "{}",
      });

      const priorEvaluationPath = path.join(priorAttemptRoot, "evaluation.json");
      await writeFile(priorEvaluationPath, '{"forged":true}');
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 1,
        repairInstruction,
      })).rejects.toThrowError("Repair prior evidence identity closure failed");
      await writeFile(priorEvaluationPath, "{}");

      const priorAttemptResultPath = path.join(priorAttemptRoot, "attempt-result.json");
      const priorAttemptResult = JSON.parse(await readFile(priorAttemptResultPath, "utf8"));
      await writeFile(priorAttemptResultPath, stringifyCanonicalJson({
        ...priorAttemptResult,
        authoredSourceHash: hash("f"),
      }));
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 1,
        repairInstruction,
      })).rejects.toThrowError("Repair prior source identity closure failed");
      await writeFile(priorAttemptResultPath, stringifyCanonicalJson(priorAttemptResult));

      const attempt1 = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        attemptIndex: 1,
        repairInstruction,
      });
      const repairContext = attempt1.generationRequest.contextInputs.find(
        ({ inputRef }) => inputRef === "context/repair-instruction.json",
      );
      expect(repairContext).toBeDefined();
      const repairBytes = await readFile(path.join(
        attempt1.taskWorkspacePath,
        "context/repair-instruction.json",
      ));
      expect(sha256Bytes(repairBytes)).toBe(repairContext?.contentHash);
      expect(JSON.parse(repairBytes.toString("utf8"))).toEqual(repairInstruction);
      const repairInputRefs = [
        "inputs/attempts/0/source/scene.ts",
        "inputs/attempts/0/source/native-block-authoring.json",
        "inputs/attempts/0/source/native-resources.json",
        "inputs/attempts/0/generation-request.json",
        "inputs/attempts/0/attempt-result.json",
        "inputs/attempts/0/evaluation.json",
        "inputs/attempts/0/capture/opening.png",
        "inputs/attempts/0/capture/opening-observation.json",
        "inputs/attempts/0/capture/collider-overlay.png",
        "inputs/attempts/0/capture/collider-overlay-observation.json",
        "inputs/attempts/0/capture/spawn-support-observation.json",
        "inputs/attempts/0/capture/scripted-traversal.json",
      ];
      expect(attempt1.generationRequest.contextInputs.map(({ inputRef }) => inputRef)).toEqual(
        expect.arrayContaining(repairInputRefs),
      );
      for (const inputRef of repairInputRefs) {
        const contextEntry = attempt1.generationRequest.contextInputs.find(
          (entry) => entry.inputRef === inputRef,
        );
        expect(contextEntry).toBeDefined();
        const bytes = await readFile(path.join(attempt1.taskWorkspacePath, inputRef));
        expect(sha256Bytes(bytes)).toBe(contextEntry?.contentHash);
      }
      const repairTaskInstruction = await readFile(
        path.join(attempt1.taskWorkspacePath, attempt1.generationRequest.taskInstructionRef),
        "utf8",
      );
      expect(repairTaskInstruction).toContain("inputs/attempts/0/source/scene.ts");
      expect(repairTaskInstruction).toContain("context/repair-instruction.json");
      expect(repairTaskInstruction).toContain("repairAction.instruction");
      expect(repairTaskInstruction).toContain("Do not change the Case, Profile, or acceptance thresholds");
      expect(repairTaskInstruction).toContain("inputs/attempts/0/evaluation.json");
      expect(repairTaskInstruction).toContain(
        "read inputs/attempts/0/evaluation.json and inputs/attempts/0/capture/",
      );
      expect(repairTaskInstruction).toContain(
        "read inputs/attempts/0/rejected-capture/opening-composition-gate-result.json",
      );
      expect(repairTaskInstruction).toContain(
        "Do not reassign an existing Block's visualGroupId",
      );
      expect(repairTaskInstruction).toContain(
        "must produce a visible geometry change in the evidence view",
      );
      expect(sha256Bytes(new TextEncoder().encode(repairTaskInstruction))).toBe(
        attempt1.generationRequest.taskInstructionHash,
      );
      expect(attempt1.generationRequest.workspaceContextManifestHash).not.toBe(
        attempt0.generationRequest.workspaceContextManifestHash,
      );
      expect(attempt1.routerTaskPayloadHash).not.toBe(attempt0.routerTaskPayloadHash);
      expect(attempt1.frozenOwnerIdentities).toEqual(attempt0.frozenOwnerIdentities);
      expect(attempt1.generationRequest.declaredOutputPaths).toEqual([
        "scene.ts", "native-block-authoring.json", "native-resources.json",
      ]);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a Native Route whose canonical decision or Case Scene Brief closure was forged", async () => {
    const value = await fixture();
    try {
      const forgedProfile = parseSceneAuthoringRouteDecisionV1({
        ...value.routeDecision,
        decision: {
          ...value.routeDecision.decision,
          authoringProfileRef: "worldkit://native-authoring-profile/forged@1",
        },
      });
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        routeDecision: forgedProfile,
      })).rejects.toThrow(/route decision/i);

      const forgedTrust = parseSceneAuthoringRouteDecisionV1({
        ...value.routeDecision,
        trustProfileRef: "worldkit://trust-profile/attacker-selected@1",
        trustProfileHash: hash("8"),
      });
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        routeDecision: forgedTrust,
      })).rejects.toThrow(/route decision/i);

      const mismatchedBrief = decideSceneAuthoringRouteV1({
        id: value.routeDecision.id,
        sceneBriefRef: "other-brief.md",
        sceneBriefHash: hash("9"),
        trustProfileRef: value.routeDecision.trustProfileRef,
        trustProfileHash: value.routeDecision.trustProfileHash,
        requiredCapabilityRefs: value.routeDecision.requiredCapabilityRefs,
        requestedSourceKind: "babylon-native",
        nativeTrustAdmitted: true,
        referenceDrivenDistinctiveSilhouette: true,
      });
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        routeDecision: mismatchedBrief,
        runId: "brief-mismatch",
        runDirectoryPath: path.join(value.root, "runs", "brief-mismatch"),
      })).rejects.toThrow(/scene brief/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a dotted bootstrap identity before whitebox.blocks finalization", async () => {
    const value = await fixture();
    try {
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        bootstrapId: "fixture.native",
      })).rejects.toThrow(/stable lowercase identity/);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("requires strict resolved resource descriptors with content hashes", async () => {
    const value = await fixture();
    try {
      await writeFile(
        path.join(value.inputDirectory, "native-scene-api.json"),
        JSON.stringify({ resourceRef: "worldkit://native-scene-api/babylon@1", resolvedVersion: "1" }),
      );
      await expect(prepareNativeBlockGenerationTaskV1(input(value))).rejects.toThrow(/resolved resource/i);
      await writeFile(
        path.join(value.inputDirectory, "native-scene-api.json"),
        `${resolutionDescriptor("native-scene-api", "worldkit://native-scene-api/babylon@1", API_HASH)}\n`,
      );
      await expect(prepareNativeBlockGenerationTaskV1(input(value))).rejects.toThrow(/canonical bytes/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a World Runtime Bootstrap identity not admitted by the selected Registry Lock", async () => {
    const value = await fixture();
    try {
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        worldRuntimeBootstrapRef: "worldkit://world-runtime-bootstrap/not-admitted@1",
      })).rejects.toThrow(/not admitted/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked input and output ancestors", async () => {
    const value = await fixture();
    const externalInput = await mkdtemp(path.join(os.tmpdir(), "worldkit-generation-external-input-"));
    const externalOutput = await mkdtemp(path.join(os.tmpdir(), "worldkit-generation-external-output-"));
    try {
      await writeFile(path.join(externalInput, "instruction.md"), "outside\n");
      await symlink(externalInput, path.join(value.inputDirectory, "linked"));
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        taskInstructionPath: path.join(value.inputDirectory, "linked", "instruction.md"),
      })).rejects.toThrow(/symbolic link|canonical|outside/i);

      await symlink(externalOutput, path.join(value.root, "linked-runs"));
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId: "escaped",
        runDirectoryPath: path.join(value.root, "linked-runs", "escaped"),
      })).rejects.toThrow(/symbolic link|canonical|outside/i);
    } finally {
      await Promise.all([
        rm(value.root, { recursive: true, force: true }),
        rm(externalInput, { recursive: true, force: true }),
        rm(externalOutput, { recursive: true, force: true }),
      ]);
    }
  });

  it("publishes each Attempt once and scopes router identity to the run", async () => {
    const value = await fixture();
    try {
      const firstInput = input(value);
      const first = await prepareNativeBlockGenerationTaskV1(firstInput);
      await expect(prepareNativeBlockGenerationTaskV1(firstInput)).rejects.toThrow(/attempt.*exists|fresh/i);
      const second = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId: "second",
        runDirectoryPath: path.join(value.root, "runs", "second"),
      });
      expect(second.routerRequestId).not.toBe(first.routerRequestId);
      expect(first.routerRequestId).toContain("-initial-");
      expect(second.routerRequestId).toContain("-second-");
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("keeps the formal router identity bounded for a valid timestamped run", async () => {
    const value = await fixture();
    try {
      const runId = "run-20260902130320-15359";
      const prepared = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId,
        runDirectoryPath: path.join(value.root, "runs", runId),
      });
      expect(prepared.routerRequestId).toMatch(/^[a-z0-9][a-z0-9-]{2,79}$/);
      expect(prepared.routerArguments).toEqual(expect.arrayContaining([
        "--task-id",
        prepared.routerRequestId,
        "--request-id",
        prepared.routerRequestId,
      ]));
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["canonical route", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), routeDecision: decideSceneAuthoringRouteV1({ id: "canonical", sceneBriefRef: "scene-brief.md", sceneBriefHash: hash("a"), trustProfileRef: "worldkit://trust-profile/trusted-local@1", trustProfileHash: hash("b"), requiredCapabilityRefs: [], requestedSourceKind: "canonical", nativeTrustAdmitted: true, referenceDrivenDistinctiveSilhouette: false }) })],
    ["second repair index", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), attemptIndex: 2 })],
    ["run directory escape", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), runDirectoryPath: path.join(value.root, "..", "escape") })],
    ["run identity outside the router dialect", async (value: Awaited<ReturnType<typeof fixture>>) => ({ ...input(value), runId: "invalid.run", runDirectoryPath: path.join(value.root, "runs", "invalid.run") })],
  ])("rejects %s before process preparation", async (_label, mutate) => {
    const value = await fixture();
    try {
      await expect(prepareNativeBlockGenerationTaskV1(await mutate(value))).rejects.toThrow();
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a cloud output root that is not an absolute S3 URI", async () => {
    const value = await fixture();
    try {
      await expect(prepareNativeBlockGenerationTaskV1({
        ...input(value),
        cloudOutputS3Root: "cloud-temple/output",
      })).rejects.toThrowError(/S3/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects symbolic-link inputs and changed bytes after the Case hash was frozen", async () => {
    const value = await fixture();
    try {
      await rm(path.join(value.inputDirectory, "reference-0.png"));
      await symlink(path.join(value.inputDirectory, "scene-brief.md"), path.join(value.inputDirectory, "reference-0.png"));
      await expect(prepareNativeBlockGenerationTaskV1(input(value))).rejects.toThrow(/symbolic link/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("declares every frozen reference as a router asset", async () => {
    const value = await fixture();
    try {
      await writeFile(path.join(value.inputDirectory, "reference-1.png"), "another");
      const fixtureInput = input(value);
      fixtureInput.case = parseWorldReconstructionCaseV1({ ...fixtureInput.case, referenceInputs: [...fixtureInput.case.referenceInputs, { inputRef: "reference-1.png", contentHash: sha256Bytes(new TextEncoder().encode("another")), mediaType: "image/png" }] });
      const prepared = await prepareNativeBlockGenerationTaskV1(fixtureInput);
      expect(prepared.routerArguments.filter((argument) => argument === "--asset")).toHaveLength(2);
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it("derives Bootstrap only from closed Host owners and rejects a Gameplay crosswire", async () => {
    const packageRoot = path.resolve("apps/playground/public/world-packages/cloud-ridge");
    const gameplay = parseGameplayBootstrapV1(JSON.parse(await readFile(path.join(packageRoot, "gameplay/bootstrap.json"), "utf8")));
    const runtime = parseWorldRuntimeBootstrapV1(JSON.parse(await readFile(path.join(packageRoot, "runtime/world-runtime-bootstrap.json"), "utf8")));
    const value = await fixture();
    try {
      const preparedInput = input(value);
      const { contentHash: _contentHash, ...gameplayBody } = gameplay;
      const mismatchedGameplay = createGameplayBootstrapV1({
        ...gameplayBody,
        resourceRef: "worldkit://gameplay-bootstrap/crosswired@1",
      });
      expect(() => deriveNativeBlockGenerationBootstrapV1({
        reconstructionCase: preparedInput.case,
        gameplayBootstrap: mismatchedGameplay,
        worldRuntimeBootstrap: runtime,
        worldBounds: preparedInput.worldBounds,
        bootstrapId: preparedInput.bootstrapId,
        sceneModuleRef: preparedInput.sceneModuleRef,
        nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
        nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
        seed: preparedInput.seed,
      })).toThrow(/owner closure/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects multiple Runtime Subjects before deriving the Native projection", async () => {
    const packageRoot = path.resolve("apps/playground/public/world-packages/cloud-ridge");
    const gameplay = parseGameplayBootstrapV1(JSON.parse(await readFile(path.join(packageRoot, "gameplay/bootstrap.json"), "utf8")));
    const runtime = parseWorldRuntimeBootstrapV1(JSON.parse(await readFile(path.join(packageRoot, "runtime/world-runtime-bootstrap.json"), "utf8")));
    const value = await fixture();
    try {
      const preparedInput = input(value);
      const { contentHash: _contentHash, ...runtimeBody } = runtime;
      const multipleSubjects = createWorldRuntimeBootstrapV1({
        ...runtimeBody,
        subjectRuntimeDescriptors: [
          ...runtime.subjectRuntimeDescriptors,
          { ...runtime.subjectRuntimeDescriptors[0]!, entityId: "secondary-subject" },
        ],
      });
      expect(() => deriveNativeBlockGenerationBootstrapV1({
        reconstructionCase: preparedInput.case,
        gameplayBootstrap: gameplay,
        worldRuntimeBootstrap: multipleSubjects,
        worldBounds: preparedInput.worldBounds,
        bootstrapId: preparedInput.bootstrapId,
        sceneModuleRef: preparedInput.sceneModuleRef,
        nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
        nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
        seed: preparedInput.seed,
      })).toThrow(/owner closure/i);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });

  it("ignores an untrusted prewritten Bootstrap and changes identity when Host seed changes", async () => {
    const value = await fixture();
    try {
      await writeFile(path.join(value.inputDirectory, "native-scene.bootstrap.json"), JSON.stringify({ seed: 99, initialControlledEntityId: "attacker" }));
      const first = await prepareNativeBlockGenerationTaskV1(input(value));
      const second = await prepareNativeBlockGenerationTaskV1({
        ...input(value),
        runId: "second",
        runDirectoryPath: path.join(value.root, "runs", "second"),
        seed: 18,
      });
      expect(first.bootstrap.seed).toBe(17);
      expect(first.bootstrap.initialControlledEntityId).toBe("g-bot-primary");
      expect(first.generationRequestHash).not.toBe(second.generationRequestHash);
      expect(first.generationRequest.bootstrapInputHash).not.toBe(second.generationRequest.bootstrapInputHash);
    } finally {
      await rm(value.root, { recursive: true, force: true });
    }
  });
});
