import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { verifyNativeBlockCaseOwnerInputSnapshotV1 } from "./final-artifact-publisher.js";
import { nativeWorldReferenceInputRefV1, nativeWorldReferenceMediaTypeV1 } from "./native-world-reference-media.js";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { sha256Bytes, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
} from "@whitebox-world/validation";
import { afterEach, describe, expect, it } from "vitest";

import {
  deriveNativeWorldBaselineProposalV1,
  prepareNativeWorldCaseV1,
  type FrozenNativeWorldReferenceInputV1,
} from "./native-world-case-preparation.js";

const temporaryRoots: string[] = [];
const REFERENCE_PNG = await sharp({ create: {
  width: 8, height: 8, channels: 3, background: "red",
} }).png().toBuffer();

const BABYLON_NATIVE_VISUAL_IDENTITY_COLORS = Object.freeze([
  "#E85D5D",
  "#F28E2B",
  "#D9A514",
  "#4E79A7",
  "#9C6ADE",
] as const);

const VALID_SCENE_BRIEF = `# WorldKit Scene Brief

## 场景
完整的原生方块测试世界。

## 主体
由 Host 控制的第三人称旅人。

## 用户事实
用户要求一个完整且可探索的测试世界。

## 可见参考证据
参考中可见旅人、连续地面与远端地标。

## 推断的世界延伸
画面外延续为连贯地面，此项属于工程推断。

## 仅视觉层设想
材质、纹理与光照只属于后续渲染层。

## 运动模式
- 陆地步行：主体自然行走和奔跑。

## 空间
前景地面连接中段与远端目的地。

## 通行
连续地面支持从入口前往远端地标。

## 首帧
标准第三人称背后视角，主体位于下方中央。

## 视觉目标
- 主体｜旅人：完整人物主体
`;

function nativeVisualIdentityPaletteText(input: Readonly<{
  sceneId: string;
  sceneBriefHash: Sha256HashV1;
  targetCount?: number;
}>): string {
  const targetCount = input.targetCount ?? 1;
  return JSON.stringify({
    kind: "worldkit-visual-identity-palette",
    schemaVersion: 1,
    sceneId: input.sceneId,
    sceneBriefHash: input.sceneBriefHash,
    movementModes: ["ground-walk"],
    movementModeLabels: ["陆地步行"],
    targets: BABYLON_NATIVE_VISUAL_IDENTITY_COLORS.slice(0, targetCount).map(
      (identityColor, index) => ({
        id: `visual-target-${index + 1}`,
        visualTargetId: `visual-target-${index + 1}`,
        targetKind: index === 0 ? "subject" : "landmark",
        name: index === 0 ? "Explorer" : `Landmark ${index}`,
        description: index === 0
          ? "controlled Subject"
          : `landmark ${index}`,
        role: index === 0
          ? "primary-subject"
          : index === 1 ? "primary-landmark" : "secondary-landmark",
        semanticClassId: index === 0
          ? "visual.subject"
          : "visual.landmark",
        identityColor,
      }),
    ),
  });
}

function sceneBriefSemanticHash(
  sceneBriefBytes: Uint8Array,
): Sha256HashV1 {
  const brief = parseSceneBriefV1(
    new TextDecoder().decode(sceneBriefBytes),
  );
  return brief.ok
    ? brief.sceneBriefHash as Sha256HashV1
    : sha256Bytes(sceneBriefBytes) as Sha256HashV1;
}

function passedNativePlannerReceipt(input: Readonly<{
  sceneId: string;
  sceneBriefBytes: Uint8Array;
  worldPlanBytes: Uint8Array;
  entryWhiteboxTargetBytes: Uint8Array;
}>): unknown {
  return {
    kind: "worldkit-planner-self-check",
    schemaVersion: 1,
    validatorVersion: "worldkit-planner-self-check-v4",
    sceneId: input.sceneId,
    sceneSourceKind: "babylon-native",
    status: "passed",
    inputs: {
      sceneBriefHash: sha256Bytes(input.sceneBriefBytes),
      worldPlanHash: sha256Bytes(input.worldPlanBytes),
      entryWhiteboxTargetHash: sha256Bytes(input.entryWhiteboxTargetBytes),
    },
    imageMeasurements: {
      widthPixels: 1600,
      heightPixels: 900,
      subjectMaskPixelCount: 32_000,
      subjectCenterXRatio: 0.5,
      subjectCenterErrorRatio: 0,
      maximumCenterErrorRatio: 0.015,
    },
    nativeBlockPaletteMeasurements: {
      worldPlan: plannerPaletteMeasurement([64, 64, 64, 0, 0]),
      entryWhiteboxTarget: plannerPaletteMeasurement([32_000, 0, 0, 0, 0]),
    },
    nativeEntryIdentityMeasurements: {
      widthPixels: 1600,
      heightPixels: 900,
      aspectRatio: 16 / 9,
      aspectErrorRatio: 0,
      requiredAspectRatio: 16 / 9,
      maximumAspectErrorRatio: 0.02,
      maximumIdentityRgbDistance: 40,
      minimumIdentitySeparationRgbUnits: 12,
      ambiguousIdentityPixelCount: 0,
      candidateIdentityPixelCount: 32_000,
      ambiguousIdentityRatio: 0,
      maximumAmbiguousIdentityRatio: 0.05,
      targets: [{
        visualTargetId: "visual-target-1",
        identityColorHex: "#E85D5D",
        exclusivelyAdmittedPixelCount: 32_000,
        imageCoverageRatio: 32_000 / (1600 * 900),
        componentCount: 1,
        coherentComponentCount: 1,
        coherentPixelCount: 32_000,
        coherentPixelRatio: 1,
        largestComponentPixelCount: 32_000,
        largestComponentImageCoverageRatio: 32_000 / (1600 * 900),
        largestComponentBoundingBoxWidthPixels: 160,
        largestComponentBoundingBoxHeightPixels: 320,
        largestComponentBoundingBoxWidthRatio: 0.1,
        largestComponentBoundingBoxHeightRatio: 320 / 900,
        minimumPixelCount: 360,
        minimumCoherentComponentPixelCount: 36,
        minimumCoherentPixelRatio: 0.75,
        minimumLargestComponentPixelCount: 1440,
        minimumLargestComponentImageCoverageRatio: 0.001,
        minimumLargestComponentBoundingBoxWidthRatio: 0.02,
        minimumLargestComponentBoundingBoxHeightRatio: 0.04,
      }],
    },
    diagnostics: [],
  };
}

