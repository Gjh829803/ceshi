import {
  mkdir,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { parseRuntimeFlightReportV1 } from "@whitebox-world/runtime-babylon";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeSubjectHostContextV1 } from "./native-subject-host-context.js";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  formalWorldCaptureIntentCanonicalBytesV1,
  hashFormalWorldCaptureIntentV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureIntentV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionDiagnosticV1,
  parseWorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { hashWorldBuildIdentityV1 } from "@whitebox-world/world-identity";

import {
  createProductionWorldReconstructionRunPortsV1,
  runBuilderSelfCheckV1,
  type ProductionWorldReconstructionRunPortOwnersV1,
  type ProductionWorldReconstructionRunPortsInputV1,
} from "./production-run-ports.js";
import { FormalCaptureCommandClosedErrorV1 } from "./formal-capture.js";
import { CAPTURE_STARTUP_BUDGET_V1, CaptureStartupErrorV1 } from "./capture-startup-watchdog.js";
import { CaptureOnlyHostedSessionClosedErrorV1 } from
  "./hosted-session-capture.js";
import { evaluateNativeBlockAttemptV1 } from "./evaluate.js";
import { createEvidenceSetFixtureInputV1 } from
  "./evaluate-fixture.test-support.js";
import { resolveWorldReconstructionFrozenOwnerIdentitiesV1 } from
  "./generation-request.js";
import { NativeBlockPackageErrorV1 } from "./native-package.js";

const H = (character: string): Sha256HashV1 =>
  `sha256:${character.repeat(64)}` as Sha256HashV1;
const RUN_ID = "f-20260901";

function runtimeDiagnosticFixture() {
  return { runtimeSessionId: "runtime.formal-capture.transport-001", formalRequestHash: H("a"),
    worldPackageRootHash: H("8"), report: parseRuntimeFlightReportV1({
      kind: "runtime-flight-report", schemaVersion: 1,
      diagnosticSessionId: "00000000-0000-4000-8000-000000000001", droppedSampleCount: 0,
      samples: [{ sequence: 1, epoch: 0, elapsedMilliseconds: 0, heartbeatDelayMilliseconds: 0,
        visibilityState: "visible", health: "healthy", metrics: { frame: null, tick: 0, paused: false,
          fps: null, triangleCount: null, drawCallCount: null, progressMode: "on-demand" } }],
    }) };
}

const temporaryDirectories: string[] = [];

it("drains checker stderr without persisting provider text or blocking a valid report", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "nbr-host-checker-")));
  temporaryDirectories.push(root);
  const checkerPath = path.join(root, "checker.mjs");
  await writeFile(checkerPath, `
const guard = setTimeout(() => process.exit(9), 2000);
process.stderr.write("untrusted diagnostic".repeat(131072), () => {
  clearTimeout(guard);
  process.stdout.write(JSON.stringify({ ok: true, diagnosticCodes: [] }));
});
`);
  expect(await runBuilderSelfCheckV1(checkerPath, root, path.join(root, "scene-brief.md")))
    .toEqual({ ok: true, diagnosticCodes: [] });
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directoryPath) =>
    rm(directoryPath, { recursive: true, force: true })));
});

async function fixture() {
  const root = await realpath(await mkdtemp(
    path.join(tmpdir(), "nbr-production-ports-"),
  ));
  temporaryDirectories.push(root);
  const runDirectoryPath = path.join(root, "runs", RUN_ID);
  const attemptDirectoryPath = path.join(runDirectoryPath, "attempts", "0");
  const packageDirectoryPath = path.join(
    attemptDirectoryPath,
    "world-package",
  );
  const captureDirectoryPath = path.join(attemptDirectoryPath, "capture");
  const evidence = createEvidenceSetFixtureInputV1({ allDimensionsPass: true });
  const casePath = path.join(root, "case.json");
  const intentPath = path.join(
    root,
    "inputs",
    "formal-world-capture-intent.json",
  );
  const worldBoundsPolicyPath = path.join(root, "world-bounds-policy.json");
  const subjectHostContext = createNativeSubjectHostContextV1(evidence.reconstructionCase.id, "camera-main");
  const worldBoundsPolicy = {
    mode: "fixed" as const,
    worldBounds: {
    centerMetersXZ: [0, -15],
    sizeMetersXZ: [180, 180],
    heightRangeMeters: [-40, 90],
    },
  };
  await mkdir(path.dirname(intentPath), { recursive: true, mode: 0o700 });
  await Promise.all([
    writeFile(casePath, stringifyCanonicalJson(evidence.reconstructionCase)),
    writeFile(
      intentPath,
      stringifyCanonicalJson(evidence.formalCaptureIntent),
    ),
    writeFile(worldBoundsPolicyPath, stringifyCanonicalJson(worldBoundsPolicy)),
  ]);
  const frozenOwnerIdentities = Object.freeze({
    caseHash: H("1"),
    evaluationProfileHash: H("2"),
    subjectHostContextHash: H("3"),
    worldBoundsPolicyHash: H("5"),
    bootstrapInputHash: H("6"),
  });
  const prepared = Object.freeze({
    generationRequest: {
      id: "case.attempt-0.generation",
      sceneBriefRef: "scene-brief.md",
      builderSkillHash: H("e"),
    },
    generationRequestHash: H("a"),
    attempt: { id: "case.attempt-0" },
    attemptHash: H("b"),
    routerRequestId: `native-block-generation-case-${RUN_ID}-attempt-0`,
    routerTaskPayloadHash: H("c"),
    backend: "local",
    routerExecutablePath: "/repo/scripts/agents/run-codex-task.mjs",
    routerArguments: [],
    runDirectoryPath,
    taskWorkspacePath: path.join(root, "task-workspace"),
    stagingDirectoryPath: path.join(attemptDirectoryPath, ".source.staging"),
    sourceDirectoryPath: path.join(attemptDirectoryPath, "source"),
    bootstrap: { id: "bootstrap" },
    bootstrapBytes: new Uint8Array(),
    subjectHostContext,
    subjectHostContextBytes: new TextEncoder().encode(stringifyCanonicalJson(subjectHostContext)),
    worldBoundsPolicyBytes: new Uint8Array(),
    frozenOwnerIdentities,
  });
  const generationReceipt = Object.freeze({
    kind: "native-block-generation-receipt",
    schemaVersion: 1,
    id: "case.attempt-0.generation.receipt",
    generationRequestRef: "generation-request.json",
    generationRequestHash: H("a"),
    routerTaskPayloadHash: H("c"),
    taskInstructionHash: H("d"),
    builderSkillHash: H("e"),
    workspaceContextManifestHash: H("f"),
    routerRequestId: prepared.routerRequestId,
    backend: "local",
    executionProfile: "formal",
    resolvedModel: "gpt-5.6-sol",
    resolvedReasoningEffort: "xhigh",
    outcome: "completed",
    outputs: [
      {
        path: "native-block-authoring.json",
        contentHash: H("7"),
        sizeBytes: 1,
        mediaType: "application/json",
      },
      {
        path: "native-resources.json",
        contentHash: H("8"),
        sizeBytes: 1,
        mediaType: "application/json",
      },
      {
        path: "scene.ts",
        contentHash: H("9"),
        sizeBytes: 1,
        mediaType: "text/typescript",
      },
    ],
    diagnosticCodes: [],
    cleanupOutcome: "completed",
  });
  const packageResult = Object.freeze({
    outcome: "completed",
    checkResult: {},
    sceneAuthoringAttemptResult: {
      kind: "scene-authoring-attempt-result",
      schemaVersion: 1,
      id: "case.attempt-0.result",
      sceneAuthoringAttemptRef:
        "worldkit://scene-authoring-attempt/case.attempt-0@1",
      sceneAuthoringAttemptHash: H("b"),
      outcome: "completed",
      authoredSourceRef: "worldkit://native-scene/case@1",
      authoredSourceHash: H("7"),
      evidenceRefs: ["worldkit://native-scene-check-result/case@1"],
    },
    verifiedWorldPackage: {
      manifest: {
        sceneSource: {
          sceneAuthoringAttemptResultRef:
            "worldkit://scene-authoring-attempt-result/case.attempt-0@1",
        },
      },
      receipt: {
        worldPackageRef: `package://world-package/sha256/${"8".repeat(64)}`,
        worldPackageRootHash: H("8"),
        worldBuildIdentityHash: H("9"),
      },
    },
    worldPackageRef: `package://world-package/sha256/${"8".repeat(64)}`,
    worldPackageRootHash: H("8"),
    worldBuildIdentityHash: H("9"),
    buildReceiptHash: H("0"),
    groundAnalysisReport: {} as never,
    groundAnalysisReportHash: H("7"),
    groundAnalysisReportPath: path.join(
      attemptDirectoryPath,
      "ground-analysis-report.json",
    ),
    outputDirectoryPath: packageDirectoryPath,
    diagnostics: [],
  });
  const input = {
    executionPurpose: "strict-acceptance",
    visualCaptureScope: "world-only",
    repositoryRoot: "/repo",
    casePath,
    caseRef:
      `artifact://world-reconstruction-case/${evidence.reconstructionCase.id}/case.json`,
    evaluationProfilePath: path.join(root, "evaluation-profile.json"),
    reconstructionCase: evidence.reconstructionCase,
    evaluationProfile: evidence.evaluationProfile,
    generationInput: {
      runDirectoryPath,
      subjectHostContext,
      worldBoundsPolicyPath,
      worldBoundsPolicy,
      bootstrapId: "package-fixture.case-native",
      sceneModuleRef: "worldkit://native-scene/package-fixture.case@1",
      seed: 20260901,
    },
    formalCaptureIntent: evidence.formalCaptureIntent,
  } as unknown as ProductionWorldReconstructionRunPortsInputV1;
  return {
    root,
    runDirectoryPath,
    attemptDirectoryPath,
    packageDirectoryPath,
    captureDirectoryPath,
    frozenOwnerIdentities,
    prepared,
    generationReceipt,
    packageResult,
    input,
    worldBoundsPolicyPath,
    subjectHostContext,
    worldBoundsPolicy,
  };
}

