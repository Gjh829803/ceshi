import {
  BLOCK_WHITEBOX_SUBJECT_COLOR_V1,
  resolveBlockCameraPackV1,
  resolveBlockPresetV1,
  type BlockPositionMetersXYZV2,
  type BlockWorldControlledSubjectV2,
  type BlockWorldCameraV2,
  type BlockWorldManifestV2,
  type BlockWorldPackCameraV1,
  type BlockWorldThirdPersonCameraV2,
} from "@whitebox-world/block-world";
import {
  createBlockWorldRuntimeClustersV2,
} from "@whitebox-world/block-world-compiler";
import agentAuthoringCatalog from "../../.codex/skills/worldkit-block-builder/references/agent-authoring-catalog.json";

import {
  composeHorizontalComparisonPngV1,
  createRgbaRasterV1,
  decodePngRgbaV1,
  drawRgbaCircleV1,
  drawRgbaLineV1,
  fillRgbaPolygonV1,
  fillRgbaRectV1,
  type RgbColorV1,
  type RgbaRasterV1,
} from "./png-raster.js";

const TOP_DOWN_PANEL_SIZE = 768;
const ENTRY_PANEL_WIDTH = 960;
const ENTRY_PANEL_HEIGHT = 540;
const SUBJECT_COLOR = rgbFromHex(BLOCK_WHITEBOX_SUBJECT_COLOR_V1);

type Vector3 = readonly [x: number, y: number, z: number];

function isPackCamera(camera: BlockWorldCameraV2): camera is BlockWorldPackCameraV1 {
  return "kind" in camera && camera.kind === "pack";
}

interface CuboidV1 {
  readonly minimum: Vector3;
  readonly maximum: Vector3;
  readonly color: RgbColorV1;
  readonly id: string;
}

interface ProjectedFaceV1 {
  readonly points: readonly (readonly [number, number])[];
  readonly depth: number;
  readonly color: RgbColorV1;
  readonly id: string;
}

