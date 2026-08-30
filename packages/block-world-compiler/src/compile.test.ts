import { describe, expect, it } from "vitest";

import {
  BLOCK_PRESET_REFS_V1,
  blockWorldSpaceTransitionDestinationAnchorEntityIdV2,
  createBlockWorldManifestV2,
  type CheckBlockWorldInputV2,
} from "@whitebox-world/block-world";

import { compileBlockWorldV2 } from "./compile.js";

function input(reverse = false): CheckBlockWorldInputV2 {
  const blocks = [
    {
      id: "ground-000",
      presetRef: BLOCK_PRESET_REFS_V1.walkable,
      shape: "full" as const,
      positionMetersXYZ: [0, 0, 0] as const,
      rotationQuarterTurnsY: 0,
    },
    {
      id: "ground-001",
      presetRef: BLOCK_PRESET_REFS_V1.walkable,
      shape: "full" as const,
      positionMetersXYZ: [1, 0, 0] as const,
      rotationQuarterTurnsY: 0,
    },
    {
      id: "palace-main-000",
      presetRef: BLOCK_PRESET_REFS_V1.landmarkOrange,
      shape: "full" as const,
      positionMetersXYZ: [3, 1, 0] as const,
      rotationQuarterTurnsY: 1,
      visualGroupId: "visual-target-2",
    },
    {
      id: "cloud-main-000",
      presetRef: BLOCK_PRESET_REFS_V1.cloudPassable,
      shape: "full" as const,
      positionMetersXYZ: [0, 4, 0] as const,
      rotationQuarterTurnsY: 0,
    },
  ];
  return {
    manifest: createBlockWorldManifestV2(reverse ? [...blocks].reverse() : blocks),
    world: { id: "compiler-block-world", seed: 1024 },
    controlledSubject: {
      kind: "registered",
      entityId: "player",
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
      visualTargetId: "visual-target-1",
      yawQuarterTurnsY: 0,
    },
    camera: {
      entityId: "camera-main",
      pitchRadians: 0.12,
      distanceMeters: 5,
      targetHeightMeters: 1.25,
      fovDegrees: 56,
      aspectRatio: 16 / 9,
    },
    subjectTraversalProfile: {
      clearanceHeightMeters: 2,
      footprintRadiusMetersXZ: 0,
      maximumStepUpMeters: 1,
      maximumStepDownMeters: 1,
      maximumAutoSmoothHeightDeltaMeters: 1,
      maximumAdjacentWalkableHeightDeltaMeters: 2,
      canStandOnCloud: false,
    },
    spawnStandPositionMetersXYZ: [0, 0.5, 0],
    requiredTargets: [{
      id: "target-ground",
      navigationRole: "remote",
      standPositionMetersXYZ: [1, 0.5, 0],
    }],
    requiredGroundTraversalBands: [],
    spaceTransitions: [],
    requireSingleReachableComponent: true,
  };
}