function owners(
  value: Awaited<ReturnType<typeof fixture>>,
  events: string[],
): ProductionWorldReconstructionRunPortOwnersV1 {
  return {
    prepareGeneration: vi.fn(async () => value.prepared as never),
    runGeneration: vi.fn(async (_prepared, runPorts) => {
      await runPorts.reconcile(
        value.prepared.routerRequestId,
        value.prepared.routerTaskPayloadHash,
      );
      events.push("generation");
      return { receipt: value.generationReceipt as never };
    }),
    createProcessPort: vi.fn(() => ({ run: vi.fn() } as never)),
    reconcileGeneration: vi.fn(async () => ({ outcome: "missing" as const })),
    runSelfCheck: vi.fn(async () => ({ ok: true, diagnosticCodes: [] })),
    packageAttempt: vi.fn(async (input) => {
      events.push("package");
      expect(input.outputDirectoryPath).toBe(value.packageDirectoryPath);
      return value.packageResult as never;
    }),
    materializeCaptureRequest: vi.fn(async (input) => {
      events.push("capture-request");
      expect(input.packageDirectoryPath).toBe(value.packageDirectoryPath);
      expect(input.visualCaptureScope).toBe(value.input.visualCaptureScope);
      return {
        request: { id: "formal-request" },
        formalRequestHash: H("a"),
        outputPath: input.outputPath,
        requestBytes: new Uint8Array(),
      } as never;
    }),
    capturePackage: vi.fn(async (input) => {
      events.push("capture-browser");
      expect(input.openingGate).toEqual({
        executionPurpose: value.input.executionPurpose,
        reconstructionCase: value.input.reconstructionCase,
        evaluationProfile: value.input.evaluationProfile,
      });
      return {
        outcome: "completed" as const,
        stage: "published" as const,
        cleanupOutcomes: {
          hostedBrowserSession: "completed" as const,
          viteServer: "completed" as const,
        },
        outputDirectoryPath: value.captureDirectoryPath,
        openingOutputPath: path.join(value.captureDirectoryPath, "opening.png"),
        formalRequestHash: H("a"),
        formalCaptureReceiptHash: H("b"),
        worldPackageRootHash: H("8"),
      };
    }),
    evaluateAttempt: vi.fn(async () => {
      throw new Error("not used");
    }),
    resolveFrozenOwnerIdentities: vi.fn(() => value.frozenOwnerIdentities),
  };
}

async function generateAndPackage(
  value: Awaited<ReturnType<typeof fixture>>,
  ownerPorts: ProductionWorldReconstructionRunPortOwnersV1,
) {
  const ports = await createProductionWorldReconstructionRunPortsV1(
    value.input,
    ownerPorts,
  );
  const generate = await ports.generate({
    attemptIndex: 0,
    backend: "local",
    runId: RUN_ID,
    requestId: value.prepared.routerRequestId,
    frozenOwnerIdentities: value.frozenOwnerIdentities,
  });
  const packaged = await ports.package({
    attemptIndex: 0,
    frozenOwnerIdentities: value.frozenOwnerIdentities,
    generate,
  });
  return { ports, generate, packaged };
}

