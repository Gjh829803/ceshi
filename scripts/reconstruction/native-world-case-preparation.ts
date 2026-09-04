import { constants, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  hashFormalWorldCaptureIntentV1,
  parseFormalWorldCaptureIntentV1,
} from "@whitebox-world/runtime-contracts";
import {
  sha256Bytes,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  type WorldReconstructionDimensionIdV1,
} from "@whitebox-world/validation";
import { parseWorldPackageWorldBoundsV1 } from "@whitebox-world/world-package";
import { isNil, sortBy } from "lodash-es";
import sharp from "sharp";

const DIMENSION_IDS = Object.freeze([
  "collider",
  "critical-traversal",
  "deterministic-build",
  "opening-composition",
  "semantic-silhouette",
  "spawn-support",
  "topology",
] as const satisfies readonly WorldReconstructionDimensionIdV1[]);

const EVIDENCE_PROFILE_REF_BY_DIMENSION = Object.freeze({
  collider: "worldkit://evidence-profile/native-block-collider@1",
  "critical-traversal": "worldkit://evidence-profile/native-block-traversal@1",
  "deterministic-build": "worldkit://evidence-profile/native-block-determinism@1",
  "opening-composition": "worldkit://evidence-profile/native-block-opening@1",
  "semantic-silhouette": "worldkit://evidence-profile/native-block-silhouette@1",
  "spawn-support": "worldkit://evidence-profile/native-block-spawn@1",
  topology: "worldkit://evidence-profile/native-block-topology@1",
} as const);

const BASELINE_WORLD_BOUNDS = Object.freeze({
  centerMetersXZ: Object.freeze([0, -32] as const),
  sizeMetersXZ: Object.freeze([128, 128] as const),
  heightRangeMeters: Object.freeze([-16, 64] as const),
});

const BASELINE_ENTRY_GROUND = Object.freeze({
  acceptanceTargetRef: "worldkit://acceptance-target/entry-ground@1",
  compositionTargetRef: "worldkit://composition-target/entry-ground@1",
  visualGroupId: "entry-ground-group",
  topologyNodeId: "entry-ground",
  semanticLayerId: "foreground",
  normalizedBounds: Object.freeze({
    minXBasisPoints: 0,
    minYBasisPoints: 6800,
    maxXBasisPoints: 10000,
    maxYBasisPoints: 10000,
  }),
  normalizedCenter: Object.freeze({ xBasisPoints: 5000, yBasisPoints: 8400 }),
  coverageBasisPoints: 3200,
});

const BASELINE_REMOTE_GROUND = Object.freeze({
  acceptanceTargetRef: "worldkit://acceptance-target/remote-ground@1",
  compositionTargetRef: "worldkit://composition-target/remote-ground@1",
  visualGroupId: "remote-ground-group",
  topologyNodeId: "remote-ground",
  semanticLayerId: "middle",
  normalizedBounds: Object.freeze({
    minXBasisPoints: 800,
    minYBasisPoints: 3600,
    maxXBasisPoints: 9200,
    maxYBasisPoints: 8800,
  }),
  normalizedCenter: Object.freeze({ xBasisPoints: 5000, yBasisPoints: 6200 }),
  coverageBasisPoints: 4368,
});

// The Planner gives generic ground no identity mask. Keep its bindings for
// presence/support/traversal, but never compare Host-invented screen bands as
// if they were reference-image truth in the default report-only profile.
const BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS = 10_000;

function isBaselineGroundAcceptanceTargetRef(targetRef: string): boolean {
  return targetRef === BASELINE_ENTRY_GROUND.acceptanceTargetRef ||
    targetRef === BASELINE_REMOTE_GROUND.acceptanceTargetRef;
}

function isBaselineGroundCompositionTargetRef(targetRef: string): boolean {
  return targetRef === BASELINE_ENTRY_GROUND.compositionTargetRef ||
    targetRef === BASELINE_REMOTE_GROUND.compositionTargetRef;
}