describe("Block World internal compiler", () => {
  it("compiles one checked Manifest into the retained runtime transport", () => {
    const result = compileBlockWorldV2(input());
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.canonicalSceneExecutionPlan).toMatchObject({
      id: "compiler-block-world",
      schemaVersion: 1,
    });
    expect(result.worldRuntimeBootstrap).toMatchObject({
      initialControlledEntityId: "player",
      initialCamera: {
        cameraEntityId: "camera-main",
        targetEntityId: "player",
      },
    });
    expect(result.canonicalSceneExecutionPlan.terrain.maximumHeightMeters).toBeLessThan(-50);
    expect(result.canonicalSceneExecutionPlan.objects).toHaveLength(3);
    const ground = result.canonicalSceneExecutionPlan.objects.find(({ semanticClassId }) =>
      semanticClassId === "block.walkable.shape.full");
    expect(ground).toMatchObject({
      collisionEnabled: true,
      transform: { positionMetersXYZ: [0.5, 0, 0], scaleXYZ: [2, 1, 1] },
    });
    expect(result.canonicalSceneExecutionPlan.objects.find(({ semanticClassId }) =>
      semanticClassId === "block.cloud-passable.shape.full")?.collisionEnabled).toBe(false);
    const palace = result.canonicalSceneExecutionPlan.objects.find(({ semanticClassId }) =>
      semanticClassId === "block.landmark-orange.shape.full.visual-group.visual-target-2");
    expect(palace?.entityId).toMatch(/^bw-chunk-/);
    expect(result.implementationMapDraft.visualTargetMappings).toEqual([
      { visualTargetId: "visual-target-1", runtimeEntityIds: ["player"] },
      { visualTargetId: "visual-target-2", runtimeEntityIds: [palace?.entityId] },
    ]);
  });

  it("is deterministic for Agent construction order", () => {
    const first = compileBlockWorldV2(input(false));
    const reversed = compileBlockWorldV2(input(true));
    expect(first.ok).toBe(true);
    expect(reversed.ok).toBe(true);
    if (!first.ok || !reversed.ok) return;
    expect(reversed.authoringSpec).toEqual(first.authoringSpec);
    expect(reversed.canonicalSceneExecutionPlan).toEqual(first.canonicalSceneExecutionPlan);
  });

  it("preserves half, quarter-volume, and small base geometry through Authoring transport", () => {
    const source = input();
    const result = compileBlockWorldV2({
      ...source,
      manifest: createBlockWorldManifestV2([
        ...source.manifest.blocks,
        {
          id: "detail-half",
          presetRef: BLOCK_PRESET_REFS_V1.obstacle,
          shape: "half",
          positionMetersXYZ: [5, 0.25, 0],
          rotationQuarterTurnsY: 0,
        },
        {
          id: "detail-quarter",
          presetRef: BLOCK_PRESET_REFS_V1.obstacle,
          shape: "quarter",
          positionMetersXYZ: [6.25, 0.25, 0],
          rotationQuarterTurnsY: 0,
        },
        {
          id: "detail-small",
          presetRef: BLOCK_PRESET_REFS_V1.obstacle,
          shape: "small",
          positionMetersXYZ: [7.25, 0.25, 0.25],
          rotationQuarterTurnsY: 0,
        },
      ]),
    });
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.canonicalSceneExecutionPlan.objects.filter(({ semanticClassId }) =>
      semanticClassId.startsWith("block.obstacle.shape."))
      .map(({ primitive, semanticClassId }) => ({ primitive, semanticClassId })))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          semanticClassId: "block.obstacle.shape.half",
          primitive: { kind: "box", sizeMetersXYZ: [1, 0.5, 1] },
        }),
        expect.objectContaining({
          semanticClassId: "block.obstacle.shape.quarter",
          primitive: { kind: "box", sizeMetersXYZ: [0.5, 0.5, 1] },
        }),
        expect.objectContaining({
          semanticClassId: "block.obstacle.shape.small",
          primitive: { kind: "box", sizeMetersXYZ: [0.5, 0.5, 0.5] },
        }),
      ]));
  });

  it("compiles a checked space transition into one trigger identity and destination anchor", () => {
    const source = input();
    const transitionId = "gate-to-courtyard";
    const result = compileBlockWorldV2({
      ...source,
      manifest: createBlockWorldManifestV2([
        ...source.manifest.blocks.filter(({ id }) => id.startsWith("ground-")),
        {
          id: "courtyard-ground",
          presetRef: BLOCK_PRESET_REFS_V1.walkable,
          shape: "full",
          positionMetersXYZ: [10, 0, 0],
          rotationQuarterTurnsY: 0,
        },
        {
          id: "gate-trigger",
          presetRef: BLOCK_PRESET_REFS_V1.interactiveTrigger,
          shape: "full",
          positionMetersXYZ: [0, 1, 0],
          rotationQuarterTurnsY: 0,
          interactionInstanceId: transitionId,
        },
      ]),
      requiredTargets: [{
        id: "courtyard-target",
        navigationRole: "remote",
        standPositionMetersXYZ: [10, 0.5, 0],
      }],
      spaceTransitions: [{
        id: transitionId,
        kind: "portal",
        triggerBlockId: "gate-trigger",
        sourceStandPositionMetersXYZ: [0, 0.5, 0],
        destinationStandPositionMetersXYZ: [10, 0.5, 0],
        destinationYawQuarterTurnsY: 2,
      }],
    });
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.canonicalSceneExecutionPlan.objects.find(({ semanticClassId }) =>
      semanticClassId.endsWith(`.space-transition.${transitionId}`)))
      .toMatchObject({ collisionEnabled: false });
    const anchorId = blockWorldSpaceTransitionDestinationAnchorEntityIdV2(
      transitionId,
    );
    expect(result.canonicalSceneExecutionPlan.layout.placementsByEntityId[anchorId]).toMatchObject({
      transform: {
        positionMetersXYZ: [10, 0.5, 0],
        rotationEulerRadiansXYZ: [0, 3.141593, 0],
      },
    });
    expect(result.canonicalSceneExecutionPlan.traversal.anchorEntityIds).toContain(anchorId);
  });

  it("compiles a 64 by 64 open world into four chunk clusters", () => {
    const source = input();
    const blocks = Array.from({ length: 64 * 64 }, (_, index) => {
      const x = index % 64;
      const z = Math.floor(index / 64);
      return {
        id: `ground-${index.toString().padStart(4, "0")}`,
        presetRef: BLOCK_PRESET_REFS_V1.walkable,
        shape: "full" as const,
        positionMetersXYZ: [x, 0, z] as const,
        rotationQuarterTurnsY: 0,
      };
    });
    const result = compileBlockWorldV2({
      ...source,
      manifest: createBlockWorldManifestV2(blocks),
      requiredTargets: [{
        id: "far-corner",
        navigationRole: "remote",
        standPositionMetersXYZ: [63, 0.5, 63],
      }],
    });
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.checkReport.metrics).toMatchObject({
      blockCount: 4096,
      reachablePositionCount: 4096,
      reachableHorizontalSpanMetersXZ: [64, 64],
      reachableChunkCount: 4,
    });
    expect(result.canonicalSceneExecutionPlan.objects).toHaveLength(4);
    expect(result.canonicalSceneExecutionPlan.staticColliders).toHaveLength(4);
  });

  it("compiles more than one hundred thousand direct blocks without spread or recursive limits", () => {
    const source = input();
    const side = 320;
    const blocks = Array.from({ length: side * side }, (_, index) => ({
      id: `ground-${index.toString().padStart(6, "0")}`,
      presetRef: BLOCK_PRESET_REFS_V1.walkable,
      shape: "full" as const,
      positionMetersXYZ: [index % side, 0, Math.floor(index / side)] as const,
      rotationQuarterTurnsY: 0,
    }));
    const result = compileBlockWorldV2({
      ...source,
      manifest: createBlockWorldManifestV2(blocks),
      requiredTargets: [{
        id: "far-corner",
        navigationRole: "remote",
        standPositionMetersXYZ: [319, 0.5, 319],
      }],
    });
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.checkReport.metrics.blockCount).toBe(102_400);
    expect(result.checkReport.metrics.reachableChunkCount).toBe(100);
    expect(result.canonicalSceneExecutionPlan.objects).toHaveLength(100);
    expect(result.canonicalSceneExecutionPlan.staticColliders).toHaveLength(100);
  }, 15_000);

  it("fails before internal compilation when Block admission fails", () => {
    const invalid = input();
    const result = compileBlockWorldV2({
      ...invalid,
      spawnStandPositionMetersXYZ: [9, 9, 9],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_SPAWN_NOT_STANDABLE",
    );
  });

  it("does not let world blocks reuse the primary Subject visual target", () => {
    const source = input();
    const result = compileBlockWorldV2({
      ...source,
      manifest: createBlockWorldManifestV2(source.manifest.blocks.map((block) =>
        block.id === "palace-main-000"
          ? { ...block, visualGroupId: "visual-target-1" }
          : block)),
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "BLOCK_WORLD_VISUAL_TARGET_CONFLICT",
    );
  });

  it("compiles an Agent-composed primitive Subject as one controlled entity", () => {
    const source = input();
    const result = compileBlockWorldV2({
      ...source,
      controlledSubject: {
        kind: "composed",
        entityId: "fox-player",
        visualTargetId: "visual-target-1",
        yawQuarterTurnsY: 0,
        definition: {
          id: "nine-tail-fox-proxy",
          category: "animal",
          bodyTopology: "quadruped",
          semanticClassId: "subject.animal.nine-tail-fox",
          displayName: "Nine-tail fox whitebox",
          description: "One controlled primitive quadruped silhouette with nine rigid tails.",
          visualBinding: { kind: "static" },
          visualParts: [
            {
              id: "body-main",
              kind: "primitive",
              shape: {
                kind: "box",
                sizeMetersXYZ: [0.8, 0.7000000000000001, 1.5],
              },
              positionMetersXYZ: [Math.sin(Math.PI), 0.35000000000000003, -0],
              colliderContribution: "include",
              semanticTags: ["body", "quadruped"],
            },
            ...Array.from({ length: 9 }, (_, index) => ({
              id: `tail-${index + 1}`,
              kind: "primitive" as const,
              shape: { kind: "capsule" as const, radiusMeters: 0.08, heightMeters: 1.1 },
              positionMetersXYZ: [
                (index - 4) * 0.12,
                0.9,
                0.75,
              ] as const,
              rotationEulerRadiansXYZ: [0.8, 0, (index - 4) * 0.08] as const,
              colliderContribution: "exclude" as const,
              semanticTags: ["tail", "silhouette"],
            })),
          ],
        },
      },
    });
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.worldRuntimeBootstrap.initialControlledEntityId).toBe("fox-player");
    expect(result.worldRuntimeBootstrap.subjectRuntimeDescriptors[0]).toMatchObject({
      entityId: "fox-player",
      subjectDefinitionRef:
        "package://subject-definition/nine-tail-fox-proxy@1",
      visualParts: expect.arrayContaining([
        expect.objectContaining({ id: "body-main", kind: "primitive" }),
        expect.objectContaining({ id: "tail-9", kind: "primitive" }),
      ]),
    });
    const authoredDefinition = result.authoringSpec.resources.subjectDefinitions[0];
    expect(authoredDefinition?.visualParts[0]).toMatchObject({
      id: "body-main",
      shape: { kind: "box", sizeMetersXYZ: [0.8, 0.7, 1.5] },
      localTransform: {
        positionMetersXYZ: [0, 0.35, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
    });
  });
});
