import type { BabylonNativeBlockLayoutIssueV1, BabylonNativeBlockLayoutV1 } from "./layout.js";
import {
  BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1,
  type BabylonNativeBlockPaletteRoleV1,
} from "./profile.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";
import type {
  BabylonNativeBlockPositionMetersXYZV1,
  BabylonNativeBlockShapeKindV1,
} from "./shapes.js";
import {
  BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1,
  BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1,
} from "./shapes.js";

export type BabylonNativeBlockProfileDiagnosticLocationV1 =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "block"; blockId: string }>
  | Readonly<{ kind: "visual-group"; visualGroupId: string }>;

export const BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1 = Object.freeze([
  "WORLDKIT_NATIVE_BLOCK_GRID_ALIGNMENT_INVALID",
  "WORLDKIT_NATIVE_BLOCK_MESH_DISPOSED",
  "WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID",
  "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
  "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED",
  "WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH",
  "WORLDKIT_NATIVE_BLOCK_STRUCTURAL_SUPPORT_MISSING",
  "WORLDKIT_NATIVE_BLOCK_WORLD_TRANSFORM_INVALID",
] as const);

export type BabylonNativeBlockProfileDiagnosticCodeV1 =
  (typeof BABYLON_NATIVE_BLOCK_PROFILE_DIAGNOSTIC_CODES_V1)[number];

export interface BabylonNativeBlockProfileDiagnosticV1 {
  readonly kind: "babylon-native-block-profile-diagnostic";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly severity: "warning" | "error";
  readonly code: BabylonNativeBlockProfileDiagnosticCodeV1;
  readonly location: BabylonNativeBlockProfileDiagnosticLocationV1;
  readonly message: string;
  readonly repairHint: string;
}

export interface BabylonNativeBlockVisualGroupInventoryV1 {
  readonly id: string;
  readonly blockIds: readonly string[];
  readonly paletteRoles: readonly BabylonNativeBlockPaletteRoleV1[];
  readonly minimumMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly maximumMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
}

export interface BabylonNativeBlockProfileMetricsV1 {
  readonly blockCount: number;
  readonly blockCountByShape: Readonly<
    Record<BabylonNativeBlockShapeKindV1, number>
  >;
  readonly blockCountByPaletteRole: Readonly<
    Record<BabylonNativeBlockPaletteRoleV1, number>
  >;
  readonly occupiedMicroCellCount: number;
  readonly exposedTopSurfaceCellCount: number;
  readonly boundarySegmentCount: number;
  readonly structuralStepTransitionCount: number;
  readonly unsupportedBlockCount: number;
  readonly structuralRouteComponentCount: number;
  readonly visualGroupCount: number;
}

export interface BabylonNativeBlockProfileCheckResultV1 {
  readonly kind: "babylon-native-block-profile-check-result";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly outcome: "passed" | "rejected";
  readonly diagnostics: readonly BabylonNativeBlockProfileDiagnosticV1[];
  readonly metrics: BabylonNativeBlockProfileMetricsV1;
  readonly visualGroups: readonly BabylonNativeBlockVisualGroupInventoryV1[];
}

const GEOMETRY_EPSILON = 1e-8;

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function blockLocation(blockId: string): BabylonNativeBlockProfileDiagnosticLocationV1 {
  return Object.freeze({ kind: "block", blockId });
}

function diagnostic(input: Readonly<{
  sequence: number;
  severity: "warning" | "error";
  code: BabylonNativeBlockProfileDiagnosticCodeV1;
  location: BabylonNativeBlockProfileDiagnosticLocationV1;
  message: string;
  repairHint: string;
}>): BabylonNativeBlockProfileDiagnosticV1 {
  return Object.freeze({
    kind: "babylon-native-block-profile-diagnostic",
    schemaVersion: 1,
    id: `native-block-diagnostic-${input.sequence.toString().padStart(4, "0")}`,
    severity: input.severity,
    code: input.code,
    location: input.location,
    message: input.message,
    repairHint: input.repairHint,
  });
}

