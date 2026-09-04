import { describe, expect, it } from "vitest";

import { checkBlockWorldV2 } from "./check.js";
import { createBlockWorldManifestV2 } from "./manifest.js";
import { BLOCK_PRESET_REFS_V1 } from "./preset-registry.js";
import type {
  BlockInstanceV2,
  BlockPositionMetersXYZV2,
  BlockPresetRefV1,
  BlockShapeKindV2,
  BlockSubjectTraversalProfileV2,
} from "./types.js";

const HUMANOID: BlockSubjectTraversalProfileV2 = {
  clearanceHeightMeters: 2,
  footprintRadiusMetersXZ: 0,
  maximumStepUpMeters: 0.3,
  maximumStepDownMeters: 0.3,
  maximumAutoSmoothHeightDeltaMeters: 1,
  maximumAdjacentWalkableHeightDeltaMeters: 2,
  canStandOnCloud: false,
};
const WORLD = { id: "checker-world", seed: 1024 } as const;
const CONTROLLED_SUBJECT = {
  kind: "registered",
  entityId: "player",
  subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
  visualTargetId: "visual-target-1",
  yawQuarterTurnsY: 0,
} as const;
const CAMERA = {
  entityId: "camera-main",
  pitchRadians: 0.12,
  distanceMeters: 5,
  targetHeightMeters: 1.25,
  fovDegrees: 56,
  aspectRatio: 16 / 9,
} as const;

function block(
  id: string,
  positionMetersXYZ: BlockPositionMetersXYZV2,
  presetRef: BlockPresetRefV1 = BLOCK_PRESET_REFS_V1.walkable,
  shape: BlockShapeKindV2 = "full",
  visualGroupId?: string,
): BlockInstanceV2 {
  return {
    id,
    presetRef,
    shape,
    positionMetersXYZ,
    rotationQuarterTurnsY: 0,
    ...(visualGroupId === undefined ? {} : { visualGroupId }),
  };
}

function check(
  blocks: readonly BlockInstanceV2[],
  spawn: BlockPositionMetersXYZV2 = [0, 0.5, 0],
) {
  return checkBlockWorldV2({
    manifest: createBlockWorldManifestV2(blocks),
    world: WORLD,
    controlledSubject: CONTROLLED_SUBJECT,
    camera: CAMERA,
    subjectTraversalProfile: HUMANOID,
    spawnStandPositionMetersXYZ: spawn,
    requiredTargets: [{
      id: "target-main",
      navigationRole: "remote",
      standPositionMetersXYZ: [2, 0.5, 0],
    }],
    requiredGroundTraversalBands: [],
    visualTargetFacings: [],
    spaceTransitions: [],
    requireSingleReachableComponent: true,
  });
}

