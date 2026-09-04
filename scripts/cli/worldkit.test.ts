import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/route-validation-runner", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../lib/route-validation-runner")
  >();
  return {
    ...actual,
    runTrustedRouteValidationV1: vi.fn(actual.runTrustedRouteValidationV1),
  };
});

import {
  createValidAuthoringSpec,
  createValidPackageSubjectWorld,
  createValidRiggedPackageDefinition,
} from "@whitebox-world/authoring/testing";
import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import {
  CONTROL_TRANSITION_CAPABILITY_REF,
  createCoreControlFeatureFactoryV1,
} from "@whitebox-world/gameplay";
import { GROUND_HUMANOID_ACTION_IDS_V1 } from "@whitebox-world/subject-contracts";
import { XIER120_SUBJECT_DEFINITIONS } from "@whitebox-world/subject-registry";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { parseWorldReconstructionProductionResultV1 } from
  "@whitebox-world/validation";

import { loadWorldkitRoutePipeline } from "../lib/worldkit-pipeline";
import { loadAuthoringScene } from "@whitebox-world/playground/authoring-loader";
import {
  RouteValidationRunnerInfrastructureErrorV1,
  runTrustedRouteValidationV1,
} from "../lib/route-validation-runner";

import { explainSubjectFile } from "../lib/subject-explain";
import {
  HELP,
  buildFile,
  captureVisibleWorldWithRetries,
  createRenderEnvironmentDiagnosticsV1,
  describeRegistryResource,
  inspectRenderEnvironmentV1,
  listRegistryResources,
  main,
  parseWorldkitArgs,
  validateSceneBriefFile,
  validateFile,
  validateSubjectDefinitionFile,
  WorldkitUsageError,
} from "./worldkit";
import { buildWorldArtifactFileV1 } from "./build-world-artifact";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "worldkit-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writePackageWorld(directory: string): Promise<string> {
  const inputPath = path.join(directory, "package-world.json");
  const source = createValidPackageSubjectWorld();
  await writeFile(
    inputPath,
    JSON.stringify({
      ...source,
      schemaVersion: 4,
      spatial: { ...source.spatial, traversalAreas: [] },
      constraints: { ...source.constraints, connectivity: [] },
    }),
    "utf8",
  );
  return inputPath;
}

async function writeRouteWorld(directory: string): Promise<string> {
  const source = createValidAuthoringSpec();
  const world: AuthoringSpecV4 = {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
      traversalAreas: [],
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 30], [0, -20]],
        widthMeters: 4,
        locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [...source.nodes, {
      id: "goal",
      kind: "anchor",
      placement: { kind: "fixed", transform: { positionMetersXYZ: [0, 0, -20] } },
      semantic: { classId: "route.destination" },
    }],
    constraints: {
      placements: source.constraints.placements,
      connectivity: [{
        id: "hero-to-goal",
        kind: "connected-by-route",
        requirement: "required",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn-main",
        destinationAnchorEntityId: "goal",
        routeId: "main-route",
      }],
    },
  };
  const inputPath = path.join(directory, "route-world.json");
  await writeFile(inputPath, JSON.stringify(world), "utf8");
  return inputPath;
}