function issueMessage(issue: BabylonNativeBlockLayoutIssueV1): Readonly<{
  message: string;
  repairHint: string;
}> {
  switch (issue.code) {
    case "WORLDKIT_NATIVE_BLOCK_MESH_DISPOSED":
      return Object.freeze({
        message: `Block '${issue.blockId}' was disposed before Profile finalization.`,
        repairHint: "Keep every Profile-created Mesh alive until build finalization.",
      });
    case "WORLDKIT_NATIVE_BLOCK_MESH_GEOMETRY_INVALID":
      return Object.freeze({
        message: `Block '${issue.blockId}' no longer has its fixed Profile geometry.`,
        repairHint: "Keep Profile block vertices, indices, and instance state unchanged.",
      });
    case "WORLDKIT_NATIVE_BLOCK_SCENE_MISMATCH":
      return Object.freeze({
        message: `Block '${issue.blockId}' no longer belongs to the Candidate Scene.`,
        repairHint: "Keep Profile blocks in the Host-provided Candidate Scene.",
      });
    case "WORLDKIT_NATIVE_BLOCK_WORLD_TRANSFORM_INVALID":
      return Object.freeze({
        message: `Block '${issue.blockId}' has scale, tilt, reflection, or rotation outside whitebox.blocks@1.`,
        repairHint: "Use unit world scale, +Y up, and a Y quarter-turn rotation.",
      });
    case "WORLDKIT_NATIVE_BLOCK_GRID_ALIGNMENT_INVALID":
      return Object.freeze({
        message: `Block '${issue.blockId}' does not align to the axis-specific center lattice [${BABYLON_NATIVE_BLOCK_CENTER_LATTICE_METERS_XYZ_V1.join(", ")}]m and occupancy grid [${BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1.join(", ")}]m.`,
        repairHint: "Move the final world transform onto the Profile lattice.",
      });
    case "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP":
      return Object.freeze({
        message: `Blocks '${issue.blockId}' and '${issue.relatedBlockId ?? "unknown"}' occupy the same micro cells.`,
        repairHint: "Move, resize by choosing another fixed shape, or remove one overlapping block.",
      });
  }
}

function visualGroups(
  layout: BabylonNativeBlockLayoutV1,
): readonly BabylonNativeBlockVisualGroupInventoryV1[] {
  const blocksByGroup = new Map<string, typeof layout.blocks[number][]>();
  for (const block of layout.blocks) {
    if (block.visualGroupId === undefined) continue;
    const blocks = blocksByGroup.get(block.visualGroupId) ?? [];
    blocks.push(block);
    blocksByGroup.set(block.visualGroupId, blocks);
  }
  return Object.freeze([...blocksByGroup.entries()]
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([id, unsortedBlocks]) => {
      const blocks = [...unsortedBlocks].sort((left, right) =>
        stableCompare(left.id, right.id));
      const minimumMetersXYZ = Object.freeze([0, 1, 2].map((axis) =>
        Math.min(...blocks.map((block) => block.minimumMetersXYZ[axis]!)),
      ) as [number, number, number]);
      const maximumMetersXYZ = Object.freeze([0, 1, 2].map((axis) =>
        Math.max(...blocks.map((block) => block.maximumMetersXYZ[axis]!)),
      ) as [number, number, number]);
      return Object.freeze({
        id,
        blockIds: Object.freeze(blocks.map(({ id: blockId }) => blockId)),
        paletteRoles: Object.freeze([...new Set(
          blocks.map(({ paletteRole }) => paletteRole),
        )].sort(stableCompare)),
        minimumMetersXYZ,
        maximumMetersXYZ,
      });
    }));
}

function intervalsStrictlyOverlap(
  leftMinimum: number,
  leftMaximum: number,
  rightMinimum: number,
  rightMaximum: number,
): boolean {
  return Math.min(leftMaximum, rightMaximum) -
    Math.max(leftMinimum, rightMinimum) > GEOMETRY_EPSILON;
}

