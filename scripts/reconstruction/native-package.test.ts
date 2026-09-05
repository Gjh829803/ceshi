import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256CanonicalJson, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1, createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1 } from "@whitebox-world/native-babylon-block-profile/host";
import { hashBabylonNativeSceneContributionV1, parseFormalWorldCaptureIntentV1, type NativeBlockGroundExplorationV1 } from "@whitebox-world/runtime-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import { createProductionWorldReconstructionRunPortsV1, type ProductionWorldReconstructionRunPortOwnersV1 } from "./production-run-ports.js";
import { assertProductionNativeBlockGroundTopologyCompatibleV1 } from "./native-ground-analysis-admission.js";
import { assertNativeBlockProductionSourceImportsV1, NativeBlockPackageErrorV1, packageNativeBlockAttemptV1 } from "./native-package.js";

import { createNativeBlockPackageAttemptFixtureV1, REPOSITORY_ROOT, HOST_CLOSURE_ROOT, SCENE_SOURCE, REPLACED_PLACEMENT_DIALECT_SCENE_SOURCE, REGENERATED_GRID_SCENE_SOURCE, MOCK_CONTEXT_LAYOUT_BRANCH_SCENE_SOURCE, MOCK_CONTEXT_GAP_BRANCH_SCENE_SOURCE, MOCK_CONTEXT_SPAWN_BRANCH_SCENE_SOURCE, MULTIPLE_ROUTE_COMPONENTS_SCENE_SOURCE, MISSING_GRID_CHILD_SCENE_SOURCE, NARROW_SPAWN_GROUND_SCENE_SOURCE, SPAWN_ADJACENT_STEP_SCENE_SOURCE, EXTRA_VISUAL_GROUP_SCENE_SOURCE, EXTRA_VISUAL_GROUP_AUTHORING } from "./native-package.test-support.js";
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

async function completedAttempt(options: Parameters<typeof createNativeBlockPackageAttemptFixtureV1>[0] = {}) {
  const fixture = await createNativeBlockPackageAttemptFixtureV1(options);
  temporaryRoots.push(fixture.root);
  return fixture;
}