interface NativeWorldVisualPaletteTargetV1 {
  readonly id: string;
  readonly targetKind: string;
  readonly semanticClassId: string;
  readonly identityColor: `#${string}`;
}

interface NativeWorldBaselineVisualTargetV1 {
  readonly acceptanceTargetRef: string;
  readonly compositionTargetRef: string;
  readonly visualGroupId: string;
  readonly topologyNodeId: string;
  readonly semanticLayerId: "foreground" | "middle" | "remote";
  readonly normalizedBounds: Readonly<{
    minXBasisPoints: number;
    minYBasisPoints: number;
    maxXBasisPoints: number;
    maxYBasisPoints: number;
  }>;
  readonly normalizedCenter: Readonly<{
    xBasisPoints: number;
    yBasisPoints: number;
  }>;
  readonly coverageBasisPoints: number;
}

function parseIdentityColor(color: string): readonly [number, number, number] {
  if (!/^#[0-9A-F]{6}$/.test(color)) {
    throw new TypeError("NATIVE_WORLD_BASELINE_PALETTE_INVALID");
  }
  return Object.freeze([
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ]);
}

function parseVisualPaletteTargets(
  value: unknown,
  expectedSceneId: string,
): readonly NativeWorldVisualPaletteTargetV1[] {
  const palette = record(
    value,
    [
      "kind",
      "schemaVersion",
      "sceneId",
      "sceneBriefHash",
      "movementMode",
      "movementModeLabel",
      "targets",
    ],
    "NATIVE_WORLD_BASELINE_PALETTE_INVALID",
  );
  if (
    palette.kind !== "worldkit-visual-identity-palette" ||
    palette.schemaVersion !== 1 ||
    palette.sceneId !== expectedSceneId ||
    !Array.isArray(palette.targets)
  ) {
    throw new TypeError("NATIVE_WORLD_BASELINE_PALETTE_INVALID");
  }
  const targets = palette.targets.map((value, index) => {
    if (isNil(value) || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("NATIVE_WORLD_BASELINE_PALETTE_INVALID");
    }
    const target = value as Record<string, unknown>;
    const id = target.id;
    const targetKind = target.targetKind;
    const semanticClassId = target.semanticClassId;
    const identityColor = target.identityColor;
    if (
      typeof id !== "string" ||
      typeof targetKind !== "string" ||
      typeof semanticClassId !== "string" ||
      typeof identityColor !== "string" ||
      !/^visual-target-[1-5]$/.test(id) ||
      !/^#[0-9A-F]{6}$/.test(identityColor) ||
      (index === 0 && targetKind !== "subject")
    ) {
      throw new TypeError("NATIVE_WORLD_BASELINE_PALETTE_INVALID");
    }
    return Object.freeze({
      id,
      targetKind,
      semanticClassId,
      identityColor: identityColor as `#${string}`,
    });
  });
  if (
    targets.filter(({ targetKind }) => targetKind === "subject").length !== 1 ||
    new Set(targets.map(({ id }) => id)).size !== targets.length ||
    new Set(targets.map(({ identityColor }) => identityColor)).size !== targets.length
  ) {
    throw new TypeError("NATIVE_WORLD_BASELINE_PALETTE_INVALID");
  }
  return Object.freeze(targets);
}

function targetLayerFromCenterY(
  yBasisPoints: number,
): NativeWorldBaselineVisualTargetV1["semanticLayerId"] {
  if (yBasisPoints >= 6500) return "foreground";
  if (yBasisPoints <= 3500) return "remote";
  return "middle";
}