function plannerPaletteMeasurement(
  visualTargetPixelCounts: readonly number[],
): unknown {
  return {
    widthPixels: 1600,
    heightPixels: 900,
    aspectRatio: 16 / 9,
    matchedBlockPixelCount: 72_000,
    blockPaletteCoverageRatio: 72_000 / (1600 * 900),
    traversablePixelCount: 64_000,
    interactivePixelCount: 0,
    blockPixelCountsBySemantic: {
      walkable: 64_000,
      obstacle: 0,
      "interactive-solid": 0,
      "interactive-trigger": 0,
      water: 0,
      "cloud-walkable": 0,
      "cloud-passable": 0,
      "visual-only": 0,
      "landmark-red": 0,
      "visual-target-2": 4_000,
      "visual-target-3": 4_000,
      "visual-target-4": 0,
      "visual-target-5": 0,
      "landmark-pink": 0,
      "visual-target-1-subject": 32_000,
    },
    visualTargetPixelCounts,
  };
}

async function prepareWithPassedPlannerReceipt(
  input: Omit<Parameters<typeof prepareNativeWorldCaseV1>[0],
    | "plannerSelfCheckPath"
    | "uploadedReferenceInputs"
    | "visualIdentityPalettePath"> & Readonly<{
      referenceImagePaths: readonly string[];
      visualIdentityPalettePath?: string;
    }>,
) {
  const [sceneBriefBytes, worldPlanBytes, entryWhiteboxTargetBytes] =
    await Promise.all([
      readFile(input.sceneBriefPath),
      readFile(input.planningImagePaths.worldPlanPath),
      readFile(input.planningImagePaths.entryWhiteboxTargetPath),
    ]);
  const plannerSelfCheckPath = `${input.outputCaseRoot}.planner-self-check.json`;
  await writeFile(plannerSelfCheckPath, JSON.stringify(passedNativePlannerReceipt({
    sceneId: input.sceneId,
    sceneBriefBytes,
    worldPlanBytes,
    entryWhiteboxTargetBytes,
  })));
  const visualIdentityPalettePath = input.visualIdentityPalettePath ??
    `${input.outputCaseRoot}.visual-identity-palette.json`;
  if (input.visualIdentityPalettePath === undefined) {
    await writeFile(visualIdentityPalettePath, nativeVisualIdentityPaletteText({
      sceneId: input.sceneId,
      sceneBriefHash: sceneBriefSemanticHash(sceneBriefBytes),
    }));
  }
  const {
    referenceImagePaths,
    visualIdentityPalettePath: _providedVisualIdentityPalettePath,
    ...caseInput
  } = input;
  return prepareNativeWorldCaseV1({
    ...caseInput,
    uploadedReferenceInputs: await frozenReferenceInputs(referenceImagePaths),
    visualIdentityPalettePath,
    plannerSelfCheckPath,
  });
}