function rgbFromHex(value: string): RgbColorV1 {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function shade(color: RgbColorV1, ratio: number): RgbColorV1 {
  return color.map((channel) => Math.max(0, Math.min(255, Math.round(channel * ratio)))) as
    unknown as RgbColorV1;
}

function cuboidsForManifest(manifest: BlockWorldManifestV2): readonly CuboidV1[] {
  return createBlockWorldRuntimeClustersV2(manifest.blocks).map((cluster) => {
    const half = cluster.sizeMetersXYZ.map((value) => value / 2) as
      unknown as Vector3;
    const preset = resolveBlockPresetV1(cluster.presetRef);
    if (preset === undefined) throw new Error(`Unknown Block preset '${cluster.presetRef}'.`);
    return Object.freeze({
      minimum: Object.freeze(cluster.centerMetersXYZ.map((value, axis) =>
        value - half[axis]!) as unknown as Vector3),
      maximum: Object.freeze(cluster.centerMetersXYZ.map((value, axis) =>
        value + half[axis]!) as unknown as Vector3),
      color: rgbFromHex(preset.render.colorHex),
      id: cluster.entityId,
    });
  });
}

function drawTopDown(
  cuboids: readonly CuboidV1[],
  spawn: BlockPositionMetersXYZV2,
): RgbaRasterV1 {
  const raster = createRgbaRasterV1(
    TOP_DOWN_PANEL_SIZE,
    TOP_DOWN_PANEL_SIZE,
    [225, 238, 245],
  );
  const minimumX = Math.min(...cuboids.map(({ minimum }) => minimum[0]), spawn[0] - 1);
  const maximumX = Math.max(...cuboids.map(({ maximum }) => maximum[0]), spawn[0] + 1);
  const minimumZ = Math.min(...cuboids.map(({ minimum }) => minimum[2]), spawn[2] - 1);
  const maximumZ = Math.max(...cuboids.map(({ maximum }) => maximum[2]), spawn[2] + 1);
  const padding = 40;
  const scale = Math.min(
    (raster.width - padding * 2) / Math.max(1, maximumX - minimumX),
    (raster.height - padding * 2) / Math.max(1, maximumZ - minimumZ),
  );
  const offsetX = (raster.width - (maximumX - minimumX) * scale) / 2;
  const offsetY = (raster.height - (maximumZ - minimumZ) * scale) / 2;
  const project = (x: number, z: number): readonly [number, number] => [
    offsetX + (x - minimumX) * scale,
    offsetY + (z - minimumZ) * scale,
  ];
  const sorted = [...cuboids].sort((left, right) =>
    left.maximum[1] - right.maximum[1] || left.id.localeCompare(right.id));
  for (const cuboid of sorted) {
    const [left, top] = project(cuboid.minimum[0], cuboid.minimum[2]);
    const [right, bottom] = project(cuboid.maximum[0], cuboid.maximum[2]);
    fillRgbaRectV1(raster, left, top, right, bottom, cuboid.color);
    if (right - left >= 4 && bottom - top >= 4) {
      const edge = shade(cuboid.color, 0.72);
      drawRgbaLineV1(raster, [left, top], [right, top], edge);
      drawRgbaLineV1(raster, [right, top], [right, bottom], edge);
      drawRgbaLineV1(raster, [right, bottom], [left, bottom], edge);
      drawRgbaLineV1(raster, [left, bottom], [left, top], edge);
    }
  }
  const [spawnX, spawnY] = project(spawn[0], spawn[2]);
  drawRgbaCircleV1(raster, spawnX, spawnY, 7, SUBJECT_COLOR);
  return raster;
}

function add(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function multiply(vector: Vector3, scalar: number): Vector3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(...vector);
  if (length <= Number.EPSILON) throw new Error("Cannot normalize a zero vector.");
  return multiply(vector, 1 / length);
}

function rotateLocalXZ(
  position: Vector3,
  yawQuarterTurnsY: number,
): Vector3 {
  const angle = yawQuarterTurnsY * Math.PI / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    position[0] * cosine + position[2] * sine,
    position[1],
    -position[0] * sine + position[2] * cosine,
  ];
}

function registeredSubjectCuboids(
  subjectDefinitionRef: string,
  spawn: Vector3,
  yawQuarterTurnsY: number,
): readonly CuboidV1[] {
  const subject = agentAuthoringCatalog.subjectPacks.find((entry) =>
    entry.subjectDefinitionRef === subjectDefinitionRef);
  if (subject === undefined) {
    throw new Error(
      `AGENT_AUTHORING_SUBJECT_NOT_ADMITTED: '${subjectDefinitionRef}'.`,
    );
  }
  return subject.visualReviewProxy.cuboids.map(({ id, centerMetersXYZ, sizeMetersXYZ }) => {
    const localCenter: Vector3 = [
      centerMetersXYZ[0]!,
      centerMetersXYZ[1]!,
      centerMetersXYZ[2]!,
    ];
    const unrotatedSize: Vector3 = [
      sizeMetersXYZ[0]!,
      sizeMetersXYZ[1]!,
      sizeMetersXYZ[2]!,
    ];
    const worldCenter = add(
      spawn,
      rotateLocalXZ(localCenter, yawQuarterTurnsY),
    );
    const size: Vector3 = yawQuarterTurnsY % 2 === 0
      ? unrotatedSize
      : [unrotatedSize[2], unrotatedSize[1], unrotatedSize[0]];
    return {
      id: `subject-${id}`,
      minimum: worldCenter.map((value, axis) => value - size[axis]! / 2) as
        unknown as Vector3,
      maximum: worldCenter.map((value, axis) => value + size[axis]! / 2) as
        unknown as Vector3,
      color: SUBJECT_COLOR,
    };
  });
}