function structurallyAdjacent(
  left: BabylonNativeBlockLayoutV1["blocks"][number],
  right: BabylonNativeBlockLayoutV1["blocks"][number],
): boolean {
  if (
    Math.abs(left.maximumMetersXYZ[1] - right.maximumMetersXYZ[1]) >
      BABYLON_NATIVE_BLOCK_OCCUPANCY_GRID_METERS_XYZ_V1[1] +
        GEOMETRY_EPSILON
  ) {
    return false;
  }
  const touchesX =
    Math.abs(left.maximumMetersXYZ[0] - right.minimumMetersXYZ[0]) <=
      GEOMETRY_EPSILON ||
    Math.abs(right.maximumMetersXYZ[0] - left.minimumMetersXYZ[0]) <=
      GEOMETRY_EPSILON;
  const touchesZ =
    Math.abs(left.maximumMetersXYZ[2] - right.minimumMetersXYZ[2]) <=
      GEOMETRY_EPSILON ||
    Math.abs(right.maximumMetersXYZ[2] - left.minimumMetersXYZ[2]) <=
      GEOMETRY_EPSILON;
  const touchesY =
    Math.abs(left.maximumMetersXYZ[1] - right.minimumMetersXYZ[1]) <=
      GEOMETRY_EPSILON ||
    Math.abs(right.maximumMetersXYZ[1] - left.minimumMetersXYZ[1]) <=
      GEOMETRY_EPSILON;
  return (
    touchesX && intervalsStrictlyOverlap(
      left.minimumMetersXYZ[2],
      left.maximumMetersXYZ[2],
      right.minimumMetersXYZ[2],
      right.maximumMetersXYZ[2],
    )
  ) || (
    touchesZ && intervalsStrictlyOverlap(
      left.minimumMetersXYZ[0],
      left.maximumMetersXYZ[0],
      right.minimumMetersXYZ[0],
      right.maximumMetersXYZ[0],
    )
  ) || (
    touchesY &&
    intervalsStrictlyOverlap(
      left.minimumMetersXYZ[0],
      left.maximumMetersXYZ[0],
      right.minimumMetersXYZ[0],
      right.maximumMetersXYZ[0],
    ) &&
    intervalsStrictlyOverlap(
      left.minimumMetersXYZ[2],
      left.maximumMetersXYZ[2],
      right.minimumMetersXYZ[2],
      right.maximumMetersXYZ[2],
    )
  );
}