describe("createProductionWorldReconstructionRunPortsV1", () => {
  it("restores a completed production generation after process restart without preparing or dispatching another paid task", async () => {
    const value = await fixture();
    const input = { ...value.input, executionPurpose: "production" as const };
    for (const file of ["source/scene.ts", "inputs/context.json", "context/case.json", "advisory/top-down.png", "attempt.json",
      "generation-request.json", "scene-authoring-route-decision.json", "generation-dispatch.json"]) {
      const target = path.join(value.attemptDirectoryPath, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "frozen-test-owner-artifact");
    }
    const stageInput = { attemptIndex: 0 as const, backend: "local" as const, runId: RUN_ID,
      requestId: value.prepared.routerRequestId, frozenOwnerIdentities: value.frozenOwnerIdentities };
    const firstOwners = owners(value, []);
    const first = await createProductionWorldReconstructionRunPortsV1(input, firstOwners);
    const generated = await first.generate(stageInput);
    const sourceBefore = await readFile(path.join(value.attemptDirectoryPath, "source/scene.ts"));
    const resumedOwners = owners(value, []);
    const resumed = await createProductionWorldReconstructionRunPortsV1({ ...input, hostRecoveryIndex: 1 }, resumedOwners);
    expect(await resumed.generate(stageInput)).toEqual(generated);
    expect(resumedOwners.prepareGeneration).not.toHaveBeenCalled();
    expect(resumedOwners.runGeneration).not.toHaveBeenCalled();
    expect(resumedOwners.reconcileGeneration).not.toHaveBeenCalled();
    expect(await readFile(path.join(value.attemptDirectoryPath, "source/scene.ts"))).toEqual(sourceBefore);
    await writeFile(path.join(value.attemptDirectoryPath, "source/scene.ts"), "changed-source");
    await expect(resumed.generate(stageInput)).rejects.toThrow("HOST_CHECKPOINT_INVALID");
    expect(resumedOwners.runGeneration).not.toHaveBeenCalled();
  });
  it("never turns missing or unknown generation into a new task on Host-only recovery", async () => {
    const value = await fixture();
    const ownerPorts = owners(value, []);
    const ports = await createProductionWorldReconstructionRunPortsV1({ ...value.input,
      executionPurpose: "production", hostRecoveryIndex: 1 }, ownerPorts);
    await expect(ports.generate({ attemptIndex: 0, backend: "local", runId: RUN_ID,
      requestId: value.prepared.routerRequestId, frozenOwnerIdentities: value.frozenOwnerIdentities }))
      .rejects.toThrow("HOST_RECOVERY_GENERATION_INCOMPLETE");
    expect(ownerPorts.prepareGeneration).not.toHaveBeenCalled();
    expect(ownerPorts.runGeneration).not.toHaveBeenCalled();
  });
  it("persists exact Builder diagnostics before cleaning the task workspace", async () => {
    const value = await fixture();
    const ownerPorts: ProductionWorldReconstructionRunPortOwnersV1 = {
      ...owners(value, []),
      runSelfCheck: vi.fn(async () => ({
      ok: false,
      diagnosticCodes: ["WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED"],
      typecheckDiagnostics: [{ code: "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED" as const, typescriptCode: 18048,
        sourcePath: "scene.ts" as const, lineNumber: 324, columnNumber: 32,
        message: "TS18048: 'xOffset' is possibly 'undefined'." }],
      })),
      runGeneration: vi.fn(async (_prepared, runPorts) => {
      await runPorts.selfCheck(value.prepared.stagingDirectoryPath);
      await runPorts.cleanup();
      return { receipt: { ...value.generationReceipt, outcome: "rejected", diagnosticCodes: ["self-check-failed"] } as never };
      }),
    };
    const ports = await createProductionWorldReconstructionRunPortsV1(value.input, ownerPorts);
    const generated = await ports.generate({
      attemptIndex: 0, backend: "local", runId: RUN_ID,
      requestId: value.prepared.routerRequestId,
      frozenOwnerIdentities: value.frozenOwnerIdentities,
    });
    expect(generated.diagnosticCodes).toEqual(["WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED", "self-check-failed"]);
    expect(ownerPorts.runSelfCheck).toHaveBeenCalledWith(
      path.join(value.prepared.taskWorkspacePath, "inputs/builder-skill/scripts/self-check.mjs"),
      value.prepared.stagingDirectoryPath,
      path.join(value.prepared.taskWorkspacePath, "inputs/scene-brief.md"),
    );
    expect(JSON.parse(await readFile(path.join(value.attemptDirectoryPath,
      "builder-self-check.host.json"), "utf8"))).toMatchObject({
      generationRequestHash: H("a"),
      ok: false,
      diagnosticCodes: ["WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED"],
      typecheckDiagnostics: [{ code: "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED", typescriptCode: 18048,
        sourcePath: "scene.ts", lineNumber: 324, columnNumber: 32,
        message: "TS18048: 'xOffset' is possibly 'undefined'." }],
    });
  });
  it("no-follow rehashes bounds and re-derives the frozen Subject context identity set", async () => {
    const value = await fixture();
    const ownerPorts = {
      ...owners(value, []),
      resolveFrozenOwnerIdentities: vi.fn(
        resolveWorldReconstructionFrozenOwnerIdentitiesV1,
      ),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const ports = await createProductionWorldReconstructionRunPortsV1(
      value.input,
      ownerPorts,
    );

    const baseline = await ports.rehashOwnerIdentities();
    expect(Object.isFrozen(baseline)).toBe(true);
    expect(ownerPorts.resolveFrozenOwnerIdentities).toHaveBeenCalledOnce();

    await writeFile(value.worldBoundsPolicyPath, stringifyCanonicalJson({
      ...value.worldBoundsPolicy,
      worldBounds: { ...value.worldBoundsPolicy.worldBounds, centerMetersXZ: [1, -15] },
    }));
    const changedBounds = await ports.rehashOwnerIdentities();
    expect(changedBounds.worldBoundsPolicyHash).not.toBe(baseline.worldBoundsPolicyHash);
    expect(changedBounds.bootstrapInputHash).toBe(baseline.bootstrapInputHash);

    await writeFile(value.worldBoundsPolicyPath, stringifyCanonicalJson({ mode: "checked-block-layout" }));
    const changedPolicy = await ports.rehashOwnerIdentities();
    expect(changedPolicy.worldBoundsPolicyHash).not.toBe(baseline.worldBoundsPolicyHash);
    expect(changedPolicy.bootstrapInputHash).toBe(baseline.bootstrapInputHash);

    await writeFile(
      value.worldBoundsPolicyPath,
      stringifyCanonicalJson(value.worldBoundsPolicy),
    );
    const changedContext = { ...value.subjectHostContext, resources: value.subjectHostContext.resources.map(
      (resource, index) => index === 0 ? { ...resource, contentHash: H("0") } : resource) };
    const tamperedPorts = await createProductionWorldReconstructionRunPortsV1({
      ...value.input, generationInput: { ...value.input.generationInput, subjectHostContext: changedContext },
    }, ownerPorts);
    await expect(tamperedPorts.rehashOwnerIdentities()).rejects.toThrow("Registry resource hash mismatch");
    const linkedBoundsTarget = path.join(value.root, "linked-world-bounds-policy.json");
    await writeFile(
      linkedBoundsTarget,
      stringifyCanonicalJson(value.worldBoundsPolicy),
    );
    await unlink(value.worldBoundsPolicyPath);
    await symlink(linkedBoundsTarget, value.worldBoundsPolicyPath);
    await expect(ports.rehashOwnerIdentities()).rejects.toThrow(
      "WORLD_RECONSTRUCTION_INPUT_INVALID",
    );
  });

  it("admits the real Case only through its canonical fixed Intent bytes and complete visual closure", async () => {
    const value = await fixture();
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const caseRoot = path.join(
      repositoryRoot,
      "artifacts",
      "scenes",
      "cloud-temple-t-gate-native-block",
    );
    const casePath = path.join(caseRoot, "case.json");
    const intentPath = path.join(
      caseRoot,
      "inputs",
      "formal-world-capture-intent.json",
    );
    const intentBytes = new Uint8Array(await readFile(intentPath));
    const formalCaptureIntent = parseFormalWorldCaptureIntentV1(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(intentBytes)),
    );
    const reconstructionCase = parseWorldReconstructionCaseV1(
      JSON.parse(await readFile(casePath, "utf8")),
    );
    const evaluationProfilePath = path.join(
      caseRoot,
      "evaluation-profile.json",
    );
    const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(
      JSON.parse(await readFile(evaluationProfilePath, "utf8")),
    );
    expect(intentBytes).toEqual(
      formalWorldCaptureIntentCanonicalBytesV1(formalCaptureIntent),
    );
    expect(hashFormalWorldCaptureIntentV1(formalCaptureIntent)).toBe(
      reconstructionCase.formalCaptureIntentHash,
    );
    expect(formalCaptureIntent.semanticCaptureTargetBindings.map(
      ({ acceptanceTargetRef }) => acceptanceTargetRef,
    )).toEqual(reconstructionCase.expected.semanticSilhouetteTargets.map(
      ({ acceptanceTargetRef }) => acceptanceTargetRef,
    ));
    expect(reconstructionCase.expected.colliders.find(
      ({ colliderId }) => colliderId === "collider-cliff-approach-ground",
    )).toEqual({
      acceptanceTargetRef:
        "worldkit://acceptance-target/foreground-platform@1",
      contributionId: "collider-cliff-approach-ground",
      colliderId: "collider-cliff-approach-ground",
      role: "ground",
      requiresOverlay: true,
    });
    expect(reconstructionCase.expected.criticalTraversalChecks.find(
      ({ id }) => id === "central-ascent-left-t-arm-pass",
    )?.fixedInputSequence).toEqual([{
      actions: ["move-forward"],
      axes: { moveYRatio: 1 },
      ticks: 760,
    }, {
      actions: ["move-left"],
      axes: { moveXRatio: -1 },
      ticks: 60,
    }]);
    expect(reconstructionCase.expected.criticalTraversalChecks.find(
      ({ id }) => id === "gate-wall-block",
    )?.fixedInputSequence).toEqual([{
      actions: ["move-forward"],
      axes: { moveYRatio: 1 },
      ticks: 510,
    }, {
      actions: ["move-left"],
      axes: { moveXRatio: -1 },
      ticks: 75,
    }, {
      actions: ["move-forward"],
      axes: { moveYRatio: 1 },
      ticks: 40,
    }]);
    expect(formalCaptureIntent.checkpointSpatialCriteria.find(
      ({ checkpointId }) => checkpointId === "gate-wall-limit",
    )).toMatchObject({
      axis: "z",
      colliderId: "collider-gate-walls",
      expectedCenterSide: "negative",
      kind: "block-plane",
      sourceFace: "maximum",
    });
    expect(reconstructionCase.expected.groundConnectivity.requiredTraversalBands
      .find(({ id }) => id === "central-ascent-left-t-arm-band")
      ?.centerlineStandPositionsXYZMeters).toContainEqual({
        // Ground Analysis uses the nearest lattice point that keeps its 0.4m
        // effective Capsule radius outside the z=-3.5 blocker face. Runtime
        // still verifies the continuous collision stop near z=-3.15.
        xMeters: -3,
        yMeters: 0,
        zMeters: -3,
      });
    expect(await readFile(
      path.join(caseRoot, "inputs", "task-instruction.md"),
      "utf8",
    )).toContain(
      "walking or falling off an unregistered ledge is not blocker evidence",
    );
    expect(await readFile(
      path.join(caseRoot, "inputs", "task-instruction.md"),
      "utf8",
    )).toContain(
      "Do not add `supported-spawn` or any other evidence-only acceptance target to `visualGroups`",
    );
    expect(await readFile(
      path.join(caseRoot, "inputs", "task-instruction.md"),
      "utf8",
    )).toContain(
      "`collider-gate-walls` must select one complete `gate-mass-collider-group`",
    );
    await expect(createProductionWorldReconstructionRunPortsV1({
      ...value.input,
      repositoryRoot,
      casePath,
      caseRef:
        `artifact://world-reconstruction-case/${reconstructionCase.id}/case.json`,
      evaluationProfilePath,
      reconstructionCase,
      evaluationProfile,
      formalCaptureIntent,
      generationInput: {
        ...value.input.generationInput,
        runDirectoryPath: path.join(caseRoot, "runs", RUN_ID),
      },
    })).resolves.toBeDefined();
  });

  it.each(["one", "all"] as const)("retains %s side/top targets without imposing an opening composition requirement", async (mode) => {
    const value = await fixture();
    const original = value.input.reconstructionCase;
    const targetRefs = new Set((mode === "all" ? original.expected.semanticSilhouetteTargets
      : [original.expected.semanticSilhouetteTargets[1]!]).map((target) => target.acceptanceTargetRef));
    const compositionTargetRefs = new Set(value.input.formalCaptureIntent.semanticCaptureTargetBindings
      .filter((binding) => targetRefs.has(binding.acceptanceTargetRef)).map((binding) => binding.compositionTargetRef));
    const opening = original.expected.openingComposition;
    const profile = value.input.evaluationProfile;
    const evaluationProfile = parseWorldReconstructionEvaluationProfileV1({
      ...profile,
      thresholds: {
        ...profile.thresholds,
        openingComposition: {
          regions: profile.thresholds.openingComposition.regions.filter((row) => !compositionTargetRefs.has(row.targetRef)),
          anchors: profile.thresholds.openingComposition.anchors.filter((row) => !compositionTargetRefs.has(row.targetRef)),
        },
      },
    });
    const reconstructionCase = parseWorldReconstructionCaseV1({
      ...original,
      evaluationProfileHash: hashWorldReconstructionEvaluationProfileV1(evaluationProfile),
      expected: {
        ...original.expected,
        semanticSilhouetteTargets: original.expected.semanticSilhouetteTargets.map((row) =>
          !targetRefs.has(row.acceptanceTargetRef) ? row : {
            ...row,
            viewRequirements: row.viewRequirements.map((requirement) =>
              requirement.viewId === "opening" ? { viewId: "opening", mode: "not-required" } : requirement),
          }),
        openingComposition: {
          ...opening,
          targetRefs: opening.targetRefs.filter((ref) => !compositionTargetRefs.has(ref)),
          regions: opening.regions.filter((row) => !compositionTargetRefs.has(row.targetRef)),
          anchors: opening.anchors.filter((row) => !compositionTargetRefs.has(row.targetRef)),
          orderedTargetRefs: opening.orderedTargetRefs.filter((ref) => !compositionTargetRefs.has(ref)),
        },
      },
    });
    await writeFile(value.input.casePath, stringifyCanonicalJson(reconstructionCase));
    await expect(createProductionWorldReconstructionRunPortsV1({
      ...value.input,
      reconstructionCase,
      evaluationProfile,
    }, owners(value, []))).resolves.toBeDefined();
    expect(reconstructionCase.expected.semanticSilhouetteTargets).toHaveLength(2);
    expect(value.input.formalCaptureIntent.semanticCaptureTargetBindings).toHaveLength(2);
    expect(reconstructionCase.expected.openingComposition.targetRefs).toHaveLength(mode === "all" ? 0 : 1);
  });

  it("rejects a non-canonical Case artifact ref before exposing ports", async () => {
    const value = await fixture();
    await expect(createProductionWorldReconstructionRunPortsV1({
      ...value.input,
      caseRef: "artifact://world-reconstruction-case/case",
    })).rejects.toThrow("WORLD_RECONSTRUCTION_CASE_REF_INVALID");
  });

  it("uses the prepared router payload hash as the sole generation request identity", async () => {
    const value = await fixture();
    const events: string[] = [];
    const ownerPorts = owners(value, events);
    const ports = await createProductionWorldReconstructionRunPortsV1(
      value.input,
      ownerPorts,
    );

    const generated = await ports.generate({
      attemptIndex: 0,
      backend: "local",
      runId: RUN_ID,
      requestId: value.prepared.routerRequestId,
      frozenOwnerIdentities: value.frozenOwnerIdentities,
    });

    expect(generated.outcome).toBe("completed");
    expect(generated.requestHash).toBe(value.prepared.routerTaskPayloadHash);
    expect(generated.generationReceiptRef).toBe(
      `artifact://world-reconstruction-case/package-fixture.case/runs/${RUN_ID}/attempts/0/generation-receipt.json`,
    );
    expect(ownerPorts.reconcileGeneration).toHaveBeenCalledWith({
      executablePath: value.prepared.routerExecutablePath,
      backend: "local",
      requestId: value.prepared.routerRequestId,
      cwd: value.prepared.runDirectoryPath,
    });
    expect(JSON.parse(await readFile(
      path.join(value.attemptDirectoryPath, "generation-receipt.json"),
      "utf8",
    ))).toEqual(value.generationReceipt);
  });

  it("does not report cleanup failure when repair preparation fails before provider allocation", async () => {
    const value = await fixture();
    const ownerPorts = {
      ...owners(value, []),
      prepareGeneration: vi.fn(async () => {
        throw new TypeError(
          "WORLD_RECONSTRUCTION_REPAIR_IDENTITY_MISMATCH: prior evidence identity closure failed.",
        );
      }),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const ports = await createProductionWorldReconstructionRunPortsV1(
      value.input,
      ownerPorts,
    );

    await expect(ports.generate({
      attemptIndex: 1,
      backend: "local",
      runId: RUN_ID,
      requestId: value.prepared.routerRequestId,
      frozenOwnerIdentities: value.frozenOwnerIdentities,
      repairInstruction: {} as never,
    })).rejects.toThrow("WORLD_RECONSTRUCTION_REPAIR_IDENTITY_MISMATCH");

    expect(await ports.cleanup()).toEqual(expect.objectContaining({
      providerTask: "completed",
      temporaryDirectories: "completed",
      outputPromotion: "completed",
    }));
  });

  it("rejects stale, non-canonical, and symlinked Case-bound Intent bytes before exposing ports", async () => {
    const stale = await fixture();
    await expect(createProductionWorldReconstructionRunPortsV1({
      ...stale.input,
      reconstructionCase: {
        ...stale.input.reconstructionCase,
        formalCaptureIntentHash: H("0"),
      },
    })).rejects.toThrow("WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID");

    const nonCanonical = await fixture();
    const intentPath = path.join(
      nonCanonical.root,
      "inputs",
      "formal-world-capture-intent.json",
    );
    await writeFile(
      intentPath,
      `${stringifyCanonicalJson(nonCanonical.input.formalCaptureIntent)}\n`,
    );
    await expect(createProductionWorldReconstructionRunPortsV1(
      nonCanonical.input,
    )).rejects.toThrow("WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID");

    const linked = await fixture();
    const linkedIntentPath = path.join(
      linked.root,
      "inputs",
      "formal-world-capture-intent.json",
    );
    const targetPath = path.join(linked.root, "intent-target.json");
    await writeFile(
      targetPath,
      stringifyCanonicalJson(linked.input.formalCaptureIntent),
    );
    await unlink(linkedIntentPath);
    await symlink(targetPath, linkedIntentPath);
    await expect(createProductionWorldReconstructionRunPortsV1(
      linked.input,
    )).rejects.toThrow("WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID");
  });

  it("publishes immutable generation evidence with same-byte replay and rejects clobber or escaped roots", async () => {
    const value = await fixture();
    const firstOwners = owners(value, []);
    const firstPorts = await createProductionWorldReconstructionRunPortsV1(
      value.input,
      firstOwners,
    );
    await firstPorts.generate({
      attemptIndex: 0,
      backend: "local",
      runId: RUN_ID,
      requestId: value.prepared.routerRequestId,
      frozenOwnerIdentities: value.frozenOwnerIdentities,
    });

    const replayOwners = owners(value, []);
    const replayPorts = await createProductionWorldReconstructionRunPortsV1(
      value.input,
      replayOwners,
    );
    await expect(replayPorts.generate({
      attemptIndex: 0,
      backend: "local",
      runId: RUN_ID,
      requestId: value.prepared.routerRequestId,
      frozenOwnerIdentities: value.frozenOwnerIdentities,
    })).resolves.toMatchObject({ outcome: "completed" });

    const changedOwners = {
      ...owners(value, []),
      runGeneration: vi.fn(async () => ({
        receipt: { ...value.generationReceipt, id: "different.receipt" } as never,
      })),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const changedPorts = await createProductionWorldReconstructionRunPortsV1(
      value.input,
      changedOwners,
    );
    await expect(changedPorts.generate({
      attemptIndex: 0,
      backend: "local",
      runId: RUN_ID,
      requestId: value.prepared.routerRequestId,
      frozenOwnerIdentities: value.frozenOwnerIdentities,
    })).rejects.toThrow("WORLD_RECONSTRUCTION_IMMUTABLE_ARTIFACT_MISMATCH");

    const linkedOutput = await fixture();
    const linkedReceiptPath = path.join(
      linkedOutput.attemptDirectoryPath,
      "generation-receipt.json",
    );
    const linkedReceiptTarget = path.join(linkedOutput.root, "receipt-target.json");
    await mkdir(path.dirname(linkedReceiptPath), { recursive: true });
    await writeFile(
      linkedReceiptTarget,
      `${stringifyCanonicalJson(linkedOutput.generationReceipt)}\n`,
    );
    await symlink(linkedReceiptTarget, linkedReceiptPath);
    const linkedOutputPorts = await createProductionWorldReconstructionRunPortsV1(
      linkedOutput.input,
      owners(linkedOutput, []),
    );
    await expect(linkedOutputPorts.generate({
      attemptIndex: 0,
      backend: "local",
      runId: RUN_ID,
      requestId: linkedOutput.prepared.routerRequestId,
      frozenOwnerIdentities: linkedOutput.frozenOwnerIdentities,
    })).rejects.toThrow("WORLD_RECONSTRUCTION_IMMUTABLE_ARTIFACT_MISMATCH");

    await expect(createProductionWorldReconstructionRunPortsV1({
      ...value.input,
      generationInput: {
        ...value.input.generationInput,
        runDirectoryPath: path.join(value.root, "outside"),
      },
    })).rejects.toThrow("WORLD_RECONSTRUCTION_RUN_DIRECTORY_INVALID");
  });

  it("maps only a completed generation with declared output missing to no-output", async () => {
    const value = await fixture();
    const events: string[] = [];
    const baseOwners = owners(value, events);
    const ownerPorts = {
      ...baseOwners,
      runGeneration: vi.fn(async () => ({
        receipt: {
          ...value.generationReceipt,
          outcome: "rejected",
          outputs: [],
          diagnosticCodes: ["output-missing"],
        } as never,
      })),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const ports = await createProductionWorldReconstructionRunPortsV1(
      value.input,
      ownerPorts,
    );

    const generated = await ports.generate({
      attemptIndex: 0,
      backend: "local",
      runId: RUN_ID,
      requestId: value.prepared.routerRequestId,
      frozenOwnerIdentities: value.frozenOwnerIdentities,
    });

    expect(generated.outcome).toBe("no-output");
    expect(generated.diagnosticCodes).toEqual(["output-missing"]);
    expect(baseOwners.packageAttempt).not.toHaveBeenCalled();
    expect(await ports.cleanup()).toEqual(expect.objectContaining({
      providerTask: "completed",
      temporaryDirectories: "completed",
      outputPromotion: "completed",
    }));
  });

  it.each(["world-only", "complete-targets"] as const)("takes authored source identity from Package and writes %s capture request before Browser allocation", async visualCaptureScope => {
    const base = await fixture();
    const value = { ...base, input: { ...base.input, visualCaptureScope } };
    const events: string[] = [];
    const ownerPorts = owners(value, events);
    const { ports, packaged } = await generateAndPackage(value, ownerPorts);

    expect(packaged).toEqual(expect.objectContaining({
      outcome: "completed",
      authoredSourceRef: "worldkit://native-scene/case@1",
      authoredSourceHash: H("7"),
    }));
    const captured = await ports.capture({ attemptIndex: 0, packaged });

    expect(captured.outcome).toBe("completed");
    expect(events).toEqual([
      "generation",
      "package",
      "capture-request",
      "capture-browser",
    ]);
  });

  it("surfaces an identity-bound Ground Analysis rejection for one source-only repair", async () => {
    const value = await fixture();
    const baseOwners = owners(value, []);
    const repairDiagnostic = parseWorldReconstructionDiagnosticV1({
      kind: "world-reconstruction-diagnostic",
      schemaVersion: 1,
      id: "ground-analysis:ground-target-standability:reach-junction",
      code: "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
      dimensionId: "critical-traversal",
      acceptanceTargetRef:
        "worldkit://acceptance-target/upper-t-junction@1",
      targetRef: "worldkit://acceptance-target/upper-t-junction@1",
      targetId: "reach-junction",
      metricId: "ground-target-standability",
      details: {
        kind: "state-mismatch",
        expectedValue: "standable",
        actualValue: "not-standable",
        correctionDirection: "replace",
      },
      evidenceRefs: ["artifact://case/logical-ground-model.json"],
      message: "Required target is not standable.",
      repairAction: {
        kind: "revise-native-source",
        targetKind: "traversal-check",
        targetId: "reach-junction",
        operation: "adjust-traversal",
        instruction: "Extend explicit support Blocks beneath the target.",
      },
    });
    const groundAnalysisReportPath = path.join(
      value.attemptDirectoryPath,
      "ground-analysis-report.json",
    );
    const groundAnalysisReport = {
      kind: "babylon-native-block-ground-analysis-report",
      schemaVersion: 1,
      admissionOutcome: "failed",
    } as never;
    const groundAnalysisReportArtifactHash = sha256CanonicalJson(
      groundAnalysisReport,
    ) as Sha256HashV1;
    const packageAttempt = vi.fn(async () => {
      throw new NativeBlockPackageErrorV1(
        [
          "native-ground-analysis-rejected",
          "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
        ],
        undefined,
        {
          kind: "ground-analysis-rejected",
          sceneAuthoringAttemptResult:
            value.packageResult.sceneAuthoringAttemptResult as never,
          groundAnalysisReport,
          groundAnalysisReportHash: groundAnalysisReportArtifactHash,
          groundAnalysisReportPath,
          repairDiagnostics: [repairDiagnostic],
        },
      );
    });
    const ownerPorts = {
      ...baseOwners,
      packageAttempt,
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const { ports, packaged } = await generateAndPackage(value, ownerPorts);

    expect(packaged).toEqual(expect.objectContaining({
      outcome: "ground-analysis-rejected",
      authoredSourceRef:
        value.packageResult.sceneAuthoringAttemptResult.authoredSourceRef,
      authoredSourceHash:
        value.packageResult.sceneAuthoringAttemptResult.authoredSourceHash,
      groundAnalysisReportRef: expect.stringMatching(
        /attempts\/0\/ground-analysis-report\.json$/,
      ),
      groundAnalysisReportHash: groundAnalysisReportArtifactHash,
      repairDiagnostics: [repairDiagnostic],
    }));
    expect(await ports.cleanup()).toEqual(expect.objectContaining({
      candidate: "completed",
      outputPromotion: "completed",
    }));
  });

  it("surfaces an identity-bound non-repairable Native Check rejection before Candidate allocation", async () => {
    const value = await fixture();
    const baseOwners = owners(value, []);
    const nativeCheckResultPath = path.join(
      value.attemptDirectoryPath,
      "native-check-result.json",
    );
    const packageAttempt = vi.fn(async () => {
      throw new NativeBlockPackageErrorV1(
        [
          "native-check-rejected",
          "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
        ],
        undefined,
        undefined,
        {
          kind: "native-check-rejected",
          sceneAuthoringAttemptResult:
            value.packageResult.sceneAuthoringAttemptResult as never,
          nativeCheckResultHash: H("8"),
          nativeCheckResultPath,
          repairDiagnostics: [],
        },
      );
    });
    const ownerPorts = {
      ...baseOwners,
      packageAttempt,
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const { ports, packaged } = await generateAndPackage(value, ownerPorts);

    expect(packaged).toEqual(expect.objectContaining({
      outcome: "native-check-rejected",
      authoredSourceRef:
        value.packageResult.sceneAuthoringAttemptResult.authoredSourceRef,
      authoredSourceHash:
        value.packageResult.sceneAuthoringAttemptResult.authoredSourceHash,
      nativeCheckResultRef: expect.stringMatching(
        /attempts\/0\/native-check-result\.json$/,
      ),
      nativeCheckResultHash: H("8"),
      repairDiagnostics: [],
    }));
    expect(await ports.cleanup()).toEqual(expect.objectContaining({
      candidate: "completed",
      outputPromotion: "completed",
    }));
  });

  it("does not claim Browser or Vite cleanup after the capture owner throws", async () => {
    const value = await fixture();
    const events: string[] = [];
    const ownerPorts = {
      ...owners(value, events),
      capturePackage: vi.fn(async () => {
        throw new Error("browser exited");
      }),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const { ports, packaged } = await generateAndPackage(value, ownerPorts);

    const captured = await ports.capture({ attemptIndex: 0, packaged });
    expect(captured).toEqual({
      outcome: "failed",
      cameraRollbackOutcome: "completed",
      diagnosticCodes: ["WORLD_RECONSTRUCTION_CAPTURE_FAILED"],
    });
    expect(await ports.cleanup()).toEqual(expect.objectContaining({
      hostedBrowserSession: "failed",
      viteServer: "failed",
    }));
  });

  it("surfaces identity-bound rejected Capture evidence without a formal receipt", async () => {
    const value = await fixture();
    const events: string[] = [];
    const gateResultHash = H("e");
    const ownerPorts = {
      ...owners(value, events),
      capturePackage: vi.fn(async (input) => {
        const rejectedDirectoryPath = input.rejectedOutputDirectoryPath;
        throw new FormalCaptureCommandClosedErrorV1({
          stage: "post-dispose",
          cleanupOutcomes: {
            hostedBrowserSession: "completed",
            viteServer: "completed",
          },
          cause: new Error(
            "FORMAL_CAPTURE_OPENING_COMPOSITION_GATE_FAILED:" +
              "WORLDKIT_OPENING_GATE_REGION_DRIFT",
          ),
          rejectedEvidence: {
            outputDirectoryPath: rejectedDirectoryPath,
            openingOutputPath: path.join(rejectedDirectoryPath, "opening.png"),
            openingGateResultPath: path.join(
              rejectedDirectoryPath,
              "opening-composition-gate-result.json",
            ),
            openingGateResultHash: gateResultHash,
            openingGateResult: {
              kind: "worldkit-opening-composition-host-gate",
              schemaVersion: 1,
              status: "failed",
              diagnostics: [{
                code: "WORLDKIT_OPENING_GATE_CAMERA_UNBOUND",
              }],
            },
          },
        });
      }),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const { ports, packaged } = await generateAndPackage(value, ownerPorts);
    if (packaged.outcome !== "completed") {
      throw new Error("expected completed Package fixture");
    }

    expect(await ports.capture({ attemptIndex: 0, packaged })).toEqual(
      expect.objectContaining({
        outcome: "rejected",
        cameraRollbackOutcome: "completed",
        diagnosticCodes: [
          "FORMAL_CAPTURE_OPENING_COMPOSITION_GATE_FAILED",
          "WORLDKIT_OPENING_GATE_REGION_DRIFT",
        ],
        rejectedWorldPackagePath: packaged.worldPackagePath,
        rejectedWorldPackageRef: packaged.worldPackageRef,
        rejectedWorldPackageRootHash: packaged.worldPackageRootHash,
        rejectedCaptureDirectoryPath: path.join(
          value.runDirectoryPath,
          "attempts",
          "0",
          "rejected-capture",
        ),
        rejectedOpeningPath: expect.stringMatching(/rejected-capture\/opening\.png$/),
        rejectedOpeningRef: expect.stringMatching(/rejected-capture\/opening\.png$/),
        openingGateResultPath: expect.stringMatching(
          /rejected-capture\/opening-composition-gate-result\.json$/,
        ),
        openingGateResultRef: expect.stringMatching(
          /rejected-capture\/opening-composition-gate-result\.json$/,
        ),
        openingGateResultHash: gateResultHash,
      }),
    );
  });

  it.each([
    ["pre-launch", "not-started", "not-started", "completed", "completed", "completed"],
    ["post-dispose", "completed", "completed", "completed", "completed", "completed"],
    ["hosted-session", "failed", "completed", "failed", "completed", "completed"],
    ["hosted-session", "completed", "failed", "completed", "failed", "completed"],
    ["publication", "completed", "completed", "completed", "completed", "failed"],
  ] as const)(
    "consumes the formal capture owner's %s Browser=%s Vite=%s cleanup truth",
    async (
      stage,
      hostedOutcome,
      viteOutcome,
      expectedHostedOutcome,
      expectedViteOutcome,
      expectedOutputPromotion,
    ) => {
      const value = await fixture();
      const events: string[] = [];
      const ownerPorts = {
        ...owners(value, events),
        capturePackage: vi.fn(async () => {
          throw new FormalCaptureCommandClosedErrorV1({
            stage,
            cleanupOutcomes: {
              hostedBrowserSession: hostedOutcome,
              viteServer: viteOutcome,
            },
            cause: new Error("FORMAL_CAPTURE_PACKAGE_REQUEST_MISMATCH"),
          });
        }),
      } as ProductionWorldReconstructionRunPortOwnersV1;
      const { ports, packaged } = await generateAndPackage(value, ownerPorts);

      expect(await ports.capture({ attemptIndex: 0, packaged })).toEqual({
        outcome: "failed",
        cameraRollbackOutcome: "completed",
        diagnosticCodes: ["FORMAL_CAPTURE_PACKAGE_REQUEST_MISMATCH"],
      });
      expect(await ports.cleanup()).toEqual(expect.objectContaining({
        hostedBrowserSession: expectedHostedOutcome,
        viteServer: expectedViteOutcome,
        outputPromotion: expectedOutputPromotion,
      }));
    },
  );

  it("preserves a stable capture diagnostic from nested closure causes", async () => {
    const value = await fixture();
    const events: string[] = [];
    const ownerPorts = {
      ...owners(value, events),
      capturePackage: vi.fn(async () => {
        const providerFailure = new Error(
          "BABYLON_FORMAL_CAPTURE_TRAVERSAL_TICK_NOT_COMMITTED",
        );
        const transportFailure = new Error("hosted bridge rejected", {
          cause: providerFailure,
        });
        throw new FormalCaptureCommandClosedErrorV1({
          stage: "hosted-session",
          cleanupOutcomes: {
            hostedBrowserSession: "completed",
            viteServer: "completed",
          },
          cause: new CaptureOnlyHostedSessionClosedErrorV1(
            transportFailure,
            {
              hostedBrowserSession: "completed",
              viteServer: "completed",
            },
          ),
        });
      }),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const { ports, packaged } = await generateAndPackage(value, ownerPorts);

    expect(await ports.capture({ attemptIndex: 0, packaged })).toEqual({
      outcome: "failed",
      cameraRollbackOutcome: "completed",
      diagnosticCodes: [
        "BABYLON_FORMAL_CAPTURE_TRAVERSAL_TICK_NOT_COMMITTED",
      ],
    });
  });

  it.each(["new", "existing", "symlink", "directory", "wrong-request", "wrong-package", "unsafe-session", "malformed"])(
    "CF-05 persists runtime history without changing Capture or overwriting %s output", async (mode) => {
      const value = await fixture();
      const diagnostic = runtimeDiagnosticFixture();
      const baseOwners = owners(value, []);
      const ownerPorts: ProductionWorldReconstructionRunPortOwnersV1 = { ...baseOwners,
        capturePackage: vi.fn(async (input) => {
          expect(input.onRuntimeFlightDiagnostic).toBeTypeOf("function");
          const candidate = { ...diagnostic,
            ...(mode === "wrong-request" ? { formalRequestHash: H("c") } : {}),
            ...(mode === "wrong-package" ? { worldPackageRootHash: H("c") } : {}),
            ...(mode === "unsafe-session" ? { runtimeSessionId: "../../unrelated-user-file" } : {}),
            ...(mode === "malformed" ? { report: { ...diagnostic.report, token: "private-secret" } } : {}),
          };
          await input.onRuntimeFlightDiagnostic!(candidate);
          if (mode === "new") await input.onRuntimeFlightDiagnostic!({ ...diagnostic,
            runtimeSessionId: "runtime.formal-capture.transport-002" });
          return baseOwners.capturePackage(input);
        }),
      };
      const { ports, packaged } = await generateAndPackage(value, ownerPorts);
      const diagnosticPath = path.join(value.attemptDirectoryPath,
        `capture-runtime-diagnostic.${diagnostic.runtimeSessionId}.json`);
      const target = path.join(value.attemptDirectoryPath, "unrelated-user-file.json");
      await writeFile(target, "keep-original");
      if (mode === "existing") await writeFile(diagnosticPath, "keep-original");
      if (mode === "symlink") await symlink(target, diagnosticPath);
      if (mode === "directory") await mkdir(diagnosticPath);
      expect(await ports.capture({ attemptIndex: 0, packaged })).toMatchObject({ outcome: "completed", diagnosticCodes: [] });
      expect(ownerPorts.capturePackage).toHaveBeenCalledOnce();
      expect(await ports.cleanup()).toMatchObject({ hostedBrowserSession: "completed", viteServer: "completed" });
      expect(await readFile(target, "utf8")).toBe("keep-original");
      if (mode === "new") {
        expect(JSON.parse(await readFile(diagnosticPath, "utf8"))).toEqual({
          kind: "world-reconstruction-capture-runtime-diagnostic", schemaVersion: 1,
          caseRef: value.input.caseRef, attemptIndex: 0, hostRecoveryIndex: null, ...diagnostic,
        });
        expect((await lstat(diagnosticPath)).mode & 0o777).toBe(0o600);
        expect(JSON.parse(await readFile(path.join(value.attemptDirectoryPath,
          "capture-runtime-diagnostic.runtime.formal-capture.transport-002.json"), "utf8")))
          .toMatchObject({ runtimeSessionId: "runtime.formal-capture.transport-002", report: diagnostic.report });
      } else if (mode === "directory") expect((await lstat(diagnosticPath)).isDirectory()).toBe(true);
      else if (mode === "existing" || mode === "symlink") {
        expect(await readFile(diagnosticPath, "utf8")).toBe("keep-original");
        if (mode === "symlink") expect((await lstat(diagnosticPath)).isSymbolicLink()).toBe(true);
      } else await expect(lstat(diagnosticPath)).rejects.toMatchObject({ code: "ENOENT" });
    });

  it.each(["new", "existing", "symlink", "directory"])("CF-05 persists startup evidence without changing failure or overwriting %s output", async (mode) => {
    const value = await fixture();
    const startup = new CaptureStartupErrorV1({
      kind: "capture-startup-trace", schemaVersion: 1, outcome: "stalled",
      budget: CAPTURE_STARTUP_BUDGET_V1, droppedEntryCount: 0,
      entries: [{ sequence: 1, elapsedMilliseconds: 0, type: "probe",
        runtime: { phase: "loading", stage: "runtime-havok", revision: 4 } }],
    });
    Object.assign(startup, { providerUrl: "https://provider.invalid/secret-cf05-token" });
    const ownerPorts = {
      ...owners(value, []),
      capturePackage: vi.fn(async () => {
        throw new FormalCaptureCommandClosedErrorV1({
          stage: "hosted-session",
          cleanupOutcomes: { hostedBrowserSession: "completed", viteServer: "completed" },
          cause: new CaptureOnlyHostedSessionClosedErrorV1(startup,
            { hostedBrowserSession: "completed", viteServer: "completed" }),
        });
      }),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const { ports, packaged } = await generateAndPackage(value, ownerPorts);
    const diagnosticPath = path.join(value.attemptDirectoryPath, "capture-startup-diagnostic.json");
    const prior = "keep-original-diagnostic";
    const target = path.join(value.attemptDirectoryPath, "unrelated-user-file.json");
    await mkdir(value.attemptDirectoryPath, { recursive: true });
    if (mode === "existing") await writeFile(diagnosticPath, prior);
    if (mode === "symlink") {
      await writeFile(target, prior);
      await symlink(target, diagnosticPath);
    }
    if (mode === "directory") await mkdir(diagnosticPath);
    expect(await ports.capture({ attemptIndex: 0, packaged })).toEqual({
      outcome: "failed", cameraRollbackOutcome: "completed",
      diagnosticCodes: ["WORLDKIT_CAPTURE_STARTUP_STALLED"],
    });
    expect(ownerPorts.capturePackage).toHaveBeenCalledOnce();
    expect(await ports.cleanup()).toEqual(expect.objectContaining({
      hostedBrowserSession: "completed", viteServer: "completed", outputPromotion: "completed",
    }));
    if (mode === "new") {
      const text = await readFile(diagnosticPath, "utf8");
      expect(text).not.toMatch(/provider.invalid|secret-cf05-token|providerUrl/);
      expect(JSON.parse(text)).toEqual({
        kind: "world-reconstruction-capture-startup-diagnostic", schemaVersion: 1,
        caseRef: value.input.caseRef, attemptIndex: 0, hostRecoveryIndex: null,
        formalRequestHash: H("a"), worldPackageRootHash: H("8"), trace: startup.trace,
      });
      expect((await lstat(diagnosticPath)).mode & 0o777).toBe(0o600);
    } else if (mode === "directory") expect((await lstat(diagnosticPath)).isDirectory()).toBe(true);
    else {
      expect(await readFile(diagnosticPath, "utf8")).toBe(prior);
      if (mode === "symlink") expect((await lstat(diagnosticPath)).isSymbolicLink()).toBe(true);
    }
  });

  it("CF-05 isolates recovery diagnostics and reuses the completed generation checkpoint", async () => {
    const value = await fixture();
    const input = { ...value.input, executionPurpose: "production" as const };
    for (const file of ["source/scene.ts", "inputs/context.json", "context/case.json", "advisory/top-down.png",
      "attempt.json", "generation-request.json", "scene-authoring-route-decision.json", "generation-dispatch.json"]) {
      const target = path.join(value.attemptDirectoryPath, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "frozen-test-owner-artifact");
    }
    const stageInput = { attemptIndex: 0 as const, backend: "local" as const, runId: RUN_ID,
      requestId: value.prepared.routerRequestId, frozenOwnerIdentities: value.frozenOwnerIdentities };
    const first = await createProductionWorldReconstructionRunPortsV1(input, owners(value, []));
    const generated = await first.generate(stageInput);
    const originalPath = path.join(value.attemptDirectoryPath, "capture-startup-diagnostic.json");
    await writeFile(originalPath, "earlier-failed-host-evidence");
    const runtimeDiagnostic = { ...runtimeDiagnosticFixture(), formalRequestHash: H("c") };
    const runtimeDiagnosticFile = `capture-runtime-diagnostic.${runtimeDiagnostic.runtimeSessionId}.json`;
    await writeFile(path.join(value.attemptDirectoryPath, runtimeDiagnosticFile), "earlier-runtime-history");
    const recoveryRoot = path.join(value.attemptDirectoryPath, "host-recoveries", "1");
    const startup = new CaptureStartupErrorV1({
      kind: "capture-startup-trace", schemaVersion: 1, outcome: "aborted",
      budget: CAPTURE_STARTUP_BUDGET_V1, droppedEntryCount: 0, entries: [],
    });
    const ownerPorts = {
      ...owners(value, []),
      packageAttempt: vi.fn(async ({ outputDirectoryPath }: { outputDirectoryPath: string }) => {
        expect(outputDirectoryPath).toBe(path.join(recoveryRoot, "world-package"));
        // Fake Package owner writes its own artifact set; the real checkpoint
        // owner inventories these bytes. This test makes no geometry claim.
        for (const file of ["world-package/package.json", "attempt-result.json", "native-check-result.json",
          "native-explain.txt", "ground-analysis-report.json", "logical-ground-model.json", "ground-analysis-diagnostics.json"]) {
          const target = path.join(recoveryRoot, file);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, "synthetic-package-owner-artifact");
        }
        return { ...value.packageResult, outputDirectoryPath,
          groundAnalysisReportPath: path.join(recoveryRoot, "ground-analysis-report.json") } as never;
      }),
      materializeCaptureRequest: vi.fn(async ({ outputMode }: { outputMode: string }) => {
        expect(outputMode).toBe("verify-or-create");
        return { formalRequestHash: H("c") } as never;
      }),
      capturePackage: vi.fn(async (captureInput) => {
        await captureInput.onRuntimeFlightDiagnostic!(runtimeDiagnostic);
        throw new FormalCaptureCommandClosedErrorV1({ stage: "hosted-session",
          cleanupOutcomes: { hostedBrowserSession: "completed", viteServer: "completed" }, cause: startup });
      }),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const resumed = await createProductionWorldReconstructionRunPortsV1({ ...input, hostRecoveryIndex: 1 }, ownerPorts);
    expect(await resumed.generate(stageInput)).toEqual(generated);
    const packaged = await resumed.package({ attemptIndex: 0,
      frozenOwnerIdentities: value.frozenOwnerIdentities, generate: generated });
    expect(await resumed.capture({ attemptIndex: 0, packaged })).toMatchObject({
      outcome: "failed", diagnosticCodes: ["WORLDKIT_CAPTURE_STARTUP_ABORTED"],
    });
    expect(JSON.parse(await readFile(path.join(recoveryRoot, "capture-startup-diagnostic.json"), "utf8")))
      .toMatchObject({ hostRecoveryIndex: 1, attemptIndex: 0, formalRequestHash: H("c"), trace: startup.trace });
    expect(await readFile(originalPath, "utf8")).toBe("earlier-failed-host-evidence");
    expect(JSON.parse(await readFile(path.join(recoveryRoot, runtimeDiagnosticFile), "utf8")))
      .toMatchObject({ hostRecoveryIndex: 1, attemptIndex: 0, ...runtimeDiagnostic });
    expect(await readFile(path.join(value.attemptDirectoryPath, runtimeDiagnosticFile), "utf8"))
      .toBe("earlier-runtime-history");
    expect(await readFile(path.join(value.attemptDirectoryPath, "source/scene.ts"), "utf8"))
      .toBe("frozen-test-owner-artifact");
    expect(ownerPorts.prepareGeneration).not.toHaveBeenCalled();
    expect(ownerPorts.runGeneration).not.toHaveBeenCalled();
    expect(ownerPorts.capturePackage).toHaveBeenCalledOnce();
  });

  it("preserves a typed Worldkit server start code from nested closure causes", async () => {
    const value = await fixture();
    const events: string[] = [];
    const ownerPorts = {
      ...owners(value, events),
      capturePackage: vi.fn(async () => {
        const startFailure = Object.assign(
          new Error("Worldkit playground did not become ready within 30000ms."),
          { code: "WORLDKIT_SERVER_START_TIMEOUT" },
        );
        throw new FormalCaptureCommandClosedErrorV1({
          stage: "hosted-session",
          cleanupOutcomes: {
            hostedBrowserSession: "failed",
            viteServer: "completed",
          },
          cause: startFailure,
        });
      }),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const { ports, packaged } = await generateAndPackage(value, ownerPorts);

    expect(await ports.capture({ attemptIndex: 0, packaged })).toEqual({
      outcome: "failed",
      cameraRollbackOutcome: "completed",
      diagnosticCodes: ["WORLDKIT_SERVER_START_TIMEOUT"],
    });
  });

  it("never allocates Browser when the verified-Package capture request writer rejects", async () => {
    const value = await fixture();
    const events: string[] = [];
    const baseOwners = owners(value, events);
    const ownerPorts = {
      ...baseOwners,
      materializeCaptureRequest: vi.fn(async () => {
        throw new Error("FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID");
      }),
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const { ports, packaged } = await generateAndPackage(value, ownerPorts);

    expect(await ports.capture({ attemptIndex: 0, packaged })).toEqual({
      outcome: "failed",
      cameraRollbackOutcome: "completed",
      diagnosticCodes: ["FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID"],
    });
    expect(baseOwners.capturePackage).not.toHaveBeenCalled();
    expect(await ports.cleanup()).toEqual(expect.objectContaining({
      hostedBrowserSession: "completed",
      viteServer: "completed",
    }));
  });

  it("joins only the canonical capture artifacts into the existing evaluator owner", async () => {
    const value = await fixture();
    const evidence = createEvidenceSetFixtureInputV1({ allDimensionsPass: true });
    const events: string[] = [];
    const baseOwners = owners(value, events);
    const verified = evidence.verifiedWorldPackage;
    const packageResult = {
      outcome: "completed" as const,
      checkResult: verified.nativeSceneCheckResult,
      sceneAuthoringAttemptResult: verified.sceneAuthoringAttemptResult,
      verifiedWorldPackage: verified,
      worldPackageRef: verified.receipt.worldPackageRef,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      worldBuildIdentityHash: hashWorldBuildIdentityV1(
        verified.receipt.worldBuildIdentity,
      ),
      buildReceiptHash: sha256CanonicalJson(verified.receipt) as Sha256HashV1,
      groundAnalysisReport: {} as never,
      groundAnalysisReportHash: H("7"),
      groundAnalysisReportPath: path.join(
        value.attemptDirectoryPath,
        "ground-analysis-report.json",
      ),
      outputDirectoryPath: value.packageDirectoryPath,
      diagnostics: [],
    };
    const input = {
      ...value.input,
      caseRef:
        `artifact://world-reconstruction-case/${evidence.reconstructionCase.id}/case.json`,
      reconstructionCase: evidence.reconstructionCase,
      evaluationProfile: evidence.evaluationProfile,
      formalCaptureIntent: evidence.formalCaptureIntent,
    } as ProductionWorldReconstructionRunPortsInputV1;
    const evaluateAttempt = vi.fn(evaluateNativeBlockAttemptV1);
    const ownerPorts = {
      ...baseOwners,
      packageAttempt: vi.fn(async () => packageResult),
      materializeCaptureRequest: vi.fn(async (materializeInput) => ({
        request: evidence.captureReceipt.formalRequest,
        formalRequestHash: evidence.captureReceipt.formalRequestHash,
        outputPath: materializeInput.outputPath,
        requestBytes: new Uint8Array(),
      })),
      capturePackage: vi.fn(async () => {
        await mkdir(value.captureDirectoryPath, { recursive: true });
        await Promise.all([
          ["formal-world-capture-receipt.json", evidence.captureReceipt],
          ["opening-observation.json", evidence.openingObservation],
          ["semantic-view-observation-set.json", evidence.semanticViewObservationSet],
          ["spawn-support-observation.json", evidence.spawnSupportObservation],
          ["collider-overlay-observation.json", evidence.colliderOverlayObservation],
          ["scripted-traversal.json", evidence.scriptedTraversalObservation],
        ].map(async ([name, artifact]) => writeFile(
          path.join(value.captureDirectoryPath, name as string),
          `${stringifyCanonicalJson(artifact)}\n`,
        )));
        await Promise.all(evidence.identityMaskPngs.map(({ viewId, bytes }) =>
          writeFile(path.join(value.captureDirectoryPath, `${viewId}-identity-mask.png`), bytes)));
        return {
          outcome: "completed" as const,
          stage: "published" as const,
          cleanupOutcomes: {
            hostedBrowserSession: "completed" as const,
            viteServer: "completed" as const,
          },
          outputDirectoryPath: value.captureDirectoryPath,
          openingOutputPath: path.join(value.captureDirectoryPath, "opening.png"),
          formalRequestHash: evidence.captureReceipt.formalRequestHash,
          formalCaptureReceiptHash:
            hashFormalWorldCaptureReceiptV1(evidence.captureReceipt),
          worldPackageRootHash: verified.receipt.worldPackageRootHash,
        };
      }),
      evaluateAttempt,
    } as ProductionWorldReconstructionRunPortOwnersV1;
    const { ports, packaged } = await generateAndPackage(
      { ...value, input },
      ownerPorts,
    );
    await mkdir(path.join(value.attemptDirectoryPath, "source"), {
      recursive: true,
    });
    await writeFile(
      path.join(
        value.attemptDirectoryPath,
        "source",
        "native-block-authoring.json",
      ),
      `${stringifyCanonicalJson(evidence.authoringManifest)}\n`,
    );
    const captured = await ports.capture({ attemptIndex: 0, packaged });
    if (captured.outcome !== "completed") throw new Error("capture failed");

    const evaluated = await ports.evaluate({
      attemptIndex: 0,
      packaged,
      captured,
    });

    expect(evaluateAttempt).toHaveBeenCalledOnce();
    expect(evaluated.outcome).toBe("passed");
    expect(evaluated.evaluation.worldPackageRootHash).toBe(
      verified.receipt.worldPackageRootHash,
    );
    expect(evaluated.evaluation.captureReceiptHash).toBe(
      hashFormalWorldCaptureReceiptV1(evidence.captureReceipt),
    );
    expect(evaluated.evaluationResultRef).toBe(
      `artifact://world-reconstruction-case/${evidence.reconstructionCase.id}/runs/${RUN_ID}/attempts/0/evaluation.json`,
    );

    evaluateAttempt.mockClear();
    await writeFile(
      path.join(value.captureDirectoryPath, "formal-world-capture-receipt.json"),
      `${stringifyCanonicalJson({
        ...evidence.captureReceipt,
        rendererIdentity: `${evidence.captureReceipt.rendererIdentity}.stale`,
      })}\n`,
    );
    await expect(ports.evaluate({
      attemptIndex: 0,
      packaged,
      captured,
    })).rejects.toThrow("WORLD_RECONSTRUCTION_CAPTURE_IDENTITY_MISMATCH");
    expect(evaluateAttempt).not.toHaveBeenCalled();
  });
});
