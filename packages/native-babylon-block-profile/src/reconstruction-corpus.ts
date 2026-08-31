import type {
  BabylonNativeSceneBuildContextV1,
  BabylonNativeTraversalBindingV1,
} from "@whitebox-world/native-babylon";
import { isEmpty, isNil } from "lodash-es";

import type { BabylonNativeBlockAuthoringCaptureV1 } from "./authoring-capture.js";
import type { BabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import type { BabylonNativeBlockColliderCandidateInventoryEntryV1 } from
  "./collider-contribution.js";
import type { BabylonNativeBlockPaletteRoleV1 } from "./profile.js";
import {
  createBabylonNativeBlockProfileSessionV1,
  type BabylonNativeBlockFinalizedEpochV1,
  type BabylonNativeBlockProfileSessionV1,
} from "./session.js";
import type {
  BabylonNativeBlockPositionMetersXYZV1,
  BabylonNativeBlockShapeKindV1,
} from "./shapes.js";

export const BABYLON_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_IDS_V1 =
  Object.freeze([
    "mountain-cliff",
    "t-shaped-traversal",
    "ordinary-and-blocked-steps",
    "building-exterior",
    "limited-interior",
    "overlap-occupancy",
    "out-of-budget",
    "invalid-traversal-binding",
    "unsupported-spawn",
    "disconnected-route",
    "cleanup-throw-partial",
  ] as const);

export type BabylonNativeBlockReconstructionCorpusCaseIdV1 =
  (typeof BABYLON_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_IDS_V1)[number];

export type BabylonNativeBlockReconstructionCorpusPolarityV1 =
  | "positive"
  | "negative";

export type BabylonNativeBlockReconstructionCorpusFamilyV1 =
  | "mountain"
  | "t-shaped"
  | "steps"
  | "building"
  | "limited-interior"
  | "negative";

export interface BabylonNativeBlockReconstructionCorpusCaseV1 {
  readonly kind: "babylon-native-block-reconstruction-corpus-case";
  readonly schemaVersion: 1;
  readonly id: BabylonNativeBlockReconstructionCorpusCaseIdV1;
  readonly seed: number;
  readonly polarity: BabylonNativeBlockReconstructionCorpusPolarityV1;
  readonly family: BabylonNativeBlockReconstructionCorpusFamilyV1;
  readonly expectedFailureCode?: string;
}

export interface BabylonNativeBlockReconstructionCorpusSpawnV1 {
  readonly positionMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly facingRadians: number;
}

export interface BabylonNativeBlockReconstructionCorpusOpeningV1 {
  readonly positionMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly targetMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly fovDegrees: number;
}

export type BabylonNativeBlockReconstructionCorpusMaterializationV1 =
  | Readonly<{
      outcome: "finalized";
      epoch: BabylonNativeBlockFinalizedEpochV1;
      spawn: BabylonNativeBlockReconstructionCorpusSpawnV1;
      opening: BabylonNativeBlockReconstructionCorpusOpeningV1;
    }>
  | Readonly<{
      outcome: "rejected";
      code: string;
      failureMessage: string;
    }>;

export interface BabylonNativeBlockReconstructionCorpusEvidenceIndexV1 {
  readonly kind: "babylon-native-block-reconstruction-corpus-evidence-index";
  readonly schemaVersion: 1;
  readonly caseId: BabylonNativeBlockReconstructionCorpusCaseIdV1;
  readonly seed: number;
  readonly polarity: BabylonNativeBlockReconstructionCorpusPolarityV1;
  readonly expectedFailureCode?: string;
  readonly authoringCapture?: BabylonNativeBlockAuthoringCaptureV1;
  readonly checkResult?: BabylonNativeBlockProfileCheckResultV1;
  readonly colliderInventory?:
    readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
  readonly isFormalCapturePublished: false;
  readonly isFormalRoutePublished: false;
  readonly isRoomVisibilityClaimed: false;
  readonly isMultilayerNavigationClaimed: false;
  readonly isCavesClaimed: false;
  readonly isBridgeUnderpassClaimed: false;
  readonly isNpcNavClaimed: false;
  readonly isGotoClaimed: false;
  readonly isThinInstanceOptimized: false;
}

interface CorpusBlockSpecV1 {
  readonly id: string;
  readonly shape: BabylonNativeBlockShapeKindV1;
  readonly paletteRole: BabylonNativeBlockPaletteRoleV1;
  readonly visualGroupId?: string;
  readonly centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
}

type ColliderModeV1 = "layout" | "invalid-binding";

interface CorpusRecordV1 {
  readonly id: BabylonNativeBlockReconstructionCorpusCaseIdV1;
  readonly seed: number;
  readonly polarity: BabylonNativeBlockReconstructionCorpusPolarityV1;
  readonly family: BabylonNativeBlockReconstructionCorpusFamilyV1;
  readonly maximumBlockCount: number;
  readonly blocks: readonly CorpusBlockSpecV1[];
  readonly extraBlock?: CorpusBlockSpecV1;
  readonly notTraversableBlockIds: readonly string[];
  readonly colliderMode: ColliderModeV1;
  readonly spawn: BabylonNativeBlockReconstructionCorpusSpawnV1;
  readonly opening: BabylonNativeBlockReconstructionCorpusOpeningV1;
  readonly expectedFailureCode?: string;
}

const GROUND_STATIC = Object.freeze({
  kind: "static-surface" as const,
  logicalSubshapeId: "top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});

const DEFAULT_OPENING = Object.freeze({
  positionMetersXYZ: Object.freeze([0, 1.8, 4] as const),
  targetMetersXYZ: Object.freeze([0, 0.4, -2] as const),
  fovDegrees: 55,
});

const SUPPORTED_SPAWN = Object.freeze({
  positionMetersXYZ: Object.freeze([0, 0, 0] as const),
  facingRadians: 0,
});

function block(
  id: string,
  shape: BabylonNativeBlockShapeKindV1,
  paletteRole: BabylonNativeBlockPaletteRoleV1,
  centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1,
  visualGroupId?: string,
): CorpusBlockSpecV1 {
  return Object.freeze({
    id,
    shape,
    paletteRole,
    centerMetersXYZ,
    ...(isNil(visualGroupId) ? {} : { visualGroupId }),
  });
}

function record(input: CorpusRecordV1): CorpusRecordV1 {
  return Object.freeze({
    ...input,
    blocks: Object.freeze([...input.blocks]),
    notTraversableBlockIds: Object.freeze([...input.notTraversableBlockIds]),
    spawn: Object.freeze(input.spawn),
    opening: Object.freeze(input.opening),
    ...(isNil(input.extraBlock) ? {} : { extraBlock: input.extraBlock }),
    ...(isNil(input.expectedFailureCode)
      ? {}
      : { expectedFailureCode: input.expectedFailureCode }),
  });
}

const ORDINARY_AND_BLOCKED_STEPS = record({
  id: "ordinary-and-blocked-steps",
  seed: 202608313,
  polarity: "positive",
  family: "steps",
  maximumBlockCount: 6,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([]),
  spawn: SUPPORTED_SPAWN,
  opening: DEFAULT_OPENING,
  blocks: Object.freeze([
    block("ground-positive-one", "full", "ground", [0, -0.5, 1]),
    block("ground-zero", "full", "ground", [0, -0.5, 0]),
    block("ground-negative-one", "full", "ground", [0, -0.5, -1]),
    block("quarter-meter-rise", "step", "ground", [0, 0.125, -2]),
    block("elevated-tread", "step", "ground", [0, 0.125, -3]),
    block("half-meter-blocker", "half", "ground", [0, 0.5, -4]),
  ]),
});

const T_SHAPED_TRAVERSAL = record({
  id: "t-shaped-traversal",
  seed: 202608312,
  polarity: "positive",
  family: "t-shaped",
  maximumBlockCount: 12,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([
    "t-west-foundation",
    "t-west-wall",
    "t-north-foundation",
    "t-north-wall",
  ]),
  spawn: SUPPORTED_SPAWN,
  opening: Object.freeze({
    positionMetersXYZ: Object.freeze([0, 2.2, 5] as const),
    targetMetersXYZ: Object.freeze([0, 0.3, -2] as const),
    fovDegrees: 55,
  }),
  blocks: Object.freeze([
    block("t-spine-south", "full", "route", [0, -0.5, 1], "t-route"),
    block("t-spine-spawn", "full", "route", [0, -0.5, 0], "t-route"),
    block("t-spine-mid", "full", "route", [0, -0.5, -1], "t-route"),
    block("t-spine-junction", "full", "route", [0, -0.5, -2], "t-route"),
    block("t-arm-west-1", "full", "route", [-1, -0.5, -2], "t-route"),
    block("t-arm-west-2", "full", "route", [-2, -0.5, -2], "t-route"),
    block("t-arm-east-1", "full", "route", [1, -0.5, -2], "t-route"),
    block("t-arm-east-2", "full", "route", [2, -0.5, -2], "t-route"),
    block("t-west-foundation", "full", "structure", [-3, -0.5, -2], "t-west-wall"),
    block("t-west-wall", "full", "structure", [-3, 0.5, -2], "t-west-wall"),
    block("t-north-foundation", "full", "structure", [0, -0.5, -3], "t-north-wall"),
    block("t-north-wall", "full", "structure", [0, 0.5, -3], "t-north-wall"),
  ]),
});

const MOUNTAIN_CLIFF = record({
  id: "mountain-cliff",
  seed: 202608311,
  polarity: "positive",
  family: "mountain",
  maximumBlockCount: 12,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([
    "m-cliff-base-s",
    "m-cliff-base-m",
    "m-cliff-base-n",
    "m-cliff-mid-s",
    "m-cliff-mid-m",
    "m-cliff-mid-n",
  ]),
  spawn: SUPPORTED_SPAWN,
  opening: Object.freeze({
    positionMetersXYZ: Object.freeze([3, 2.8, 5] as const),
    targetMetersXYZ: Object.freeze([-1, 0.6, -2] as const),
    fovDegrees: 55,
  }),
  blocks: Object.freeze([
    block("m-route-south", "full", "route", [0, -0.5, 1], "m-route"),
    block("m-route-spawn", "full", "route", [0, -0.5, 0], "m-route"),
    block("m-route-north", "full", "route", [0, -0.5, -1], "m-route"),
    block("m-step-rise", "step", "route", [0, 0.125, -2], "m-route"),
    block("m-step-tread", "step", "route", [0, 0.125, -3], "m-route"),
    block("m-overlook", "step", "route", [0, 0.125, -4], "m-route"),
    block("m-cliff-base-s", "full", "background-mass", [-1, -0.5, 0], "m-cliff"),
    block("m-cliff-base-m", "full", "background-mass", [-1, -0.5, -1], "m-cliff"),
    block("m-cliff-base-n", "full", "background-mass", [-1, -0.5, -2], "m-cliff"),
    block("m-cliff-mid-s", "full", "background-mass", [-1, 0.5, 0], "m-cliff"),
    block("m-cliff-mid-m", "full", "background-mass", [-1, 0.5, -1], "m-cliff"),
    block("m-cliff-mid-n", "full", "background-mass", [-1, 0.5, -2], "m-cliff"),
  ]),
});

const BUILDING_EXTERIOR = record({
  id: "building-exterior",
  seed: 202608314,
  polarity: "positive",
  family: "building",
  maximumBlockCount: 8,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([
    "b-wall-west",
    "b-wall-east",
    "b-wall-back",
  ]),
  spawn: SUPPORTED_SPAWN,
  opening: Object.freeze({
    positionMetersXYZ: Object.freeze([0, 1.7, 3.5] as const),
    targetMetersXYZ: Object.freeze([0, 0.4, -2] as const),
    fovDegrees: 55,
  }),
  blocks: Object.freeze([
    block("b-pad-south", "full", "ground", [0, -0.5, 1]),
    block("b-pad-spawn", "full", "ground", [0, -0.5, 0]),
    block("b-pad-mid", "full", "ground", [0, -0.5, -1]),
    block("b-threshold", "step", "ground", [0, 0.125, -2]),
    block("b-door-sill", "step", "ground", [0, 0.125, -3]),
    block("b-wall-west", "full", "structure", [-1, 0.5, -3], "building-shell"),
    block("b-wall-east", "full", "structure", [1, 0.5, -3], "building-shell"),
    block("b-wall-back", "full", "structure", [0, 0.5, -4], "building-shell"),
  ]),
});

const LIMITED_INTERIOR = record({
  id: "limited-interior",
  seed: 202608315,
  polarity: "positive",
  family: "limited-interior",
  maximumBlockCount: 10,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([
    "i-wall-west",
    "i-wall-east",
    "i-wall-back",
    "i-wall-south-west",
    "i-wall-south-east",
    "i-ceil-west",
    "i-ceil-east",
  ]),
  spawn: SUPPORTED_SPAWN,
  opening: Object.freeze({
    positionMetersXYZ: Object.freeze([0, 1.4, 3] as const),
    targetMetersXYZ: Object.freeze([0, 0.6, -1] as const),
    fovDegrees: 60,
  }),
  blocks: Object.freeze([
    block("i-floor-spawn", "full", "ground", [0, -0.5, 0]),
    block("i-floor-mid", "full", "ground", [0, -0.5, -1]),
    block("i-floor-north", "full", "ground", [0, -0.5, -2]),
    block("i-wall-west", "full", "structure", [-1, 0.5, -1], "interior-shell"),
    block("i-wall-east", "full", "structure", [1, 0.5, -1], "interior-shell"),
    block("i-wall-back", "full", "structure", [0, 0.5, -3], "interior-shell"),
    block("i-wall-south-west", "full", "structure", [-1, 0.5, 0], "interior-shell"),
    block("i-wall-south-east", "full", "structure", [1, 0.5, 0], "interior-shell"),
    block("i-ceil-west", "full", "structure", [-1, 1.5, -1], "interior-shell"),
    block("i-ceil-east", "full", "structure", [1, 1.5, -1], "interior-shell"),
  ]),
});

const OVERLAP_OCCUPANCY = record({
  id: "overlap-occupancy",
  seed: 202608321,
  polarity: "negative",
  family: "negative",
  maximumBlockCount: 2,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([]),
  expectedFailureCode: "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
  spawn: SUPPORTED_SPAWN,
  opening: DEFAULT_OPENING,
  blocks: Object.freeze([
    block("overlap-first", "full", "ground", [0, -0.5, 0]),
    block("overlap-second", "full", "ground", [0, -0.5, 0]),
  ]),
});

const OUT_OF_BUDGET = record({
  id: "out-of-budget",
  seed: 202608322,
  polarity: "negative",
  family: "negative",
  maximumBlockCount: 1,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([]),
  expectedFailureCode: "WORLDKIT_NATIVE_BLOCK_COUNT_EXCEEDED",
  spawn: SUPPORTED_SPAWN,
  opening: DEFAULT_OPENING,
  blocks: Object.freeze([
    block("budget-only", "full", "ground", [0, -0.5, 0]),
  ]),
  extraBlock: block("budget-two", "full", "ground", [1, -0.5, 0]),
});

const INVALID_TRAVERSAL_BINDING = record({
  id: "invalid-traversal-binding",
  seed: 202608323,
  polarity: "negative",
  family: "negative",
  maximumBlockCount: 1,
  colliderMode: "invalid-binding",
  notTraversableBlockIds: Object.freeze([]),
  expectedFailureCode: "WORLDKIT_NATIVE_BLOCK_COLLIDER_SELECTION_INVALID",
  spawn: SUPPORTED_SPAWN,
  opening: DEFAULT_OPENING,
  blocks: Object.freeze([
    block("bind-ground", "full", "ground", [0, -0.5, 0]),
  ]),
});

const UNSUPPORTED_SPAWN = record({
  id: "unsupported-spawn",
  seed: 202608324,
  polarity: "negative",
  family: "negative",
  maximumBlockCount: 1,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([]),
  spawn: Object.freeze({
    positionMetersXYZ: Object.freeze([4, 3, 4] as const),
    facingRadians: 0,
  }),
  opening: DEFAULT_OPENING,
  blocks: Object.freeze([
    block("support-pad", "full", "ground", [0, -0.5, 0]),
  ]),
});

const DISCONNECTED_ROUTE = record({
  id: "disconnected-route",
  seed: 202608325,
  polarity: "negative",
  family: "negative",
  maximumBlockCount: 2,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([]),
  expectedFailureCode: "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED",
  spawn: SUPPORTED_SPAWN,
  opening: DEFAULT_OPENING,
  blocks: Object.freeze([
    block("west-route", "full", "route", [0, -0.5, 0], "split-route"),
    block("east-route", "full", "route", [4, -0.5, 0], "split-route"),
  ]),
});

const CLEANUP_THROW_PARTIAL = record({
  id: "cleanup-throw-partial",
  seed: 202608326,
  polarity: "negative",
  family: "negative",
  maximumBlockCount: 2,
  colliderMode: "layout",
  notTraversableBlockIds: Object.freeze([]),
  expectedFailureCode: "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
  spawn: SUPPORTED_SPAWN,
  opening: DEFAULT_OPENING,
  blocks: Object.freeze([
    block("partial-first", "full", "ground", [0, -0.5, 0]),
    block("partial-second", "full", "ground", [0, -0.5, 0]),
  ]),
});

const RECORDS = Object.freeze([
  MOUNTAIN_CLIFF,
  T_SHAPED_TRAVERSAL,
  ORDINARY_AND_BLOCKED_STEPS,
  BUILDING_EXTERIOR,
  LIMITED_INTERIOR,
  OVERLAP_OCCUPANCY,
  OUT_OF_BUDGET,
  INVALID_TRAVERSAL_BINDING,
  UNSUPPORTED_SPAWN,
  DISCONNECTED_ROUTE,
  CLEANUP_THROW_PARTIAL,
]);

const RECORD_BY_ID = new Map(RECORDS.map((entry) => [entry.id, entry]));

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

function requireRecord(
  caseId: BabylonNativeBlockReconstructionCorpusCaseIdV1,
): CorpusRecordV1 {
  const found = RECORD_BY_ID.get(caseId);
  if (isNil(found)) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_UNKNOWN",
      `case '${String(caseId)}' is outside the closed Corpus`,
    );
  }
  return found;
}

function placeBlock(
  session: BabylonNativeBlockProfileSessionV1,
  spec: CorpusBlockSpecV1,
): void {
  session.createBlock({
    id: spec.id,
    shape: spec.shape,
    paletteRole: spec.paletteRole,
    ...(isNil(spec.visualGroupId) ? {} : { visualGroupId: spec.visualGroupId }),
  }).position.set(
    spec.centerMetersXYZ[0],
    spec.centerMetersXYZ[1],
    spec.centerMetersXYZ[2],
  );
}

function traversalBindingFor(
  recordValue: CorpusRecordV1,
  spec: CorpusBlockSpecV1,
): BabylonNativeTraversalBindingV1 {
  if (recordValue.notTraversableBlockIds.includes(spec.id)) {
    return Object.freeze({ kind: "not-traversable" });
  }
  return Object.freeze({
    kind: GROUND_STATIC.kind,
    surfaceEntityId: `surface-${spec.id}`,
    logicalSubshapeId: GROUND_STATIC.logicalSubshapeId,
    traversalSurfaceProfileRef: GROUND_STATIC.traversalSurfaceProfileRef,
  });
}

function layoutSelections(recordValue: CorpusRecordV1) {
  return Object.freeze(recordValue.blocks.map((spec) => Object.freeze({
    id: `collider-${spec.id}`,
    blockId: spec.id,
    traversalBinding: traversalBindingFor(recordValue, spec),
    frictionRatio: 0.8,
    restitutionRatio: 0,
  })));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function closedFailure(
  recordValue: CorpusRecordV1,
  error: unknown,
): BabylonNativeBlockReconstructionCorpusMaterializationV1 | undefined {
  const expected = recordValue.expectedFailureCode;
  const failureMessage = errorMessage(error);
  if (
    recordValue.polarity !== "negative" ||
    isNil(expected) ||
    !failureMessage.includes(expected)
  ) {
    return undefined;
  }
  return Object.freeze({
    outcome: "rejected",
    code: expected,
    failureMessage,
  });
}

export function inspectBabylonNativeBlockReconstructionCorpusCaseV1(
  caseId: BabylonNativeBlockReconstructionCorpusCaseIdV1,
): BabylonNativeBlockReconstructionCorpusCaseV1 {
  const recordValue = requireRecord(caseId);
  return Object.freeze({
    kind: "babylon-native-block-reconstruction-corpus-case",
    schemaVersion: 1,
    id: recordValue.id,
    seed: recordValue.seed,
    polarity: recordValue.polarity,
    family: recordValue.family,
    ...(isNil(recordValue.expectedFailureCode)
      ? {}
      : { expectedFailureCode: recordValue.expectedFailureCode }),
  });
}

export function materializeBabylonNativeBlockReconstructionCorpusCaseV1(
  context: BabylonNativeSceneBuildContextV1,
  caseId: BabylonNativeBlockReconstructionCorpusCaseIdV1,
): BabylonNativeBlockReconstructionCorpusMaterializationV1 {
  const recordValue = requireRecord(caseId);
  const session = createBabylonNativeBlockProfileSessionV1(context, {
    maximumBlockCount: recordValue.maximumBlockCount,
  });
  try {
    for (const spec of recordValue.blocks) {
      placeBlock(session, spec);
    }
    if (!isNil(recordValue.extraBlock)) {
      placeBlock(session, recordValue.extraBlock);
    }
    const epoch = recordValue.colliderMode === "invalid-binding"
      ? session.finalize(Object.freeze({
        staticColliders: Object.freeze([Object.freeze({
          id: "collider-bind-ground",
          blockId: "bind-ground",
          traversalBinding: Object.freeze({
            kind: "static-surface",
          }) as unknown as BabylonNativeTraversalBindingV1,
        })]),
      }))
      : session.finalize(Object.freeze({
        displayGapMeters: 0.04,
        staticColliders: layoutSelections(recordValue),
      }));
    context.registration.registerSpawnMarker(Object.freeze({
      id: context.bootstrap.spawnMarkerId,
      positionMetersXYZ: recordValue.spawn.positionMetersXYZ,
      facingRadians: recordValue.spawn.facingRadians,
    }));
    return Object.freeze({
      outcome: "finalized",
      epoch,
      spawn: recordValue.spawn,
      opening: recordValue.opening,
    });
  } catch (error) {
    try {
      session.dispose();
    } catch {
      /* keep the original materialization error */
    }
    const rejected = closedFailure(recordValue, error);
    if (!isNil(rejected)) return rejected;
    throw error;
  }
}

export function createBabylonNativeBlockReconstructionCorpusEvidenceIndexV1(
  input: Readonly<{
    caseId: BabylonNativeBlockReconstructionCorpusCaseIdV1;
    materialization: BabylonNativeBlockReconstructionCorpusMaterializationV1;
    authoringCapture?: BabylonNativeBlockAuthoringCaptureV1;
  }>,
): BabylonNativeBlockReconstructionCorpusEvidenceIndexV1 {
  const inspected = inspectBabylonNativeBlockReconstructionCorpusCaseV1(
    input.caseId,
  );
  const finalized = input.materialization.outcome === "finalized"
    ? input.materialization
    : undefined;
  if (
    !isNil(input.authoringCapture) &&
    (isNil(finalized) ||
      input.authoringCapture.kind !== "babylon-native-block-authoring-capture" ||
      input.authoringCapture.scope !== "build-epoch-local")
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_RECONSTRUCTION_EVIDENCE_INVALID",
      "authoringCapture must be one build-epoch-local capture for a finalized case",
    );
  }
  if (
    inspected.polarity === "positive" &&
    (isNil(finalized) || isEmpty(finalized.epoch.colliderInventory))
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_RECONSTRUCTION_EVIDENCE_INVALID",
      "positive evidence requires one finalized collider inventory",
    );
  }
  return Object.freeze({
    kind: "babylon-native-block-reconstruction-corpus-evidence-index",
    schemaVersion: 1,
    caseId: inspected.id,
    seed: inspected.seed,
    polarity: inspected.polarity,
    ...(isNil(inspected.expectedFailureCode)
      ? {}
      : { expectedFailureCode: inspected.expectedFailureCode }),
    ...(isNil(input.authoringCapture)
      ? {}
      : { authoringCapture: input.authoringCapture }),
    ...(isNil(finalized)
      ? {}
      : {
        checkResult: finalized.epoch.checkedLayout.checkResult,
        colliderInventory: finalized.epoch.colliderInventory,
      }),
    isFormalCapturePublished: false,
    isFormalRoutePublished: false,
    isRoomVisibilityClaimed: false,
    isMultilayerNavigationClaimed: false,
    isCavesClaimed: false,
    isBridgeUnderpassClaimed: false,
    isNpcNavClaimed: false,
    isGotoClaimed: false,
    isThinInstanceOptimized: false,
  });
}