async function measurePaletteTarget(
  imagePath: string,
  target: NativeWorldVisualPaletteTargetV1,
): Promise<NativeWorldBaselineVisualTargetV1> {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [red, green, blue] = parseIdentityColor(target.identityColor);
  let minimumX = info.width;
  let minimumY = info.height;
  let maximumX = -1;
  let maximumY = -1;
  let pixelCount = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      if (
        Math.abs(data[offset]! - red) > 24 ||
        Math.abs(data[offset + 1]! - green) > 24 ||
        Math.abs(data[offset + 2]! - blue) > 24 ||
        data[offset + 3]! === 0
      ) continue;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
      pixelCount += 1;
    }
  }
  const hasMeasuredMask = pixelCount > 0;
  const normalizedBounds = hasMeasuredMask
    ? Object.freeze({
      minXBasisPoints: Math.floor(minimumX * 10000 / info.width),
      minYBasisPoints: Math.floor(minimumY * 10000 / info.height),
      maxXBasisPoints: Math.ceil((maximumX + 1) * 10000 / info.width),
      maxYBasisPoints: Math.ceil((maximumY + 1) * 10000 / info.height),
    })
    : Object.freeze({
      minXBasisPoints: 2500,
      minYBasisPoints: 1200,
      maxXBasisPoints: 7500,
      maxYBasisPoints: 5200,
    });
  const normalizedCenter = Object.freeze({
    xBasisPoints: Math.round(
      (normalizedBounds.minXBasisPoints + normalizedBounds.maxXBasisPoints) / 2,
    ),
    yBasisPoints: Math.round(
      (normalizedBounds.minYBasisPoints + normalizedBounds.maxYBasisPoints) / 2,
    ),
  });
  return Object.freeze({
    acceptanceTargetRef: `worldkit://acceptance-target/${target.id}@1`,
    compositionTargetRef: `worldkit://composition-target/${target.id}@1`,
    visualGroupId: `${target.id}-group`,
    topologyNodeId: target.id,
    semanticLayerId: targetLayerFromCenterY(normalizedCenter.yBasisPoints),
    normalizedBounds,
    normalizedCenter,
    coverageBasisPoints: hasMeasuredMask
      ? Math.max(1, Math.round(pixelCount * 10000 / (info.width * info.height)))
      : 2000,
  });
}

/**
 * Derives the deliberately small report-only Case that replaces the former
 * model-authored Native Case Mapping stage. The Host owns this fixed frame;
 * the Builder still owns all scene geometry inside it.
 */
