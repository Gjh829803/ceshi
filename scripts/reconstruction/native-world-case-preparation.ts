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
    maximumRepairAttemptCount: 3,
    builderSelfRepairAttemptCount: 3,
    thresholds: {
      semanticSilhouetteTargets: silhouetteTargets.map(({ acceptanceTargetRef }) => ({
        acceptanceTargetRef,
        maximumBoundsDriftBasisPoints: 1600,
        maximumCenterDriftBasisPoints: 1000,
        maximumCoverageDriftBasisPoints: 1800,
      })),
      openingComposition: {
        regions: opening.regions.map(({ targetRef }) => ({
          targetRef,
          maximumDriftBasisPoints: 1600,
        })),
        anchors: opening.anchors.map(({ targetRef }) => ({
          targetRef,
          maximumDriftBasisPoints: 1000,
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
  const referenceInputs = await Promise.all(input.referenceImagePaths.map(
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
      "Build the complete playable world described by the frozen Scene Brief, Case, references, and Host Bootstrap.",
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
