import { sha256Bytes, stringifyCanonicalJson } from "@whitebox-world/protocol";
import { omit } from "lodash-es";
import {
  formalWorldCaptureRequestCanonicalBytesV1,
  hashBabylonNativeSceneContributionV1,
  hashFormalWorldCaptureIntentV1,
  hashFormalWorldCaptureRequestV1,
  parseFormalWorldCaptureIntentV1,
  parseFormalWorldCaptureRequestV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringAttemptV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import {
  createBabylonNativeBlockWorldPackageTestInputV1,
  createBabylonNativeWorldPackageTestInputV1,
} from "@whitebox-world/world-package/testing";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { writeVisualIdentityPalette } from "../visual/write-visual-identity-palette.js";
import type { VisualIdentityPaletteV1 } from "../scenes/visual-identity-palette.js";
import { deriveNativeVisualCaptureGroupsV1 } from "./native-visual-capture-groups.js";
import { deriveNativeFormalWorldCaptureBoundsV1 } from "./formal-capture-bounds.js";
import {
  assertFormalCaptureRequestMatchesVerifiedPackageV1,
} from "./formal-capture.js";
import {
  FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
  materializeFormalWorldCaptureRequestV1,
  type MaterializeFormalWorldCaptureRequestInputV1,
} from "./formal-capture-request.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

const OPENING_TARGET = "worldkit://acceptance-target/package-fixture-opening@1";
const SECONDARY_TARGET =
  "worldkit://acceptance-target/package-fixture-secondary@1";
const OPENING_COMPOSITION =
  "worldkit://composition-target/package-fixture-opening@1";
const SECONDARY_COMPOSITION =
  "worldkit://composition-target/package-fixture-secondary@1";

function profileValue(
  OPENING_TARGET = "worldkit://acceptance-target/package-fixture-opening@1",
  SECONDARY_TARGET = "worldkit://acceptance-target/package-fixture-secondary@1",
) {
  const dimensionIds = [
    "collider",
    "critical-traversal",
    "deterministic-build",
    "opening-composition",
    "semantic-silhouette",
    "spawn-support",
    "topology",
  ] as const;
  return parseWorldReconstructionEvaluationProfileV1({
    kind: "world-reconstruction-evaluation-profile",
    schemaVersion: 1,
    id: "package-fixture-profile",
    dimensionIds,
    qualityGateMode: "required-for-publication",
    maximumRepairAttemptCount: 3,
    builderSelfRepairAttemptCount: 3,
    thresholds: {
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: OPENING_TARGET,
        maximumBoundsDriftBasisPoints: 100,
        maximumCenterDriftBasisPoints: 100,
        maximumCoverageDriftBasisPoints: 100,
      }, {
        acceptanceTargetRef: SECONDARY_TARGET,
        maximumBoundsDriftBasisPoints: 100,
        maximumCenterDriftBasisPoints: 100,
        maximumCoverageDriftBasisPoints: 100,
      }],
      openingComposition: {
        regions: [{
          targetRef: OPENING_COMPOSITION,
          maximumDriftBasisPoints: 100,
        }, {
          targetRef: SECONDARY_COMPOSITION,
          maximumDriftBasisPoints: 100,
        }],
        anchors: [{
          targetRef: OPENING_COMPOSITION,
          maximumDriftBasisPoints: 100,
        }, {
          targetRef: SECONDARY_COMPOSITION,
          maximumDriftBasisPoints: 100,
        }],
      },
      spawnSupport: {
        maximumPositionDriftMillimeters: 100,
        maximumSupportGapMillimeters: 10,
      },
    },
    requiredEvidenceByDimension: dimensionIds.map((dimensionId) => ({
      dimensionId,
      evidenceProfileRefs: [`worldkit://evidence-profile/${dimensionId}@1`],
    })),
  });
}