export async function deriveNativeWorldBaselineProposalV1(input: Readonly<{
  sceneId: string;
  visualIdentityPalettePath: string;
  entryWhiteboxTargetPath: string;
}>): Promise<unknown> {
  const palette = parseVisualPaletteTargets(
    JSON.parse(await readFile(input.visualIdentityPalettePath, "utf8")),
    input.sceneId,
  );
  const landmarkTargets = await Promise.all(
    palette.filter(({ targetKind }) => targetKind !== "subject")
      .map((target) => measurePaletteTarget(input.entryWhiteboxTargetPath, target)),
  );
  const visualTargets = sortBy([
    BASELINE_ENTRY_GROUND,
    BASELINE_REMOTE_GROUND,
    ...landmarkTargets,
  ], ({ acceptanceTargetRef }) => acceptanceTargetRef);
  const targetRefs = visualTargets.map(({ compositionTargetRef }) =>
    compositionTargetRef);
  const semanticLayerIds = sortBy([
    ...new Set(visualTargets.map(({ semanticLayerId }) => semanticLayerId)),
  ]);
  const orderedTargetRefs = [
    BASELINE_ENTRY_GROUND,
    BASELINE_REMOTE_GROUND,
    ...sortBy(landmarkTargets, ({ normalizedCenter }) =>
      -normalizedCenter.yBasisPoints),
  ].map(({ compositionTargetRef }) => compositionTargetRef);
  const entryAcceptanceTargetRef = BASELINE_ENTRY_GROUND.acceptanceTargetRef;
  const remoteAcceptanceTargetRef = BASELINE_REMOTE_GROUND.acceptanceTargetRef;
  const traversalCheckId = "entry-to-remote-ground-pass";
  const checkpointId = "remote-ground-arrival";
  const expected = Object.freeze({
    topology: Object.freeze({
      acceptanceTargetRef: remoteAcceptanceTargetRef,
      nodeIds: sortBy(visualTargets.map(({ topologyNodeId }) => topologyNodeId)),
      relations: Object.freeze([Object.freeze({
        fromNodeId: BASELINE_ENTRY_GROUND.topologyNodeId,
        relation: "connects-to" as const,
        toNodeId: BASELINE_REMOTE_GROUND.topologyNodeId,
      })]),
      layerIds: Object.freeze(semanticLayerIds),
    }),
    semanticSilhouetteTargets: Object.freeze(visualTargets.map((target) =>
      Object.freeze({
        acceptanceTargetRef: target.acceptanceTargetRef,
        visualGroupId: target.visualGroupId,
        normalizedBounds: target.normalizedBounds,
        normalizedCenter: target.normalizedCenter,
        coverageBasisPoints: target.coverageBasisPoints,
      }))),
    openingComposition: Object.freeze({
      acceptanceTargetRef: remoteAcceptanceTargetRef,
      targetRefs: Object.freeze(targetRefs),
      regions: Object.freeze(visualTargets.map((target) => Object.freeze({
        targetRef: target.compositionTargetRef,
        normalizedBounds: target.normalizedBounds,
      }))),
      anchors: Object.freeze(visualTargets.map((target) => Object.freeze({
        targetRef: target.compositionTargetRef,
        normalizedCenter: target.normalizedCenter,
      }))),
      orderedTargetRefs: Object.freeze(orderedTargetRefs),
    }),
    spawnSupport: Object.freeze({
      acceptanceTargetRef: entryAcceptanceTargetRef,
      spawnMarkerId: "entry-spawn",
      supportColliderId: "collider-entry-ground",
      expectedMedium: "ground" as const,
      expectedPositionXYZMeters: Object.freeze({
        xMeters: 0,
        yMeters: 0,
        zMeters: 0,
      }),
    }),
    colliders: Object.freeze(sortBy([
      Object.freeze({
        acceptanceTargetRef: entryAcceptanceTargetRef,
        contributionId: "collider-entry-ground",
        colliderId: "collider-entry-ground",
        role: "ground" as const,
        requiresOverlay: true,
      }),
      Object.freeze({
        acceptanceTargetRef: remoteAcceptanceTargetRef,
        contributionId: "collider-remote-ground",
        colliderId: "collider-remote-ground",
        role: "ground" as const,
        requiresOverlay: true,
      }),
      ...landmarkTargets.map((target) => {
        const colliderId = `collider-${target.topologyNodeId}-solid`;
        return Object.freeze({
          acceptanceTargetRef: target.acceptanceTargetRef,
          contributionId: colliderId,
          colliderId,
          role: "blocker" as const,
          requiresOverlay: true,
        });
      }),
    ], ({ contributionId }) => contributionId)),
    groundConnectivity: Object.freeze({
      requireSingleReachableComponent: true,
      requiredTraversalBands: Object.freeze([Object.freeze({
        acceptanceTargetRef: remoteAcceptanceTargetRef,
        id: "entry-to-remote-ground-band",
        centerlineStandPositionsXYZMeters: Object.freeze([
          Object.freeze({ xMeters: 0, yMeters: 0, zMeters: 0 }),
          Object.freeze({ xMeters: 0, yMeters: 0, zMeters: -4 }),
          Object.freeze({ xMeters: 0, yMeters: 0, zMeters: -8 }),
          Object.freeze({ xMeters: 0, yMeters: 0, zMeters: -12 }),
        ]),
        halfWidthMeters: 1.5,
      })]),
    }),
    criticalTraversalChecks: Object.freeze([Object.freeze({
      acceptanceTargetRef: remoteAcceptanceTargetRef,
      id: traversalCheckId,
      evidenceKind: "scripted-fixed-input" as const,
      expectation: "pass" as const,
      checkpointIds: Object.freeze([checkpointId]),
      fixedInputSequence: Object.freeze([Object.freeze({
        actions: Object.freeze(["move-forward"]),
        axes: Object.freeze({ moveYRatio: 1 }),
        ticks: 300,
      })]),
    })]),
    deterministicBuild: Object.freeze({
      acceptanceTargetRef: remoteAcceptanceTargetRef,
      requiresCandidateReplay: true as const,
      requiresWorldPackageIdentityAgreement: true as const,
      requiresBuildIdentityAgreement: true as const,
      requiresCaptureIdentityAgreement: true as const,
    }),
  });
  return Object.freeze({
    kind: "native-world-case-proposal",
    schemaVersion: 1,
    sceneId: input.sceneId,
    expected,
    formalCaptureIntent: Object.freeze({
      kind: "formal-world-capture-intent",
      schemaVersion: 1,
      id: `${input.sceneId}.formal-world-capture-intent`,
      captureProfile: Object.freeze({
        widthPixels: 1280,
        heightPixels: 720,
        devicePixelRatio: 1,
      }),
      semanticCaptureTargetBindings: Object.freeze(visualTargets.map((target) =>
        Object.freeze({
          acceptanceTargetRef: target.acceptanceTargetRef,
          compositionTargetRef: target.compositionTargetRef,
          topologyNodeId: target.topologyNodeId,
          semanticLayerId: target.semanticLayerId,
          blockVisualGroupId: target.visualGroupId,
        }))),
      topologyRelations: Object.freeze([Object.freeze({
        fromNodeId: BASELINE_ENTRY_GROUND.topologyNodeId,
        relation: "connects-to" as const,
        toNodeId: BASELINE_REMOTE_GROUND.topologyNodeId,
        measurementSource: "scripted-traversal" as const,
        traversalCheckId,
      })]),
      checkpointSpatialCriteria: Object.freeze([Object.freeze({
        kind: "reach-bounds" as const,
        checkpointId,
        expectation: "reach" as const,
        sourceVisualGroupId: BASELINE_REMOTE_GROUND.visualGroupId,
        capsuleRadiusMeters: 0.35,
        toleranceMeters: 0.05,
      })]),
    }),
    worldBounds: BASELINE_WORLD_BOUNDS,
  });
}