describe("Block World V2 checker", () => {
  it("accepts a connected meter-scale component and publishes meter metrics", () => {
    const report = check([
      block("ground-000", [0, 0, 0]),
      block("ground-001", [1, 0, 0]),
      block("ground-002", [2, 0, 0]),
    ]);
    expect(report).toMatchObject({
      status: "passed",
      diagnostics: [],
      metrics: {
        blockCount: 3,
        blockCountByShape: { full: 3, half: 0, quarter: 0, small: 0 },
        standablePositionCount: 3,
        reachablePositionCount: 3,
        reachableHorizontalSpanMetersXZ: [3, 1],
        maximumReachableDistanceMeters: 2,
      },
    });
  });

  it("admits the four grid-aligned shapes and rejects overlapping micro-cells", () => {
    const admitted = checkBlockWorldV2({
      manifest: createBlockWorldManifestV2([
        block("full-main", [0, 0, 0]),
        block("half-main", [1, 0.25, 0], BLOCK_PRESET_REFS_V1.obstacle, "half"),
        block("quarter-main", [2.25, 0.25, 0], BLOCK_PRESET_REFS_V1.obstacle, "quarter"),
        block("small-main", [2.75, 0.25, -0.25], BLOCK_PRESET_REFS_V1.obstacle, "small"),
      ]),
      world: WORLD,
      controlledSubject: CONTROLLED_SUBJECT,
      camera: CAMERA,
      subjectTraversalProfile: HUMANOID,
      spawnStandPositionMetersXYZ: [0, 0.5, 0],
      requiredTargets: [],
      requiredGroundTraversalBands: [],
      visualTargetFacings: [],
      spaceTransitions: [],
      requireSingleReachableComponent: true,
    });
    expect(admitted.diagnostics.map(({ code }) => code)).not.toContain("BLOCK_POSITION_INVALID");
    expect(admitted.metrics.blockCountByShape).toEqual({ full: 1, half: 1, quarter: 1, small: 1 });

    const overlap = checkBlockWorldV2({
      ...checkInput([block("full-main", [0, 0, 0])]),
      manifest: createBlockWorldManifestV2([
        block("full-main", [0, 0, 0]),
        block("small-overlap", [0.25, 0.25, 0.25], BLOCK_PRESET_REFS_V1.obstacle, "small"),
      ]),
    });
    expect(overlap.diagnostics.map(({ code }) => code)).toContain("BLOCK_OCCUPANCY_OVERLAP");
  });

  it("requires one semantic front for every non-subject visual group", () => {
    const landmark = block(
      "horse-main",
      [4, 1, 0],
      BLOCK_PRESET_REFS_V1.landmarkOrange,
      "full",
      "visual-target-2",
    );
    const missing = checkBlockWorldV2({
      ...checkInput([block("ground-main", [0, 0, 0]), landmark]),
      visualTargetFacings: [],
    });
    expect(missing.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_VISUAL_TARGET_FACING_MISSING",
    );

    const declared = checkBlockWorldV2({
      ...checkInput([block("ground-main", [0, 0, 0]), landmark]),
      visualTargetFacings: [{
        visualTargetId: "visual-target-2",
        frontYawQuarterTurnsY: 1,
      }],
    });
    expect(declared.diagnostics.map(({ code }) => code)).not.toContain(
      "BLOCK_VISUAL_TARGET_FACING_MISSING",
    );
    expect(declared.diagnostics.map(({ code }) => code)).not.toContain(
      "BLOCK_VISUAL_TARGET_FACING_INVALID",
    );
  });

  it("connects and counts a one-meter smoothed transition", () => {
    const report = checkBlockWorldV2({
      ...checkInput([
        block("ground-low", [0, 0, 0]),
        block("ground-high", [1, 1, 0]),
      ]),
      requiredTargets: [{
        id: "target-high",
        navigationRole: "remote",
        standPositionMetersXYZ: [1, 1.5, 0],
      }],
    });
    expect(report.status).toBe("passed");
    expect(report.metrics.smoothedWalkableEdgeCount).toBe(1);
  });

  it("requires an intermediate transition above one meter and rejects more than two", () => {
    const twoMeter = checkBlockWorldV2({
      ...checkInput([
        block("ground-low", [0, 0, 0]),
        block("ground-high", [1, 2, 0]),
      ]),
      requiredTargets: [{
        id: "target-high",
        navigationRole: "remote",
        standPositionMetersXYZ: [1, 2.5, 0],
      }],
    });
    expect(twoMeter.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "BLOCK_WORLD_TARGET_UNREACHABLE",
      "BLOCK_WORLD_WALKABLE_COMPONENT_DISCONNECTED",
    ]));
    const excessive = checkBlockWorldV2({
      ...checkInput([
        block("ground-low", [0, 0, 0]),
        block("ground-high", [1, 3, 0]),
      ]),
      requiredTargets: [],
    });
    expect(excessive.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_ADJACENT_WALKABLE_HEIGHT_DELTA_EXCEEDED",
    );
  });

  it("reports but does not reject disconnected ground for a free-space-capable Subject", () => {
    const report = checkBlockWorldV2({
      ...checkInput([
        block("ground-start", [0, 0, 0]),
        block("ground-remote", [8, 0, 0]),
      ]),
      requiredTargets: [{
        id: "remote-landing",
        navigationRole: "remote",
        standPositionMetersXYZ: [8, 0.5, 0],
      }],
      requireSingleReachableComponent: false,
    });

    expect(report.status).toBe("passed");
    expect(report.metrics.disconnectedStandablePositionCount).toBe(1);
    expect(report.metrics.reachableRequiredTargetCount).toBe(0);
    expect(report.diagnostics.map(({ code }) => code)).not.toContain(
      "BLOCK_WORLD_TARGET_UNREACHABLE",
    );
  });

  it("rejects a broken declared traversal band even when a wider detour keeps one global component", () => {
    const blocks: BlockInstanceV2[] = [];
    for (let z = 0; z <= 1; z += 1) {
      for (let x = 0; x <= 4; x += 1) {
        if (z === 0 && x === 2) continue;
        blocks.push(block(`ground-${x}-${z}`, [x, 0, z]));
      }
    }
    const source = {
      ...checkInput(blocks),
      requiredTargets: [{
        id: "far-side",
        navigationRole: "remote" as const,
        standPositionMetersXYZ: [4, 0.5, 0] as const,
      }],
      requiredGroundTraversalBands: [{
        id: "opening-ground-band",
        centerlineStandPositionsMetersXYZ: [
          [0, 0.5, 0],
          [4, 0.5, 0],
        ] as const,
        halfWidthMeters: 0.25,
        isBidirectional: true,
      }],
    };
    const blocked = checkBlockWorldV2(source);
    expect(blocked.metrics.disconnectedStandablePositionCount).toBe(0);
    expect(blocked.metrics.reachableRequiredTargetCount).toBe(1);
    expect(blocked.metrics.reachableRequiredGroundTraversalBandCount).toBe(0);
    expect(blocked.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_GROUND_TRAVERSAL_BAND_DISCONNECTED",
    );

    const admitted = checkBlockWorldV2({
      ...source,
      requiredGroundTraversalBands: [{
        ...source.requiredGroundTraversalBands[0]!,
        halfWidthMeters: 1.25,
      }],
    });
    expect(admitted.status, JSON.stringify(admitted.diagnostics)).toBe("passed");
    expect(admitted.metrics.reachableRequiredGroundTraversalBandCount).toBe(1);
  });

  it("uses the union of supports for a real meter footprint", () => {
    const narrow = checkBlockWorldV2({
      ...checkInput([
        block("small-only", [0.25, 0.25, 0.25], BLOCK_PRESET_REFS_V1.walkable, "small"),
      ]),
      subjectTraversalProfile: { ...HUMANOID, footprintRadiusMetersXZ: 0.35 },
      spawnStandPositionMetersXYZ: [0.25, 0.5, 0.25],
      requiredTargets: [],
    });
    expect(narrow.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "BLOCK_WORLD_NO_STANDABLE_POSITIONS",
      "BLOCK_WORLD_SPAWN_NOT_STANDABLE",
    ]));
    const full = checkBlockWorldV2({
      ...checkInput([block("ground-full", [0, 0, 0])]),
      subjectTraversalProfile: { ...HUMANOID, footprintRadiusMetersXZ: 0.35 },
      requiredTargets: [],
    });
    expect(full.status).toBe("passed");
  });

  it("connects separately built spaces through a checked directed interaction", () => {
    const transitionId = "gate-to-courtyard";
    const trigger = {
      ...block(
        "gate-trigger",
        [0, 1, 0],
        BLOCK_PRESET_REFS_V1.interactiveTrigger,
      ),
      interactionInstanceId: transitionId,
    };
    const report = checkBlockWorldV2({
      ...checkInput([
        block("entry-ground", [0, 0, 0]),
        block("courtyard-ground", [10, 0, 0]),
        trigger,
      ]),
      requiredTargets: [{
        id: "courtyard-target",
        navigationRole: "remote",
        standPositionMetersXYZ: [10, 0.5, 0],
      }],
      spaceTransitions: [{
        id: transitionId,
        kind: "door",
        triggerBlockId: trigger.id,
        sourceStandPositionMetersXYZ: [0, 0.5, 0],
        destinationStandPositionMetersXYZ: [10, 0.5, 0],
        destinationYawQuarterTurnsY: 2,
      }],
    });
    expect(report.status, JSON.stringify(report.diagnostics)).toBe("passed");
    expect(report.metrics).toMatchObject({
      reachablePositionCount: 2,
      disconnectedStandablePositionCount: 0,
      reachableRequiredTargetCount: 1,
      spaceTransitionCount: 1,
      reachableSpaceTransitionCount: 1,
    });
  });

  it("rejects a transition whose source block is not the matching trigger", () => {
    const report = checkBlockWorldV2({
      ...checkInput([
        block("entry-ground", [0, 0, 0]),
        block("courtyard-ground", [10, 0, 0]),
        block("fake-trigger", [0, 1, 0], BLOCK_PRESET_REFS_V1.obstacle),
      ]),
      spaceTransitions: [{
        id: "gate-to-courtyard",
        kind: "portal",
        triggerBlockId: "fake-trigger",
        sourceStandPositionMetersXYZ: [0, 0.5, 0],
        destinationStandPositionMetersXYZ: [10, 0.5, 0],
        destinationYawQuarterTurnsY: 0,
      }],
    });
    expect(report.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_SPACE_TRANSITION_TRIGGER_INVALID",
    );
  });

  it("rejects oversized composed ordinary humans", () => {
    const report = checkBlockWorldV2({
      ...checkInput([block("ground-full", [0, 0, 0])]),
      controlledSubject: {
        kind: "composed",
        entityId: "player-custom",
        visualTargetId: "visual-target-1",
        yawQuarterTurnsY: 0,
        definition: {
          id: "oversized-human",
          category: "human",
          bodyTopology: "biped",
          semanticClassId: "subject.human.oversized",
          displayName: "Oversized human",
          description: "Invalid ordinary human scale.",
          visualBinding: { kind: "static" },
          visualParts: [{
            id: "body-main",
            kind: "primitive",
            shape: { kind: "box", sizeMetersXYZ: [0.8, 3, 0.5] },
            positionMetersXYZ: [0, 1.5, 0],
            colliderContribution: "include",
            semanticTags: ["body", "human"],
          }],
        },
      },
      requiredTargets: [],
    });
    expect(report.diagnostics.map(({ code }) => code)).toContain("BLOCK_WORLD_SUBJECT_SCALE_INVALID");
  });

  it("requires a Subject Assembly to reference every extracted Mesh part exactly once", () => {
    const base = checkInput([block("ground-full", [0, 0, 0])]);
    const report = checkBlockWorldV2({
      ...base,
      controlledSubject: {
        kind: "assembly",
        entityId: "custom-player",
        visualTargetId: "visual-target-1",
        yawQuarterTurnsY: 0,
        assembly: {
          id: "custom-mesh-player",
          baseSubject: {
            kind: "custom-mesh",
            subjectMeshBindingIds: ["custom-body"],
            category: "custom",
            bodyTopology: "custom",
            semanticClassId: "subject.custom.mesh-player",
            displayName: "Custom Mesh Player",
            description: "A rigid custom player.",
          },
          attachments: [],
          motion: { motionPackId: "ground.root-standard" },
          presentation: { kind: "automatic" },
        },
      },
      subjectMeshParts: [
        {
          id: "custom-body",
          kind: "primitive",
          shape: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
          positionMetersXYZ: [0, 0.5, 0],
          colliderContribution: "include",
          semanticTags: ["body", "custom"],
        },
        {
          id: "unused-eye",
          kind: "primitive",
          shape: { kind: "sphere", radiusMeters: 0.2 },
          positionMetersXYZ: [0, 0.7, -0.5],
          colliderContribution: "exclude",
          semanticTags: ["eye"],
        },
      ],
      camera: {
        kind: "pack",
        entityId: "camera-main",
        cameraPackId: "third-person.standard",
        target: { kind: "assembly-bounds", heightRatio: 0.5 },
        aspectRatio: 16 / 9,
      },
      requiredTargets: [],
    });
    expect(report.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_SUBJECT_ASSEMBLY_INVALID",
    );
  });
});

function checkInput(blocks: readonly BlockInstanceV2[]) {
  return {
    manifest: createBlockWorldManifestV2(blocks),
    world: WORLD,
    controlledSubject: CONTROLLED_SUBJECT,
    camera: CAMERA,
    subjectTraversalProfile: HUMANOID,
    spawnStandPositionMetersXYZ: [0, 0.5, 0] as BlockPositionMetersXYZV2,
    requiredTargets: [] as const,
    requiredGroundTraversalBands: [] as const,
    visualTargetFacings: [] as const,
    spaceTransitions: [] as const,
    requireSingleReachableComponent: true,
  };
}
