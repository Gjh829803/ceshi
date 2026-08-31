import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sha256CanonicalJson, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { decideSceneAuthoringRouteV1 } from "@whitebox-world/scene-authoring-contracts";
import { parseWorldReconstructionCaseV1, parseWorldReconstructionEvaluationProfileV1 } from "@whitebox-world/validation";
import { parseWorldPackageWorldBoundsV1 } from "@whitebox-world/world-package";
import { afterEach, describe, expect, it } from "vitest";

import { prepareNativeBlockGenerationTaskV1 } from "./generation-request.js";
import { runNativeBlockGenerationV1 } from "./generation-runner.js";
import {
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
    const session = createBabylonNativeBlockProfileSessionV1(context, { maximumBlockCount: 16 });
    const central = session.createBlock({ id: "central", shape: "full", paletteRole: "route", visualGroupId: "central-ascent-group" });
    central.position.set(0, -0.5, 10);
    const foreground = session.createBlock({ id: "foreground", shape: "full", paletteRole: "ground", visualGroupId: "foreground-platform-group" });
    foreground.position.set(0, -0.5, 18);
    const gate = session.createBlock({ id: "gate", shape: "full", paletteRole: "structure", visualGroupId: "gate-mass-group" });
    gate.position.set(4, -0.5, 2);
    const mountain = session.createBlock({ id: "mountain", shape: "full", paletteRole: "background-mass", visualGroupId: "mountain-cliff-layers-group" });
    mountain.position.set(-4, -0.5, 2);
    const upper = session.createBlock({ id: "upper", shape: "full", paletteRole: "structure", visualGroupId: "upper-t-junction-group" });
    upper.position.set(0, -0.5, 2);
    session.finalize({ staticColliders: [
      { id: "collider-central-steps", blockId: "central", traversalBinding: { kind: "static-surface", surfaceEntityId: "central-surface", logicalSubshapeId: "central-top", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" } },
      { id: "collider-cliff-blockers", blockId: "mountain", traversalBinding: { kind: "not-traversable" } },
      { id: "collider-foreground-ground", blockId: "foreground", traversalBinding: { kind: "static-surface", surfaceEntityId: "foreground-surface", logicalSubshapeId: "foreground-top", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" } },
      { id: "collider-gate-walls", blockId: "gate", traversalBinding: { kind: "not-traversable" } },
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

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

async function completedAttempt() {
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
    worldBounds: parseWorldPackageWorldBoundsV1(boundsValue),
    bootstrapId: `${reconstructionCase.id}-native`,
    sceneModuleRef: `worldkit://native-scene/${reconstructionCase.id}@1`,
    seed: 19,
    budgets: {
      maximumBlockCount: 16,
      maximumStaticColliderCount: 8,
      maximumStaticColliderVertexCount: 1024,
      maximumStaticColliderTriangleCount: 1024,
      maximumOutputBytes: 100_000,
      timeoutSeconds: 30,
    },
  });
  await Promise.all([
    writeFile(path.join(prepared.stagingDirectoryPath, "scene.ts"), SCENE_SOURCE),
    writeFile(path.join(prepared.stagingDirectoryPath, "native-block-authoring.json"), stringifyCanonicalJson(AUTHORING)),
    writeFile(path.join(prepared.stagingDirectoryPath, "native-resources.json"), stringifyCanonicalJson({ kind: "native-visual-resource-list", schemaVersion: 1, resourceRefs: [] })),
  ]);
  const generated = await runNativeBlockGenerationV1(prepared, {
    process: {
      async run() {
        return {
          exitCode: 0,
          stdout: `WORLDKIT_LOCAL_CODEX_JOB native-block-generation ${prepared.routerRequestId} pid=123 profile=formal model=gpt-5.6-sol reasoning=xhigh\n`,
          stderr: "",
        };
      },
    },
    selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
    reconcile: async () => ({ outcome: "missing" }),
    cleanup: async () => ({ outcome: "completed" }),
  });
  expect(generated.receipt.outcome).toBe("completed");
  const attemptDirectoryPath = path.dirname(generated.sourceDirectoryPath!);
  await writeFile(
    path.join(attemptDirectoryPath, "generation-receipt.json"),
    `${stringifyCanonicalJson(generated.receipt)}\n`,
  );
  return {
    root,
    casePath,
    attemptDirectoryPath,
    outputDirectoryPath: path.join(root, "packages", "world"),
  };
}

describe("packageNativeBlockAttemptV1", () => {
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
      throw new Error(`${String(error)}\n${check}`);
    });

    expect(packaged.checkResult.outcome).toBe("passed");
    expect(packaged.verifiedWorldPackage.kind).toBe("babylon-native-scene");
    expect(packaged.sceneAuthoringAttemptResult.authoredSourceHash).toBe(
      packaged.verifiedWorldPackage.sceneModuleBundleManifest.sourceGraphHash,
    );
    expect(packaged.authoringLayoutBinding.visualGroups).toHaveLength(5);
    expect(packaged.worldPackageRef).toBe(
      packaged.verifiedWorldPackage.receipt.worldPackageRef,
    );
    await expect(lstat(path.join(
      fixture.attemptDirectoryPath,
      "native-block-authoring-layout-binding.json",
    ))).resolves.toBeDefined();
  }, 60_000);

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
});