async function fixture(withoutScriptedTraversal = false, completeTargets = false, facingRadians = 0): Promise<Readonly<{
  caseRoot: string;
  input: MaterializeFormalWorldCaptureRequestInputV1;
  verifiedPackage: Extract<
    ReturnType<typeof verifyWorldPackageDirectoryV1>,
    { kind: "babylon-native-scene" }
  >;
}>> {
  const caseRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "formal-capture-request-")),
  );
  temporaryRoots.push(caseRoot);
  const attemptDirectoryPath = path.join(caseRoot, "attempts", "0");
  const packageDirectoryPath = path.join(attemptDirectoryPath, "world-package");
  const outputPath = path.join(
    attemptDirectoryPath,
    FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
  );
  const OPENING_TARGET = completeTargets ? "worldkit://acceptance-target/visual-target-2@1" : "worldkit://acceptance-target/package-fixture-opening@1";
  const SECONDARY_TARGET = completeTargets ? "worldkit://acceptance-target/visual-target-3@1" : "worldkit://acceptance-target/package-fixture-secondary@1";
  const profile = profileValue(OPENING_TARGET, SECONDARY_TARGET);
  const requiredEvidenceProfileRefs = profile.requiredEvidenceByDimension
    .flatMap((entry) => entry.evidenceProfileRefs)
    .slice()
    .sort();
  const baseInput = createBabylonNativeBlockWorldPackageTestInputV1();
  const baseMetadata = baseInput.nativeBlockMaterializerMetadata!;
  let plannerInputs: { briefBytes: Buffer; paletteBytes: Buffer; palette: VisualIdentityPaletteV1 } | undefined;
  if (completeTargets) {
    const inputRoot = path.join(caseRoot, "inputs");
    await mkdir(inputRoot, { recursive: true });
    const briefBytes = await readFile(path.resolve("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/scene-brief.md"));
    const briefPath = path.join(inputRoot, "scene-brief.md");
    const palettePath = path.join(inputRoot, "visual-identity-palette.json");
    await writeFile(briefPath, briefBytes);
    await writeVisualIdentityPalette({ sceneId: "package-fixture.case", sceneSourceKind: "babylon-native",
      briefPath, outputPath: palettePath });
    const paletteBytes = await readFile(palettePath);
    plannerInputs = { briefBytes, paletteBytes, palette: JSON.parse(paletteBytes.toString()) as VisualIdentityPaletteV1 };
  }
  const formalCaptureIntent = parseFormalWorldCaptureIntentV1({
    kind: "formal-world-capture-intent",
    schemaVersion: 1,
    id: "package-fixture.case.formal-world-capture-intent",
    captureProfile: {
      widthPixels: 320,
      heightPixels: 180,
      devicePixelRatio: 1,
    },
    semanticCaptureTargetBindings: [{
      acceptanceTargetRef: OPENING_TARGET,
      compositionTargetRef: OPENING_COMPOSITION,
      topologyNodeId: "package-fixture-opening",
      semanticLayerId: "ground",
      blockVisualGroupId: "ground-group",
    }, {
      acceptanceTargetRef: SECONDARY_TARGET,
      compositionTargetRef: SECONDARY_COMPOSITION,
      topologyNodeId: "package-fixture-secondary",
      semanticLayerId: "upper",
      blockVisualGroupId: "ridge-group",
    }],
    topologyRelations: withoutScriptedTraversal ? [] : [{
      fromNodeId: "package-fixture-opening",
      relation: "connects-to",
      toNodeId: "package-fixture-secondary",
      measurementSource: "package-bounds",
      fromVisualGroupId: "ground-group",
      toVisualGroupId: "ridge-group",
    }],
    checkpointSpatialCriteria: withoutScriptedTraversal ? [] : [{
      kind: "reach-position",
      standPositionMetersXYZ: [0, 0, 0],
      checkpointId: "ground-checkpoint",
      expectation: "reach",
      sourceVisualGroupId: "ground-group",
      capsuleRadiusMeters: 0.35,
      toleranceMeters: 0.05,
    }],
  });
  const nativeSceneContribution = {
    ...baseInput.nativeSceneContribution,
    spawnMarker: { ...baseInput.nativeSceneContribution.spawnMarker, facingRadians },
    profileSettlement: {
      ...baseInput.nativeSceneContribution.profileSettlement,
      targetCount: 3,
    },
  } as typeof baseInput.nativeSceneContribution;
  const reconstructionCase = parseWorldReconstructionCaseV1({
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: "package-fixture.case",
    sceneBriefRef: completeTargets ? "scene-brief.md" : baseInput.sceneAuthoringAttempt.sceneBriefRef,
    sceneBriefHash: plannerInputs ? sha256Bytes(plannerInputs.briefBytes) : baseInput.sceneAuthoringAttempt.sceneBriefHash,
    referenceInputs: [{
      inputRef: "artifact://case/package-fixture/reference.png",
      contentHash: `sha256:${"e".repeat(64)}`,
      mediaType: "image/png",
    }, ...(plannerInputs ? [{ inputRef: "visual-identity-palette.json",
      contentHash: sha256Bytes(plannerInputs.paletteBytes), mediaType: "application/json" }] : [])],
    evaluationProfileRef: "evaluation-profile.json",
    evaluationProfileHash: hashWorldReconstructionEvaluationProfileV1(profile),
    formalCaptureIntentRef: "inputs/formal-world-capture-intent.json",
    formalCaptureIntentHash: hashFormalWorldCaptureIntentV1(formalCaptureIntent),
    acceptanceTargetRefs: [OPENING_TARGET, SECONDARY_TARGET],
    requiredEvidenceProfileRefs,
    expected: {
      topology: {
        acceptanceTargetRef: OPENING_TARGET,
        nodeIds: ["package-fixture-opening", "package-fixture-secondary"],
        relations: withoutScriptedTraversal ? [] : [{
          fromNodeId: "package-fixture-opening",
          relation: "connects-to",
          toNodeId: "package-fixture-secondary",
        }],
        layerIds: ["ground", "upper"],
      },
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: OPENING_TARGET,
        visualGroupId: "ground-group",
        viewRequirements: [{ viewId: "opening", mode: "reference-projection-required",
        normalizedBounds: {
          minXBasisPoints: 100,
          minYBasisPoints: 200,
          maxXBasisPoints: 900,
          maxYBasisPoints: 800,
        },
        normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 },
        coverageBasisPoints: 4_800,
        }, { viewId: "world-side", mode: "presence-required" },
        { viewId: "world-top-down", mode: "presence-required" }],
      }, {
        acceptanceTargetRef: SECONDARY_TARGET,
        visualGroupId: "ridge-group",
        viewRequirements: [{ viewId: "opening", mode: "reference-projection-required",
        normalizedBounds: {
          minXBasisPoints: 400,
          minYBasisPoints: 100,
          maxXBasisPoints: 600,
          maxYBasisPoints: 300,
        },
        normalizedCenter: { xBasisPoints: 500, yBasisPoints: 200 },
        coverageBasisPoints: 400,
        }, { viewId: "world-side", mode: "presence-required" },
        { viewId: "world-top-down", mode: "presence-required" }],
      }],
      openingComposition: {
        acceptanceTargetRef: OPENING_TARGET,
        targetRefs: [OPENING_COMPOSITION, SECONDARY_COMPOSITION],
        regions: [{
          targetRef: OPENING_COMPOSITION,
          normalizedBounds: {
            minXBasisPoints: 100,
            minYBasisPoints: 200,
            maxXBasisPoints: 900,
            maxYBasisPoints: 800,
          },
        }, {
          targetRef: SECONDARY_COMPOSITION,
          normalizedBounds: {
            minXBasisPoints: 400,
            minYBasisPoints: 100,
            maxXBasisPoints: 600,
            maxYBasisPoints: 300,
          },
        }],
        anchors: [{
          targetRef: OPENING_COMPOSITION,
          normalizedCenter: { xBasisPoints: 500, yBasisPoints: 500 },
        }, {
          targetRef: SECONDARY_COMPOSITION,
          normalizedCenter: { xBasisPoints: 500, yBasisPoints: 200 },
        }],
        orderedTargetRefs: [OPENING_COMPOSITION, SECONDARY_COMPOSITION],
      },
      spawnSupport: {
        acceptanceTargetRef: OPENING_TARGET,
        spawnMarkerId: "player-spawn",
        supportColliderId: "ground",
        expectedMedium: "ground",
        expectedPositionXYZMeters: { xMeters: 0, yMeters: 0, zMeters: 0 },
      },
      colliders: [{
        acceptanceTargetRef: OPENING_TARGET,
        contributionId: "ground",
        colliderId: "ground",
        role: "ground",
        requiresOverlay: true,
      }],
      groundConnectivity: { mode: withoutScriptedTraversal ? "source-authored" : "case-defined",
        requireSingleReachableComponent: true,
        requiredTraversalBands: withoutScriptedTraversal ? [] : [{
          acceptanceTargetRef: OPENING_TARGET,
          id: "ground-band",
          centerlineStandPositionsXYZMeters: [
            { xMeters: 0, yMeters: 0, zMeters: 0 },
            { xMeters: 0, yMeters: 0, zMeters: -1 },
          ],
          halfWidthMeters: 1,
        }],
      },
      criticalTraversalChecks: withoutScriptedTraversal ? [] : [{
        acceptanceTargetRef: OPENING_TARGET,
        id: "ground-check",
        evidenceKind: "scripted-fixed-input",
        expectation: "pass",
        checkpointIds: ["ground-checkpoint"],
        fixedInputSequence: [{ actions: ["move-forward"], ticks: 1 }],
      }],
      deterministicBuild: {
        acceptanceTargetRef: OPENING_TARGET,
        requiresCandidateReplay: true,
        requiresWorldPackageIdentityAgreement: true,
        requiresBuildIdentityAgreement: true,
        requiresCaptureIdentityAgreement: true,
      },
    },
  });
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  const sceneAuthoringRouteDecision = { ...baseInput.sceneAuthoringRouteDecision,
    sceneBriefRef: reconstructionCase.sceneBriefRef, sceneBriefHash: reconstructionCase.sceneBriefHash };
  const sceneAuthoringAttempt = parseSceneAuthoringAttemptV1({
    ...baseInput.sceneAuthoringAttempt,
    sceneBriefRef: reconstructionCase.sceneBriefRef,
    sceneBriefHash: reconstructionCase.sceneBriefHash,
    sceneAuthoringRouteDecisionHash: hashSceneAuthoringRouteDecisionV1(sceneAuthoringRouteDecision),
    acceptanceTargetRefs: reconstructionCase.acceptanceTargetRefs,
    requiredEvidenceProfileRefs: reconstructionCase.requiredEvidenceProfileRefs,
  });
  const sceneAuthoringAttemptResult = {
    ...baseInput.sceneAuthoringAttemptResult,
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(sceneAuthoringAttempt),
  };
  const nativeBlockMaterializerMetadata = {
    ...baseMetadata,
    groundExploration: withoutScriptedTraversal ? {
      mode: "source-authored" as const,
      requiredTargets: [
        { id: "middle", region: "middle" as const, standPositionMetersXYZ: [0, 0, -1] as const },
        { id: "remote", region: "remote" as const, standPositionMetersXYZ: [0, 0, -2] as const },
      ],
      requiredTraversalBands: [{ id: "entry-middle", halfWidthMeters: 1,
        centerlineStandPositionsMetersXYZ: [[0, 0, 0] as const, [0, 0, -1] as const] }],
    } : baseMetadata.groundExploration,
    caseHash,
    contributionHash: hashBabylonNativeSceneContributionV1(nativeSceneContribution),
    blocks: [...baseMetadata.blocks, {
      blockId: "ridge-block",
      runtimeEntityId: "native-block:ridge-block",
      semanticCaptureClassId: "worldkit.native-block.group.ridge-group",
      shape: "full" as const,
      paletteRole: "structure" as const,
      visualGroupId: "ridge-group",
      centerMetersXYZ: [0, 1, 4] as const,
      rotationQuarterTurnsY: 0 as const,
      sizeMetersXYZ: [2, 2, 2] as const,
    }],
    visualGroups: [...baseMetadata.visualGroups, {
      frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "ridge-group",
      acceptanceTargetRef: SECONDARY_TARGET,
      semanticClassId: "structure.fixture",
      identityColorHex: "#AA0002" as const,
      blockIds: ["ridge-block"],
      paletteRoles: ["structure" as const],
      minimumMetersXYZ: [-1, 0, 3] as const,
      maximumMetersXYZ: [1, 2, 5] as const,
    }],
  };
  if (plannerInputs) {
    nativeBlockMaterializerMetadata.visualGroups = nativeBlockMaterializerMetadata.visualGroups.map((group, index) => {
      const target = plannerInputs.palette.targets[index + 1]!;
      return { ...group, acceptanceTargetRef: index === 0 ? OPENING_TARGET : SECONDARY_TARGET,
        semanticClassId: target.semanticClassId, identityColorHex: target.identityColor };
    });
  }
  const directory = createBabylonNativeWorldPackageV1({
    ...baseInput,
    sceneAuthoringRouteDecision,
    sceneAuthoringAttempt,
    sceneAuthoringAttemptResult,
    nativeSceneContribution,
    nativeBlockMaterializerMetadata,
  });
  const verifiedPackage = verifyWorldPackageDirectoryV1(directory);
  if (verifiedPackage.kind !== "babylon-native-scene") {
    throw new Error("expected Native Package fixture");
  }
  const metadata = verifiedPackage.nativeBlockMaterializerMetadata!;
  await mkdir(attemptDirectoryPath, { recursive: true, mode: 0o700 });
  await writeWorldPackageDirectoryV1({
    outputDirectoryPath: packageDirectoryPath,
    directory: verifiedPackage.directory,
  });
  await writeFile(
    path.join(caseRoot, "case.json"),
    stringifyCanonicalJson(reconstructionCase),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    path.join(caseRoot, "evaluation-profile.json"),
    stringifyCanonicalJson(profile),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    path.join(attemptDirectoryPath, "attempt.json"),
    stringifyCanonicalJson(verifiedPackage.sceneAuthoringAttempt),
    { flag: "wx", mode: 0o600 },
  );
  return Object.freeze({
    caseRoot,
    verifiedPackage,
    input: Object.freeze({
      visualCaptureScope: completeTargets ? "complete-targets" : "world-only",
      outputMode: "create",
      casePath: path.join(caseRoot, "case.json"),
      evaluationProfilePath: path.join(caseRoot, "evaluation-profile.json"),
      sceneAuthoringAttemptPath: path.join(attemptDirectoryPath, "attempt.json"),
      packageDirectoryPath,
      outputPath,
      formalCaptureIntent,
    }),
  });
}