const RIGGED_SUBJECT_WORLD_PATH = path.resolve(
  fileURLToPath(new URL("../../examples/authoring/rigged-subject-world.json", import.meta.url)),
);
const G_BOT_SUBJECT_WORLD_PATH = path.resolve(
  fileURLToPath(new URL("../../examples/authoring/g-bot-subject-world.json", import.meta.url)),
);
const G_BOT_ACTION_IDS = GROUND_HUMANOID_ACTION_IDS_V1.filter(
  (actionId) =>
    actionId !== "jump.small.takeoff" && actionId !== "jump.small.airborne",
).sort();

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("worldkit CLI", () => {
  it("loads V4 Route worlds through the terminal Canonical Scene Plan pipeline", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writeRouteWorld(directory);
    const route = await loadWorldkitRoutePipeline(inputPath);

    expect(route).toMatchObject({
      ok: true,
      authoringSpec: {
        schemaVersion: 4,
        id: expect.any(String),
      },
      normalizedWorldIr: { schemaVersion: 4 },
      layoutSolveReport: {
        kind: "worldkit-layout-solve-report",
        schemaVersion: 1,
        status: "solved",
      },
      layoutSolveReportHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      executionPlan: {
        kind: "worldkit-canonical-scene-execution-plan",
        schemaVersion: 1,
      },
    });
  });

  it("locks the authoritative core-control feature into Canonical Route plans", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writeRouteWorld(directory);
    const route = await loadWorldkitRoutePipeline(inputPath);
    if (!route.ok) {
      throw new Error(JSON.stringify(route.diagnostics));
    }
    const coreControlManifest = createCoreControlFeatureFactoryV1().manifest;
    const sourceText = await readFile(inputPath, "utf8");
    const loaded = await loadAuthoringScene(async () => new Response(sourceText, {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    expect(route.gameplayBootstrap.featureResourceLocks).toEqual([{
      resourceRef: coreControlManifest.resourceRef,
      contentHash: coreControlManifest.contentHash,
    }]);
    expect(route.gameplayBootstrap.availableCapabilityRefs).toContain(
      CONTROL_TRANSITION_CAPABILITY_REF,
    );
    expect(route.worldRuntimeBootstrap.runtimeResourceLockEntries).toContainEqual({
      resourceRef: route.gameplayBootstrap.resourceRef,
      resourceKind: "gameplay-bootstrap",
      resolvedVersion: "1",
      contentHash: route.gameplayBootstrap.contentHash,
    });
    expect(loaded.runtimeWorldConfiguration?.gameplayBootstrap).toEqual(
      route.gameplayBootstrap,
    );
    expect(loaded.executionPlanHash).toBe(route.executionPlanHash);
  });

  it("validates and builds V4 worlds through the shared CLI surface", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = path.resolve(
      fileURLToPath(new URL("../../examples/authoring/basic-world.json", import.meta.url)),
    );
    const outputPath = path.join(directory, "route-world.package");

    const validation = await validateFile(inputPath);
    const build = await buildFile(inputPath, outputPath);
    if (!build.ok) throw new Error(JSON.stringify(build));
    const manifest = JSON.parse(
      await readFile(path.join(outputPath, "manifest.json"), "utf8"),
    );

    expect(validation).toMatchObject({
      ok: true,
      normalizedWorldIrHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      worldBuildIdentityHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(build).toMatchObject({
      kind: "worldkit-package-command-result",
      command: "build",
      ok: true,
      protocolVersion: 1,
      packageFormatVersion: 1,
    });
    expect(manifest).toMatchObject({
      kind: "worldkit-world-package-manifest",
      schemaVersion: 1,
    });
  });

  it("parses an explicit dependency refresh for local Runtime startup", () => {
    expect(
      parseWorldkitArgs([
        "run",
        "world.json",
        "--refresh-dependencies",
        "--json",
      ]),
    ).toEqual({
      command: "run-browser",
      inputPath: "world.json",
      refreshDependencies: true,
      json: true,
    });
  });

  it("parses the closed Native check and explain argv contracts", () => {
    expect(parseWorldkitArgs([
      "native",
      "check",
      "world-directory",
      "--json",
    ])).toEqual({
      command: "native-check",
      worldDirectoryPath: "world-directory",
      json: true,
    });
    expect(parseWorldkitArgs([
      "native",
      "explain",
      "world-directory",
    ])).toEqual({
      command: "native-explain",
      worldDirectoryPath: "world-directory",
      json: false,
    });
    expect(parseWorldkitArgs([
      "native",
      "explain",
      "world-directory",
      "--json",
    ])).toEqual({
      command: "native-explain",
      worldDirectoryPath: "world-directory",
      json: true,
    });
    expect(() => parseWorldkitArgs([
      "native",
      "check",
      "world-directory",
    ])).toThrow("native check requires --json");
    expect(() => parseWorldkitArgs([
      "native",
      "check",
      "world-directory",
      "--json",
      "--json",
    ])).toThrow("--json may be provided only once");
    expect(() => parseWorldkitArgs([
      "native",
      "explain",
      "world-directory",
      "--unknown",
    ])).toThrow("Unknown native explain option '--unknown'");
    expect(HELP).toContain("worldkit native check <world-directory> --json");
    expect(HELP).toContain("worldkit native explain <world-directory> [--json]");
  });

  it("parses the sole generic Native package command", () => {
    expect(parseWorldkitArgs([
      "native",
      "package",
      "artifacts/scenes/case-a/runs/run-a/attempts/0",
      "--case",
      "artifacts/scenes/case-a/case.json",
      "--json",
    ])).toEqual({
      command: "native-package",
      attemptDirectoryPath:
        "artifacts/scenes/case-a/runs/run-a/attempts/0",
      casePath: "artifacts/scenes/case-a/case.json",
      json: true,
    });
    expect(HELP).toContain(
      "worldkit native package <attempt-directory> --case <case.json> --json",
    );
  });

  it("parses the sole BNA verification Harness run command", () => {
    expect(parseWorldkitArgs([
      "native",
      "run",
      "artifacts/scenes/case-a/packages/run-a-attempt-0",
      "--port",
      "5174",
      "--json",
    ])).toEqual({
      command: "native-run",
      packageDirectoryPath:
        "artifacts/scenes/case-a/packages/run-a-attempt-0",
      port: 5174,
      json: true,
    });
    expect(HELP).toContain(
      "worldkit native run <package-directory> [--port <port>] [--json]",
    );
    expect(() => parseWorldkitArgs([
      "native",
      "run-cloud-ridge",
      "packages/cloud-ridge",
    ])).toThrow("Unknown native operation 'run-cloud-ridge'.");
  });

  it("resolves a relative Native Package into an owned copy before Host admission", async () => {
    const directory = await createTemporaryDirectory();
    const packageDirectoryPath = path.join(directory, "native-package");
    await mkdir(path.join(packageDirectoryPath, "native"), { recursive: true });
    await writeFile(
      path.join(packageDirectoryPath, "native/scene.mjs"),
      "export default {};\n",
      "utf8",
    );
    const relativePackageDirectoryPath = path.relative(
      process.cwd(),
      packageDirectoryPath,
    );
    let receivedSource: unknown;
    let ownedPackageDirectoryPath: string | undefined;
    let copiedSceneSource: string | undefined;
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(
      () => true,
    );
    try {
      await expect(main([
        "native",
        "run",
        relativePackageDirectoryPath,
        "--port",
        "5174",
        "--json",
      ], {
        startWorldkitServerV1: async (options) => {
          receivedSource = options.source;
          if (options.source.kind !== "world-package") {
            throw new Error("Expected a WorldPackage source.");
          }
          ownedPackageDirectoryPath = options.source.packageDirectoryPath;
          copiedSceneSource = await readFile(
            path.join(ownedPackageDirectoryPath, "native/scene.mjs"),
            "utf8",
          );
          return {
            url: "http://127.0.0.1:5174/",
            port: 5174,
            process: {} as never,
            sceneSourceKind: "babylon-native-scene",
            worldPackageRootHash: `sha256:${"1".repeat(64)}`,
            stop: async () => {},
            waitForExit: async () => 0,
          };
        },
      })).resolves.toBe(0);
    } finally {
      stdoutWrite.mockRestore();
    }
    expect(ownedPackageDirectoryPath).toBeDefined();
    expect(receivedSource).toEqual({
      kind: "world-package",
      packageDirectoryPath: ownedPackageDirectoryPath,
    });
    expect(ownedPackageDirectoryPath).not.toBe(path.resolve(
      relativePackageDirectoryPath,
    ));
    expect(copiedSceneSource).toBe("export default {};\n");
    await expect(readFile(
      path.join(ownedPackageDirectoryPath!, "native/scene.mjs"),
      "utf8",
    )).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("parses the sole reconstruction production transaction command", () => {
    expect(parseWorldkitArgs([
      "reconstruct",
      "run",
      "artifacts/scenes/case-a/case.json",
      "--output",
      "artifacts/scenes/case-a/runs/run-a",
      "--json",
    ])).toEqual({
      command: "reconstruct-run",
      casePath: "artifacts/scenes/case-a/case.json",
      outputDirectoryPath: "artifacts/scenes/case-a/runs/run-a",
      backend: "cloud",
      json: true,
    });
    expect(parseWorldkitArgs([
      "reconstruct",
      "run",
      "artifacts/scenes/case-a/case.json",
      "--output",
      "artifacts/scenes/case-a/runs/run-local",
      "--backend",
      "local",
      "--json",
    ])).toEqual({
      command: "reconstruct-run",
      casePath: "artifacts/scenes/case-a/case.json",
      outputDirectoryPath: "artifacts/scenes/case-a/runs/run-local",
      backend: "local",
      json: true,
    });
    expect(HELP).toContain(
      "worldkit reconstruct run <case.json> --output <run-directory> [--backend cloud|local] --json",
    );
  });

  it("rejects open, incomplete, duplicate, or non-JSON reconstruction argv", () => {
    expect(() => parseWorldkitArgs([
      "reconstruct",
      "run",
      "case.json",
      "--json",
    ])).toThrow("reconstruct run requires --output <run-directory>.");
    expect(() => parseWorldkitArgs([
      "reconstruct",
      "run",
      "case.json",
      "--output",
      "runs/run-a",
    ])).toThrow("reconstruct run requires --json.");
    expect(() => parseWorldkitArgs([
      "reconstruct",
      "run",
      "case.json",
      "--output",
      "runs/run-a",
      "--backend",
      "remote",
      "--json",
    ])).toThrow("reconstruct run --backend must be 'cloud' or 'local'.");
    expect(() => parseWorldkitArgs([
      "reconstruct",
      "run",
      "case.json",
      "--output",
      "runs/run-a",
      "--output",
      "runs/run-b",
      "--json",
    ])).toThrow("--output may be provided only once.");
    expect(() => parseWorldkitArgs([
      "reconstruct",
      "run",
      "case.json",
      "--output",
      "runs/run-a",
      "--backend",
      "cloud",
      "--backend",
      "local",
      "--json",
    ])).toThrow("--backend may be provided only once.");
    expect(() => parseWorldkitArgs([
      "reconstruct",
      "run",
      "case.json",
      "--output",
      "runs/run-a",
      "--json",
      "--json",
    ])).toThrow("--json may be provided only once.");
    expect(() => parseWorldkitArgs([
      "reconstruct",
      "run",
      "case.json",
      "--output",
      "runs/run-a",
      "--unknown",
      "--json",
    ])).toThrow("Unknown reconstruct run option '--unknown'.");
    expect(() => parseWorldkitArgs([
      "reconstruct",
      "build",
      "case.json",
      "--output",
      "runs/run-a",
      "--json",
    ])).toThrow("Unknown reconstruct operation 'build'.");
  });

  it("delegates reconstruct run once to one transaction port and prints canonical JSON", async () => {
    const calls: unknown[] = [];
    let stdout = "";
    let stderr = "";
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        stdout += String(chunk);
        return true;
      },
    );
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(
      (chunk) => {
        stderr += String(chunk);
        return true;
      },
    );
    const result = parseWorldReconstructionProductionResultV1({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: "cloud-temple-t-gate-native-block",
      caseRef:
        "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/case.json",
      runId: "run-a",
      productionOutcome: "passed",
      publicationOutcome: "published",
      evaluationOutcome: "passed",
      strictDiagnosticOutcome: "failed",
      strictDiagnosticCodes: Object.freeze([
        "NBR70_BLOCKER_IDENTITY_MISMATCH",
      ]),
      strictDiagnosticCleanupOutcome: "not-started",
      cleanupOutcome: "completed",
      attemptCount: 2,
      finalWorldPackagePath: "/case/final/world-package",
      finalWorldPackageRef:
        `package://world-package/sha256/${"1".repeat(64)}`,
      finalWorldPackageRootHash: `sha256:${"1".repeat(64)}`,
      finalCaptureReceiptPath:
        "/case/final/capture/formal-world-capture-receipt.json",
      finalCaptureReceiptHash: `sha256:${"2".repeat(64)}`,
      finalEvaluationPath: "/case/final/evaluation.json",
      finalEvaluationHash: `sha256:${"3".repeat(64)}`,
      finalStrictDiagnosticPath: "/case/final/strict-diagnostic.json",
      finalStrictDiagnosticRef:
        "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/final/strict-diagnostic.json",
      finalStrictDiagnosticHash: `sha256:${"5".repeat(64)}`,
      finalEntryValidationPath:
        "/case/final/entry-third-person-validation.json",
      finalEntryValidationRef:
        "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/final/entry-third-person-validation.json",
      finalEntryValidationHash: `sha256:${"6".repeat(64)}`,
      runReceiptPath: "/case/runs/run-a/run-receipt.json",
      runReceiptRef:
        "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/runs/run-a/run-receipt.json",
      runReceiptHash: `sha256:${"4".repeat(64)}`,
      finalDirectoryPath: "/case/final",
    });

    try {
      await expect(main([
        "reconstruct",
        "run",
        "artifacts/scenes/case-a/case.json",
        "--output",
        "artifacts/scenes/case-a/runs/run-a",
        "--backend",
        "local",
        "--json",
      ], {
        runWorldReconstructionProductionV1: async (input: unknown) => {
          calls.push(input);
          return result;
        },
      })).resolves.toBe(0);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }

    expect(calls).toEqual([{
      casePath: "artifacts/scenes/case-a/case.json",
      outputDirectoryPath: "artifacts/scenes/case-a/runs/run-a",
      backend: "local",
      routePolicy: {
        requiredCapabilityRefs: [],
        requestedSourceKind: "babylon-native",
        nativeTrustAdmitted: true,
      },
    }]);
    expect(stdout).toBe(`${stringifyCanonicalJson(result)}\n`);
    expect(stderr).toBe("");
  });

  it("returns failure when production did not pass and nothing was published", async () => {
    let stdout = "";
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        stdout += String(chunk);
        return true;
      },
    );
    const result = parseWorldReconstructionProductionResultV1({
      kind: "world-reconstruction-production-result" as const,
      schemaVersion: 1 as const,
      caseId: "case-a",
      caseRef: "artifact://world-reconstruction-case/case-a/case.json",
      runId: "run-a",
      productionOutcome: "failed" as const,
      publicationOutcome: "not-published" as const,
      runOutcome: "failed" as const,
      evaluationOutcome: "failed" as const,
      strictDiagnosticOutcome: "not-run" as const,
      strictDiagnosticCodes: Object.freeze([]),
      strictDiagnosticCleanupOutcome: "not-started" as const,
      attemptCount: 4 as const,
      diagnosticCodes: Object.freeze([
        "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
      ]),
      cleanupOutcome: "completed" as const,
    });
    try {
      await expect(main([
        "reconstruct",
        "run",
        "case.json",
        "--output",
        "runs/run-a",
        "--json",
      ], {
        runWorldReconstructionProductionV1: async () => result,
      })).resolves.toBe(1);
    } finally {
      stdoutWrite.mockRestore();
    }
    expect(stdout).toBe(`${stringifyCanonicalJson(result)}\n`);
  });

  it("prints one stable reconstruction diagnostic without leaking a thrown cause", async () => {
    let stdout = "";
    let stderr = "";
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        stdout += String(chunk);
        return true;
      },
    );
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(
      (chunk) => {
        stderr += String(chunk);
        return true;
      },
    );
    try {
      await expect(main([
        "reconstruct",
        "run",
        "case.json",
        "--output",
        "runs/run-a",
        "--json",
      ], {
        runWorldReconstructionProductionV1: async () => {
          throw new Error(
            "WORLD_RECONSTRUCTION_STALE_CASE: /private/secret/case.json",
          );
        },
      })).resolves.toBe(1);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }
    expect(JSON.parse(stdout)).toEqual({
      kind: "worldkit-command-failure",
      schemaVersion: 1,
      command: "reconstruct-run",
      ok: false,
      exitCode: 1,
      diagnostics: [{
        severity: "error",
        code: "WORLD_RECONSTRUCTION_STALE_CASE",
        instancePath: "",
        message:
          "World reconstruction failed before a production result was available.",
      }],
    });
    expect(stdout).not.toContain("/private/secret");
    expect(stderr).toBe("");
  });

  it("passes through a transaction-owned cleanup failure without reclassifying it", async () => {
    let stdout = "";
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        stdout += String(chunk);
        return true;
      },
    );
    const result = parseWorldReconstructionProductionResultV1({
      kind: "world-reconstruction-production-result" as const,
      schemaVersion: 1 as const,
      caseId: "case-a",
      caseRef: "artifact://world-reconstruction-case/case-a/case.json",
      runId: "run-a",
      productionOutcome: "failed" as const,
      publicationOutcome: "not-published" as const,
      runOutcome: "passed" as const,
      evaluationOutcome: "passed" as const,
      strictDiagnosticOutcome: "incomplete" as const,
      strictDiagnosticCodes: Object.freeze(["NBR70_PLAYABILITY_CLEANUP_FAILED"]),
      strictDiagnosticCleanupOutcome: "failed" as const,
      attemptCount: 1 as const,
      diagnosticCodes: Object.freeze(["NBR70_PLAYABILITY_CLEANUP_FAILED"]),
      cleanupOutcome: "failed" as const,
    });
    try {
      await expect(main([
        "reconstruct",
        "run",
        "case.json",
        "--output",
        "runs/run-a",
        "--json",
      ], {
        runWorldReconstructionProductionV1: async () => result,
      })).resolves.toBe(1);
    } finally {
      stdoutWrite.mockRestore();
    }
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual(result);
    expect(parsed).not.toHaveProperty("runReceiptPath");
    expect(parsed).not.toHaveProperty("runReceiptRef");
    expect(parsed).not.toHaveProperty("runReceiptHash");
  });

  it("rejects incomplete and legacy Native package argv", () => {
    expect(() => parseWorldkitArgs([
      "native",
      "package",
      "attempts/0",
      "--output",
      "packages/attempt-0",
      "--json",
    ])).toThrow("native package requires --case <case.json>.");
    expect(() => parseWorldkitArgs([
      "native",
      "package",
      "artifacts/case-a/attempts/0",
      "--case",
      "artifacts/case-a/case.json",
      "--output",
      "artifacts/case-a/attempts/0/world-package",
      "--json",
    ])).toThrow("Unknown native package option '--output'.");
    expect(() => parseWorldkitArgs([
      "native",
      "package-cloud-ridge",
      "attempts/0",
      "--json",
    ])).toThrow("Unknown native operation 'package-cloud-ridge'.");
    expect(() => parseWorldkitArgs([
      "native",
      "build-cloud-ridge",
      "attempts/0",
      "--json",
    ])).toThrow("Unknown native operation 'build-cloud-ridge'.");
  });

  it("resolves relative Native package paths before dispatch without owning build policy", async () => {
    const adapterInputs: unknown[] = [];
    const stdout: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    const attemptResult = {
      kind: "scene-authoring-attempt-result",
      schemaVersion: 1,
      id: "attempt-result-a",
    };

    try {
      await expect(main([
        "native",
        "package",
        "attempts/0",
        "--case",
        "case.json",
        "--json",
      ], {
        packageNativeBlockAttemptV1: async (input: unknown) => {
          adapterInputs.push(input);
          return {
            sceneAuthoringAttemptResult: attemptResult,
            verifiedWorldPackage: {
              receipt: {
                worldPackageRef:
                  `package://world-package/sha256/${"1".repeat(64)}`,
                worldPackageRootHash: `sha256:${"1".repeat(64)}`,
                worldBuildIdentityHash: `sha256:${"2".repeat(64)}`,
              },
            },
            buildReceiptHash: `sha256:${"3".repeat(64)}`,
            outputDirectoryPath: path.resolve(
              "attempts/0/world-package",
            ),
            diagnostics: [],
          };
        },
      })).resolves.toBe(0);
    } finally {
      write.mockRestore();
    }

    expect(adapterInputs).toEqual([{
      repositoryRoot: path.resolve(import.meta.dirname, "../.."),
      attemptDirectoryPath: path.resolve("attempts/0"),
      casePath: path.resolve("case.json"),
      outputDirectoryPath: path.resolve("attempts/0/world-package"),
    }]);
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0]!)).toEqual({
      outcome: "completed",
      sceneAuthoringAttemptResult: attemptResult,
      worldPackageRef: `package://world-package/sha256/${"1".repeat(64)}`,
      worldPackageRootHash: `sha256:${"1".repeat(64)}`,
      worldBuildIdentityHash: `sha256:${"2".repeat(64)}`,
      buildReceiptHash: `sha256:${"3".repeat(64)}`,
      outputDirectoryPath: path.resolve("attempts/0/world-package"),
      diagnostics: [],
    });
  });

  it("preserves the adapter rejection for a raw source directory", async () => {
    const stdout: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    const diagnostic = {
      kind: "native-block-package-diagnostic",
      schemaVersion: 1,
      code: "WORLDKIT_NATIVE_PACKAGE_ATTEMPT_IDENTITY_MISSING",
      severity: "error",
      instancePath: "/attemptDirectoryPath",
      message: "The attempt directory does not contain frozen Host identity.",
    };

    try {
      await expect(main([
        "native",
        "package",
        "attempts/0/source",
        "--case",
        "case.json",
        "--json",
      ], {
        packageNativeBlockAttemptV1: async () => {
          throw Object.freeze({
            name: "NativeBlockPackageErrorV1",
            code: diagnostic.code,
            diagnostics: Object.freeze([Object.freeze(diagnostic)]),
          });
        },
      })).resolves.toBe(1);
    } finally {
      write.mockRestore();
    }

    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0]!)).toEqual({
      outcome: "failed",
      code: diagnostic.code,
      diagnostics: [diagnostic],
    });
  });

  it("retries background-only browser captures and stops at the first visible world", async () => {
    const sampledRgbColorCounts = [1, 2, 4];
    let attempts = 0;

    await expect(
      captureVisibleWorldWithRetries(async () => ({
        sampledRgbColorCount: sampledRgbColorCounts[attempts++]!,
        screenshotDataUrl: `capture-${attempts}`,
      }), 4),
    ).resolves.toEqual({
      sampledRgbColorCount: 4,
      screenshotDataUrl: "capture-3",
    });
    expect(attempts).toBe(3);
  });

  it("fails after the bounded visible-world capture attempts", async () => {
    let attempts = 0;
    await expect(
      captureVisibleWorldWithRetries(async () => {
        attempts += 1;
        return { sampledRgbColorCount: 1 };
      }, 3),
    ).rejects.toThrow("WORLDKIT_CAPTURE_VISIBLE_WORLD_MISSING");
    expect(attempts).toBe(3);
  });

  it.each([
    [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))",
      "software",
    ],
    ["llvmpipe (LLVM 18.1.8, 256 bits)", "software"],
    ["ANGLE Metal Renderer: Apple M3", "hardware"],
  ] as const)(
    "classifies the reported WebGL renderer %s as %s",
    (webglRenderer, expectedMode) => {
      expect(
        inspectRenderEnvironmentV1({
          webglApi: "webgl2",
          webglVendor: "Google Inc.",
          webglRenderer,
          isUnmaskedRenderer: true,
        }),
      ).toMatchObject({
        kind: "worldkit-render-environment-receipt",
        schemaVersion: 1,
        mode: expectedMode,
        webglRenderer,
      });
    },
  );

  it("does not claim hardware acceleration from a masked WebGL identity", () => {
    expect(
      inspectRenderEnvironmentV1({
        webglApi: "webgl2",
        webglVendor: "WebKit",
        webglRenderer: "WebKit WebGL",
        isUnmaskedRenderer: false,
      }).mode,
    ).toBe("unknown");
  });

  it("reports software rendering as a non-blocking capture warning", () => {
    expect(
      createRenderEnvironmentDiagnosticsV1({
        kind: "worldkit-render-environment-receipt",
        schemaVersion: 1,
        webglApi: "webgl2",
        webglVendor: "Google Inc.",
        webglRenderer: "ANGLE (SwiftShader Device)",
        isUnmaskedRenderer: true,
        mode: "software",
      }),
    ).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "CLI_CAPTURE_SOFTWARE_RENDERER",
      }),
    ]);
  });

  it("parses discovery and explain commands without positional guessing", () => {
    expect(
      parseWorldkitArgs(["brief", "validate", "scene-brief.md", "--json"]),
    ).toEqual({
      command: "brief-validate",
      inputPath: "scene-brief.md",
      json: true,
    });
    expect(
      parseWorldkitArgs(["take", "validate", "opening.take.json", "--json"]),
    ).toEqual({
      command: "take-validate",
      inputPath: "opening.take.json",
      json: true,
    });
    expect(
      parseWorldkitArgs(["take", "inspect", "opening.take.json", "--json"]),
    ).toEqual({
      command: "take-inspect",
      inputPath: "opening.take.json",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "take",
        "run",
        "opening.take.json",
        "--world",
        "world.json",
        "--output",
        "capture-bundle",
        "--width-pixels",
        "320",
        "--height-pixels",
        "180",
        "--port",
        "5180",
        "--json",
      ]),
    ).toEqual({
      command: "take-run",
      inputPath: "opening.take.json",
      worldPath: "world.json",
      outputPath: "capture-bundle",
      widthPixels: 320,
      heightPixels: 180,
      port: 5180,
      json: true,
    });
    expect(
      parseWorldkitArgs(["capture", "validate", "capture-bundle", "--json"]),
    ).toEqual({ command: "capture-validate", inputPath: "capture-bundle", json: true });
    expect(
      parseWorldkitArgs(["capture", "inspect", "capture-bundle", "--json"]),
    ).toEqual({ command: "capture-inspect", inputPath: "capture-bundle", json: true });
    expect(
      parseWorldkitArgs([
        "verify",
        "capture",
        "capture-bundle",
        "--output",
        "validation-report.json",
        "--json",
      ]),
    ).toEqual({
      command: "verify-capture",
      inputPath: "capture-bundle",
      outputPath: "validation-report.json",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "verify",
        "route",
        "route-world.json",
        "--profile",
        "worldkit://validation-profile/outdoor-world-package-dev@1",
        "--output",
        "route-validation-report.json",
        "--json",
      ]),
    ).toEqual({
      command: "verify-route",
      inputPath: "route-world.json",
      validationProfileRef:
        "worldkit://validation-profile/outdoor-world-package-dev@1",
      outputPath: "route-validation-report.json",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "verify",
        "explain",
        "validation-report.json",
        "--gate-id",
        "capture-completeness",
        "--json",
      ]),
    ).toEqual({
      command: "verify-explain",
      inputPath: "validation-report.json",
      gateId: "capture-completeness",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "registry",
        "list",
        "--kind",
        "subject-definition",
        "--json",
      ]),
    ).toEqual({
      command: "registry-list",
      resourceKind: "subject-definition",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "registry",
        "list",
        "--kind",
        "control-feel-profile",
        "--json",
      ]),
    ).toEqual({
      command: "registry-list",
      resourceKind: "control-feel-profile",
      json: true,
    });
    expect(
      parseWorldkitArgs(["layout", "validate", "world.json", "--json"]),
    ).toEqual({
      command: "layout-validate",
      inputPath: "world.json",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "layout",
        "solve",
        "world.json",
        "--output",
        "layout-output",
        "--json",
      ]),
    ).toEqual({
      command: "layout-solve",
      inputPath: "world.json",
      outputPath: "layout-output",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "layout",
        "explain",
        "layout-report.json",
        "--constraint-id",
        "tower-clearance",
        "--json",
      ]),
    ).toEqual({
      command: "layout-explain",
      inputPath: "layout-report.json",
      constraintId: "tower-clearance",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "registry",
        "describe",
        "--resource-ref",
        "worldkit://subject-definition/humanoid.third-person@1",
        "--json",
      ]),
    ).toEqual({
      command: "registry-describe",
      resourceRef: "worldkit://subject-definition/humanoid.third-person@1",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "subject-definition",
        "validate",
        "definition.json",
        "--json",
      ]),
    ).toEqual({
      command: "subject-definition-validate",
      inputPath: "definition.json",
      json: true,
    });
    expect(
      parseWorldkitArgs([
        "subject",
        "explain",
        "world.json",
        "--entity-id",
        "pack-animal-a",
        "--json",
      ]),
    ).toEqual({
      command: "subject-explain",
      inputPath: "world.json",
      entityId: "pack-animal-a",
      json: true,
    });
  });

  it("parses canonical runtime capture artifact outputs", () => {
    expect(parseWorldkitArgs([
      "capture",
      "world.json",
      "--output",
      "opening-frame.png",
      "--snapshot",
      "snapshot.json",
      "--triview-output",
      "triviews",
      "--implementation-map",
      "scene-implementation-map.json",
      "--json",
    ])).toEqual({
      command: "capture",
      inputPath: "world.json",
      outputPath: "opening-frame.png",
      snapshotPath: "snapshot.json",
      triviewOutputPath: "triviews",
      implementationMapPath: "scene-implementation-map.json",
      json: true,
    });
  });

  it("parses verified Package Capture without a Canonical implementation map", () => {
    expect(parseWorldkitArgs([
      "capture",
      "attempts/0/world-package",
      "--output",
      "attempts/0/capture/opening.png",
      "--triview-output",
      "attempts/0/capture",
      "--json",
    ])).toEqual({
      command: "capture",
      inputPath: "attempts/0/world-package",
      outputPath: "attempts/0/capture/opening.png",
      triviewOutputPath: "attempts/0/capture",
      json: true,
    });
  });

  it("dispatches a directory input to the capture-only Hosted Package adapter", async () => {
    const root = await createTemporaryDirectory();
    const packageDirectoryPath = path.join(root, "world-package");
    const captureDirectoryPath = path.join(root, "capture");
    const openingOutputPath = path.join(captureDirectoryPath, "opening.png");
    await mkdir(packageDirectoryPath);
    const calls: unknown[] = [];
    const stdout: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    try {
      await expect(main([
        "capture",
        packageDirectoryPath,
        "--output",
        openingOutputPath,
        "--triview-output",
        captureDirectoryPath,
        "--json",
      ], {
        captureHostedWorldPackageV1: async (input: unknown) => {
          calls.push(input);
          return {
            outcome: "completed",
            outputDirectoryPath: captureDirectoryPath,
            openingOutputPath,
            formalRequestHash: `sha256:${"1".repeat(64)}`,
            formalCaptureReceiptHash: `sha256:${"2".repeat(64)}`,
            worldPackageRootHash: `sha256:${"3".repeat(64)}`,
          };
        },
      })).resolves.toBe(0);
    } finally {
      write.mockRestore();
    }

    expect(calls).toEqual([{
      packageDirectoryPath,
      outputPath: openingOutputPath,
      triviewOutputPath: captureDirectoryPath,
    }]);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      ok: true,
      exitCode: 0,
      outputPath: openingOutputPath,
      triviewOutputPath: captureDirectoryPath,
      formalRequestHash: `sha256:${"1".repeat(64)}`,
      formalCaptureReceiptHash: `sha256:${"2".repeat(64)}`,
      worldPackageRootHash: `sha256:${"3".repeat(64)}`,
    });
  });

  it("validates a lightweight Scene Brief through the CLI boundary", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = path.join(directory, "scene-brief.md");
    await writeFile(inputPath, `# WorldKit Scene Brief

## 场景
开阔海湾中的完整滑行世界。

## 主体
人与滑板组成一个完整受控主体。

## 用户事实
用户要求根据参考意图创建可操作白模世界。

## 可见参考证据
可见海湾、前景平台和远景城市天际线。

## 推断的世界延伸
镜头外区域延伸为连贯海岸地形，此项为工程推断。

## 仅视觉层设想
水面反光、材质和天空风格只属于渲染层。

## 运动模式
陆地滑行：主体依靠滑板连续滑行并保留惯性。

## 空间
前景平台连接中景海湾，远景保留完整城市天际线。

## 通行
除实体碰撞外全图开放，不设计首选路线。

## 首帧
标准第三人称背后构图，主体面向开放海湾。

## 视觉目标
- 主体｜滑板旅人：完整的人与滑板复合主体
`, "utf8");
    const result = await validateSceneBriefFile(inputPath);
    expect(result).toMatchObject({
      ok: true,
      movementMode: "ground-slide",
      movementModeLabel: "陆地滑行",
      visualTargetCount: 1,
    });
    expect(result.sceneBriefHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const customSource = (await readFile(inputPath, "utf8")).replace("陆地滑行", "磁力墙面行走");
    await writeFile(inputPath, customSource, "utf8");
    await expect(validateSceneBriefFile(inputPath)).resolves.toMatchObject({
      ok: true,
      movementMode: "custom",
      movementModeLabel: "磁力墙面行走",
    });
  });

  it("rejects unknown, incomplete, or ambiguous command options", () => {
    expect(() => parseWorldkitArgs(["build", "world.json"])).toThrow(
      WorldkitUsageError,
    );
    expect(() => parseWorldkitArgs([
      "run",
      "world.package",
      "--interactive",
    ])).toThrow("--protocol ndjson --headless");
    expect(() => parseWorldkitArgs([
      "run",
      "world.package",
      "--interactive",
      "--protocol",
      "ndjson",
      "--headless",
      "--session-directory",
      "relative/session",
    ])).toThrow("absolute directory");
    expect(() => parseWorldkitArgs([
      "run",
      "world.package",
      "--interactive",
      "--protocol",
      "ndjson",
      "--headless",
      "--session-directory",
      "/tmp/worldkit-session",
      "--port",
      "5173",
    ])).toThrow("do not accept Browser flags");
    expect(() =>
      parseWorldkitArgs(["registry", "list", "--json"]),
    ).toThrow(WorldkitUsageError);
    expect(() =>
      parseWorldkitArgs([
        "registry",
        "describe",
        "worldkit://subject-definition/humanoid.third-person@1",
      ]),
    ).toThrow(WorldkitUsageError);
    expect(() =>
      parseWorldkitArgs(["subject", "explain", "world.json"]),
    ).toThrow(WorldkitUsageError);
    expect(() =>
      parseWorldkitArgs(["verify", "capture", "capture-bundle"]),
    ).toThrow(WorldkitUsageError);
    expect(() =>
      parseWorldkitArgs([
        "verify",
        "route",
        "route-world.json",
        "--output",
        "route-validation-report.json",
      ]),
    ).toThrow("verify route requires --profile <validation-profile-ref>");
    expect(() =>
      parseWorldkitArgs([
        "verify",
        "route",
        "route-world.json",
        "--profile",
        "worldkit://validation-profile/outdoor-world-package-dev@1",
      ]),
    ).toThrow("verify route requires --output <validation-report.json>");
    expect(() =>
      parseWorldkitArgs([
        "verify",
        "route",
        "route-world.json",
        "--profile",
        "worldkit://validation-profile/outdoor-world-package-dev@1",
        "--profile",
        "worldkit://validation-profile/outdoor-world-package-dev@1",
        "--output",
        "route-validation-report.json",
      ]),
    ).toThrow("--profile may be provided only once");
    expect(() =>
      parseWorldkitArgs([
        "verify",
        "route",
        "route-world.json",
        "--profile",
        "worldkit://validation-profile/outdoor-world-package-dev@1",
        "--output",
        "route-validation-report.json",
        "--output",
        "other-route-validation-report.json",
      ]),
    ).toThrow("--output may be provided only once");
    expect(() =>
      parseWorldkitArgs([
        "verify",
        "explain",
        "validation-report.json",
        "--gate-id",
        "capture-completeness",
        "--gate-id",
        "capture-ownership",
      ]),
    ).toThrow(WorldkitUsageError);
    expect(() =>
      parseWorldkitArgs([
        "layout",
        "explain",
        "report.json",
        "--entity-id",
        "tower",
        "--constraint-id",
        "tower-clearance",
      ]),
    ).toThrow("exactly one of --entity-id or --constraint-id");
    expect(() =>
      parseWorldkitArgs(["layout", "solve", "world.json"]),
    ).toThrow("layout solve requires --output <directory>");
    expect(() =>
      parseWorldkitArgs(["take", "run", "opening.take.json", "--world", "world.json"]),
    ).toThrow("take run requires --output <directory>");
    expect(() =>
      parseWorldkitArgs([
        "take", "run", "opening.take.json", "--world", "world.json",
        "--output", "bundle", "--width-pixels", "320",
      ]),
    ).toThrow("take run requires --height-pixels <integer>");
  });

  it("parses the exact Package inspect, load, and interactive run dialect", () => {
    expect(parseWorldkitArgs(["inspect", "world.package", "--json"])).toEqual({
      command: "inspect",
      packageDirectoryPath: "world.package",
      json: true,
    });
    expect(parseWorldkitArgs([
      "load",
      "world.package",
      "--headless",
      "--json",
    ])).toEqual({
      command: "load",
      packageDirectoryPath: "world.package",
      headless: true,
      json: true,
    });
    expect(parseWorldkitArgs([
      "run",
      "world.package",
      "--interactive",
      "--protocol",
      "ndjson",
      "--headless",
      "--session-directory",
      "/tmp/worldkit-session",
      "--resume",
    ])).toEqual({
      command: "run-session",
      packageDirectoryPath: "world.package",
      sessionDirectoryPath: "/tmp/worldkit-session",
      resume: true,
      json: false,
    });
  });

  it("rejects --resume before reading stdin when the Session WAL is missing", async () => {
    const directory = await createTemporaryDirectory();
    let stdout = "";
    let stderr = "";
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        stdout += String(chunk);
        return true;
      },
    );
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(
      (chunk) => {
        stderr += String(chunk);
        return true;
      },
    );
    try {
      await expect(main([
        "run",
        path.join(directory, "missing.package"),
        "--interactive",
        "--protocol",
        "ndjson",
        "--headless",
        "--session-directory",
        path.join(directory, "missing-session"),
        "--resume",
      ])).resolves.toBe(2);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }
    expect(stdout).toBe("");
    expect(stderr).toContain("--resume requires an existing Runtime Session WAL");
  });

  it("prints one canonical JSON result and keeps stderr empty for layout commands", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writePackageWorld(directory);
    const outputPath = path.join(directory, "layout");
    let stdout = "";
    let stderr = "";
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        stdout += String(chunk);
        return true;
      });
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
      });
    try {
      await expect(
        main([
          "layout",
          "solve",
          inputPath,
          "--output",
          outputPath,
          "--json",
        ]),
      ).resolves.toBe(0);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }

    expect(stderr).toBe("");
    expect(stdout.endsWith("\n")).toBe(true);
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      exitCode: 0,
      kind: "worldkit-layout-solve",
      status: "solved",
      outputPath,
    });
  });

  it("prints stable Route validation diagnostics in human and JSON modes", async () => {
    const directory = await createTemporaryDirectory();
    const outputPath = path.join(directory, "route-report.json");
    let stdout = "";
    let stderr = "";
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        stdout += String(chunk);
        return true;
      });
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
      });
    try {
      await expect(main([
        "verify",
        "route",
        "world.json",
        "--profile",
        "worldkit://validation-profile/unsupported@1",
        "--output",
        outputPath,
      ])).resolves.toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain(
        "[error] WORLDKIT_ROUTE_VALIDATION_PROFILE_UNSUPPORTED /validationProfileRef",
      );

      stdout = "";
      stderr = "";
      await expect(main([
        "verify",
        "route",
        "world.json",
        "--profile",
        "worldkit://validation-profile/unsupported@1",
        "--output",
        outputPath,
        "--json",
      ])).resolves.toBe(1);
      expect(stderr).toBe("");
      expect(stdout.trim().split("\n")).toHaveLength(1);
      expect(JSON.parse(stdout)).toMatchObject({
        ok: false,
        exitCode: 1,
        diagnostics: [{
          severity: "error",
          code: "WORLDKIT_ROUTE_VALIDATION_PROFILE_UNSUPPORTED",
          instancePath: "/validationProfileRef",
        }],
      });
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }
  });

  it("redacts provider errors from worldkit run JSON diagnostics", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writeRouteWorld(directory);
    const privateProviderMessage =
      "Recast/Havok failed at /Users/private-user/native/provider-state.bin";
    vi.mocked(runTrustedRouteValidationV1).mockRejectedValueOnce(
      new Error(privateProviderMessage),
    );
    let stdout = "";
    let stderr = "";
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        stdout += String(chunk);
        return true;
      });
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
      });
    try {
      await expect(main(["run", inputPath, "--json"])).resolves.toBe(1);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }

    expect(stderr).toBe("");
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(stdout)).toEqual({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        severity: "error",
        code: "WORLDKIT_ROUTE_VALIDATION_RUNNER_FAILED",
        instancePath: "",
        message:
          "Unable to prepare trusted Route evidence for the playground.",
      }],
    });
    expect(stdout).not.toContain(privateProviderMessage);
    expect(stdout).not.toContain("/Users/private-user");
  });

  it("redacts runner-owned paths and cause from worldkit run JSON diagnostics", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writeRouteWorld(directory);
    const privateInputPath =
      "/Users/private-user/worlds/unpublished-route-source.json";
    const privateProviderMessage = "Recast native status from Havok adapter";
    vi.mocked(runTrustedRouteValidationV1).mockRejectedValueOnce(
      new RouteValidationRunnerInfrastructureErrorV1(
        "WORLDKIT_ROUTE_VALIDATION_RESOURCE_RESOLUTION_FAILED",
        { inputPath: privateInputPath, nativeProviderHandle: 7 },
        new Error(privateProviderMessage),
      ),
    );
    let stdout = "";
    let stderr = "";
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        stdout += String(chunk);
        return true;
      });
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
      });
    try {
      await expect(main(["run", inputPath, "--json"])).resolves.toBe(1);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }

    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        severity: "error",
        code: "WORLDKIT_ROUTE_VALIDATION_INFRASTRUCTURE_ERROR",
        instancePath: "",
        message:
          "Unable to prepare trusted Route evidence for the playground.",
        details: {
          reason: "WORLDKIT_ROUTE_VALIDATION_RESOURCE_RESOLUTION_FAILED",
        },
      }],
    });
    expect(stdout).not.toContain(privateInputPath);
    expect(stdout).not.toContain(privateProviderMessage);
    expect(stdout).not.toContain("nativeProviderHandle");
    expect(stdout).not.toContain("cause");
  });

  it("runs the public Route command and publishes a canonical failed report", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writeRouteWorld(directory);
    const world = JSON.parse(await readFile(inputPath, "utf8")) as {
      constraints: { connectivity: readonly unknown[] };
    };
    world.constraints.connectivity = [];
    await writeFile(inputPath, JSON.stringify(world), "utf8");
    const outputPath = path.join(directory, "route-report.json");
    let stdout = "";
    let stderr = "";
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        stdout += String(chunk);
        return true;
      });
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
      });
    try {
      await expect(main([
        "verify",
        "route",
        inputPath,
        "--profile",
        "worldkit://validation-profile/outdoor-world-package-dev@1",
        "--output",
        outputPath,
        "--json",
      ])).resolves.toBe(2);
    } finally {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }

    expect(stderr).toBe("");
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(stdout)).toMatchObject({
      ok: false,
      exitCode: 2,
      kind: "worldkit-route-validation-command-result",
      schemaVersion: 1,
      validationStatus: "failed",
      validationReportHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      outputPath,
      evidenceDirectory: `${outputPath}.evidence`,
    });
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      kind: "worldkit-validation-report",
      schemaVersion: 1,
      status: "failed",
      routeValidationSetReceipt: { rows: [] },
    });
  });

  it("lists and describes immutable Registry resources in stable order", () => {
    const first = listRegistryResources("subject-definition");
    const second = listRegistryResources("subject-definition");

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      kind: "worldkit-registry-list",
      schemaVersion: 1,
      resourceKind: "subject-definition",
    });
    expect(first.resources.map((resource) => resource.resourceRef)).toEqual([
      "worldkit://subject-definition/animal.quadruped.forward-steer@1",
      "worldkit://subject-definition/animal.quadruped.forward-steer@2",
      "worldkit://subject-definition/glider.paraglider.unpowered@1",
      "worldkit://subject-definition/humanoid.alpha-local-actions@1",
      "worldkit://subject-definition/humanoid.g-bot@2",
      "worldkit://subject-definition/humanoid.rigged-golden@2",
      "worldkit://subject-definition/humanoid.third-person@1",
      "worldkit://subject-definition/quadruped.ground-proxy@1",
      "worldkit://subject-definition/surface-craft.ice-skimmer@1",
      "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
      "worldkit://subject-definition/watercraft.kayak.surface@1",
      ...XIER120_SUBJECT_DEFINITIONS
        .map((definition) => definition.resourceRef)
        .sort((left, right) => left.localeCompare(right)),
    ]);
    expect(first.resources[0]).toMatchObject({
      kind: "subject-definition",
      schemaVersion: 3,
      version: 1,
      contentHash: expect.stringMatching(/^sha256:/),
      aiMetadata: {
        displayName: expect.any(String),
        description: expect.any(String),
      },
      coordinateConvention: { pivot: "support-center" },
    });
    const controlFeelProfiles = listRegistryResources("control-feel-profile");
    expect(controlFeelProfiles.resources.length).toBeGreaterThan(0);
    expect(controlFeelProfiles.resources.every(
      (resource) => resource.kind === "control-feel-profile",
    )).toBe(true);
    expect(
      describeRegistryResource(
        "worldkit://subject-definition/humanoid.g-bot@2",
      ),
    ).toMatchObject({
      ok: true,
      kind: "worldkit-registry-description",
      schemaVersion: 1,
      resource: {
        resourceRef: "worldkit://subject-definition/humanoid.g-bot@2",
        schemaVersion: 3,
        contentHash: first.resources.find(
          (resource) =>
            resource.resourceRef ===
            "worldkit://subject-definition/humanoid.g-bot@2",
        )?.contentHash,
      },
    });

    expect(
      describeRegistryResource(
        "worldkit://subject-definition/humanoid.third-person@1",
      ),
    ).toMatchObject({
      ok: true,
      kind: "worldkit-registry-description",
      schemaVersion: 1,
      resource: {
        resourceRef:
          "worldkit://subject-definition/humanoid.third-person@1",
        contentHash: expect.stringMatching(/^sha256:/),
      },
    });
  });

  it("describes every Registry resource kind selected by the rigged Subject", () => {
    const resourceRefByKind = {
      "subject-asset": "worldkit://subject-asset/humanoid.golden@2",
      "rig-profile": "worldkit://rig-profile/biped.golden@2",
      "animation-set": "worldkit://animation-set/humanoid.ground.golden@2",
      "collider-profile": "worldkit://collider-profile/humanoid.medium-capsule@1",
      "physics-body-profile": "worldkit://physics-body-profile/character.medium@1",
      "locomotion-profile": "worldkit://locomotion-profile/ground.standard@1",
      capability: "worldkit://capability/locomotion.ground@1",
      "subject-definition": "worldkit://subject-definition/humanoid.rigged-golden@2",
    } as const;

    for (const [kind, resourceRef] of Object.entries(resourceRefByKind)) {
      expect(describeRegistryResource(resourceRef)).toMatchObject({
        ok: true,
        resource: { kind, resourceRef },
      });
    }
  });

  it("describes a Control Feel through generic Registry discovery", () => {
    expect(
      describeRegistryResource(
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
      ),
    ).toMatchObject({
      ok: true,
      kind: "worldkit-registry-description",
      resource: {
        kind: "control-feel-profile",
        resourceRef:
          "worldkit://control-feel-profile/humanoid.medium-ground@1",
      },
    });
  });

  it("returns discovery guidance for a missing exact Registry Ref", () => {
    expect(
      describeRegistryResource(
        "worldkit://subject-definition/humanoid.third-person@2",
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "SUBJECT_DEFINITION_NOT_FOUND",
          details: {
            resourceRef:
              "worldkit://subject-definition/humanoid.third-person@2",
            availableResourceRefs: expect.arrayContaining([
              "worldkit://subject-definition/humanoid.third-person@1",
            ]),
          },
        },
      ],
    });
  });

  it("validates a standalone Definition through canonical derivation", async () => {
    const directory = await createTemporaryDirectory();
    const definitionPath = path.join(directory, "definition.json");
    const definition = createValidPackageSubjectWorld().resources
      .subjectDefinitions[0]!;
    await writeFile(definitionPath, JSON.stringify(definition), "utf8");

    const result = await validateSubjectDefinitionFile(definitionPath);

    expect(result).toMatchObject({
      ok: true,
      kind: "worldkit-subject-definition-validation",
      schemaVersion: 1,
      subjectDefinition: {
        subjectDefinitionRef:
          "package://subject-definition/coastal-pack-animal@1",
        subjectDefinitionHash: expect.stringMatching(/^sha256:/),
        collider: {
          colliderDerivationProfileRef:
            "worldkit://collider-derivation-profile/vertical-character-capsule@1",
          radiusMeters: 0.7,
          heightMeters: 1.4,
          centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
        },
        resourceCost: { vertices: 304, triangles: 524, colliders: 1 },
        resourceLockHash: expect.stringMatching(/^sha256:/),
        resourceLockEntries: expect.any(Array),
      },
    });
  });

  it("validates a profile Collider without inventing a derivation alias", async () => {
    const directory = await createTemporaryDirectory();
    const definitionPath = path.join(directory, "rigged-definition.json");
    await writeFile(
      definitionPath,
      JSON.stringify(createValidRiggedPackageDefinition()),
      "utf8",
    );

    const result = await validateSubjectDefinitionFile(definitionPath);

    expect(result).toMatchObject({
      ok: true,
      subjectDefinition: {
        collider: {
          colliderProfileRef:
            "worldkit://collider-profile/humanoid.medium-capsule@1",
          radiusMeters: 0.32,
          heightMeters: 1.92,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("derivationProfileRef");
  });

  it("rejects duplicate keys and invalid standalone Definition fields", async () => {
    const directory = await createTemporaryDirectory();
    const duplicatePath = path.join(directory, "duplicate.json");
    const invalidPath = path.join(directory, "invalid.json");
    await writeFile(
      duplicatePath,
      '{"id":"a","id":"b","kind":"subject-definition"}',
      "utf8",
    );
    await writeFile(
      invalidPath,
      JSON.stringify({
        ...createValidPackageSubjectWorld().resources.subjectDefinitions[0],
        unexpectedField: true,
      }),
      "utf8",
    );

    expect(await validateSubjectDefinitionFile(duplicatePath)).toMatchObject({
      ok: false,
      diagnostics: [
        { code: "AUTHORING_JSON_DUPLICATE_KEY", instancePath: "/id" },
      ],
    });
    expect(await validateSubjectDefinitionFile(invalidPath)).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "AUTHORING_SCHEMA_INVALID" })],
    });
  });

  it("explains Definition, collider, Profiles, lock entries, and cost", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writePackageWorld(directory);

    const result = await explainSubjectFile(inputPath, "pack-animal-a");

    expect(result).toMatchObject({
      ok: true,
      kind: "worldkit-subject-explanation",
      schemaVersion: 1,
      subject: {
        entityId: "pack-animal-a",
        subjectDefinitionRef:
          "package://subject-definition/coastal-pack-animal@1",
        subjectDefinitionHash: expect.stringMatching(/^sha256:/),
        source: "package",
        collider: {
          colliderDerivationProfileRef:
            "worldkit://collider-derivation-profile/vertical-character-capsule@1",
          centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
        },
        profiles: {
          physicsBodyProfileRef:
            "worldkit://physics-body-profile/character.capability-medium@1",
          locomotionProfileRef:
            "worldkit://locomotion-profile/ground.standard@1",
        },
        capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
        resourceLockEntries: expect.any(Array),
        resourceLockHash: expect.stringMatching(/^sha256:/),
        resourceCost: { colliders: 1 },
      },
    });
  });

  it("explains the rigged Subject with canonical refs and exactly eight selected lock kinds", async () => {
    const result = await explainSubjectFile(
      RIGGED_SUBJECT_WORLD_PATH,
      "rigged-primary",
    );

    expect(result).toMatchObject({
      ok: true,
      subject: {
        entityId: "rigged-primary",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.rigged-golden@2",
        visualParts: [
          {
            id: "body.asset",
            kind: "asset",
            subjectAssetRef: "worldkit://subject-asset/humanoid.golden@2",
          },
        ],
        visualBinding: {
          mode: "rigged",
          rigProfileRef: "worldkit://rig-profile/biped.golden@2",
          animationSetRef:
            "worldkit://animation-set/humanoid.ground.golden@2",
        },
        collider: {
          colliderProfileRef:
            "worldkit://collider-profile/humanoid.medium-capsule@1",
        },
      },
    });
    if (!result.ok) throw new Error("Rigged Subject explanation failed.");
    expect(
      result.subject.resourceLockEntries.map((entry) => entry.resourceKind),
    ).toEqual([
      "animation-set",
      "capability",
      "collider-profile",
      "locomotion-profile",
      "physics-body-profile",
      "rig-profile",
      "subject-asset",
      "subject-definition",
    ]);
    const explanationJson = JSON.stringify(result.subject);
    for (const forbiddenField of [
      "artifact",
      "bytes",
      "provenance",
      "sourceUri",
      "engineHandle",
    ]) {
      expect(explanationJson).not.toContain(forbiddenField);
    }
  });

  it("validates, builds, and explains the G Bot world without leaking asset locations", async () => {
    const directory = await createTemporaryDirectory();
    const outputPath = path.join(directory, "g-bot.build.json");

    const validation = await validateFile(G_BOT_SUBJECT_WORLD_PATH);
    const build = await buildWorldArtifactFileV1(
      G_BOT_SUBJECT_WORLD_PATH,
      outputPath,
    );
    const explanation = await explainSubjectFile(
      G_BOT_SUBJECT_WORLD_PATH,
      "g-bot-primary",
    );
    expect(validation).toMatchObject({ ok: true, diagnostics: [] });
    expect(build).toMatchObject({ ok: true, outputPath });
    expect(explanation).toMatchObject({
      ok: true,
      subject: {
        entityId: "g-bot-primary",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@2",
        visualBinding: {
          rigProfileRef: "worldkit://rig-profile/biped.mixamo-g-bot@2",
          animationSetRef:
            "worldkit://animation-set/humanoid.ground.g-bot@2",
        },
      },
    });
    const artifactText = await readFile(outputPath, "utf8");
    const artifact = JSON.parse(artifactText) as {
      worldRuntimeBootstrap: {
        subjectAssets: Array<{ subjectAssetRef: string }>;
        rigProfiles: Array<{ skeletonRootBoneName: string }>;
        animationSets: Array<{ animationBindings: Array<{ actionId: string }> }>;
        colliderProfiles: Array<{ colliderProfileRef: string }>;
      };
    };

    expect(artifact.worldRuntimeBootstrap.subjectAssets).toEqual([
      {
        subjectAssetRef: "worldkit://subject-asset/actor.humanoid.g-bot@2",
        artifactContentHash:
          "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f",
        byteLength: 6_743_072,
        format: "glb",
        inventory: expect.any(Object),
        mediaType: "model/gltf-binary",
      },
    ]);
    expect(artifact.worldRuntimeBootstrap.rigProfiles).toEqual([
      expect.objectContaining({ skeletonRootBoneName: "mixamorig:Hips" }),
    ]);
    expect(
      artifact.worldRuntimeBootstrap.animationSets[0]?.animationBindings.map(
        (binding) => binding.actionId,
      ),
    ).toEqual(G_BOT_ACTION_IDS);
    expect(artifact.worldRuntimeBootstrap.colliderProfiles).toEqual([
      expect.objectContaining({
        colliderProfileRef:
          "worldkit://collider-profile/humanoid.g-bot-capsule@1",
      }),
    ]);
    expect(artifactText).not.toMatch(
      /subject-assets\/humanoid|sourceUri|licenseUri|providerHandle/i,
    );
  });

  it("returns a stable diagnostic for a missing Subject Entity", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writePackageWorld(directory);

    expect(await explainSubjectFile(inputPath, "missing")).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "SUBJECT_ENTITY_NOT_FOUND",
          details: {
            entityId: "missing",
            availableEntityIds: ["pack-animal-a", "pack-animal-b", "player"],
          },
        },
      ],
    });
  });

  it("validates V4 files and builds deterministic artifacts with one World Build identity", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = await writePackageWorld(directory);
    const outputPath = path.join(directory, "dist", "world.build.json");

    const validation = await validateFile(inputPath);
    const first = await buildWorldArtifactFileV1(inputPath, outputPath);
    const firstBytes = await readFile(outputPath, "utf8");
    const second = await buildWorldArtifactFileV1(inputPath, outputPath);
    const secondBytes = await readFile(outputPath, "utf8");
    const artifact = JSON.parse(firstBytes) as Record<string, unknown>;

    expect(validation).toMatchObject({
      ok: true,
      exitCode: 0,
      diagnostics: [],
      worldBuildIdentityHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(first).toMatchObject({
      ok: true,
      exitCode: 0,
      outputPath,
      worldBuildIdentityHash: validation.worldBuildIdentityHash,
    });
    expect(second.ok).toBe(true);
    expect(firstBytes).toBe(secondBytes);
    expect(artifact).toMatchObject({
      kind: "worldkit-build-artifact",
      schemaVersion: 4,
      worldBuildIdentityHash: validation.worldBuildIdentityHash,
      normalizedWorldIr: { schemaVersion: 4 },
      executionPlan: {
        kind: "worldkit-canonical-scene-execution-plan",
        schemaVersion: 1,
      },
      gameplayBootstrap: {
        kind: "gameplay-bootstrap",
        version: 1,
      },
    });
    expect(firstBytes).not.toContain(["kit", "Ref"].join(""));
  });
});