async function expectVisualReviewRejectedBeforeGround(
  fixture: Awaited<ReturnType<typeof completedAttempt>>,
  diagnostic: string,
): Promise<void> {
  await expect(packageNativeBlockAttemptV1({
    repositoryRoot: REPOSITORY_ROOT,
    attemptDirectoryPath: fixture.attemptDirectoryPath,
    casePath: fixture.casePath,
    outputDirectoryPath: fixture.outputDirectoryPath,
  })).rejects.toMatchObject({ diagnostics: [diagnostic] });
  await expect(lstat(path.join(
    fixture.attemptDirectoryPath,
    "native-check-result.json",
  ))).resolves.toBeDefined();
  await expect(lstat(path.join(
    fixture.attemptDirectoryPath,
    "ground-analysis-report.json",
  ))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect((await readdir(fixture.attemptDirectoryPath)).filter((name) =>
    name.startsWith(".native-block-visual-replay-")
  )).toEqual([]);
}

describe("packageNativeBlockAttemptV1", () => {
  it("freezes an explicit no-script fixture before generation without changing its actual ground anchors", async () => {
    const groundExploration: NativeBlockGroundExplorationV1 = {
      mode: "source-authored",
      requiredTargets: [
        { id: "middle", region: "middle", standPositionMetersXYZ: [0, 0, 10] },
        { id: "remote", region: "remote", standPositionMetersXYZ: [0, 0, 3] },
      ],
      requiredTraversalBands: [{ id: "entry-middle", halfWidthMeters: 1,
        centerlineStandPositionsMetersXYZ: [[0, 0, 18], [0, 0, 10]] }],
    };
    const fixture = await completedAttempt({ withoutScriptedTraversal: true, groundExploration });
    expect(fixture.reconstructionCase.expected.criticalTraversalChecks).toEqual([]);
    expect(fixture.reconstructionCase.expected.topology.relations).toEqual([]);
    const intent = parseFormalWorldCaptureIntentV1(JSON.parse(await readFile(path.join(
      path.dirname(fixture.casePath), fixture.reconstructionCase.formalCaptureIntentRef,
    ), "utf8")));
    expect(intent.checkpointSpatialCriteria).toEqual([]);
    expect(intent.topologyRelations).toEqual([]);
    const authoring = JSON.parse(await readFile(path.join(
      fixture.attemptDirectoryPath, "source/native-block-authoring.json",
    ), "utf8"));
    expect(authoring.groundExploration).toEqual(groundExploration);
  }, 30_000);

  it("exposes the single materialized Profile identity authority through the Host entrypoint", () => {
    expect(typeof createBabylonNativeBlockProfileInventoryIdentityFromMaterializedV1)
      .toBe("function");
  });

  it("fails closed when the Profile topology exceeds the controlled Subject envelope", () => {
    const evidence = (options: Readonly<{
      riseMeters?: number;
      reverseWinding?: boolean;
      topologyPolicyHash?: Sha256HashV1;
    }> = {}) => {
      const logicalGroundModelHash = sha256CanonicalJson({ ground: "model" });
      const topologyBody = {
        kind: "babylon-native-block-walkable-topology",
        schemaVersion: 1,
        identity: {
          logicalGroundModelHash,
          topologyPolicyHash: options.topologyPolicyHash ?? sha256CanonicalJson(
            BABYLON_NATIVE_BLOCK_CURRENT_WALKABLE_TOPOLOGY_POLICY_V1,
          ),
        },
        walkableGeometries: [{
          logicalColliderId: "ground",
          collisionPositionsMetersXYZ: [
            0, 0, 0,
            1, options.riseMeters ?? 0, 0,
            0, 0, 1,
          ],
          triangleIndices: options.reverseWinding ? [0, 2, 1] : [0, 1, 2],
        }],
        solidGeometries: [],
        logicalColliderCount: 1,
        colliderVertexCount: 3,
        colliderTriangleCount: 1,
        removedInternalFaceCount: 0,
      };
      return {
        logicalGroundModel: { logicalGroundModelHash },
        topology: {
          ...topologyBody,
          topologyHash: sha256CanonicalJson(topologyBody),
        },
      } as never;
    };
    const envelope = (maxStepHeightMeters: number, maxSlopeDegrees: number) => ({
      envelope: { maxStepHeightMeters, maxSlopeDegrees },
    }) as never;

    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence(),
      envelope(0.3, 42),
    )).not.toThrow();
    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence(),
      envelope(0.2, 42),
    )).toThrow(
      "WORLDKIT_NATIVE_BLOCK_GROUND_ADMISSION_INPUT_INVALID: Block Profile auto-smooth limit 0.3m exceeds controlled Subject maxStepHeightMeters 0.2m",
    );
    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence({ riseMeters: 0.5 }),
      envelope(0.3, 20),
    )).toThrow(/slope .* exceeds controlled Subject maxSlopeDegrees 20deg/);
    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence({ reverseWinding: true }),
      envelope(0.3, 42),
    )).toThrow(/downward-facing triangle/);
    expect(() => assertProductionNativeBlockGroundTopologyCompatibleV1(
      evidence({ topologyPolicyHash: `sha256:${"0".repeat(64)}` }),
      envelope(0.3, 42),
    )).toThrow(/topology identity or Profile policy is stale/);
  });

  it("admits exactly the two current Native Block imports in production", () => {
    expect(() => assertNativeBlockProductionSourceImportsV1([
      "@whitebox-world/native-babylon",
      "@whitebox-world/native-babylon-block-profile",
    ])).not.toThrow();
    expect(() => assertNativeBlockProductionSourceImportsV1([
      "@whitebox-world/native-babylon",
      "@whitebox-world/native-babylon-block-profile",
      "@babylonjs/core/Maths/math.vector.js",
    ])).toThrowError(expect.objectContaining({
      diagnostics: [
        "production-native-import-set-invalid:@babylonjs/core/Maths/math.vector.js,@whitebox-world/native-babylon,@whitebox-world/native-babylon-block-profile",
      ],
    }));
    expect(() => assertNativeBlockProductionSourceImportsV1([
      "@whitebox-world/native-babylon",
    ])).toThrowError(expect.objectContaining({
      diagnostics: [
        "production-native-import-set-invalid:@whitebox-world/native-babylon",
      ],
    }));
  });

  it("restores original owner receipts when generation completed before the Host checkpoint commit", async () => {
    const fixture = await completedAttempt({ omitAdvisory: true });
    // The reconstruction runner normally creates the advisory directory. No rendering is
    // needed to exercise the generation receipt/checkpoint crash boundary.
    await mkdir(path.join(fixture.attemptDirectoryPath, "advisory"));
    const forbidden = vi.fn(async () => { throw new Error("UNEXPECTED_OWNER_REEXECUTION"); });
    const owners: ProductionWorldReconstructionRunPortOwnersV1 = {
      prepareGeneration: forbidden, runGeneration: forbidden, runSelfCheck: forbidden,
      packageAttempt: forbidden, materializeCaptureRequest: forbidden,
      capturePackage: forbidden, evaluateAttempt: forbidden, reconcileGeneration: forbidden,
      createProcessPort: vi.fn(() => { throw new Error("UNEXPECTED_PROCESS"); }),
      resolveFrozenOwnerIdentities: vi.fn(() => { throw new Error("UNEXPECTED_OWNER_RESOLUTION"); }),
    };
    const formalCaptureIntent = parseFormalWorldCaptureIntentV1(JSON.parse(await readFile(path.join(
      path.dirname(fixture.casePath), "inputs/formal-world-capture-intent.json"), "utf8")));
    const input = { executionPurpose: "production" as const, hostRecoveryIndex: 1,
      repositoryRoot: REPOSITORY_ROOT, casePath: fixture.casePath,
      caseRef: `artifact://world-reconstruction-case/${fixture.reconstructionCase.id}/case.json`,
      evaluationProfilePath: path.join(path.dirname(fixture.casePath), "evaluation-profile.json"),
      reconstructionCase: fixture.reconstructionCase, evaluationProfile: fixture.profile,
      generationInput: fixture.generationInput, formalCaptureIntent };
    const stageInput = { attemptIndex: 0 as const, backend: "local" as const, runId: "test",
      requestId: fixture.prepared.routerRequestId, frozenOwnerIdentities: fixture.prepared.frozenOwnerIdentities };
    const receiptBefore = await readFile(path.join(fixture.attemptDirectoryPath, "generation-receipt.json"));
    const ports = await createProductionWorldReconstructionRunPortsV1(input, owners);
    // A lost Host checkpoint does not allow stale owner bytes to become a new baseline.
    for (const relativePath of ["source/scene.ts", "context/case.json"]) {
      const target = path.join(fixture.attemptDirectoryPath, relativePath);
      const original = await readFile(target);
      await writeFile(target, "changed-after-generation");
      await expect(ports.restoreGenerated!(stageInput)).rejects.toThrow("HOST_CHECKPOINT_INVALID");
      await writeFile(target, original);
    }
    await expect(ports.restoreGenerated!({ ...stageInput, requestId: "foreign-request" }))
      .rejects.toThrow("HOST_CHECKPOINT_INVALID");
    await expect(ports.restoreGenerated!({ ...stageInput, frozenOwnerIdentities: {
      ...stageInput.frozenOwnerIdentities, caseHash: `sha256:${"f".repeat(64)}`,
    } })).rejects.toThrow("HOST_CHECKPOINT_INVALID");
    const generated = await ports.restoreGenerated!(stageInput);
    expect(generated).toMatchObject({ outcome: "completed", requestId: fixture.prepared.routerRequestId,
      requestHash: fixture.prepared.routerTaskPayloadHash });
    const restarted = await createProductionWorldReconstructionRunPortsV1({ ...input, hostRecoveryIndex: 2 }, owners);
    expect(await restarted.restoreGenerated!(stageInput)).toEqual(generated);
    expect(forbidden).not.toHaveBeenCalled();
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "generation-receipt.json"))).toEqual(receiptBefore);
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "host-checkpoints/generate.json"), "utf8"))
      .toContain(fixture.prepared.routerRequestId);
  }, 30_000);

  it("packages the original generated Attempt into a recovery epoch without overwriting the failed check", async () => {
    const fixture = await completedAttempt();
    const originalReceipt = await readFile(path.join(fixture.attemptDirectoryPath, "generation-receipt.json"));
    const originalSource = await readFile(path.join(fixture.attemptDirectoryPath, "source/scene.ts"));
    await writeFile(path.join(fixture.attemptDirectoryPath, "native-check-result.json"), "historical-failure");
    const outputDirectoryPath = path.join(fixture.attemptDirectoryPath, "host-recoveries/1/world-package");
    const result = await packageNativeBlockAttemptV1({ repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath, casePath: fixture.casePath, outputDirectoryPath });
    expect(result.outcome).toBe("completed");
    expect(result.groundAnalysisReportPath).toBe(path.join(path.dirname(outputDirectoryPath), "ground-analysis-report.json"));
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "native-check-result.json"), "utf8")).toBe("historical-failure");
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "generation-receipt.json"))).toEqual(originalReceipt);
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "source/scene.ts"))).toEqual(originalSource);
  }, 60_000);

  it("derives real Package bounds from all checked Blocks and keeps frozen policy bytes through Ground", async () => {
    const sceneSource = SCENE_SOURCE.replace('    session.finalize({',
      '    session.createBlock({ id: "off-camera-background", shape: "full", paletteRole: "background-mass", centerMetersXYZ: [200, -0.5, 10] });\n    session.finalize({');
    const fixture = await completedAttempt({ sceneSource, worldBoundsPolicy: { mode: "checked-block-layout" } });
    const policyPath = path.join(fixture.attemptDirectoryPath, "inputs/world-bounds-policy.json");
    const originalPolicy = await readFile(policyPath);
    const originalRequest = await readFile(path.join(fixture.attemptDirectoryPath, "generation-request.json"));
    const packaged = await packageNativeBlockAttemptV1({ repositoryRoot: REPOSITORY_ROOT,
      casePath: fixture.casePath, attemptDirectoryPath: fixture.attemptDirectoryPath,
      outputDirectoryPath: fixture.outputDirectoryPath });
    expect(packaged.groundAnalysisReport.admissionOutcome).toBe("passed");
    const bounds = packaged.verifiedWorldPackage.manifest.worldBounds;
    expect(bounds.centerMetersXZ[0] + bounds.sizeMetersXZ[0] / 2).toBe(205);
    expect(bounds.sizeMetersXZ[0]).toBeGreaterThan(200);
    for (const collider of packaged.verifiedWorldPackage.nativeSceneContribution.staticColliders) {
      const xCoordinates = collider.worldPositionsMetersXYZ.filter((_, index) => index % 3 === 0);
      expect(Math.max(...xCoordinates)).toBeLessThan(100);
    }
    expect(await readFile(policyPath)).toEqual(originalPolicy);
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "generation-request.json"))).toEqual(originalRequest);
  }, 60_000);

  it("admits source-authored curved exploration and rejects unsupported or disconnected remote anchors", async () => {
    const groundExploration: NativeBlockGroundExplorationV1 = {
      mode: "source-authored",
      requiredTargets: [
        { id: "middle-court", region: "middle", standPositionMetersXYZ: [6, 0, 7] },
        { id: "remote-garden", region: "remote", standPositionMetersXYZ: [6, 0, 2] },
      ],
      requiredTraversalBands: [{ id: "entry-court", halfWidthMeters: 1,
        centerlineStandPositionsMetersXYZ: [[0, 0, 18], [0, 0, 11], [6, 0, 11], [6, 0, 7]] },
      { id: "middle-garden", halfWidthMeters: 1,
        centerlineStandPositionsMetersXYZ: [[6, 0, 7], [6, 0, 2]] }],
    };
    const curvedSource = SCENE_SOURCE
      .replace("maximumBlockCount: 64", "maximumBlockCount: 128")
      .replace('minimumCenterMetersXYZ: [-1, -0.5, 4], repeatCountXYZ: [3, 1, 7]',
        'minimumCenterMetersXYZ: [5, -0.5, 4], repeatCountXYZ: [3, 1, 6]')
      .replace('minimumCenterMetersXYZ: [-1, -0.5, 1], repeatCountXYZ: [3, 1, 3]',
        'minimumCenterMetersXYZ: [5, -0.5, 1], repeatCountXYZ: [3, 1, 3]')
      .replace('    session.finalize({',
        '    session.createBlockGrid({idPrefix: "bend", shape: "full", paletteRole: "route", visualGroupId: "central-ascent-group", colliderGroupId: "central-ground-group", minimumCenterMetersXYZ: [2, -0.5, 10], repeatCountXYZ: [6, 1, 3] });\n    session.finalize({');
    const fixture = await completedAttempt({ sceneSource: curvedSource, groundExploration, maximumBlockCount: 128 });
    const originalCase = await readFile(fixture.casePath);
    const originalRequest = await readFile(path.join(fixture.attemptDirectoryPath, "generation-request.json"));
    const packaged = await packageNativeBlockAttemptV1({ repositoryRoot: REPOSITORY_ROOT,
      casePath: fixture.casePath, attemptDirectoryPath: fixture.attemptDirectoryPath,
      outputDirectoryPath: path.join(fixture.attemptDirectoryPath, "world-package") });
    expect(packaged.groundAnalysisReport).toMatchObject({ admissionOutcome: "passed",
      metrics: { requiredTargetCount: 2, reachableRequiredTargetCount: 2,
        requiredTraversalBandCount: 2, reachableRequiredTraversalBandCount: 2 } });
    expect(await readFile(fixture.casePath)).toEqual(originalCase);
    expect(await readFile(path.join(fixture.attemptDirectoryPath, "generation-request.json"))).toEqual(originalRequest);
    const failedFixture = await completedAttempt({ sceneSource: curvedSource, maximumBlockCount: 128,
      groundExploration: { ...groundExploration, requiredTargets: [groundExploration.requiredTargets[0]!,
        { id: "remote-garden", region: "remote", standPositionMetersXYZ: [30, 0, 2] }] } });
    await expect(packageNativeBlockAttemptV1({ repositoryRoot: REPOSITORY_ROOT,
      casePath: failedFixture.casePath, attemptDirectoryPath: failedFixture.attemptDirectoryPath,
      outputDirectoryPath: path.join(failedFixture.attemptDirectoryPath, "world-package") })).rejects.toThrow();
    const failure = JSON.parse(await readFile(path.join(failedFixture.attemptDirectoryPath, "ground-analysis-report.json"), "utf8"));
    expect(failure.admissionOutcome).toBe("failed");
    expect(failure.identity.worldPackageRootHash).not.toBe(packaged.worldPackageRootHash);
    expect(failure.failureFacts).toContainEqual(expect.objectContaining({ targetId: "remote-garden" }));
    const islandFixture = await completedAttempt({ maximumBlockCount: 128,
      sceneSource: curvedSource.replace('    session.finalize({',
        '    session.createBlockGrid({idPrefix: "remote-island", shape: "full", paletteRole: "ground", visualGroupId: "upper-t-junction-group", colliderGroupId: "upper-ground-group", minimumCenterMetersXYZ: [29, -0.5, 1], repeatCountXYZ: [3, 1, 3] });\n    session.finalize({'),
      groundExploration: { ...groundExploration, requiredTargets: [groundExploration.requiredTargets[0]!,
        { id: "remote-garden", region: "remote", standPositionMetersXYZ: [30, 0, 2] }] } });
    await expect(packageNativeBlockAttemptV1({ repositoryRoot: REPOSITORY_ROOT,
      casePath: islandFixture.casePath, attemptDirectoryPath: islandFixture.attemptDirectoryPath,
      outputDirectoryPath: path.join(islandFixture.attemptDirectoryPath, "world-package") })).rejects.toThrow();
    const disconnected = JSON.parse(await readFile(path.join(islandFixture.attemptDirectoryPath, "ground-analysis-report.json"), "utf8"));
    expect(disconnected.failureFacts).toContainEqual(expect.objectContaining({
      targetId: "remote-garden", metricId: "ground-target-reachability",
    }));
  }, 120_000);

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
    expect(packaged.groundAnalysisReport.standableNodes).toEqual(
      expect.arrayContaining([expect.objectContaining({
        positionMetersXYZ: [0, 0, 18],
        isReachableFromSpawn: true,
      })]),
    );
    expect(packaged.groundAnalysisReportHash).toBe(
      sha256CanonicalJson(packaged.groundAnalysisReport),
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
    expect((await readdir(fixture.attemptDirectoryPath)).filter((name) =>
      name.startsWith(".native-block-visual-replay-")
    )).toEqual([]);
  }, 60_000);

  it("rejects a Builder-selected target color before Native Check", async () => {
    const fixture = await completedAttempt({
      target3IdentityColorHex: "#123456",
      omitAdvisory: true,
    });

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toMatchObject({
      diagnostics: [
        "WORLDKIT_NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_INVALID",
      ],
      visualIdentityAdmissionRejection: {
        outcome: "rejected",
        diagnostics: [expect.objectContaining({
          reason: "identity-color-mismatch",
          visualTargetId: "visual-target-3",
          expectedIdentityColorHex: "#D9A514",
          actualIdentityColorHex: "#123456",
        })],
      },
    });
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "native-check-result.json",
    ))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("completes Package publication when route palette Blocks form multiple advisory components", async () => {
    const fixture = await completedAttempt({
      sceneSource: MULTIPLE_ROUTE_COMPONENTS_SCENE_SOURCE,
    });

    const packaged = await packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    });

    expect(packaged.outcome).toBe("completed");
    expect(packaged.checkResult.outcome).toBe("passed");
    expect(packaged.groundAnalysisReport.admissionOutcome).toBe("passed");
    const routeBlocks = packaged.verifiedWorldPackage
      .nativeBlockMaterializerMetadata?.blocks.filter(
        ({ paletteRole }) => paletteRole === "route",
      );
    expect(routeBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        blockId: "isolated-route",
        centerMetersXYZ: [20, -0.5, 20],
      }),
      expect.objectContaining({
        blockId: "central-x0-y0-z0",
      }),
    ]));
    expect(await readFile(path.join(
      fixture.attemptDirectoryPath,
      "native-explain.txt",
    ), "utf8")).toBe("outcome: passed\n");
  }, 60_000);

  it("fails closed after Native Check when one Builder advisory output is missing", async () => {
    const fixture = await completedAttempt();
    await rm(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    ));

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-output-missing",
    );
  }, 60_000);

  it("fails closed on a valid fixed-dimension PNG whose decoded RGBA differs from Host replay", async () => {
    const fixture = await completedAttempt();
    const topPath = path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    );
    const decoded = await sharp(await readFile(topPath))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    decoded.data[0] = decoded.data[0] === 255 ? 254 : decoded.data[0]! + 1;
    await writeFile(topPath, await sharp(decoded.data, {
      raw: decoded.info,
    }).png().toBuffer());

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-rgba-mismatch",
    );
  }, 60_000);

  it("rejects advisory pixels whose mock layout differs from the checked Native Profile layout", async () => {
    const fixture = await completedAttempt({
      sceneSource: MOCK_CONTEXT_LAYOUT_BRANCH_SCENE_SOURCE,
    });

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-layout-mismatch",
    );
  }, 60_000);

  it("joins captured displayGap through the checked Profile inventory identity", async () => {
    const fixture = await completedAttempt({
      sceneSource: MOCK_CONTEXT_GAP_BRANCH_SCENE_SOURCE,
    });

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-layout-mismatch",
    );
  }, 60_000);

  it("joins captured Spawn exactly to the checked Native contribution", async () => {
    const fixture = await completedAttempt({
      sceneSource: MOCK_CONTEXT_SPAWN_BRANCH_SCENE_SOURCE,
    });

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-layout-mismatch",
    );
  }, 60_000);

  it("fails closed before reading advisory output bytes outside the closed budget", async () => {
    const fixture = await completedAttempt();
    await writeFile(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    ), Buffer.alloc(4_000_001));

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-output-budget-exceeded",
    );
  }, 60_000);

  it("rejects a compressed PNG whose decoded pixels exceed the fixed review surface", async () => {
    const fixture = await completedAttempt();
    const compressedBomb = await sharp({
      create: {
        width: 2_048,
        height: 2_048,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    }).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    ), compressedBomb);

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-png-invalid",
    );
  }, 60_000);

  it("rejects a valid PNG with the wrong fixed review dimensions", async () => {
    const fixture = await completedAttempt();
    const entryBytes = await readFile(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-entry-comparison.png",
    ));
    await writeFile(path.join(
      fixture.attemptDirectoryPath,
      "advisory/builder-top-down-comparison.png",
    ), entryBytes);

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-png-invalid",
    );
  }, 60_000);

  it("fails closed when the durable Builder renderer no longer closes its frozen hash", async () => {
    const fixture = await completedAttempt();
    const rendererPath = path.join(
      fixture.attemptDirectoryPath,
      "inputs/builder-skill/scripts/render-visual-review.mjs",
    );
    await writeFile(
      rendererPath,
      Buffer.concat([await readFile(rendererPath), Buffer.from("\n")]),
    );

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-renderer-stale",
    );
  }, 60_000);

  it("fails closed when the Host-owned Subject visual proxy bytes drift", async () => {
    const fixture = await completedAttempt();
    const proxyPath = path.join(
      fixture.attemptDirectoryPath,
      "inputs/subject-visual-review-proxy.json",
    );
    await writeFile(
      proxyPath,
      Buffer.concat([await readFile(proxyPath), Buffer.from("\n")]),
    );

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-subject-visual-review-proxy-stale",
    );
  }, 60_000);

  it("fails closed when a durable planning image no longer closes Case and Request identity", async () => {
    const fixture = await completedAttempt();
    await writeFile(path.join(
      fixture.attemptDirectoryPath,
      "inputs/world-plan.png",
    ), "tampered");

    await expectVisualReviewRejectedBeforeGround(
      fixture,
      "native-block-visual-review-input-stale",
    );
  }, 60_000);

  it("rejects an extra authored visual group at the visual identity boundary", async () => {
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
      diagnostics: ["WORLDKIT_NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_INVALID"],
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

  it("reuses Runtime surface admission before Package publication when final topology obstructs the Spawn Capsule", async () => {
    const fixture = await completedAttempt({
      sceneSource: SPAWN_ADJACENT_STEP_SCENE_SOURCE,
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
        groundAnalysisReport: {
          admissionOutcome: "failed",
          failureFacts: expect.arrayContaining([
            expect.objectContaining({
              metricId: "ground-spawn-standability",
              targetId: "spawn-foreground-platform",
              details: {
                kind: "state-mismatch",
                expectedValue: "runtime-surface-admitted",
                actualValue:
                  "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_CAPSULE_OBSTRUCTED",
                correctionDirection: "replace",
              },
            }),
          ]),
        },
        repairDiagnostics: expect.arrayContaining([
          expect.objectContaining({
            metricId: "ground-spawn-standability",
            message: expect.stringContaining("Related frozen Collider IDs:"),
            repairAction: expect.objectContaining({
              instruction: expect.stringContaining(
                "Keep the frozen Subject Capsule and Runtime admission threshold unchanged.",
              ),
            }),
          }),
        ]),
      },
    });
    await expect(lstat(fixture.outputDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("rejects post-creation Block placement without inventing a Builder repair", async () => {
    const fixture = await completedAttempt({
      sceneSource: REPLACED_PLACEMENT_DIALECT_SCENE_SOURCE,
      omitAdvisory: true,
    });

    await expect(packageNativeBlockAttemptV1({
      repositoryRoot: REPOSITORY_ROOT,
      attemptDirectoryPath: fixture.attemptDirectoryPath,
      casePath: fixture.casePath,
      outputDirectoryPath: fixture.outputDirectoryPath,
    })).rejects.toMatchObject({
      diagnostics: ["native-check-rejected"],
      nativeCheckRejection: {
        kind: "native-check-rejected",
        repairDiagnostics: [],
      },
    });
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