describe("materializeFormalWorldCaptureRequestV1", () => {
  it.each([0, Math.PI / 2, Math.PI / 4])("selects every complete Native target and the true Subject at yaw %s", async facingRadians => {
    const { input, verifiedPackage } = await fixture(false, true, facingRadians);
    const result = await materializeFormalWorldCaptureRequestV1(input);
    const groups = result.request.visualCaptureGroups;
    expect(groups.map(row => row.visualTargetId)).toEqual(["visual-target-1", "visual-target-2", "visual-target-3"]);
    expect(groups[0]!.runtimeEntityIds).toEqual([verifiedPackage.worldRuntimeBootstrap.initialControlledEntityId]);
    expect(groups[0]!.frontDirectionWorldXZ[0]).toBeCloseTo(-Math.sin(facingRadians), 12);
    expect(groups[0]!.frontDirectionWorldXZ[1]).toBeCloseTo(-Math.cos(facingRadians), 12);
    for (const [index, metadataGroup] of verifiedPackage.nativeBlockMaterializerMetadata!.visualGroups.entries()) {
      expect(groups[index + 1]).toMatchObject({ semanticClassId: metadataGroup.semanticClassId,
        identityColor: metadataGroup.identityColorHex, frontDirectionWorldXZ: metadataGroup.frontDirectionWorldXZ,
        runtimeEntityIds: verifiedPackage.nativeBlockMaterializerMetadata!.blocks
          .filter(block => block.visualGroupId === metadataGroup.visualGroupId).map(block => block.runtimeEntityId).sort() });
    }
    expect(Object.isFrozen(groups[0]!.frontDirectionWorldXZ)).toBe(true);
    expect(result.formalRequestHash).not.toBe(hashFormalWorldCaptureRequestV1({ ...result.request, visualCaptureGroups: [] }));
    const replay = await materializeFormalWorldCaptureRequestV1({ ...input, outputMode: "verify-or-create" });
    expect(replay.requestBytes).toEqual(result.requestBytes);
    await expect(materializeFormalWorldCaptureRequestV1({ ...input, outputMode: "verify-or-create", visualCaptureScope: "world-only" }))
      .rejects.toThrow("existing request bytes");
  });

  it.each(["scene-brief.md", "visual-identity-palette.json"])("rejects changed frozen %s bytes before writing the capture request", async name => {
    const { input, caseRoot } = await fixture(false, true);
    const file = path.join(caseRoot, "inputs", name);
    await writeFile(file, Buffer.concat([await readFile(file), Buffer.from("\n")]));
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow("visual capture planner input bytes");
    await expect(lstat(input.outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not omit a missing complete target or use a Native block as the controlled Subject", async () => {
    const { input, caseRoot, verifiedPackage } = await fixture(false, true);
    const palette = JSON.parse(await readFile(path.join(caseRoot, "inputs", "visual-identity-palette.json"), "utf8")) as VisualIdentityPaletteV1;
    const source = { palette, metadata: verifiedPackage.nativeBlockMaterializerMetadata!,
      runtimeBootstrap: verifiedPackage.worldRuntimeBootstrap, spawnMarker: verifiedPackage.nativeSceneContribution.spawnMarker };
    const expected = deriveNativeVisualCaptureGroupsV1(source);
    expect(deriveNativeVisualCaptureGroupsV1({ ...source, metadata: { ...source.metadata,
      blocks: [...source.metadata.blocks].reverse(), visualGroups: [...source.metadata.visualGroups].reverse() } })).toEqual(expected);
    const member = source.metadata.blocks.find(block => block.visualGroupId === source.metadata.visualGroups[0]!.visualGroupId)!;
    const extended = deriveNativeVisualCaptureGroupsV1({ ...source, metadata: { ...source.metadata,
      blocks: [...source.metadata.blocks, { ...member, blockId: "extension", runtimeEntityId: "native-block:extension" }] } });
    expect(extended[1]!.runtimeEntityIds).toEqual([...expected[1]!.runtimeEntityIds, "native-block:extension"].sort());
    expect(extended[0]).toEqual(expected[0]);
    expect(extended[2]).toEqual(expected[2]);
    expect(() => deriveNativeVisualCaptureGroupsV1({ ...source, metadata: { ...source.metadata, visualGroups: source.metadata.visualGroups.slice(1) } }))
      .toThrow("NATIVE_VISUAL_CAPTURE_TARGET_MISMATCH");
    expect(() => deriveNativeVisualCaptureGroupsV1({ ...source,
      runtimeBootstrap: { ...source.runtimeBootstrap, initialControlledEntityId: "native-block:ground" } }))
      .toThrow("NATIVE_VISUAL_CAPTURE_SUBJECT_INVALID");
    for (const changed of [{ identityColorHex: "#FFFFFF" as const }, { semanticClassId: "visual.foreign" }]) {
      expect(() => deriveNativeVisualCaptureGroupsV1({ ...source, metadata: { ...source.metadata,
        visualGroups: source.metadata.visualGroups.map((row, index) => index === 0 ? { ...row, ...changed } : row) } }))
        .toThrow("NATIVE_VISUAL_CAPTURE_TARGET_MISMATCH");
    }
    await materializeFormalWorldCaptureRequestV1(input);
  });

  it("requires an explicit capture scope and never falls back when selected target inputs are absent", async () => {
    const { input } = await fixture();
    await expect(materializeFormalWorldCaptureRequestV1({ ...input, visualCaptureScope: "complete-targets" }))
      .rejects.toThrow("visual capture planner inputs");
    await expect(materializeFormalWorldCaptureRequestV1(omit(input, "visualCaptureScope") as MaterializeFormalWorldCaptureRequestInputV1))
      .rejects.toThrow("unknown or missing field");
    const result = await materializeFormalWorldCaptureRequestV1(input);
    expect(result.request.visualCaptureGroups).toEqual([]);
  });

  it("includes asymmetric ungrouped off-camera Blocks and ignores inventory order", async () => {
    const { verifiedPackage } = await fixture();
    const original = verifiedPackage.nativeBlockMaterializerMetadata!.blocks;
    const blocks = [...original, {
      ...omit(original[0]!, ["visualGroupId", "colliderGroupId"]),
      centerMetersXYZ: [100, -7, -80] as const, sizeMetersXYZ: [1, 1, 2] as const,
      rotationQuarterTurnsY: 1 as const,
    }];
    const bounds = deriveNativeFormalWorldCaptureBoundsV1({ blocks });
    expect(bounds.minimumMetersXYZ[1]).toBe(-7.5);
    expect(bounds.minimumMetersXYZ[2]).toBe(-81);
    expect(bounds.maximumMetersXYZ[0]).toBe(100.5);
    expect(deriveNativeFormalWorldCaptureBoundsV1({ blocks: [...blocks].reverse() })).toEqual(bounds);
    expect(() => deriveNativeFormalWorldCaptureBoundsV1({ blocks: [] })).toThrow("FORMAL_CAPTURE_VISUAL_BOUNDS_INVALID");
  });

  it("frames checked world geometry instead of invisible Package container margins", async () => {
    const { input, verifiedPackage } = await fixture();
    const { request } = await materializeFormalWorldCaptureRequestV1(input);
    const blocks = verifiedPackage.nativeBlockMaterializerMetadata!.blocks;
    const minY = Math.min(...blocks.map(block => block.centerMetersXYZ[1] - block.sizeMetersXYZ[1] / 2));
    const maxY = Math.max(...blocks.map(block => block.centerMetersXYZ[1] + block.sizeMetersXYZ[1] / 2));
    for (const view of [request.views[1], request.views[2]]) {
      expect(view.targetMetersXYZ[1]).toBe((minY + maxY) / 2);
      expect(view.worldBoundsMeters.maximumMetersXYZ[1] - view.worldBoundsMeters.minimumMetersXYZ[1])
        .toBe(Math.max(4, maxY - minY));
    }
    expect(() => assertFormalCaptureRequestMatchesVerifiedPackageV1({ verifiedPackage, request })).not.toThrow();
  });

  it("materializes and rereads exact empty traversal sets without rewriting the frozen Case", async () => {
    const { input } = await fixture(true);
    const caseBytes = await readFile(input.casePath);
    const first = await materializeFormalWorldCaptureRequestV1(input);
    expect(first.request.scriptedTraversal.checks).toEqual([]);
    expect(first.request.semanticCaptureMap.traversalCheckBindings).toEqual([]);
    expect(first.request.semanticCaptureMap.topologyRelations).toEqual([]);
    const second = await materializeFormalWorldCaptureRequestV1({ ...input, outputMode: "verify-or-create" });
    expect(second.request).toEqual(first.request);
    expect(await readFile(input.casePath)).toEqual(caseBytes);
  });

  it("writes one canonical request from frozen Case/Attempt/Package/Profile identities", async () => {
    const { input, verifiedPackage } = await fixture();
    const materialized = await materializeFormalWorldCaptureRequestV1(input);
    const bytes = new Uint8Array(await readFile(input.outputPath));
    const parsed = parseFormalWorldCaptureRequestV1(JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ));

    expect(bytes).toEqual(formalWorldCaptureRequestCanonicalBytesV1(parsed));
    expect(parsed).toEqual(materialized.request);
    expect(materialized.formalRequestHash).toBe(
      hashFormalWorldCaptureRequestV1(parsed),
    );
    expect(parsed.caseHash).toBe(hashWorldReconstructionCaseV1(
      parseWorldReconstructionCaseV1(JSON.parse(
        await readFile(input.casePath, "utf8"),
      )),
    ));
    expect(parsed.evaluationProfileHash).toBe(
      hashWorldReconstructionEvaluationProfileV1(
        parseWorldReconstructionEvaluationProfileV1(JSON.parse(
          await readFile(input.evaluationProfilePath, "utf8"),
        )),
      ),
    );
    expect(parsed.sceneAuthoringAttemptHash).toBe(
      hashSceneAuthoringAttemptV1(verifiedPackage.sceneAuthoringAttempt),
    );
    expect(parsed.worldPackageRootHash).toBe(
      verifiedPackage.receipt.worldPackageRootHash,
    );
    expect(assertFormalCaptureRequestMatchesVerifiedPackageV1({
      verifiedPackage,
      request: parsed,
    })).toEqual({
      verifiedPackage,
      request: parsed,
      formalRequestHash: materialized.formalRequestHash,
    });
    expect((await readdir(path.dirname(input.outputPath)))
      .filter((name) => name.includes("formal-world-capture-request")))
      .toEqual([FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1]);
  });

  it("rejects caller-provided hashes and does not import Hosted/Runtime owners", async () => {
    const source = await readFile(
      new URL("./formal-capture-request.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("parseFormalWorldCaptureRequestV1");
    expect(source).toContain("hashFormalWorldCaptureRequestV1");
    expect(source).not.toContain("hosted-session-capture");
    expect(source).not.toContain("runtime-babylon");
    expect(source).not.toContain("worldkit-server");
    expect(source).not.toContain("./formal-capture.js");

    const { input } = await fixture();
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      caseHash: `sha256:${"0".repeat(64)}`,
    } as MaterializeFormalWorldCaptureRequestInputV1)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a missing Attempt before Browser or output publication", async () => {
    const { input } = await fixture();
    await rm(input.sceneAuthoringAttemptPath);
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects stale Case identity", async () => {
    const { input } = await fixture();
    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(
      await readFile(input.casePath, "utf8"),
    ));
    await writeFile(
      input.casePath,
      stringifyCanonicalJson({
        ...reconstructionCase,
        id: "package-fixture.stale-case",
      }),
    );
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH: formalCaptureIntent",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects stale Evaluation Profile identity", async () => {
    const { input } = await fixture();
    const profile = parseWorldReconstructionEvaluationProfileV1(JSON.parse(
      await readFile(input.evaluationProfilePath, "utf8"),
    ));
    await writeFile(
      input.evaluationProfilePath,
      stringifyCanonicalJson({
        ...profile,
        id: "package-fixture-stale-profile",
      }),
    );
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH: evaluationProfileHash",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects stale SceneAuthoringAttempt identity", async () => {
    const { input } = await fixture();
    const attempt = parseSceneAuthoringAttemptV1(JSON.parse(
      await readFile(input.sceneAuthoringAttemptPath, "utf8"),
    ));
    await writeFile(
      input.sceneAuthoringAttemptPath,
      stringifyCanonicalJson({
        ...attempt,
        id: "package-fixture-stale-attempt",
      }),
    );
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH: sceneAuthoringAttemptHash",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects stale or foreign WorldPackage identity", async () => {
    const { input, caseRoot } = await fixture();
    const stalePackageDirectoryPath = path.join(
      caseRoot,
      "attempts",
      "0",
      "stale-world-package",
    );
    const staleDirectory = createBabylonNativeWorldPackageV1(
      createBabylonNativeBlockWorldPackageTestInputV1(),
    );
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: stalePackageDirectoryPath,
      directory: staleDirectory,
    });
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      packageDirectoryPath: stalePackageDirectoryPath,
      outputPath: path.join(
        path.dirname(stalePackageDirectoryPath),
        FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
      ),
    })).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH",
    );

    const foreignPackageDirectoryPath = path.join(
      caseRoot,
      "attempts",
      "0",
      "foreign-world-package",
    );
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: foreignPackageDirectoryPath,
      directory: createBabylonNativeWorldPackageV1(
        createBabylonNativeWorldPackageTestInputV1(),
      ),
    });
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      packageDirectoryPath: foreignPackageDirectoryPath,
      outputPath: path.join(
        path.dirname(foreignPackageDirectoryPath),
        FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
      ),
    })).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH: worldPackage",
    );
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a symlinked Case input", async () => {
    const { input, caseRoot } = await fixture();
    const linkedCasePath = path.join(caseRoot, "linked-case.json");
    await symlink(input.casePath, linkedCasePath);
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      casePath: linkedCasePath,
    })).rejects.toThrow("FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID");
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects an output path that escapes the Case root", async () => {
    const { input, caseRoot } = await fixture();
    await expect(materializeFormalWorldCaptureRequestV1({
      ...input,
      outputPath: path.resolve(
        caseRoot,
        "..",
        FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1,
      ),
    })).rejects.toThrow("FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID");
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a duplicate output", async () => {
    const { input } = await fixture();
    await materializeFormalWorldCaptureRequestV1(input);
    await expect(materializeFormalWorldCaptureRequestV1(input)).rejects.toThrow(
      "FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID: outputPath duplicate",
    );
    expect(await readdir(path.dirname(input.outputPath))).toEqual(
      expect.arrayContaining([FORMAL_WORLD_CAPTURE_REQUEST_FILE_NAME_V1]),
    );
    expect((await readdir(path.dirname(input.outputPath)))
      .filter((name) => name.startsWith("."))).toEqual([]);
  });

  it("revalidates and reuses an identical request on Host-only recovery without replacing bytes", async () => {
    const { input } = await fixture();
    const first = await materializeFormalWorldCaptureRequestV1(input);
    const bytes = await readFile(input.outputPath);
    const before = await lstat(input.outputPath);
    const recovered = await materializeFormalWorldCaptureRequestV1({ ...input, outputMode: "verify-or-create" });
    expect(recovered.formalRequestHash).toBe(first.formalRequestHash);
    expect(await readFile(input.outputPath)).toEqual(bytes);
    const after = await lstat(input.outputPath);
    expect([after.ino, after.mtimeMs]).toEqual([before.ino, before.mtimeMs]);
  });

  it("rejects changed and symlinked recovery requests without replacing prior evidence", async () => {
    const { input } = await fixture();
    await materializeFormalWorldCaptureRequestV1(input);
    const bytes = await readFile(input.outputPath);
    await writeFile(input.outputPath, "{}\n");
    await expect(materializeFormalWorldCaptureRequestV1({ ...input, outputMode: "verify-or-create" }))
      .rejects.toThrow("FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH");
    expect(await readFile(input.outputPath, "utf8")).toBe("{}\n");
    await rm(input.outputPath);
    const savedPath = path.join(path.dirname(input.outputPath), "saved-request.json");
    await writeFile(savedPath, bytes);
    await symlink(savedPath, input.outputPath);
    await expect(materializeFormalWorldCaptureRequestV1({ ...input, outputMode: "verify-or-create" }))
      .rejects.toThrow("FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID");
    expect(await readFile(savedPath)).toEqual(bytes);
  });

  it("creates a missing request on recovery using the same identity checks", async () => {
    const { input } = await fixture();
    const result = await materializeFormalWorldCaptureRequestV1({ ...input, outputMode: "verify-or-create" });
    expect(await readFile(input.outputPath)).toEqual(Buffer.from(result.requestBytes));
  });

  it("cleans partial staging after a failed publication", async () => {
    const { input } = await fixture();
    await expect(materializeFormalWorldCaptureRequestV1(input, {
      hooks: {
        beforeRename: async () => {
          throw new Error("staging publication failed");
        },
      },
    })).rejects.toThrow("staging publication failed");
    await expect(readdir(input.outputPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await readdir(path.dirname(input.outputPath)))
      .filter((name) => name.includes("formal-world-capture-request")))
      .toEqual([]);
  });
});