function subjectCuboids(
  subject: BlockWorldControlledSubjectV2,
  spawn: Vector3,
  subjectMeshParts: readonly import("@whitebox-world/block-world").BlockSubjectVisualPartV2[] = [],
): readonly CuboidV1[] {
  if (subject.kind === "registered") {
    return registeredSubjectCuboids(
      subject.subjectDefinitionRef,
      spawn,
      subject.yawQuarterTurnsY,
    );
  }
  if (subject.kind === "assembly") {
    const base = subject.assembly.baseSubject;
    const registered = base.kind === "subject-pack"
      ? agentAuthoringCatalog.subjectPacks.find((entry) =>
          entry.id === base.subjectPackId)
      : undefined;
    const registeredCuboids = registered === undefined
      ? []
      : registeredSubjectCuboids(
          registered.subjectDefinitionRef,
          spawn,
          subject.yawQuarterTurnsY,
        );
    const selectedIds = new Set([
      ...(base.kind === "custom-mesh" ? base.subjectMeshBindingIds : []),
      ...subject.assembly.attachments.map(({ subjectMeshBindingId }) =>
        subjectMeshBindingId),
    ]);
    const meshCuboids = subjectMeshParts
      .filter((part) => part.kind === "primitive" && selectedIds.has(part.id))
      .map((part) => {
        if (part.kind !== "primitive") throw new Error("unreachable");
        const center = add(
          spawn,
          rotateLocalXZ(part.positionMetersXYZ, subject.yawQuarterTurnsY),
        );
        const unrotatedSize: Vector3 = part.shape.kind === "box"
          ? part.shape.sizeMetersXYZ
          : part.shape.kind === "sphere"
            ? [part.shape.radiusMeters * 2, part.shape.radiusMeters * 2,
                part.shape.radiusMeters * 2]
            : [part.shape.radiusMeters * 2, part.shape.heightMeters,
                part.shape.radiusMeters * 2];
        const size: Vector3 = subject.yawQuarterTurnsY % 2 === 0
          ? unrotatedSize
          : [unrotatedSize[2], unrotatedSize[1], unrotatedSize[0]];
        return {
          id: `subject-${part.id}`,
          minimum: center.map((value, axis) => value - size[axis]! / 2) as
            unknown as Vector3,
          maximum: center.map((value, axis) => value + size[axis]! / 2) as
            unknown as Vector3,
          color: SUBJECT_COLOR,
        };
      });
    const combined = [...registeredCuboids, ...meshCuboids];
    if (combined.length === 0) {
      throw new Error("BLOCK_WORLD_SUBJECT_ASSEMBLY_VISUAL_PROXY_MISSING");
    }
    return combined;
  }
  const primitiveParts = subject.definition.visualParts.filter(
    (part) => part.kind === "primitive",
  );
  if (primitiveParts.length === 0) {
    throw new Error("BLOCK_WORLD_COMPOSED_SUBJECT_VISUAL_PROXY_MISSING");
  }
  return primitiveParts.map((part) => {
    const center = add(spawn, rotateLocalXZ(part.positionMetersXYZ, subject.yawQuarterTurnsY));
    const unrotatedSize: Vector3 = part.shape.kind === "box"
      ? part.shape.sizeMetersXYZ
      : part.shape.kind === "sphere"
        ? [part.shape.radiusMeters * 2, part.shape.radiusMeters * 2, part.shape.radiusMeters * 2]
        : [part.shape.radiusMeters * 2, part.shape.heightMeters, part.shape.radiusMeters * 2];
    const size: Vector3 = subject.yawQuarterTurnsY % 2 === 0
      ? unrotatedSize
      : [unrotatedSize[2], unrotatedSize[1], unrotatedSize[0]];
    return {
      id: `subject-${part.id}`,
      minimum: center.map((value, axis) => value - size[axis]! / 2) as unknown as Vector3,
      maximum: center.map((value, axis) => value + size[axis]! / 2) as unknown as Vector3,
      color: SUBJECT_COLOR,
    };
  });
}

