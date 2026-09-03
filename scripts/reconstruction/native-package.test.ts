import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sha256CanonicalJson, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { hashBabylonNativeSceneContributionV1 } from "@whitebox-world/runtime-contracts";
import { decideSceneAuthoringRouteV1 } from "@whitebox-world/scene-authoring-contracts";
import { parseWorldReconstructionCaseV1, parseWorldReconstructionEvaluationProfileV1 } from "@whitebox-world/validation";
import { parseWorldPackageWorldBoundsV1 } from "@whitebox-world/world-package";
import { afterEach, describe, expect, it } from "vitest";

import { prepareNativeBlockGenerationTaskV1 } from "./generation-request.js";
import { runNativeBlockGenerationV1 } from "./generation-runner.js";
import {
  assertNativeBlockProductionSourceImportsV1,
  NativeBlockPackageErrorV1,
  packageNativeBlockAttemptV1,
} from "./native-package.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const CASE_SOURCE = path.join(
  REPOSITORY_ROOT,
  "artifacts/scenes/cloud-temple-t-gate-native-block",
);
const HOST_CLOSURE_ROOT = path.join(
  REPOSITORY_ROOT,
  "apps/playground/public/world-packages/cloud-ridge",
);
const temporaryRoots: string[] = [];

const SCENE_SOURCE = `import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1 } from "@whitebox-world/native-babylon-block-profile";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "cloud-temple-test",
  build(context) {
    const session = createBabylonNativeBlockProfileSessionV1(context, { maximumBlockCount: 64 });
    session.createBlockGrid({idPrefix: "foreground", shape: "full", paletteRole: "ground", visualGroupId: "foreground-platform-group", colliderGroupId: "foreground-ground-group", minimumCenterMetersXYZ: [-1, -0.5, 11], repeatCountXYZ: [3, 1, 8] });
    session.createBlockGrid({idPrefix: "central", shape: "full", paletteRole: "route", visualGroupId: "central-ascent-group", colliderGroupId: "central-ground-group", minimumCenterMetersXYZ: [-1, -0.5, 4], repeatCountXYZ: [3, 1, 7] });
    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });
    session.createBlock({id: "mountain", shape: "full", paletteRole: "background-mass", visualGroupId: "mountain-cliff-layers-group", centerMetersXYZ: [-4, -0.5, 2] });
    session.createBlockGrid({idPrefix: "upper", shape: "full", paletteRole: "structure", visualGroupId: "upper-t-junction-group", colliderGroupId: "upper-ground-group", minimumCenterMetersXYZ: [-1, -0.5, 1], repeatCountXYZ: [3, 1, 3] });
    session.finalize({ staticColliders: [
      { id: "collider-central-steps", colliderGeometrySource: { kind: "block-group", colliderGroupId: "central-ground-group" }, traversalBinding: { kind: "static-surface", surfaceEntityId: "central-surface", logicalSubshapeId: "central-top", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" }, exposedEdgePolicy: "none" },
      { id: "collider-cliff-blockers", colliderGeometrySource: { kind: "block", blockId: "mountain" }, traversalBinding: { kind: "not-traversable" }, exposedEdgePolicy: "none" },
      { id: "collider-foreground-ground", colliderGeometrySource: { kind: "block-group", colliderGroupId: "foreground-ground-group" }, traversalBinding: { kind: "static-surface", surfaceEntityId: "foreground-surface", logicalSubshapeId: "foreground-top", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" }, exposedEdgePolicy: "protect-ground-subject" },
      { id: "collider-upper-ground", colliderGeometrySource: { kind: "block-group", colliderGroupId: "upper-ground-group" }, traversalBinding: { kind: "static-surface", surfaceEntityId: "upper-surface", logicalSubshapeId: "upper-top", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" }, exposedEdgePolicy: "none" },
      { id: "collider-gate-walls", colliderGeometrySource: { kind: "block", blockId: "gate" }, traversalBinding: { kind: "not-traversable" }, exposedEdgePolicy: "none" },
    ] });
    context.registration.registerSpawnMarker({ id: context.bootstrap.spawnMarkerId, positionMetersXYZ: [0, 0, 18], facingRadians: 0 });
  },
});
`;