function structuralRouteComponentCount(
  layout: BabylonNativeBlockLayoutV1,
): number {
  const routeBlocks = layout.blocks.filter(({ paletteRole }) =>
    paletteRole === "route");
  const neighborsById = new Map(routeBlocks.map(({ id }) => [id, [] as string[]]));
  for (let leftIndex = 0; leftIndex < routeBlocks.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < routeBlocks.length;
      rightIndex += 1
    ) {
      const left = routeBlocks[leftIndex]!;
      const right = routeBlocks[rightIndex]!;
      if (!structurallyAdjacent(left, right)) continue;
      neighborsById.get(left.id)!.push(right.id);
      neighborsById.get(right.id)!.push(left.id);
    }
  }
  const visited = new Set<string>();
  let componentCount = 0;
  for (const block of routeBlocks) {
    if (visited.has(block.id)) continue;
    componentCount += 1;
    const queue = [block.id];
    visited.add(block.id);
    for (let index = 0; index < queue.length; index += 1) {
      for (const neighborId of neighborsById.get(queue[index]!) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
  }
  return componentCount;
}

function countInputs(
  records: readonly BabylonNativeBlockSessionRecordV1[],
): Readonly<{
  blockCountByShape: Readonly<Record<BabylonNativeBlockShapeKindV1, number>>;
  blockCountByPaletteRole: Readonly<Record<BabylonNativeBlockPaletteRoleV1, number>>;
}> {
  const blockCountByShape: Record<BabylonNativeBlockShapeKindV1, number> = {
    full: 0,
    half: 0,
    quarter: 0,
    small: 0,
    step: 0,
  };
  const blockCountByPaletteRole = Object.fromEntries(
    BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1.map((role) => [role, 0]),
  ) as Record<BabylonNativeBlockPaletteRoleV1, number>;
  for (const { input } of records) {
    blockCountByShape[input.shape] += 1;
    blockCountByPaletteRole[input.paletteRole] += 1;
  }
  return Object.freeze({
    blockCountByShape: Object.freeze(blockCountByShape),
    blockCountByPaletteRole: Object.freeze(blockCountByPaletteRole),
  });
}

function diagnosticSortKey(
  diagnosticValue: Omit<BabylonNativeBlockProfileDiagnosticV1, "id">,
): string {
  const location = diagnosticValue.location;
  if (location.kind === "none") return `0::${diagnosticValue.code}`;
  if (location.kind === "block") {
    return `1:${location.blockId}:${diagnosticValue.code}`;
  }
  return `2:${location.visualGroupId}:${diagnosticValue.code}`;
}

export function createBabylonNativeBlockProfileCheckResultV1(
  worldId: string,
  records: readonly BabylonNativeBlockSessionRecordV1[],
  layout: BabylonNativeBlockLayoutV1,
): BabylonNativeBlockProfileCheckResultV1 {
  const pendingDiagnostics: Omit<
    BabylonNativeBlockProfileDiagnosticV1,
    "id"
  >[] = [];
  for (const issue of layout.issues) {
    const text = issueMessage(issue);
    pendingDiagnostics.push(Object.freeze({
      kind: "babylon-native-block-profile-diagnostic",
      schemaVersion: 1,
      severity: "error",
      code: issue.code,
      location: blockLocation(issue.blockId),
      message: text.message,
      repairHint: text.repairHint,
    }));
  }
  // Functional palette roles do not imply semantic identity. Ordinary scenery
  // keeps its Profile color without a group, as in legacy non-landmark presets.
  // The authoring binding owns exact Case/manifest/actual-group joins and still
  // rejects undeclared groups and targets with no actual Blocks.
  for (const blockId of layout.unsupportedBlockIds) {
    pendingDiagnostics.push(Object.freeze({
      kind: "babylon-native-block-profile-diagnostic",
      schemaVersion: 1,
      severity: "warning",
      code: "WORLDKIT_NATIVE_BLOCK_STRUCTURAL_SUPPORT_MISSING",
      location: blockLocation(blockId),
      message: `Block '${blockId}' has no structural support path to the layout root stratum.`,
      repairHint: "Add visible supporting mass or keep the warning as explicit floating visual intent.",
    }));
  }
  const routeComponentCount = structuralRouteComponentCount(layout);
  if (routeComponentCount > 1) {
    pendingDiagnostics.push(Object.freeze({
      kind: "babylon-native-block-profile-diagnostic",
      schemaVersion: 1,
      severity: "warning",
      code: "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED",
      location: Object.freeze({ kind: "none" }),
      message: `Route-colored structural blocks form ${routeComponentCount} visual components; palette-only adjacency does not establish Case-required connectivity.`,
      repairHint: "Use Case-declared Ground Analysis and traversal gates to decide whether any required course must be connected and passable.",
    }));
  }
  const sortedPending = [...pendingDiagnostics].sort((left, right) =>
    stableCompare(diagnosticSortKey(left), diagnosticSortKey(right)));
  const diagnostics = Object.freeze(sortedPending.map((entry, index) =>
    diagnostic({
      sequence: index,
      severity: entry.severity,
      code: entry.code,
      location: entry.location,
      message: entry.message,
      repairHint: entry.repairHint,
    })));
  const inventory = visualGroups(layout);
  const counts = countInputs(records);
  const metrics = Object.freeze({
    blockCount: records.length,
    blockCountByShape: counts.blockCountByShape,
    blockCountByPaletteRole: counts.blockCountByPaletteRole,
    occupiedMicroCellCount: new Set(
      layout.blocks.flatMap(({ occupiedMicroCellKeys }) =>
        occupiedMicroCellKeys),
    ).size,
    exposedTopSurfaceCellCount: layout.exposedTopSurfaceCellKeys.length,
    boundarySegmentCount: layout.boundarySegmentKeys.length,
    structuralStepTransitionCount: layout.structuralStepTransitionKeys.length,
    unsupportedBlockCount: layout.unsupportedBlockIds.length,
    structuralRouteComponentCount: routeComponentCount,
    visualGroupCount: inventory.length,
  });
  return Object.freeze({
    kind: "babylon-native-block-profile-check-result",
    schemaVersion: 1,
    id: `${worldId}.whitebox-blocks-check`,
    outcome: diagnostics.some(({ severity }) => severity === "error")
      ? "rejected"
      : "passed",
    diagnostics,
    metrics,
    visualGroups: inventory,
  });
}