function drawEntry(
  worldCuboids: readonly CuboidV1[],
  subject: BlockWorldControlledSubjectV2,
  camera: BlockWorldCameraV2,
  spawn: BlockPositionMetersXYZV2,
  subjectMeshParts: readonly import("@whitebox-world/block-world").BlockSubjectVisualPartV2[],
): RgbaRasterV1 {
  const raster = createRgbaRasterV1(
    ENTRY_PANEL_WIDTH,
    ENTRY_PANEL_HEIGHT,
    [159, 207, 238],
  );
  const yaw = subject.yawQuarterTurnsY * Math.PI / 2;
  const subjectForward: Vector3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
  const packCamera = isPackCamera(camera) ? camera : undefined;
  const cameraPack = packCamera === undefined
    ? undefined
    : resolveBlockCameraPackV1(packCamera.cameraPackId);
  const pitchRadians = cameraPack === undefined
    ? (camera as BlockWorldThirdPersonCameraV2).pitchRadians
    : packCamera!.tuning?.pitchRadians ?? cameraPack.defaults.pitchRadians;
  const distanceMeters = cameraPack === undefined
    ? (camera as BlockWorldThirdPersonCameraV2).distanceMeters
    : Math.max(0.1, packCamera!.tuning?.distanceMeters ?? cameraPack.defaults.distanceMeters);
  const targetHeightMeters = cameraPack === undefined
    ? (camera as BlockWorldThirdPersonCameraV2).targetHeightMeters
    : packCamera!.target.kind === "subject-local-point"
      ? packCamera!.target.positionMetersXYZ[1]
      : packCamera!.target.kind === "base-subject-bounds" ||
          packCamera!.target.kind === "assembly-bounds"
        ? (() => {
            const cuboids = subjectCuboids(subject, [0, 0, 0], subjectMeshParts);
            const minimum = Math.min(...cuboids.map(({ minimum }) => minimum[1]));
            const maximum = Math.max(...cuboids.map(({ maximum }) => maximum[1]));
            return minimum + (maximum - minimum) * packCamera!.target.heightRatio;
          })()
        : packCamera!.target.socketId === "FirstPersonView" ? 1.7 : 1.25;
  const fovDegrees = cameraPack === undefined
    ? (camera as BlockWorldThirdPersonCameraV2).fovDegrees
    : packCamera!.tuning?.fovDegrees ?? cameraPack.defaults.fovDegrees;
  const target: Vector3 = [
    spawn[0],
    spawn[1] + targetHeightMeters,
    spawn[2],
  ];
  const horizontalDistance = distanceMeters * Math.cos(pitchRadians);
  const cameraPosition = add(
    add(target, multiply(subjectForward, -horizontalDistance)),
    [0, distanceMeters * Math.sin(pitchRadians), 0],
  );
  const cameraForward = normalize(subtract(target, cameraPosition));
  const right = normalize(cross(cameraForward, [0, 1, 0]));
  const up = normalize(cross(right, cameraForward));
  const tangent = Math.tan(fovDegrees * Math.PI / 360);
  const project = (point: Vector3): Readonly<{ point: readonly [number, number]; depth: number }> | null => {
    const relative = subtract(point, cameraPosition);
    const depth = dot(relative, cameraForward);
    if (depth <= 0.05) return null;
    const normalizedX = dot(relative, right) / (depth * tangent * camera.aspectRatio);
    const normalizedY = dot(relative, up) / (depth * tangent);
    return {
      point: [
        (normalizedX * 0.5 + 0.5) * raster.width,
        (0.5 - normalizedY * 0.5) * raster.height,
      ],
      depth,
    };
  };

  const faceDefinitions = [
    { indexes: [0, 1, 2, 3], normal: [0, 0, -1] as Vector3, shade: 0.92 },
    { indexes: [5, 4, 7, 6], normal: [0, 0, 1] as Vector3, shade: 0.98 },
    { indexes: [4, 0, 3, 7], normal: [-1, 0, 0] as Vector3, shade: 0.8 },
    { indexes: [1, 5, 6, 2], normal: [1, 0, 0] as Vector3, shade: 0.86 },
    { indexes: [4, 5, 1, 0], normal: [0, -1, 0] as Vector3, shade: 0.72 },
    { indexes: [3, 2, 6, 7], normal: [0, 1, 0] as Vector3, shade: 1.08 },
  ] as const;
  const faces: ProjectedFaceV1[] = [];
  for (const cuboid of [
    ...worldCuboids,
    ...subjectCuboids(subject, spawn, subjectMeshParts),
  ]) {
    const { minimum: min, maximum: max } = cuboid;
    const corners: readonly Vector3[] = [
      [min[0], min[1], min[2]], [max[0], min[1], min[2]],
      [max[0], max[1], min[2]], [min[0], max[1], min[2]],
      [min[0], min[1], max[2]], [max[0], min[1], max[2]],
      [max[0], max[1], max[2]], [min[0], max[1], max[2]],
    ];
    for (const definition of faceDefinitions) {
      const worldPoints = definition.indexes.map((index) => corners[index]!);
      const center = multiply(worldPoints.reduce(add, [0, 0, 0] as Vector3), 1 / 4);
      if (dot(definition.normal, subtract(cameraPosition, center)) <= 0) continue;
      const projected = worldPoints.map(project);
      if (projected.some((row) => row === null)) continue;
      const complete = projected as readonly Readonly<{
        point: readonly [number, number];
        depth: number;
      }>[];
      faces.push({
        points: complete.map(({ point }) => point),
        depth: complete.reduce((sum, row) => sum + row.depth, 0) / complete.length,
        color: shade(cuboid.color, definition.shade),
        id: `${cuboid.id}-${definition.indexes.join("")}`,
      });
    }
  }
  faces.sort((left, rightFace) => rightFace.depth - left.depth || left.id.localeCompare(rightFace.id));
  for (const face of faces) {
    fillRgbaPolygonV1(raster, face.points, face.color);
    const edge = shade(face.color, 0.7);
    for (let index = 0; index < face.points.length; index += 1) {
      drawRgbaLineV1(
        raster,
        face.points[index]!,
        face.points[(index + 1) % face.points.length]!,
        edge,
      );
    }
  }
  return raster;
}