function record(value: unknown, fields: readonly string[], code: string) {
  if (isNil(value) || typeof value !== "object" || Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(code);
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new TypeError(code);
  }
  return input;
}

function mediaType(filePath: string): "image/png" | "image/jpeg" {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  throw new TypeError("NATIVE_WORLD_REFERENCE_MEDIA_TYPE_INVALID");
}

function parseNativeWorldCaseWorldBoundsV1(value: unknown) {
  try {
    return parseWorldPackageWorldBoundsV1(value);
  } catch (error) {
    const receivedFields = isNil(value) || typeof value !== "object" ||
        Array.isArray(value) || Reflect.getPrototypeOf(value) !== Object.prototype
      ? "<non-record>"
      : sortBy(Object.keys(value as Record<string, unknown>)).join(", ") ||
        "<none>";
    throw new TypeError(
      "NATIVE_WORLD_CASE_WORLD_BOUNDS_INVALID: expected exactly " +
        "centerMetersXZ, sizeMetersXZ, heightRangeMeters; received " +
        `${receivedFields}; Formal Capture AABB fields are not Package worldBounds`,
      { cause: error },
    );
  }
}

async function writeCanonicalExclusive(filePath: string, value: unknown) {
  await writeFile(filePath, stringifyCanonicalJson(value), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

export interface PreparedNativeWorldCaseV1 {
  readonly casePath: string;
  readonly evaluationProfilePath: string;
  readonly formalCaptureIntentPath: string;
}

export async function prepareNativeWorldCaseV1(input: Readonly<{
  repositoryRoot: string;
  sceneId: string;
  proposalPath: string;
  sceneBriefPath: string;
  referenceImagePaths: readonly string[];
  planningImagePaths: Readonly<{
    worldPlanPath: string;
    entryWhiteboxTargetPath: string;
  }>;
  outputCaseRoot: string;
}>): Promise<PreparedNativeWorldCaseV1> {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(input.sceneId)) {
    throw new TypeError("NATIVE_WORLD_CASE_SCENE_ID_INVALID");
  }
  const proposal = record(
    JSON.parse(await readFile(input.proposalPath, "utf8")),
    ["kind", "schemaVersion", "sceneId", "expected", "formalCaptureIntent", "worldBounds"],
    "NATIVE_WORLD_CASE_PROPOSAL_INVALID",
  );
  if (proposal.kind !== "native-world-case-proposal" ||
    proposal.schemaVersion !== 1 || proposal.sceneId !== input.sceneId) {
    throw new TypeError("NATIVE_WORLD_CASE_PROPOSAL_INVALID");
  }
  const formalCaptureIntent = parseFormalWorldCaptureIntentV1(
    proposal.formalCaptureIntent,
  );
  if (formalCaptureIntent.id !==
    `${input.sceneId}.formal-world-capture-intent`) {
    throw new TypeError("NATIVE_WORLD_CAPTURE_INTENT_IDENTITY_INVALID");
  }
  const worldBounds = parseNativeWorldCaseWorldBoundsV1(proposal.worldBounds);
  const briefBytes = await readFile(input.sceneBriefPath);

  const acceptanceTargetRefs = sortBy([...new Set([
    (proposal.expected as { topology?: { acceptanceTargetRef?: unknown } })
      .topology?.acceptanceTargetRef,
    ...((proposal.expected as { semanticSilhouetteTargets?: unknown[] })
      .semanticSilhouetteTargets ?? []).map((value) =>
        (value as { acceptanceTargetRef?: unknown }).acceptanceTargetRef
      ),
    (proposal.expected as { openingComposition?: { acceptanceTargetRef?: unknown } })
      .openingComposition?.acceptanceTargetRef,
    (proposal.expected as { spawnSupport?: { acceptanceTargetRef?: unknown } })
      .spawnSupport?.acceptanceTargetRef,
    ...((proposal.expected as { colliders?: unknown[] }).colliders ?? []).map(
      (value) => (value as { acceptanceTargetRef?: unknown }).acceptanceTargetRef,
    ),
    ...((proposal.expected as { criticalTraversalChecks?: unknown[] })
      .criticalTraversalChecks ?? []).map((value) =>
        (value as { acceptanceTargetRef?: unknown }).acceptanceTargetRef
      ),
    ...((proposal.expected as {
      groundConnectivity?: {
        requiredTraversalBands?: unknown[];
      };
    }).groundConnectivity?.requiredTraversalBands ?? []).map((value) =>
      (value as { acceptanceTargetRef?: unknown }).acceptanceTargetRef
    ),
    (proposal.expected as { deterministicBuild?: { acceptanceTargetRef?: unknown } })
      .deterministicBuild?.acceptanceTargetRef,
  ].filter((value): value is string => typeof value === "string"))]);

  const silhouetteTargets = (proposal.expected as {
    semanticSilhouetteTargets?: readonly Readonly<{
      acceptanceTargetRef: string;
    }>[];
  }).semanticSilhouetteTargets ?? [];
  const opening = (proposal.expected as {
    openingComposition?: Readonly<{
      regions: readonly Readonly<{ targetRef: string }>[];
      anchors: readonly Readonly<{ targetRef: string }>[];
    }>;
  }).openingComposition;
  if (silhouetteTargets.length === 0 || opening === undefined) {
    throw new TypeError("NATIVE_WORLD_CASE_PROPOSAL_INVALID");
  }
  const evaluationProfile = parseWorldReconstructionEvaluationProfileV1({
    kind: "world-reconstruction-evaluation-profile",
    schemaVersion: 1,
    id: `${input.sceneId}-profile`,
    dimensionIds: DIMENSION_IDS,
    qualityGateMode: "report-only",
    maximumRepairAttemptCount: 3,
    builderSelfRepairAttemptCount: 3,
    thresholds: {
      semanticSilhouetteTargets: silhouetteTargets.map(({ acceptanceTargetRef }) => ({
        acceptanceTargetRef,
        maximumBoundsDriftBasisPoints:
          isBaselineGroundAcceptanceTargetRef(acceptanceTargetRef)
            ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
            : 1600,
        maximumCenterDriftBasisPoints:
          isBaselineGroundAcceptanceTargetRef(acceptanceTargetRef)
            ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
            : 1000,
        maximumCoverageDriftBasisPoints:
          isBaselineGroundAcceptanceTargetRef(acceptanceTargetRef)
            ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
            : 1800,
      })),
      openingComposition: {
        regions: opening.regions.map(({ targetRef }) => ({
          targetRef,
          maximumDriftBasisPoints:
            isBaselineGroundCompositionTargetRef(targetRef)
              ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
              : 1600,
        })),
        anchors: opening.anchors.map(({ targetRef }) => ({
          targetRef,
          maximumDriftBasisPoints:
            isBaselineGroundCompositionTargetRef(targetRef)
              ? BASELINE_PRESENCE_ONLY_DRIFT_BASIS_POINTS
              : 1000,
        })),
      },
      spawnSupport: {
        maximumPositionDriftMillimeters: 250,
        maximumSupportGapMillimeters: 50,
      },
    },
    requiredEvidenceByDimension: DIMENSION_IDS.map((dimensionId) => ({
      dimensionId,
      evidenceProfileRefs: [EVIDENCE_PROFILE_REF_BY_DIMENSION[dimensionId]],
    })),
  });
  const uploadedReferenceInputs = await Promise.all(input.referenceImagePaths.map(
    async (sourcePath, index) => {
      const bytes = await readFile(sourcePath);
      const type = mediaType(sourcePath);
      return Object.freeze({
        sourcePath,
        bytes,
        row: Object.freeze({
          inputRef: `reference-${index}.${type === "image/png" ? "png" : "jpg"}`,
          contentHash: sha256Bytes(bytes) as Sha256HashV1,
          mediaType: type,
        }),
      });
    },
  ));
  const planningReferenceInputs = await Promise.all([{
    sourcePath: input.planningImagePaths.entryWhiteboxTargetPath,
    inputRef: "entry-whitebox-target.png",
  }, {
    sourcePath: input.planningImagePaths.worldPlanPath,
    inputRef: "world-plan.png",
  }].map(async ({ sourcePath, inputRef }) => {
    if (mediaType(sourcePath) !== "image/png") {
      throw new TypeError("NATIVE_WORLD_PLANNING_IMAGE_MEDIA_TYPE_INVALID");
    }
    const bytes = await readFile(sourcePath);
    return Object.freeze({
      sourcePath,
      bytes,
      row: Object.freeze({
        inputRef,
        contentHash: sha256Bytes(bytes) as Sha256HashV1,
        mediaType: "image/png" as const,
      }),
    });
  }));
  const referenceInputs = sortBy(
    [...uploadedReferenceInputs, ...planningReferenceInputs],
    ({ row }) => row.inputRef,
  );
  const requiredEvidenceProfileRefs = sortBy(
    Object.values(EVIDENCE_PROFILE_REF_BY_DIMENSION),
  );
  const reconstructionCase = parseWorldReconstructionCaseV1({
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: input.sceneId,
    sceneBriefRef: "scene-brief.md",
    sceneBriefHash: sha256Bytes(briefBytes),
    referenceInputs: referenceInputs.map(({ row }) => row),
    evaluationProfileRef: "evaluation-profile.json",
    evaluationProfileHash:
      hashWorldReconstructionEvaluationProfileV1(evaluationProfile),
    formalCaptureIntentRef: "inputs/formal-world-capture-intent.json",
    formalCaptureIntentHash: hashFormalWorldCaptureIntentV1(formalCaptureIntent),
    acceptanceTargetRefs,
    requiredEvidenceProfileRefs,
    expected: proposal.expected,
  });
  const mismatchedColliderIdentity = reconstructionCase.expected.colliders.find(
    ({ contributionId, colliderId }) => contributionId !== colliderId,
  );
  if (!isNil(mismatchedColliderIdentity)) {
    throw new TypeError(
      "NATIVE_WORLD_CASE_COLLIDER_IDENTITY_INVALID: Babylon Native static " +
        "Collider contributionId must equal colliderId; received " +
        `${mismatchedColliderIdentity.contributionId} and ` +
        mismatchedColliderIdentity.colliderId,
    );
  }

  const inputRoot = path.join(input.outputCaseRoot, "inputs");
  const skillRoot = path.join(inputRoot, "builder-skill");
  await Promise.all([
    mkdir(path.join(skillRoot, "references"), { recursive: true, mode: 0o700 }),
    mkdir(path.join(skillRoot, "scripts"), { recursive: true, mode: 0o700 }),
  ]);
  const casePath = path.join(input.outputCaseRoot, "case.json");
  const evaluationProfilePath = path.join(
    input.outputCaseRoot,
    "evaluation-profile.json",
  );
  const formalCaptureIntentPath = path.join(
    inputRoot,
    "formal-world-capture-intent.json",
  );
  const frozenInputFixtureRoot = path.join(
    input.repositoryRoot,
    "artifacts/scenes/cloud-temple-t-gate-native-block/inputs",
  );
  await Promise.all([
    writeCanonicalExclusive(casePath, reconstructionCase),
    writeCanonicalExclusive(evaluationProfilePath, evaluationProfile),
    writeCanonicalExclusive(formalCaptureIntentPath, formalCaptureIntent),
    writeCanonicalExclusive(path.join(inputRoot, "world-bounds.json"), worldBounds),
    writeFile(path.join(inputRoot, "scene-brief.md"), briefBytes, { flag: "wx" }),
    writeFile(path.join(inputRoot, "task-instruction.md"), [
      "# Native Block generation request",
      "",
      "Build the complete playable world described by the frozen Scene Brief, uploaded references, world-plan.png, entry-whitebox-target.png, and Host Bootstrap.",
      "Write exactly scene.ts, native-block-authoring.json, and native-resources.json.",
      "Implement every Case visual group and every explicit required Collider contribution exactly once.",
      "Never reconstruct the controlled Subject, rider, mount, avatar, character, or body parts as Native Block geometry; RuntimeHost creates the SDK Subject separately.",
      "Keep the Spawn supported and preserve every fixed-input pass or block check without adding undeclared input.",
      "For a ground Case, preserve every frozen groundConnectivity band and keep the complete explicitly contributed support surface in one Spawn-reachable component.",
      "Do not create Runtime, physics, camera, input, timers, gameplay entities, Package, Capture, Receipt, or thresholds.",
      "Do not alter any frozen input. Formal Capture Intent remains Host-only.",
      "",
    ].join("\n"), { encoding: "utf8", flag: "wx" }),
    ...["native-scene-api.json", "native-scene-profile.json", "block-profile.json"]
      .map((fileName) => copyFile(
        path.join(frozenInputFixtureRoot, fileName),
        path.join(inputRoot, fileName),
        constants.COPYFILE_EXCL,
      )),
    copyFile(
      path.join(input.repositoryRoot, ".codex/skills/worldkit-native-block-builder/SKILL.md"),
      path.join(skillRoot, "SKILL.md"),
      constants.COPYFILE_EXCL,
    ),
    copyFile(
      path.join(input.repositoryRoot, ".codex/skills/worldkit-native-block-builder/references/native-block-output-contract.md"),
      path.join(skillRoot, "references/native-block-output-contract.md"),
      constants.COPYFILE_EXCL,
    ),
    copyFile(
      path.join(input.repositoryRoot, ".codex/skills/worldkit-native-block-builder/scripts/self-check.mjs"),
      path.join(skillRoot, "scripts/self-check.mjs"),
      constants.COPYFILE_EXCL,
    ),
    ...referenceInputs.map(({ sourcePath, row }) => copyFile(
      sourcePath,
      path.join(inputRoot, row.inputRef),
      constants.COPYFILE_EXCL,
    )),
  ]);
  return Object.freeze({
    casePath,
    evaluationProfilePath,
    formalCaptureIntentPath,
  });
}