async function frozenReferenceInputs(
  referenceImagePaths: readonly string[],
): Promise<readonly FrozenNativeWorldReferenceInputV1[]> {
  return Promise.all(referenceImagePaths.map(async (referenceImagePath, index) => {
    const bytes = new Uint8Array(await readFile(referenceImagePath));
    const mediaType = nativeWorldReferenceMediaTypeV1(referenceImagePath);
    return Object.freeze({
      inputRef: nativeWorldReferenceInputRefV1(index, mediaType),
      contentHash: sha256Bytes(bytes) as FrozenNativeWorldReferenceInputV1["contentHash"],
      mediaType,
      bytes,
    });
  }));
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("trusted Native world Case preparation", () => {
  it("derives a closed report-only baseline Case without a Mapper model task", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-baseline-"));
    temporaryRoots.push(root);
    const briefText = VALID_SCENE_BRIEF;
    const sceneBriefSemanticHashValue = sceneBriefSemanticHash(
      new TextEncoder().encode(briefText),
    );
    const palettePath = path.join(root, "visual-identity-palette.json");
    const entryPath = path.join(root, "entry-whitebox-target.png");
    await Promise.all([
      writeFile(palettePath, JSON.stringify({
        kind: "worldkit-visual-identity-palette",
        schemaVersion: 1,
        sceneId: "baseline-native-world",
        sceneBriefHash: sceneBriefSemanticHashValue,
        movementModes: ["ground-walk"],
        movementModeLabels: ["陆地步行"],
        targets: [{
          id: "visual-target-1",
          visualTargetId: "visual-target-1",
          targetKind: "subject",
          name: "Explorer",
          description: "controlled Subject",
          role: "primary-subject",
          semanticClassId: "visual.subject",
          identityColor: "#E85D5D",
        }, {
          id: "visual-target-2",
          visualTargetId: "visual-target-2",
          targetKind: "landmark",
          name: "Volcano",
          description: "remote landmark",
          role: "primary-landmark",
          semanticClassId: "visual.landmark",
          identityColor: "#F28E2B",
        }],
      })),
      sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 220, g: 220, b: 220, alpha: 1 },
        },
      }).composite([{
        input: {
          create: {
            width: 10,
            height: 20,
            channels: 4,
            background: { r: 232, g: 93, b: 93, alpha: 1 },
          },
        },
        left: 45,
        top: 70,
      }, {
        input: {
          create: {
            width: 20,
            height: 20,
            channels: 4,
            background: { r: 242, g: 142, b: 43, alpha: 1 },
          },
        },
        left: 40,
        top: 40,
      }]).png().toFile(entryPath),
    ]);

    const proposal = await deriveNativeWorldBaselineProposalV1({
      sceneId: "baseline-native-world",
      sceneBriefBytes: new TextEncoder().encode(VALID_SCENE_BRIEF),
      visualIdentityPalettePath: palettePath,
      entryWhiteboxTargetPath: entryPath,
    }) as {
      expected: {
        topology: {
          layerIds: readonly string[];
          relations: readonly unknown[];
        };
        colliders: readonly {
          acceptanceTargetRef: string;
          contributionId: string;
          colliderId: string;
          role: "ground" | "blocker" | "step";
          requiresOverlay: boolean;
        }[];
        semanticSilhouetteTargets: readonly {
          acceptanceTargetRef: string;
          visualGroupId: string;
          viewRequirements: readonly {
            viewId: string;
            mode: string;
            normalizedBounds?: unknown;
          }[];
        }[];
        criticalTraversalChecks: readonly { id: string }[];
      };
      formalCaptureIntent: {
        topologyRelations: readonly unknown[];
        checkpointSpatialCriteria: readonly {
          kind: string;
          standPositionMetersXYZ: readonly [number, number, number];
        }[];
        semanticCaptureTargetBindings: readonly {
          acceptanceTargetRef: string;
          semanticLayerId: string;
        }[];
      };
      worldBoundsPolicy: unknown;
    };
    expect(proposal.expected.semanticSilhouetteTargets.map(
      ({ acceptanceTargetRef }) => acceptanceTargetRef,
    )).toEqual([
      "worldkit://acceptance-target/visual-target-2@1",
    ]);
    expect(proposal.expected.semanticSilhouetteTargets.find(
      ({ visualGroupId }) => visualGroupId === "visual-target-2-group",
    )?.viewRequirements.find(({ viewId }) => viewId === "opening")
      ?.normalizedBounds).toEqual({
      minXBasisPoints: 4000,
      minYBasisPoints: 4000,
      maxXBasisPoints: 6000,
      maxYBasisPoints: 6000,
    });
    expect(proposal.expected.criticalTraversalChecks).toEqual([]);
    expect(proposal.formalCaptureIntent.checkpointSpatialCriteria).toEqual([]);
    expect(proposal.expected.topology.relations).toEqual([]);
    expect(proposal.formalCaptureIntent.topologyRelations).toEqual([]);
    expect(proposal.expected.colliders).toEqual([
      expect.objectContaining({
        acceptanceTargetRef:
          "worldkit://acceptance-target/ground@1",
        contributionId: "collider-entry-ground",
        colliderId: "collider-entry-ground",
        role: "ground",
      }),
      {
        acceptanceTargetRef:
          "worldkit://acceptance-target/visual-target-2@1",
        contributionId: "collider-visual-target-2-solid",
        colliderId: "collider-visual-target-2-solid",
        role: "blocker",
        requiresOverlay: true,
      },
    ]);
    expect(proposal.formalCaptureIntent.semanticCaptureTargetBindings)
      .toHaveLength(1);
    expect(proposal.expected.topology.layerIds).toEqual([
      "middle",
    ]);
    expect(proposal.expected.topology.layerIds).toEqual(
      [...new Set(proposal.formalCaptureIntent.semanticCaptureTargetBindings
        .map(({ semanticLayerId }) => semanticLayerId))].sort(),
    );
    expect(proposal.worldBoundsPolicy).toEqual({
      mode: "checked-block-layout",
    });

    const proposalPath = path.join(root, "host-derived-baseline-case.json");
    const briefPath = path.join(root, "scene-brief.md");
    const outputCaseRoot = path.join(root, "prepared-case");
    await Promise.all([
      writeFile(proposalPath, JSON.stringify(proposal)),
      writeFile(briefPath, briefText),
    ]);
    const prepared = await prepareWithPassedPlannerReceipt({
      repositoryRoot: process.cwd(),
      sceneId: "baseline-native-world",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [entryPath],
      planningImagePaths: {
        worldPlanPath: entryPath,
        entryWhiteboxTargetPath: entryPath,
      },
      visualIdentityPalettePath: palettePath,
      outputCaseRoot,
    });
    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(
      await readFile(prepared.casePath, "utf8"),
    ));
    const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(
      JSON.parse(await readFile(prepared.evaluationProfilePath, "utf8")),
    );
    expect(reconstructionCase.expected.criticalTraversalChecks).toEqual([]);
    expect(reconstructionCase.expected.groundConnectivity).toEqual({
      mode: "source-authored", requireSingleReachableComponent: true,
      requiredTraversalBands: [],
    });
    expect(evaluationProfile.thresholds.semanticSilhouetteTargets).toEqual([
      {
        acceptanceTargetRef:
          "worldkit://acceptance-target/visual-target-2@1",
        maximumBoundsDriftBasisPoints: 1600,
        maximumCenterDriftBasisPoints: 1000,
        maximumCoverageDriftBasisPoints: 1800,
      },
    ]);
    expect(evaluationProfile.thresholds.openingComposition.regions).toEqual([
      {
        targetRef: "worldkit://composition-target/visual-target-2@1",
        maximumDriftBasisPoints: 1600,
      },
    ]);
    expect(evaluationProfile.thresholds.openingComposition.anchors).toEqual([
      {
        targetRef: "worldkit://composition-target/visual-target-2@1",
        maximumDriftBasisPoints: 1000,
      },
    ]);

    const [sceneBriefBytes, worldPlanBytes, entryWhiteboxTargetBytes] =
      await Promise.all([
        readFile(briefPath),
        readFile(entryPath),
        readFile(entryPath),
      ]);
    const plannerReceipt = passedNativePlannerReceipt({
      sceneId: "baseline-native-world",
      sceneBriefBytes,
      worldPlanBytes,
      entryWhiteboxTargetBytes,
    }) as Record<string, unknown>;
    const staleReceiptPath = path.join(root, "stale-planner-self-check.json");
    await writeFile(staleReceiptPath, JSON.stringify({
      ...plannerReceipt,
      inputs: {
        ...(plannerReceipt.inputs as Record<string, unknown>),
        worldPlanHash: `sha256:${"0".repeat(64)}`,
      },
    }));
    await expect(prepareNativeWorldCaseV1({
      repositoryRoot: process.cwd(),
      sceneId: "baseline-native-world",
      proposalPath,
      sceneBriefPath: briefPath,
      uploadedReferenceInputs: await frozenReferenceInputs([entryPath]),
      planningImagePaths: {
        worldPlanPath: entryPath,
        entryWhiteboxTargetPath: entryPath,
      },
      visualIdentityPalettePath: palettePath,
      plannerSelfCheckPath: staleReceiptPath,
      outputCaseRoot: path.join(root, "stale-prepared-case"),
    })).rejects.toThrow("NATIVE_WORLD_PLANNER_RECEIPT_INPUT_MISMATCH");

    const openReceiptPath = path.join(root, "open-planner-self-check.json");
    await writeFile(openReceiptPath, JSON.stringify({
      ...plannerReceipt,
      legacyStatus: "passed",
    }));
    await expect(prepareNativeWorldCaseV1({
      repositoryRoot: process.cwd(),
      sceneId: "baseline-native-world",
      proposalPath,
      sceneBriefPath: briefPath,
      uploadedReferenceInputs: await frozenReferenceInputs([entryPath]),
      planningImagePaths: {
        worldPlanPath: entryPath,
        entryWhiteboxTargetPath: entryPath,
      },
      visualIdentityPalettePath: palettePath,
      plannerSelfCheckPath: openReceiptPath,
      outputCaseRoot: path.join(root, "open-prepared-case"),
    })).rejects.toThrow("NATIVE_WORLD_PLANNER_RECEIPT_INVALID");
  });

  it("derives connected ground only when every ordered movement mode is ground-based", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-ground-policy-"));
    temporaryRoots.push(root);
    const sceneId = "ground-policy-parity";
    const palettePath = path.join(root, "palette.json");
    const imagePath = path.join(root, "entry.png");
    const sceneBriefHash = sceneBriefSemanticHash(new TextEncoder().encode(VALID_SCENE_BRIEF));
    const basePalette = JSON.parse(nativeVisualIdentityPaletteText({ sceneId, sceneBriefHash, targetCount: 1 }));
    await sharp({ create: { width: 100, height: 100, channels: 4, background: "#E85D5D" } }).png().toFile(imagePath);
    const scenarios = [
      ["ground-walk"], ["ground-slide"], ["ground-ride"], ["ground-drive"],
      ["water-surface"], ["underwater"], ["flight"], ["custom"],
      ["ground-drive", "ground-walk"], ["ground-walk", "flight"], ["flight", "ground-walk"],
    ];
    for (const movementModes of scenarios) {
      const labels = new Map([
        ["ground-walk", "陆地步行"], ["ground-slide", "陆地滑行"], ["ground-ride", "陆地骑乘"],
        ["ground-drive", "陆地驾驶"], ["water-surface", "水面航行"], ["underwater", "水下游动"],
        ["flight", "空中飞行"], ["custom", "自定义墙面行走"],
      ]);
      const sceneBriefBytes = new TextEncoder().encode(VALID_SCENE_BRIEF.replace(
        "- 陆地步行：主体自然行走和奔跑。",
        movementModes.map(mode => `- ${labels.get(mode)}：按参考移动。`).join("\n"),
      ));
      // The intentionally unchanged ground-only Palette labels cannot override
      // the real Brief's mixed/free-space policy.
      await writeFile(palettePath, JSON.stringify({ ...basePalette, sceneBriefHash: sceneBriefSemanticHash(sceneBriefBytes) }));
      const proposal = await deriveNativeWorldBaselineProposalV1({ sceneId, sceneBriefBytes,
        visualIdentityPalettePath: palettePath, entryWhiteboxTargetPath: imagePath }) as {
          expected: { groundConnectivity: { requireSingleReachableComponent: boolean; requiredTraversalBands: unknown[] } };
        };
      expect(proposal.expected.groundConnectivity, movementModes.join(",")).toEqual({
        mode: "source-authored",
        requireSingleReachableComponent: movementModes.every(mode => ["ground-walk", "ground-slide", "ground-ride", "ground-drive"].includes(mode)),
        requiredTraversalBands: [],
      });
    }
  });

  it("prepares a Subject-only palette without inventing ground visual targets or a remote Collider", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-subject-only-"));
    temporaryRoots.push(root);
    const sceneId = "subject-only-ground";
    const briefPath = path.join(root, "scene-brief.md");
    const palettePath = path.join(root, "palette.json");
    const imagePath = path.join(root, "entry.png");
    await writeFile(briefPath, VALID_SCENE_BRIEF);
    await writeFile(palettePath, nativeVisualIdentityPaletteText({ sceneId,
      sceneBriefHash: sceneBriefSemanticHash(new TextEncoder().encode(VALID_SCENE_BRIEF)), targetCount: 1 }));
    await sharp({ create: { width: 100, height: 100, channels: 4, background: "#E85D5D" } }).png().toFile(imagePath);
    const proposal = await deriveNativeWorldBaselineProposalV1({ sceneId,
      sceneBriefBytes: new TextEncoder().encode(VALID_SCENE_BRIEF),
      visualIdentityPalettePath: palettePath, entryWhiteboxTargetPath: imagePath });
    const proposalPath = path.join(root, "proposal.json");
    await writeFile(proposalPath, JSON.stringify(proposal));
    const prepared = await prepareWithPassedPlannerReceipt({ repositoryRoot: process.cwd(), sceneId,
      proposalPath, sceneBriefPath: briefPath, referenceImagePaths: [imagePath],
      planningImagePaths: { worldPlanPath: imagePath, entryWhiteboxTargetPath: imagePath },
      visualIdentityPalettePath: palettePath, outputCaseRoot: path.join(root, "prepared") });
    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(await readFile(prepared.casePath, "utf8")));
    const profile = parseWorldReconstructionEvaluationProfileV1(JSON.parse(await readFile(prepared.evaluationProfilePath, "utf8")));
    expect(reconstructionCase.expected.semanticSilhouetteTargets).toEqual([]);
    expect(reconstructionCase.expected.topology.nodeIds).toEqual([]);
    expect(reconstructionCase.expected.colliders.map(row => row.colliderId)).toEqual(["collider-entry-ground"]);
    expect(reconstructionCase.acceptanceTargetRefs).toEqual(["worldkit://acceptance-target/ground@1"]);
    expect(profile.thresholds.semanticSilhouetteTargets).toEqual([]);
    expect(reconstructionCase.expected.groundConnectivity).toEqual({ mode: "source-authored",
      requireSingleReachableComponent: true, requiredTraversalBands: [] });
  });

  it("rejects a pass check whose acceptance target is only a blocker", async () => {
    const root = await mkdtemp(path.join(
      os.tmpdir(),
      "native-world-case-pass-target-",
    ));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const [fixtureCase, formalCaptureIntent, worldBoundsPolicy] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds-policy.json", "utf8").then(JSON.parse),
    ]);
    fixtureCase.expected.criticalTraversalChecks[0].acceptanceTargetRef =
      "worldkit://acceptance-target/mountain-cliff-layers@1";
    await Promise.all([
      writeFile(briefPath, VALID_SCENE_BRIEF),
      writeFile(referencePath, REFERENCE_PNG),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "invalid-native-pass-target",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "invalid-native-pass-target.formal-world-capture-intent",
        },
        worldBoundsPolicy,
      })),
    ]);

    await expect(prepareWithPassedPlannerReceipt({
      repositoryRoot: process.cwd(),
      sceneId: "invalid-native-pass-target",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [referencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    })).rejects.toThrow("WORLD_RECONSTRUCTION_CASE_INVALID");
  });

  it("rejects ground bands that evade Spawn origin or bind non-pass targets", async () => {
    const root = await mkdtemp(path.join(
      os.tmpdir(),
      "native-world-case-ground-connectivity-",
    ));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const [fixtureCase, formalCaptureIntent, worldBoundsPolicy] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds-policy.json", "utf8").then(JSON.parse),
    ]);
    fixtureCase.expected.groundConnectivity.requiredTraversalBands[0]
      .centerlineStandPositionsXYZMeters[0].zMeters = 17;
    fixtureCase.expected.groundConnectivity.requiredTraversalBands.push({
      ...structuredClone(
        fixtureCase.expected.groundConnectivity.requiredTraversalBands[0],
      ),
      acceptanceTargetRef:
        "worldkit://acceptance-target/mountain-cliff-layers@1",
      id: "cliff-evasion-band",
    });
    await Promise.all([
      writeFile(briefPath, VALID_SCENE_BRIEF),
      writeFile(referencePath, REFERENCE_PNG),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "invalid-native-ground-connectivity",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "invalid-native-ground-connectivity.formal-world-capture-intent",
        },
        worldBoundsPolicy,
      })),
    ]);

    await expect(prepareWithPassedPlannerReceipt({
      repositoryRoot: process.cwd(),
      sceneId: "invalid-native-ground-connectivity",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [referencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    })).rejects.toThrow("WORLD_RECONSTRUCTION_CASE_INVALID");
  });

  it("reports the exact Package bounds shape when Mapper copies Formal Capture AABB fields", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-case-bounds-"));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const [fixtureCase, formalCaptureIntent] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
    ]);
    await Promise.all([
      writeFile(briefPath, VALID_SCENE_BRIEF),
      writeFile(referencePath, REFERENCE_PNG),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "invalid-native-world-bounds",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "invalid-native-world-bounds.formal-world-capture-intent",
        },
        worldBoundsPolicy: {
          minimumMetersXYZ: [-20, -2, -30],
          maximumMetersXYZ: [20, 24, 30],
        },
      })),
    ]);

    await expect(prepareWithPassedPlannerReceipt({
      repositoryRoot: process.cwd(),
      sceneId: "invalid-native-world-bounds",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [referencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    })).rejects.toThrow(
      "NATIVE_WORLD_CASE_WORLD_BOUNDS_POLICY_INVALID: expected mode checked-block-layout or fixed with WorldPackage worldBounds; received maximumMetersXYZ, minimumMetersXYZ",
    );
  });

  it("rejects a parallel Native Collider contribution identity", async () => {
    const root = await mkdtemp(path.join(
      os.tmpdir(),
      "native-world-case-collider-identity-",
    ));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const [fixtureCase, formalCaptureIntent, worldBoundsPolicy] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds-policy.json", "utf8").then(JSON.parse),
    ]);
    fixtureCase.expected.colliders[0].contributionId =
      "collider-central-steps-parallel";
    await Promise.all([
      writeFile(briefPath, VALID_SCENE_BRIEF),
      writeFile(referencePath, REFERENCE_PNG),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "invalid-native-collider-identity",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "invalid-native-collider-identity.formal-world-capture-intent",
        },
        worldBoundsPolicy,
      })),
    ]);

    await expect(prepareWithPassedPlannerReceipt({
      repositoryRoot: process.cwd(),
      sceneId: "invalid-native-collider-identity",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [referencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    })).rejects.toThrow(
      "NATIVE_WORLD_CASE_COLLIDER_IDENTITY_INVALID: Babylon Native static " +
        "Collider contributionId must equal colliderId",
    );
  });

  it.each(["png", "webp"] as const)("binds an untrusted proposal to Host profiles and immutable %s inputs through Publisher admission", async (format) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-case-"));
    temporaryRoots.push(root);
    const proposalPath = path.join(root, "proposal.json");
    const briefPath = path.join(root, "scene-brief.md");
    const referencePath = path.join(root, "reference.png");
    const outputCaseRoot = path.join(root, "prepared-case");
    const uploadedReferencePath = path.join(root, `upload.${format}`);
    const uploadedReferenceBytes = format === "png" ? REFERENCE_PNG : await sharp(REFERENCE_PNG).webp().toBuffer();
    const uploadedReferenceRef = `reference-0.${format}`;
    const [fixtureCase, formalCaptureIntent, worldBoundsPolicy] = await Promise.all([
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/case.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json", "utf8").then(JSON.parse),
      readFile("artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds-policy.json", "utf8").then(JSON.parse),
    ]);
    await Promise.all([
      writeFile(briefPath, VALID_SCENE_BRIEF),
      writeFile(referencePath, REFERENCE_PNG),
      writeFile(uploadedReferencePath, uploadedReferenceBytes),
      writeFile(proposalPath, JSON.stringify({
        kind: "native-world-case-proposal",
        schemaVersion: 1,
        sceneId: "prepared-native-world",
        expected: fixtureCase.expected,
        formalCaptureIntent: {
          ...formalCaptureIntent,
          id: "prepared-native-world.formal-world-capture-intent",
        },
        worldBoundsPolicy,
      })),
    ]);

    const prepared = await prepareWithPassedPlannerReceipt({
      repositoryRoot: process.cwd(),
      sceneId: "prepared-native-world",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [uploadedReferencePath],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      outputCaseRoot,
    });

    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(
      await readFile(prepared.casePath, "utf8"),
    ));
    const profile = parseWorldReconstructionEvaluationProfileV1(JSON.parse(
      await readFile(path.join(outputCaseRoot, "evaluation-profile.json"), "utf8"),
    ));
    expect(reconstructionCase.id).toBe("prepared-native-world");
    expect(reconstructionCase.evaluationProfileHash).toBe(
      hashWorldReconstructionEvaluationProfileV1(profile),
    );
    expect(reconstructionCase.referenceInputs.map(({ inputRef }) => inputRef))
      .toEqual([
        "entry-whitebox-target.png",
        "planner-self-check.json",
        uploadedReferenceRef,
        "visual-identity-palette.json",
        "world-plan.png",
      ]);
    expect(profile.qualityGateMode).toBe("report-only");
    await expect(readFile(
      path.join(outputCaseRoot, "inputs", "world-plan.png"),
    )).resolves.toEqual(REFERENCE_PNG);
    await expect(readFile(
      path.join(outputCaseRoot, "inputs", "entry-whitebox-target.png"),
    )).resolves.toEqual(REFERENCE_PNG);
    expect(reconstructionCase.referenceInputs.find(
      ({ inputRef }) => inputRef === uploadedReferenceRef,
    )).toEqual({
      inputRef: uploadedReferenceRef,
      contentHash: sha256Bytes(uploadedReferenceBytes),
      mediaType: `image/${format}`,
    });
    await expect(readFile(path.join(
      outputCaseRoot,
      "inputs",
      uploadedReferenceRef,
    ))).resolves.toEqual(uploadedReferenceBytes);
    const publisherSnapshot = await verifyNativeBlockCaseOwnerInputSnapshotV1(
      await realpath(path.join(outputCaseRoot, "inputs")), reconstructionCase,
    );
    expect(publisherSnapshot.filesByRelativePath.get(uploadedReferenceRef)).toBe(sha256Bytes(uploadedReferenceBytes));
    const plannerReceiptBytes = await readFile(
      path.join(outputCaseRoot, "inputs", "planner-self-check.json"),
    );
    expect(reconstructionCase.referenceInputs.find(
      ({ inputRef }) => inputRef === "planner-self-check.json",
    )).toEqual({
      inputRef: "planner-self-check.json",
      contentHash: sha256Bytes(plannerReceiptBytes),
      mediaType: "application/json",
    });
    await expect(readFile(path.join(outputCaseRoot, "planner-self-check.json")))
      .resolves.toEqual(plannerReceiptBytes);
    const paletteBytes = await readFile(path.join(
      outputCaseRoot,
      "inputs",
      "visual-identity-palette.json",
    ));
    expect(reconstructionCase.referenceInputs.find(
      ({ inputRef }) => inputRef === "visual-identity-palette.json",
    )).toEqual({
      inputRef: "visual-identity-palette.json",
      contentHash: sha256Bytes(paletteBytes),
      mediaType: "application/json",
    });
    expect(reconstructionCase.requiredEvidenceProfileRefs).toHaveLength(7);
    expect(await readFile(
      path.join(outputCaseRoot, "inputs", "builder-skill", "SKILL.md"),
      "utf8",
    )).toContain("WorldKit Native Block Builder");
    const [preparedRenderer, liveRenderer] = await Promise.all([
      readFile(path.join(
        outputCaseRoot,
        "inputs",
        "builder-skill",
        "scripts",
        "render-visual-review.mjs",
      )),
      readFile(path.resolve(
        ".codex/skills/worldkit-native-block-builder/scripts/render-visual-review.mjs",
      )),
    ]);
    expect(preparedRenderer.equals(liveRenderer)).toBe(true);
    const taskInstruction = await readFile(path.join(
      outputCaseRoot,
      "inputs",
      "task-instruction.md",
    ), "utf8");
    const preparedSkill = await readFile(path.join(
      outputCaseRoot, "inputs", "builder-skill", "SKILL.md",
    ), "utf8");
    expect(preparedSkill).toBe(await readFile(path.resolve(
      ".codex/skills/worldkit-native-block-builder/SKILL.md",
    ), "utf8"));
    for (const [name, text] of [["frozen Skill", preparedSkill], ["task instruction", taskInstruction]] as const) {
      const instruction = text.replace(/\s+/g, " ");
      for (const semantic of [
        /at least (?:four|4) times .*?reference-visible area/i,
        /twice.*?width.*?twice.*?depth/i,
        /one continuous .*?world/i,
        /side.*?rear.*?remote/i,
        /empty padding.*?(?:does not|never) count/i,
        /(?:not|never)[^.]*?(?:area|similarity)[^.]*?gate/i,
        /conflict[^.]*?change.request/i,
        /(?:never|do not)[^.]*?silently[^.]*?(?:expand|rewrite|extend)[^.]*?frozen/i,
      ]) expect(semantic.test(instruction), `${name}: ${semantic}`).toBe(true);
    }
    expect(taskInstruction).toContain("two Host-declared advisory comparison PNGs");
    expect(taskInstruction).toContain("Author middle/remote exploration anchors and honest-width bands from the actual Brief geography");
    expect(taskInstruction).not.toContain("generic Case entry/remote checks");
    expect(taskInstruction).toContain("actually open both comparison PNGs");
    expect(taskInstruction).toContain("inputs/builder-skill/SKILL.md");
    expect(taskInstruction).toContain("inputs/builder-skill/references/native-block-output-contract.md");
    expect(taskInstruction).toContain("node inputs/builder-skill/scripts/self-check.mjs");
    expect(taskInstruction).toContain("node inputs/builder-skill/scripts/render-visual-review.mjs");
    expect(taskInstruction).toContain("regenerate both comparisons, and open both fresh images again");
    expect(taskInstruction).toContain("not an automatic similarity gate");
    expect(taskInstruction).toContain("Do not withhold otherwise valid declared outputs solely because visual differences remain");
    expect(taskInstruction).not.toContain("judged aligned");
    expect(taskInstruction).toContain("never author a review manifest or second geometry list");
    expect(taskInstruction).toContain(
      "For every non-Subject target in visual-identity-palette.json, implement its one Case visual group",
    );

    await expect(prepareNativeWorldCaseV1({
      repositoryRoot: process.cwd(),
      sceneId: "prepared-native-world",
      proposalPath,
      sceneBriefPath: briefPath,
      uploadedReferenceInputs: [{
        inputRef: "reference-0.png",
        contentHash: sha256Bytes(Buffer.from("different-reference-bytes")) as
          FrozenNativeWorldReferenceInputV1["contentHash"],
        mediaType: "image/png",
        bytes: uploadedReferenceBytes,
      }],
      planningImagePaths: {
        worldPlanPath: referencePath,
        entryWhiteboxTargetPath: referencePath,
      },
      visualIdentityPalettePath:
        `${outputCaseRoot}.visual-identity-palette.json`,
      plannerSelfCheckPath: `${outputCaseRoot}.planner-self-check.json`,
      outputCaseRoot: path.join(root, "mismatched-reference-case"),
    })).rejects.toThrow("NATIVE_WORLD_REFERENCE_INPUT_IDENTITY_MISMATCH");
  });

  it("retains a missing non-subject mask without inventing Opening bounds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-mask-"));
    temporaryRoots.push(root);
    const sceneBriefBytes = new TextEncoder().encode(VALID_SCENE_BRIEF);
    const sceneBriefHash = sceneBriefSemanticHash(sceneBriefBytes);
    const palettePath = path.join(root, "visual-identity-palette.json");
    const entryPath = path.join(root, "entry-whitebox-target.png");
    const briefPath = path.join(root, "scene-brief.md");
    await Promise.all([
      writeFile(palettePath, JSON.stringify({
        kind: "worldkit-visual-identity-palette",
        schemaVersion: 1,
        sceneId: "missing-native-mask",
        sceneBriefHash,
        movementModes: ["ground-walk"],
        movementModeLabels: ["陆地步行"],
        targets: [{
          id: "visual-target-1",
          visualTargetId: "visual-target-1",
          targetKind: "subject",
          name: "Explorer",
          description: "controlled Subject",
          role: "primary-subject",
          semanticClassId: "visual.subject",
          identityColor: "#E85D5D",
        }, {
          id: "visual-target-2",
          visualTargetId: "visual-target-2",
          targetKind: "landmark",
          name: "Remote landmark",
          description: "occluded remote landmark",
          role: "primary-landmark",
          semanticClassId: "visual.landmark",
          identityColor: "#F28E2B",
        }],
      })),
      sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 220, g: 220, b: 220, alpha: 1 },
        },
      }).composite([{
        input: {
          create: {
            width: 10,
            height: 20,
            channels: 4,
            background: { r: 232, g: 93, b: 93, alpha: 1 },
          },
        },
        left: 45,
        top: 70,
      }]).png().toFile(entryPath),
      writeFile(briefPath, sceneBriefBytes),
    ]);

    const proposal = await deriveNativeWorldBaselineProposalV1({
      sceneId: "missing-native-mask",
      sceneBriefBytes: new TextEncoder().encode(VALID_SCENE_BRIEF),
      visualIdentityPalettePath: palettePath,
      entryWhiteboxTargetPath: entryPath,
    }) as {
      expected: {
        openingComposition: {
          targetRefs: readonly string[];
          regions: readonly unknown[];
          anchors: readonly unknown[];
          orderedTargetRefs: readonly string[];
        };
        semanticSilhouetteTargets: readonly {
          acceptanceTargetRef: string;
          viewRequirements: readonly {
            viewId: string;
            mode: string;
          }[];
        }[];
      };
      formalCaptureIntent: unknown;
      worldBoundsPolicy: unknown;
    };
    expect(proposal.expected.semanticSilhouetteTargets.map(
      ({ acceptanceTargetRef }) => acceptanceTargetRef,
    )).toEqual([
      "worldkit://acceptance-target/visual-target-2@1",
    ]);
    expect(proposal.expected.semanticSilhouetteTargets.find(
      ({ acceptanceTargetRef }) =>
        acceptanceTargetRef ===
          "worldkit://acceptance-target/visual-target-2@1",
    )?.viewRequirements).toEqual([
      { viewId: "opening", mode: "not-required" },
      { viewId: "world-side", mode: "presence-required" },
      { viewId: "world-top-down", mode: "presence-required" },
    ]);
    expect(proposal.expected.openingComposition).toMatchObject({
      targetRefs: [],
      regions: [],
      anchors: [],
      orderedTargetRefs: [],
    });

    const proposalPath = path.join(root, "proposal.json");
    const outputCaseRoot = path.join(root, "prepared-case");
    await writeFile(proposalPath, JSON.stringify(proposal));
    const prepared = await prepareWithPassedPlannerReceipt({
      repositoryRoot: process.cwd(),
      sceneId: "missing-native-mask",
      proposalPath,
      sceneBriefPath: briefPath,
      referenceImagePaths: [entryPath],
      planningImagePaths: {
        worldPlanPath: entryPath,
        entryWhiteboxTargetPath: entryPath,
      },
      visualIdentityPalettePath: palettePath,
      outputCaseRoot,
    });
    const reconstructionCase = parseWorldReconstructionCaseV1(JSON.parse(
      await readFile(prepared.casePath, "utf8"),
    ));
    const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(
      JSON.parse(await readFile(prepared.evaluationProfilePath, "utf8")),
    );
    expect(reconstructionCase.expected.openingComposition.targetRefs).toEqual([]);
    expect(evaluationProfile.thresholds.openingComposition).toEqual({
      regions: [],
      anchors: [],
    });
  });

  it("accepts historical Native target-3 yellow and rejects the Canonical target-3 purple", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-world-palette-profile-"));
    temporaryRoots.push(root);
    const sceneBriefHash = sceneBriefSemanticHash(new TextEncoder().encode(VALID_SCENE_BRIEF));
    const palettePath = path.join(root, "visual-identity-palette.json");
    const entryPath = path.join(root, "entry-whitebox-target.png");
    const palette = {
      kind: "worldkit-visual-identity-palette",
      schemaVersion: 1,
      sceneId: "native-palette-profile",
      sceneBriefHash,
      movementModes: ["ground-walk"],
      movementModeLabels: ["陆地步行"],
      targets: [{
        id: "visual-target-1",
        visualTargetId: "visual-target-1",
        targetKind: "subject",
        name: "Explorer",
        description: "controlled Subject",
        role: "primary-subject",
        semanticClassId: "visual.subject",
        identityColor: "#E85D5D",
      }, {
        id: "visual-target-2",
        visualTargetId: "visual-target-2",
        targetKind: "landmark",
        name: "Gate",
        description: "primary gate",
        role: "primary-landmark",
        semanticClassId: "visual.landmark",
        identityColor: "#F28E2B",
      }, {
        id: "visual-target-3",
        visualTargetId: "visual-target-3",
        targetKind: "landmark",
        name: "Moon",
        description: "remote moon",
        role: "secondary-landmark",
        semanticClassId: "visual.landmark",
        identityColor: "#D9A514",
      }],
    };
    await Promise.all([
      writeFile(palettePath, JSON.stringify(palette)),
      sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 220, g: 220, b: 220, alpha: 1 },
        },
      }).composite([{
        input: { create: {
          width: 10,
          height: 20,
          channels: 4,
          background: { r: 232, g: 93, b: 93, alpha: 1 },
        } },
        left: 45,
        top: 70,
      }, {
        input: { create: {
          width: 10,
          height: 10,
          channels: 4,
          background: { r: 242, g: 142, b: 43, alpha: 1 },
        } },
        left: 20,
        top: 30,
      }, {
        input: { create: {
          width: 10,
          height: 10,
          channels: 4,
          background: { r: 217, g: 165, b: 20, alpha: 1 },
        } },
        left: 70,
        top: 30,
      }]).png().toFile(entryPath),
    ]);

    const nativeProposal = await deriveNativeWorldBaselineProposalV1({
      sceneId: "native-palette-profile",
      sceneBriefBytes: new TextEncoder().encode(VALID_SCENE_BRIEF),
      visualIdentityPalettePath: palettePath,
      entryWhiteboxTargetPath: entryPath,
    }) as { expected: { semanticSilhouetteTargets: readonly {
      acceptanceTargetRef: string;
    }[] } };
    expect(nativeProposal.expected.semanticSilhouetteTargets.map(
      ({ acceptanceTargetRef }) => acceptanceTargetRef,
    )).toContain("worldkit://acceptance-target/visual-target-3@1");

    palette.targets[2]!.identityColor = "#8E6CCF";
    await writeFile(palettePath, JSON.stringify(palette));
    await expect(deriveNativeWorldBaselineProposalV1({
      sceneId: "native-palette-profile",
      sceneBriefBytes: new TextEncoder().encode(VALID_SCENE_BRIEF),
      visualIdentityPalettePath: palettePath,
      entryWhiteboxTargetPath: entryPath,
    })).rejects.toThrow("WORLDKIT_VISUAL_IDENTITY_PALETTE_INVALID");
  });
});
