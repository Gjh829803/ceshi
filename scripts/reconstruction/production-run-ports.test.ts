import {
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

import { afterEach, describe, expect, it, vi } from "vitest";
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
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { hashWorldBuildIdentityV1 } from "@whitebox-world/world-identity";

import {
  createProductionWorldReconstructionRunPortsV1,
  type ProductionWorldReconstructionRunPortOwnersV1,
  type ProductionWorldReconstructionRunPortsInputV1,
} from "./production-run-ports.js";
import { evaluateNativeBlockAttemptV1 } from "./evaluate.js";
import { createEvidenceSetFixtureInputV1 } from
  "./evaluate-fixture.test-support.js";

const H = (character: string): Sha256HashV1 =>
  `sha256:${character.repeat(64)}` as Sha256HashV1;
const RUN_ID = "f-20260901";

const temporaryDirectories: string[] = [];

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
  await mkdir(path.dirname(intentPath), { recursive: true, mode: 0o700 });
  await writeFile(casePath, stringifyCanonicalJson(evidence.reconstructionCase));
  await writeFile(
    intentPath,
    stringifyCanonicalJson(evidence.formalCaptureIntent),
  );
  const frozenOwnerIdentities = Object.freeze({
    caseHash: H("1"),
    evaluationProfileHash: H("2"),
    gameplayBootstrapHash: H("3"),
    worldRuntimeBootstrapHash: H("4"),
    worldBoundsHash: H("5"),
    bootstrapInputHash: H("6"),
  });
  const prepared = Object.freeze({
    generationRequest: { id: "case.attempt-0.generation" },
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
    gameplayBootstrapBytes: new Uint8Array(),
    worldRuntimeBootstrapBytes: new Uint8Array(),
    worldBoundsBytes: new Uint8Array(),
    hostClosure: {},
    hostClosureBytes: new Uint8Array(),
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
    outputDirectoryPath: packageDirectoryPath,
    diagnostics: [],
  });
  const input = {
    repositoryRoot: "/repo",
    casePath,
    caseRef:
      `artifact://world-reconstruction-case/${evidence.reconstructionCase.id}/case.json`,
    evaluationProfilePath: path.join(root, "evaluation-profile.json"),
    reconstructionCase: evidence.reconstructionCase,
    evaluationProfile: evidence.evaluationProfile,
    generationInput: {
      runDirectoryPath,
      gameplayBootstrapPath: path.join(root, "gameplay.json"),
      worldRuntimeBootstrapPath: path.join(root, "runtime.json"),
      worldBounds: {},
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
      return {
        request: { id: "formal-request" },
        formalRequestHash: H("a"),
        outputPath: input.outputPath,
        requestBytes: new Uint8Array(),
      } as never;
    }),
    capturePackage: vi.fn(async () => {
      events.push("capture-browser");
      return {
        outcome: "completed" as const,
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

  it("takes authored source identity from Package and writes the capture request before Browser allocation", async () => {
    const value = await fixture();
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
          ["spawn-support-observation.json", evidence.spawnSupportObservation],
          ["collider-overlay-observation.json", evidence.colliderOverlayObservation],
          ["scripted-traversal.json", evidence.scriptedTraversalObservation],
        ].map(async ([name, artifact]) => writeFile(
          path.join(value.captureDirectoryPath, name as string),
          `${stringifyCanonicalJson(artifact)}\n`,
        )));
        return {
          outcome: "completed" as const,
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
  });
});