const AUTHORING = {
  kind: "native-block-authoring",
  schemaVersion: 1,
  entryModulePath: "scene.ts",
  blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
  visualGroups: [
    { visualGroupId: "central-ascent-group", acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1", semanticClassId: "route.central-ascent", identityColorHex: "#AA0001" },
    { visualGroupId: "foreground-platform-group", acceptanceTargetRef: "worldkit://acceptance-target/foreground-platform@1", semanticClassId: "ground.foreground-platform", identityColorHex: "#AA0002" },
    { visualGroupId: "gate-mass-group", acceptanceTargetRef: "worldkit://acceptance-target/gate-mass@1", semanticClassId: "structure.gate-mass", identityColorHex: "#AA0003" },
    { visualGroupId: "mountain-cliff-layers-group", acceptanceTargetRef: "worldkit://acceptance-target/mountain-cliff-layers@1", semanticClassId: "terrain.mountain-cliff", identityColorHex: "#AA0004" },
    { visualGroupId: "upper-t-junction-group", acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1", semanticClassId: "structure.upper-t", identityColorHex: "#AA0005" },
  ],
} as const;

const REPLACED_PLACEMENT_DIALECT_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
  `    const gate = session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group" });
    gate.position.set(4, -0.5, 2);`,
);

const REGENERATED_GRID_SCENE_SOURCE = SCENE_SOURCE
  .replace(
    `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [4, -0.5, 2] });`,
    `    session.createBlock({id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group", centerMetersXYZ: [5, -0.5, 2] });`,
  );

const MISSING_GRID_CHILD_SCENE_SOURCE = SCENE_SOURCE.replace(
  `{ kind: "block-group", colliderGroupId: "foreground-ground-group" }`,
  `{ kind: "block", blockId: "foreground" }`,
);

const NARROW_SPAWN_GROUND_SCENE_SOURCE = SCENE_SOURCE.replace(
  `minimumCenterMetersXYZ: [-1, -0.5, 11], repeatCountXYZ: [3, 1, 8]`,
  `minimumCenterMetersXYZ: [0, -0.5, 11], repeatCountXYZ: [1, 1, 8]`,
);

const EXTRA_VISUAL_GROUP_SCENE_SOURCE = SCENE_SOURCE.replace(
  `    session.createBlockGrid({idPrefix: "upper",`,
  `    session.createBlock({id: "supported-spawn", shape: "full", paletteRole: "ground", visualGroupId: "supported-spawn-group", centerMetersXYZ: [8, -0.5, 2] });
    session.createBlockGrid({idPrefix: "upper",`,
);

const EXTRA_VISUAL_GROUP_AUTHORING = {
  ...AUTHORING,
  visualGroups: [
    ...AUTHORING.visualGroups.slice(0, 4),
    { visualGroupId: "supported-spawn-group", acceptanceTargetRef: "worldkit://acceptance-target/supported-spawn@1", semanticClassId: "ground.supported-spawn", identityColorHex: "#AA0006" },
    AUTHORING.visualGroups[4]!,
  ],
} as const;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

async function completedAttempt(options: Readonly<{
  sceneSource?: string;
  authoring?: typeof AUTHORING | typeof EXTRA_VISUAL_GROUP_AUTHORING;
}> = {}) {
  const sceneSource = options.sceneSource ?? SCENE_SOURCE;
  const authoring = options.authoring ?? AUTHORING;
  const root = await realpath(await mkdtemp(
    path.join(os.tmpdir(), "worldkit-native-package-"),
  ));
  temporaryRoots.push(root);
  const caseRoot = path.join(root, "case");
  await cp(CASE_SOURCE, caseRoot, { recursive: true });
  const casePath = path.join(caseRoot, "case.json");
  const inputDirectoryPath = path.join(caseRoot, "inputs");
  const [caseValue, profileValue, boundsValue] = await Promise.all([
    readFile(casePath, "utf8").then(JSON.parse),
    readFile(path.join(caseRoot, "evaluation-profile.json"), "utf8").then(JSON.parse),
    readFile(path.join(inputDirectoryPath, "world-bounds.json"), "utf8").then(JSON.parse),
  ]);
  const reconstructionCase = parseWorldReconstructionCaseV1(caseValue);
  const profile = parseWorldReconstructionEvaluationProfileV1(profileValue);
  const routeDecision = decideSceneAuthoringRouteV1({
    id: `${reconstructionCase.id}-route`,
    sceneBriefRef: reconstructionCase.sceneBriefRef,
    sceneBriefHash: reconstructionCase.sceneBriefHash,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: sha256CanonicalJson({ id: "trusted-local", version: 1 }) as Sha256HashV1,
    requiredCapabilityRefs: [],
    requestedSourceKind: "babylon-native",
    nativeTrustAdmitted: true,
    referenceDrivenDistinctiveSilhouette: true,
  });
  const runDirectoryPath = path.join(caseRoot, "runs", "test");
  await mkdir(path.dirname(runDirectoryPath), { recursive: true });
  const prepared = await prepareNativeBlockGenerationTaskV1({
    case: reconstructionCase,
    profile,
    routeDecision,
    runId: "test",
    attemptIndex: 0,
    backend: "local",
    runDirectoryPath,
    inputDirectoryPath,
    taskInstructionPath: path.join(inputDirectoryPath, "task-instruction.md"),
    builderSkillPath: path.join(inputDirectoryPath, "builder-skill", "SKILL.md"),
    nativeSceneApiPath: path.join(inputDirectoryPath, "native-scene-api.json"),
    nativeSceneProfilePath: path.join(inputDirectoryPath, "native-scene-profile.json"),
    blockProfilePath: path.join(inputDirectoryPath, "block-profile.json"),
    hostClosureRootPath: HOST_CLOSURE_ROOT,
    gameplayBootstrapPath: path.join(HOST_CLOSURE_ROOT, "gameplay/bootstrap.json"),
    worldRuntimeBootstrapPath: path.join(HOST_CLOSURE_ROOT, "runtime/world-runtime-bootstrap.json"),
    worldRuntimeBootstrapRef: "worldkit://world-runtime-bootstrap/cloud-ridge@1",
    worldBoundsPath: path.join(inputDirectoryPath, "world-bounds.json"),
    worldBounds: parseWorldPackageWorldBoundsV1(boundsValue),
    bootstrapId: `${reconstructionCase.id}-native`,
    sceneModuleRef: `worldkit://native-scene/${reconstructionCase.id}@1`,
    seed: 19,
    budgets: {
      maximumBlockCount: 64,
      maximumStaticColliderCount: 8,
      maximumStaticColliderVertexCount: 1024,
      maximumStaticColliderTriangleCount: 1024,
      maximumOutputBytes: 100_000,
      timeoutSeconds: 30,
    },
  });
  await Promise.all([
    writeFile(path.join(prepared.stagingDirectoryPath, "scene.ts"), sceneSource),
    writeFile(path.join(prepared.stagingDirectoryPath, "native-block-authoring.json"), stringifyCanonicalJson(authoring)),
    writeFile(path.join(prepared.stagingDirectoryPath, "native-resources.json"), stringifyCanonicalJson({ kind: "native-visual-resource-list", schemaVersion: 1, resourceRefs: [] })),
  ]);
  const generated = await runNativeBlockGenerationV1(prepared, {
    process: {
      async run() {
        return {
          exitCode: 0,
          stdout: `WORLDKIT_LOCAL_CODEX_JOB native-block-generation ${prepared.routerRequestId} pid=123 profile=formal model=gpt-5.6-sol reasoning=xhigh\n`,
          stderr: "",
          taskOutcome: {
            kind: "worldkit-codex-task-outcome" as const,
            schemaVersion: 1 as const,
            requestId: prepared.routerRequestId,
            outcome: "completed" as const,
          },
        };
      },
    },
    selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
    reconcile: async () => ({ outcome: "missing" }),
    cleanup: async () => ({ outcome: "completed" }),
  });
  expect(
    generated.receipt.outcome,
    JSON.stringify(generated.receipt),
  ).toBe("completed");
  const attemptDirectoryPath = path.dirname(generated.sourceDirectoryPath!);
  await writeFile(
    path.join(attemptDirectoryPath, "generation-receipt.json"),
    `${stringifyCanonicalJson(generated.receipt)}\n`,
  );
  return {
    root,
    casePath,
    attemptDirectoryPath,
    outputDirectoryPath: path.join(attemptDirectoryPath, "world-package"),
  };
}

describe("packageNativeBlockAttemptV1", () => {
  it("keeps Runtime as the sole light owner for Block production Modules", () => {
    expect(() => assertNativeBlockProductionSourceImportsV1([
      "@whitebox-world/native-babylon",
      "@whitebox-world/native-babylon-block-profile",
      "@babylonjs/core/Materials/standardMaterial.js",
    ])).not.toThrow();
    expect(() => assertNativeBlockProductionSourceImportsV1([
      "@babylonjs/core/Lights/hemisphericLight.js",
      "@babylonjs/core/Lights/directionalLight.js",
    ])).toThrowError(expect.objectContaining({
      diagnostics: [
        "production-native-light-import-forbidden:@babylonjs/core/Lights/directionalLight.js,@babylonjs/core/Lights/hemisphericLight.js",
      ],
    }));
  });

  it("checks and binds the generated Layout before atomically publishing one verified Package", async () => {
    const fixture = await completedAttempt();
    const packaged = await packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    }).catch(async (error: unknown) => {
      const check = await readFile(path.join(
        fixture.attemptDirectoryPath,
        "native-check-result.json",
      ), "utf8");
      const groundReport = await readFile(path.join(
        fixture.attemptDirectoryPath,
        "ground-analysis-report.json",
      ), "utf8").catch(() => "ground report not written");
      const cause = error instanceof Error ? error.cause : undefined;
      const nestedCause = cause instanceof Error ? cause.cause : undefined;
      throw new Error(
        [
          error,
          error instanceof NativeBlockPackageErrorV1
            ? JSON.stringify(error.diagnostics)
            : "",
          cause,
          nestedCause,
          check,
          groundReport,
        ].map(String).join("\n"),
      );
    });

    expect(packaged.checkResult.outcome).toBe("passed");
    expect(packaged.verifiedWorldPackage.kind).toBe("babylon-native-scene");
    expect(packaged.sceneAuthoringAttemptResult.authoredSourceHash).toBe(
      packaged.verifiedWorldPackage.sceneModuleBundleManifest.sourceGraphHash,
    );
    expect(
      packaged.verifiedWorldPackage.nativeBlockMaterializerMetadata
        ?.visualGroups,
    ).toHaveLength(5);
    const contribution = packaged.verifiedWorldPackage.nativeSceneContribution;
    const groundBoundary = contribution.staticColliders.find(
      ({ runtimeRole }) => runtimeRole === "ground-safety-boundary",
    );
    expect(groundBoundary).toMatchObject({
      runtimeRole: "ground-safety-boundary",
      traversalBinding: { kind: "not-traversable" },
    });
    expect(
      packaged.verifiedWorldPackage.nativeBlockMaterializerMetadata
        ?.colliderJoins.some(({ colliderId }) => colliderId === groundBoundary?.id),
    ).toBe(false);
    expect(packaged.verifiedWorldPackage.receipt.manifest.sceneSource).toEqual(
      expect.objectContaining({
        kind: "babylon-native-scene",
        nativeSceneContributionHash:
          hashBabylonNativeSceneContributionV1(contribution),
      }),
    );
    expect(packaged.worldPackageRef).toBe(
      packaged.verifiedWorldPackage.receipt.worldPackageRef,
    );
    expect(packaged.groundAnalysisReport).toMatchObject({
      kind: "babylon-native-block-ground-analysis-report",
      admissionOutcome: "passed",
      identity: {
        worldPackageRootHash: packaged.worldPackageRootHash,
      },
    });
    expect(packaged.groundAnalysisReportHash).toBe(
      sha256CanonicalJson(packaged.groundAnalysisReport),
    );
    expect(packaged.groundAnalysisReportHash).not.toBe(
      packaged.groundAnalysisReport.groundAnalysisReportHash,
    );
    expect(JSON.parse(await readFile(
      packaged.groundAnalysisReportPath,
      "utf8",
    ))).toEqual(packaged.groundAnalysisReport);
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "logical-ground-model.json",
    ))).resolves.toBeDefined();
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "ground-analysis-diagnostics.json",
    ))).resolves.toBeDefined();
    await expect(lstat(path.join(
      fixture.outputDirectoryPath,
      "native",
      "block-materializer-metadata.json",
    ))).resolves.toBeDefined();
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "native-block-authoring-layout-binding.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "attempt-result.json",
    ), "utf8"))).toEqual(packaged.sceneAuthoringAttemptResult);
    expect(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "native-explain.txt",
    ), "utf8")).toBe("outcome: passed\n");
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "scene-authoring-attempt-result.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });
  }, 60_000);

  it("reports the stable authoring/Layout binding diagnostic instead of an internal Package failure", async () => {
    const fixture = await completedAttempt({
      sceneSource: EXTRA_VISUAL_GROUP_SCENE_SOURCE,
      authoring: EXTRA_VISUAL_GROUP_AUTHORING,
    });

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toMatchObject({
      diagnostics: ["native-block-authoring-layout-binding-invalid"],
    });
  }, 60_000);

  it("fails closed before Package publication when the Spawn Capsule footprint is not fully supported", async () => {
    const fixture = await completedAttempt({
      sceneSource: NARROW_SPAWN_GROUND_SCENE_SOURCE,
    });

    const rejected = await packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    }).catch((error: unknown) => error);
    expect(rejected).toMatchObject({
      diagnostics: [
        "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
        "native-ground-analysis-rejected",
      ],
      groundAnalysisRejection: {
        kind: "ground-analysis-rejected",
        groundAnalysisReport: {
          admissionOutcome: "failed",
        },
        repairDiagnostics: expect.arrayContaining([
          expect.objectContaining({
            metricId: "ground-support-coverage-basis-points",
            targetId: "spawn-foreground-platform",
          }),
        ]),
      },
    });
    const report = JSON.parse(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "ground-analysis-report.json",
    ), "utf8"));
    expect(report).toMatchObject({
      kind: "babylon-native-block-ground-analysis-report",
      admissionOutcome: "failed",
    });
    expect(report.failureFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metricId: "ground-support-coverage-basis-points",
        targetId: "spawn-foreground-platform",
      }),
    ]));
    expect(JSON.parse(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "attempt-result.json",
    ), "utf8"))).toMatchObject({
      outcome: "completed",
      authoredSourceRef: expect.any(String),
      authoredSourceHash: expect.stringMatching(/^sha256:/),
    });
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("rejects a generated module that still places Blocks after creation", async () => {
    const fixture = await completedAttempt({
      sceneSource: REPLACED_PLACEMENT_DIALECT_SCENE_SOURCE,
    });

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toMatchObject({ diagnostics: ["native-check-rejected"] });
    expect(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "native-check-result.json",
    ), "utf8")).toContain("WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED");
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("rejects a Grid Collider that names the prefix instead of a child Block", async () => {
    const fixture = await completedAttempt({
      sceneSource: MISSING_GRID_CHILD_SCENE_SOURCE,
    });

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toMatchObject({ diagnostics: ["native-check-rejected"] });
    const checkResult = await readFile(path.join(
      fixture.attemptDirectoryPath,
      "native-check-result.json",
    ), "utf8");
    expect(checkResult).toContain("WORLDKIT_NATIVE_BLOCK_COLLIDER_SOURCE_MISSING");
    expect(checkResult).not.toContain("WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED");
    expect(checkResult).not.toMatch(/(?:Error:|\n\s+at\s)/);
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("gives regenerated current-API source a new authored-source and Package identity", async () => {
    const publishedResultPath = path.join(
      HOST_CLOSURE_ROOT,
      "authoring/scene-authoring-attempt-result.json",
    );
    const publishedBefore = await readFile(publishedResultPath, "utf8");
    const [baseline, regenerated] = [
      await completedAttempt(),
      await completedAttempt({ sceneSource: REGENERATED_GRID_SCENE_SOURCE }),
    ];

    const [baselinePackage, regeneratedPackage] = await Promise.all([
      packageNativeBlockAttemptV1({
        repositoryRoot: REPOSITORY_ROOT,
        attemptDirectoryPath: baseline.attemptDirectoryPath,
        casePath: baseline.casePath,
        outputDirectoryPath: baseline.outputDirectoryPath,
      }),
      packageNativeBlockAttemptV1({
        repositoryRoot: REPOSITORY_ROOT,
        attemptDirectoryPath: regenerated.attemptDirectoryPath,
        casePath: regenerated.casePath,
        outputDirectoryPath: regenerated.outputDirectoryPath,
      }),
    ]);

    expect(regeneratedPackage.checkResult.outcome).toBe("passed");
    expect(regeneratedPackage.sceneAuthoringAttemptResult.authoredSourceHash)
      .not.toBe(baselinePackage.sceneAuthoringAttemptResult.authoredSourceHash);
    expect(regeneratedPackage.worldPackageRootHash)
      .not.toBe(baselinePackage.worldPackageRootHash);
    expect(regeneratedPackage.buildReceiptHash)
      .not.toBe(baselinePackage.buildReceiptHash);
    expect(regeneratedPackage.sceneAuthoringAttemptResult.authoredSourceHash)
      .toBe(
        regeneratedPackage.verifiedWorldPackage.sceneModuleBundleManifest
          .sourceGraphHash,
      );

    const publishedResult = JSON.parse(publishedBefore);
    expect(regeneratedPackage.sceneAuthoringAttemptResult.authoredSourceHash)
      .not.toBe(publishedResult.authoredSourceHash);
    expect(await readFile(publishedResultPath, "utf8")).toBe(publishedBefore);
  }, 120_000);

  it("rejects a stale Generation Receipt before creating a check or Package output", async () => {
    const fixture = await completedAttempt();
    const receiptPath = path.join(fixture.attemptDirectoryPath, "generation-receipt.json");
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receipt.generationRequestHash = `sha256:${"f".repeat(64)}`;
    await writeFile(receiptPath, `${stringifyCanonicalJson(receipt)}\n`);

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toBeInstanceOf(NativeBlockPackageErrorV1);
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects every Package output location except the canonical Attempt child", async () => {
    const fixture = await completedAttempt();
    const externalOutputPath = path.join(fixture.root, "packages", "world");

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: externalOutputPath,
    })).rejects.toMatchObject({
      diagnostics: ["output-location-invalid"],
    });
    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: path.join(fixture.attemptDirectoryPath, "other"),
    })).rejects.toMatchObject({
      diagnostics: ["output-location-invalid"],
    });
    await expect(lstat(externalOutputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