export function createBlockWorldVisualReviewPngsV1(input: Readonly<{
  manifest: BlockWorldManifestV2;
  controlledSubject: BlockWorldControlledSubjectV2;
  camera: BlockWorldCameraV2;
  subjectMeshParts?: readonly import("@whitebox-world/block-world").BlockSubjectVisualPartV2[];
  spawnStandPositionMetersXYZ: BlockPositionMetersXYZV2;
  plannerWorldPlanPng: Uint8Array;
  plannerEntryWhiteboxTargetPng: Uint8Array;
}>): Readonly<{
  topDownComparisonPng: Buffer;
  entryComparisonPng: Buffer;
}> {
  const cuboids = cuboidsForManifest(input.manifest);
  if (cuboids.length === 0) throw new Error("Cannot render a Block World without blocks.");
  const topDown = drawTopDown(cuboids, input.spawnStandPositionMetersXYZ);
  const entry = drawEntry(
    cuboids,
    input.controlledSubject,
    input.camera,
    input.spawnStandPositionMetersXYZ,
    input.subjectMeshParts ?? [],
  );
  return Object.freeze({
    topDownComparisonPng: composeHorizontalComparisonPngV1(
      decodePngRgbaV1(input.plannerWorldPlanPng),
      topDown,
      TOP_DOWN_PANEL_SIZE,
      TOP_DOWN_PANEL_SIZE,
    ),
    entryComparisonPng: composeHorizontalComparisonPngV1(
      decodePngRgbaV1(input.plannerEntryWhiteboxTargetPng),
      entry,
      ENTRY_PANEL_WIDTH,
      ENTRY_PANEL_HEIGHT,
    ),
  });
}
