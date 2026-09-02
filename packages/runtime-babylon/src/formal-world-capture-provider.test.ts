import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import type {
  BabylonNativeBlockMaterializerMetadataV1,
  FormalWorldCaptureRequestV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import { describe, expect, it, vi } from "vitest";

import {
  assertFormalCaptureLiveVisualRegistryV1,
  FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1,
  measureFormalTraversalCheckpointV1,
  selectFormalCommittedSupportContactV1,
  type FormalWorldCaptureProviderPortsV1,
} from "./formal-world-capture-provider.js";

function traversalSnapshot(
  runtimeSessionId: string,
  worldSessionId: string,
  simulationTick: number,
  positionMetersXYZ: readonly [number, number, number] = [0, 1, 0],
): WorldRuntimeSnapshotV4 {
  return {
    runtimeSessionId,
    worldSessionId,
    runtime: { phase: "ready" },
    resources: { phase: "ready" },
    world: {
      simulationTick,
      subjectStatesByEntityId: {
        player: {
          entityState: { positionMetersXYZ },
          capabilityStatesById: {
            locomotion: {
              kind: "locomotion-capability-state-v2",
              locomotion: {
                status: "active",
                movementMedium: "ground",
              },
            },
          },
        },
      },
    },
  } as unknown as WorldRuntimeSnapshotV4;
}

function traversalRequestFixture() {
  const criterion = {
    kind: "reach-bounds" as const,
    checkpointId: "spawn",
    expectation: "reach" as const,
    sourceVisualGroupId: "ground",
    sourceBoundsMeters: {
      minimumMetersXYZ: [-1, 0, -1] as const,
      maximumMetersXYZ: [1, 2, 1] as const,
    },
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  };
  return {
    semanticCaptureMap: { topologyRelations: [] },
    scriptedTraversal: {
      checks: ["first", "second"].map((id) => ({
        id,
        acceptanceTargetRef: `worldkit://acceptance-target/${id}@1`,
        checkExpectation: "pass" as const,
        fixedInputSequence: [{ actions: ["move-forward" as const], ticks: 1 }],
        checkpointCriteria: [criterion],
      })),
    },
  } as unknown as Parameters<
    typeof FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1.captureTraversalChecks
  >[0];
}

function traversalPorts(
  runtimeSessionId: string,
  failOnSecondCheck = false,
  fixedInputPositionMetersXYZ: readonly [number, number, number] = [0, 1, 0],
) {
  let resetCount = 0;
  let current = traversalSnapshot(runtimeSessionId, "world.uninitialized", 0);
  const ports: FormalWorldCaptureProviderPortsV1 = {
    resetWithInitialControlBinding: vi.fn(async () => {
      resetCount += 1;
      current = traversalSnapshot(runtimeSessionId, `world.${resetCount}`, 0);
      return current;
    }),
    awaitRenderReady: vi.fn(async () => {}),
    runFixedInput: vi.fn(async (input) => {
      if (failOnSecondCheck && resetCount === 2 && input.actions.length > 0) {
        throw new Error("injected traversal failure");
      }
      current = traversalSnapshot(
        runtimeSessionId,
        current.worldSessionId,
        current.world.simulationTick + input.ticks,
        input.actions.length === 0 ? [0, 1, 0] : fixedInputPositionMetersXYZ,
      );
      return current;
    }),
    snapshot: vi.fn(() => current),
    captureArtifactView: vi.fn(),
    readCommittedSupportEvidence: vi.fn(),
  };
  return { ports, resetCount: () => resetCount };
}

describe("formal world capture provider", () => {
  it("fails closed on missing, extra, foreign, or disposed visual handles without reading Mesh metadata", () => {
    // This catches a fallback to Scene/Mesh name, tag, or metadata inference
    // when the trusted profile registry is incomplete.
    const firstEngine = new NullEngine();
    const firstScene = new Scene(firstEngine);
    const secondEngine = new NullEngine();
    const secondScene = new Scene(secondEngine);
    const first = MeshBuilder.CreateBox("first", {}, firstScene);
    const second = MeshBuilder.CreateBox("second", {}, firstScene);
    const foreign = MeshBuilder.CreateBox("foreign", {}, secondScene);
    let metadataReadCount = 0;
    Object.defineProperty(first, "metadata", {
      configurable: true,
      get() {
        metadataReadCount += 1;
        throw new Error("metadata must not be read");
      },
      set() {},
    });
    const metadata = {
      blocks: [
        {
          blockId: "first",
          runtimeEntityId: "native-block:first",
          semanticCaptureClassId: "worldkit.native-block.group.route",
          visualGroupId: "route",
        },
        {
          blockId: "second",
          runtimeEntityId: "native-block:second",
          semanticCaptureClassId: "worldkit.native-block.group.route",
          visualGroupId: "route",
        },
      ],
      visualGroups: [{ visualGroupId: "route", blockIds: ["first", "second"] }],
    } as const;
    const valid = {
      kind: "babylon-native-block-live-handle-registry",
      schemaVersion: 1,
      realization: { kind: "authoring-unbatched" },
      blocks: [
        {
          kind: "independent-mesh",
          blockId: "first",
          runtimeEntityId: "native-block:first",
          semanticCaptureClassId: "worldkit.native-block.group.route",
          mesh: first,
        },
        {
          kind: "independent-mesh",
          blockId: "second",
          runtimeEntityId: "native-block:second",
          semanticCaptureClassId: "worldkit.native-block.group.route",
          mesh: second,
        },
      ],
      visualBatches: [],
      visualGroups: [{ visualGroupId: "route", blockHandles: [] }],
      walkableOverlays: [],
    } as const;
    const validRegistry = {
      ...valid,
      visualGroups: [{
        visualGroupId: "route",
        blockHandles: [valid.blocks[0], valid.blocks[1]],
      }],
    } as const;

    try {
      expect(() => assertFormalCaptureLiveVisualRegistryV1({
        scene: firstScene,
        materializerMetadata: metadata,
        liveHandleRegistry: validRegistry,
      })).not.toThrow();
      expect(metadataReadCount).toBe(0);

      expect(() => assertFormalCaptureLiveVisualRegistryV1({
        scene: firstScene,
        materializerMetadata: metadata,
        liveHandleRegistry: {
          ...validRegistry,
          blocks: validRegistry.blocks.slice(0, 1),
        },
      })).toThrowError(/LIVE_VISUAL/);
      expect(() => assertFormalCaptureLiveVisualRegistryV1({
        scene: firstScene,
        materializerMetadata: metadata,
        liveHandleRegistry: {
          ...validRegistry,
          blocks: [...validRegistry.blocks, {
            kind: "independent-mesh" as const,
            blockId: "extra",
            runtimeEntityId: "native-block:extra",
            semanticCaptureClassId: "worldkit.native-block.group.route",
            mesh: second,
          }],
        },
      })).toThrowError(/LIVE_VISUAL/);
      expect(() => assertFormalCaptureLiveVisualRegistryV1({
        scene: firstScene,
        materializerMetadata: metadata,
        liveHandleRegistry: {
          ...validRegistry,
          blocks: [
            validRegistry.blocks[0],
            { ...validRegistry.blocks[1], mesh: foreign },
          ],
          visualGroups: [{
            visualGroupId: "route",
            blockHandles: [
              validRegistry.blocks[0],
              { ...validRegistry.blocks[1], mesh: foreign },
            ],
          }],
        },
      })).toThrowError(/LIVE_VISUAL/);
      second.dispose();
      expect(() => assertFormalCaptureLiveVisualRegistryV1({
        scene: firstScene,
        materializerMetadata: metadata,
        liveHandleRegistry: validRegistry,
      })).toThrowError(/LIVE_VISUAL/);
      expect(metadataReadCount).toBe(0);
    } finally {
      firstScene.dispose();
      firstEngine.dispose();
      secondScene.dispose();
      secondEngine.dispose();
    }
  });

  it("derives asymmetric pass and block checkpoints only from frozen spatial criteria", () => {
    // This catches treating one sign convention as symmetric or copying a
    // Case expectation into the observed outcome.
    expect(measureFormalTraversalCheckpointV1({
      criterion: {
        kind: "pass-plane",
        checkpointId: "passed-east",
        expectation: "pass",
        sourceVisualGroupId: "gate",
        sourceBoundsMeters: {
          minimumMetersXYZ: [4, 0, -1],
          maximumMetersXYZ: [6, 2, 1],
        },
        axis: "x",
        sourceFace: "maximum",
        planeMeters: 6,
        expectedCenterSide: "positive",
        capsuleRadiusMeters: 0.5,
        toleranceMeters: 0.1,
      },
      startPositionMetersXYZ: [4, 1, 0],
      positionMetersXYZ: [6.6, 1, 0],
      tick: 7,
      isFinalTick: false,
    })).toEqual({ checkpointId: "passed-east", outcome: "passed", observedAtTick: 7 });

    expect(measureFormalTraversalCheckpointV1({
      criterion: {
        kind: "pass-plane",
        checkpointId: "blocked-east",
        expectation: "pass",
        sourceVisualGroupId: "gate",
        sourceBoundsMeters: {
          minimumMetersXYZ: [4, 0, -1],
          maximumMetersXYZ: [6, 2, 1],
        },
        axis: "x",
        sourceFace: "maximum",
        planeMeters: 6,
        expectedCenterSide: "positive",
        capsuleRadiusMeters: 0.5,
        toleranceMeters: 0.1,
      },
      startPositionMetersXYZ: [4, 1, 0],
      positionMetersXYZ: [5.2, 1, 0],
      tick: 8,
      isFinalTick: true,
    })).toEqual({ checkpointId: "blocked-east", outcome: "blocked", observedAtTick: 8 });

    expect(measureFormalTraversalCheckpointV1({
      criterion: {
        kind: "reach-bounds",
        checkpointId: "blocked-platform",
        expectation: "reach",
        sourceVisualGroupId: "platform",
        sourceBoundsMeters: {
          minimumMetersXYZ: [-1, 0, -4],
          maximumMetersXYZ: [1, 2, -2],
        },
        capsuleRadiusMeters: 0.35,
        toleranceMeters: 0.05,
      },
      startPositionMetersXYZ: [0, 1, 0],
      positionMetersXYZ: [0, 1, -1],
      tick: 9,
      isFinalTick: true,
    })).toEqual({
      checkpointId: "blocked-platform",
      outcome: "blocked",
      observedAtTick: 9,
    });

    expect(measureFormalTraversalCheckpointV1({
      criterion: {
        kind: "block-plane",
        checkpointId: "blocked-west",
        expectation: "block",
        sourceVisualGroupId: "wall",
        sourceBoundsMeters: {
          minimumMetersXYZ: [-6, 0, -1],
          maximumMetersXYZ: [-4, 2, 1],
        },
        colliderId: "west-wall",
        axis: "x",
        sourceFace: "minimum",
        planeMeters: -6,
        expectedCenterSide: "negative",
        capsuleRadiusMeters: 0.5,
        toleranceMeters: 0.1,
      },
      startPositionMetersXYZ: [-4, 1, 0],
      positionMetersXYZ: [-5.45, 1, 0],
      tick: 11,
      isFinalTick: true,
    })).toEqual({ checkpointId: "blocked-west", outcome: "blocked", observedAtTick: 11 });

    expect(measureFormalTraversalCheckpointV1({
      criterion: {
        kind: "block-plane",
        checkpointId: "blocked-west",
        expectation: "block",
        sourceVisualGroupId: "wall",
        sourceBoundsMeters: {
          minimumMetersXYZ: [-6, 0, -1],
          maximumMetersXYZ: [-4, 2, 1],
        },
        colliderId: "west-wall",
        axis: "x",
        sourceFace: "minimum",
        planeMeters: -6,
        expectedCenterSide: "negative",
        capsuleRadiusMeters: 0.5,
        toleranceMeters: 0.1,
      },
      startPositionMetersXYZ: [-4, 1, 0],
      positionMetersXYZ: [-6.6, 1, 0],
      tick: 10,
      isFinalTick: false,
    })).toEqual({ checkpointId: "blocked-west", outcome: "passed", observedAtTick: 10 });
  });

  it.each([
    ["never approaches the plane", [-4, 1, 0], [-4, 1, 0]],
    ["moves away from the plane", [-5.45, 1, 0], [-5.4, 1, 0]],
    ["starts beyond the blocker", [-6.6, 1, 0], [-5.45, 1, 0]],
  ] as const)("does not report a Block checkpoint when the subject %s", (
    _label,
    startPositionMetersXYZ,
    positionMetersXYZ,
  ) => {
    expect(measureFormalTraversalCheckpointV1({
      criterion: {
        kind: "block-plane",
        checkpointId: "blocked-west",
        expectation: "block",
        sourceVisualGroupId: "wall",
        sourceBoundsMeters: {
          minimumMetersXYZ: [-6, 0, -1],
          maximumMetersXYZ: [-4, 2, 1],
        },
        colliderId: "west-wall",
        axis: "x",
        sourceFace: "minimum",
        planeMeters: -6,
        expectedCenterSide: "negative",
        capsuleRadiusMeters: 0.5,
        toleranceMeters: 0.1,
      },
      startPositionMetersXYZ,
      positionMetersXYZ,
      tick: 11,
      isFinalTick: true,
    })).toBeUndefined();
  });

  it("measures contains and above from Package bounds instead of copying requested relations", () => {
    const bindings = [{
      topologyNodeId: "container",
      blockVisualGroupId: "decoy-container-group",
    }, {
      topologyNodeId: "inside",
      blockVisualGroupId: "decoy-inside-group",
    }, {
      topologyNodeId: "upper",
      blockVisualGroupId: "upper-group",
    }] as const;
    const metadata = {
      visualGroups: [{
        visualGroupId: "container-group",
        minimumMetersXYZ: [-5, 0, -5],
        maximumMetersXYZ: [5, 5, 5],
      }, {
        // Mere overlap with container, not containment.
        visualGroupId: "inside-group",
        minimumMetersXYZ: [4, 1, -1],
        maximumMetersXYZ: [6, 2, 1],
      }, {
        // These decoys overlap, proving Package measurement uses the explicit
        // relation joins rather than the topology-node display bindings.
        visualGroupId: "decoy-container-group",
        minimumMetersXYZ: [-2, 0, -2],
        maximumMetersXYZ: [2, 3, 2],
      }, {
        visualGroupId: "decoy-inside-group",
        minimumMetersXYZ: [-1, 1, -1],
        maximumMetersXYZ: [1, 2, 1],
      }, {
        // Horizontally overlaps container and is vertically above it.
        visualGroupId: "upper-group",
        minimumMetersXYZ: [-1, 5, -1],
        maximumMetersXYZ: [1, 7, 1],
      }],
    } as unknown as BabylonNativeBlockMaterializerMetadataV1;
    const request = {
      semanticCaptureMap: {
        bindings,
        topologyRelations: [{
          fromNodeId: "container",
          relation: "contains",
          toNodeId: "inside",
          measurementSource: "package-bounds",
          fromVisualGroupId: "container-group",
          toVisualGroupId: "inside-group",
        }, {
          fromNodeId: "upper",
          relation: "above",
          toNodeId: "container",
          measurementSource: "package-bounds",
          fromVisualGroupId: "upper-group",
          toVisualGroupId: "container-group",
        }],
      },
    } as unknown as FormalWorldCaptureRequestV1;

    expect(FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .measuredPackageRelations(request, metadata)).toEqual([{
        fromNodeId: "upper",
        relation: "above",
        toNodeId: "container",
      }]);
  });

  it("publishes SDK support and collider relations only after explicit identity joins", () => {
    const topologyRelations = [{
      fromNodeId: "subject-node",
      relation: "above" as const,
      toNodeId: "ground-node",
      measurementSource: "sdk-support" as const,
      subjectEntityId: "player",
      colliderId: "ground.collider",
    }, {
      fromNodeId: "wall-node",
      relation: "blocks" as const,
      toNodeId: "route-node",
      measurementSource: "sdk-collider" as const,
      colliderId: "wall.collider",
      sourceVisualGroupId: "wall-group",
    }, {
      fromNodeId: "decoy-node",
      relation: "blocks" as const,
      toNodeId: "route-node",
      measurementSource: "sdk-collider" as const,
      colliderId: "decoy.collider",
      sourceVisualGroupId: "wall-group",
    }] as const;
    const request = {
      semanticCaptureMap: { topologyRelations },
    } as unknown as FormalWorldCaptureRequestV1;
    const metadata = {
      visualGroups: [{ visualGroupId: "wall-group", blockIds: ["wall-block"] }],
    } as unknown as BabylonNativeBlockMaterializerMetadataV1;
    const colliders = [{
      colliderId: "wall.collider",
      sourceBlockIds: ["wall-block"],
      colliderSubshapeId: "wall.shape",
      chunkParts: [{
        chunkPartId: "wall.collider-grid-chunk-xp0-zp0",
        chunkResidencyGroupId: "grid-chunk-xp0-zp0",
        overlayRecordId: "wall.overlay",
        physicsResidency: {
          mode: "resident" as const,
          physicsBodyId: "wall.body",
        },
      }],
    }] as const;

    expect(FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .measuredSupportRelations(request, "player", "ground.collider"))
      .toEqual([{ fromNodeId: "subject-node", relation: "above", toNodeId: "ground-node" }]);
    expect(FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .measuredSupportRelations(request, "other", "ground.collider"))
      .toEqual([]);
    expect(FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .measuredColliderRelations(request, metadata, colliders))
      .toEqual([{ fromNodeId: "wall-node", relation: "blocks", toNodeId: "route-node" }]);
  });

  it("keeps one logical collider observation across resident and non-resident Chunk parts", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const liveMesh = MeshBuilder.CreateBox("live-part", {}, scene);
    const positions = [
      -1, 0, -1,
      1, 0, -1,
      1, 0, 1,
      -1, 0, 1,
    ] as const;
    const indices = [0, 1, 2, 0, 2, 3] as const;
    const parts = ["xp0", "xp1"].map((suffix, index) => ({
      colliderId: "ground.collider",
      chunkPartId: `ground.collider-grid-chunk-${suffix}-zp0`,
      chunkResidencyGroupId: `grid-chunk-${suffix}-zp0`,
      runtimeRole: "scene-static-collider" as const,
      colliderSubshapeId: "ground.shape",
      sourceBlockIds: ["ground-block"],
      overlayRecordId: `ground.overlay.${index}`,
      worldPositionsMetersXYZ: positions,
      triangleIndices: indices,
      partHash: `sha256:${String(index + 1).repeat(64)}` as const,
    }));
    const registry = {
      kind: "babylon-native-live-collider-registry",
      schemaVersion: 1,
      residency: {
        chunkPolicyHash: `sha256:${"a".repeat(64)}`,
        partitionHash: `sha256:${"b".repeat(64)}`,
        logicalColliderCount: 1,
        partCount: 2,
        activePartCount: 1,
        peakActivePartCount: 1,
      },
      parts,
      colliders: [{
        ...parts[0],
        physicsBodyId: "ground.body.0",
        mesh: liveMesh,
        body: { isDisposed: false },
      }],
    } as unknown as Parameters<
      typeof FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1.validateColliderRegistry
    >[2];
    const verified = {
      nativeSceneContribution: {
        staticColliders: [{
          id: "ground.collider",
          runtimeRole: "scene-static-collider",
          colliderSubshapeId: "ground.shape",
        }],
      },
    } as unknown as Parameters<
      typeof FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1.validateColliderRegistry
    >[0];
    const metadata = {
      colliderJoins: [{
        colliderId: "ground.collider",
        sourceBlockIds: ["ground-block"],
      }],
    } as unknown as BabylonNativeBlockMaterializerMetadataV1;

    try {
      expect(FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
        .validateColliderRegistry(verified, metadata, registry)).toEqual([{
        colliderId: "ground.collider",
        sourceBlockIds: ["ground-block"],
        colliderSubshapeId: "ground.shape",
        chunkParts: [{
          chunkPartId: "ground.collider-grid-chunk-xp0-zp0",
          chunkResidencyGroupId: "grid-chunk-xp0-zp0",
          overlayRecordId: "ground.overlay.0",
          physicsResidency: {
            mode: "resident",
            physicsBodyId: "ground.body.0",
          },
        }, {
          chunkPartId: "ground.collider-grid-chunk-xp1-zp0",
          chunkResidencyGroupId: "grid-chunk-xp1-zp0",
          overlayRecordId: "ground.overlay.1",
          physicsResidency: { mode: "not-resident" },
        }],
      }]);

      const overlay = FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
        .materializeColliderOverlayMeshes(scene, registry);
      expect(overlay.meshes).toHaveLength(2);
      expect(overlay.meshes.every((mesh) => !mesh.isDisposed())).toBe(true);
      overlay.dispose();
      expect(overlay.meshes.every((mesh) => mesh.isDisposed())).toBe(true);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("rejects stale and ambiguous committed support evidence", () => {
    // This catches accepting a support sample from before the neutral settling
    // Tick or arbitrarily choosing one of two supporting collider identities.
    const contact = {
      pointMetersXYZ: [0, 0, 0] as const,
      normalXYZ: [0, 1, 0] as const,
      distanceMeters: 0.01,
      motionType: "static" as const,
      colliderId: "ground",
      colliderSubshapeId: "ground.shape",
      logicalSubshapeId: "ground.surface",
      traversalSurfaceId: "ground.traversal",
      surfaceEntityId: "ground.entity",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    };
    const evidence = {
      schemaVersion: 1 as const,
      tick: 1,
      sampledControllerCenterMetersXYZ: [0, 1, 0] as const,
      sampledFootPointMetersXYZ: [0, 0.01, 0] as const,
      support: {
        mode: "supported" as const,
        pointMetersXYZ: [0, 0, 0] as const,
        normalXYZ: [0, 1, 0] as const,
        isDynamic: false,
      },
      contacts: [contact],
    };

    expect(() => selectFormalCommittedSupportContactV1({
      evidence,
      committedTick: 2,
    })).toThrowError(/STALE/);
    expect(() => selectFormalCommittedSupportContactV1({
      evidence: {
        ...evidence,
        contacts: [contact, {
          ...contact,
          colliderId: "other-ground",
          colliderSubshapeId: "other-ground.shape",
        }],
      },
      committedTick: 1,
    })).toThrowError(/AMBIGUOUS/);
    expect(() => selectFormalCommittedSupportContactV1({
      evidence: {
        ...evidence,
        contacts: [contact, {
          pointMetersXYZ: [0, 0, 0],
          normalXYZ: [0, 1, 0],
          distanceMeters: 0.02,
          motionType: "static",
        }],
      },
      committedTick: 1,
    })).toThrowError(/UNJOINABLE/);
    expect(selectFormalCommittedSupportContactV1({
      evidence,
      committedTick: 1,
    })).toEqual(contact);

    const contribution = {
      id: "ground",
      runtimeRole: "scene-static-collider",
      colliderSubshapeId: "ground.shape",
      geometryHash: `sha256:${"b".repeat(64)}`,
      worldPositionsMetersXYZ: [0, 0, 0],
      triangleIndices: [0, 0, 0],
      vertexCount: 1,
      triangleCount: 1,
      frictionRatio: 0.5,
      restitutionRatio: 0,
      traversalBinding: {
        kind: "static-surface" as const,
        logicalSubshapeId: "ground.surface",
        traversalSurfaceId: "ground.traversal",
        surfaceEntityId: "ground.entity",
        traversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      },
    } as const;
    expect(() => FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .assertFormalSupportContactContributionIdentityV1(
        contact,
        contribution,
      )).not.toThrow();
    expect(() => FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .assertFormalSupportContactContributionIdentityV1(
        { ...contact, traversalSurfaceId: "drifted" },
        contribution,
      )).toThrowError(/IDENTITY_MISMATCH/);
    expect(() => FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .assertFormalSupportContactContributionIdentityV1(
        { ...contact, traversalSurfaceProfileRef: "worldkit://drifted@1" },
        contribution,
      )).toThrowError(/IDENTITY_MISMATCH/);
  });

  it("uses a fresh settled world session for every scripted check", async () => {
    const runtimeSessionId = "runtime.formal.provider-test";
    const { ports, resetCount } = traversalPorts(runtimeSessionId);

    const checks = await FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .captureTraversalChecks(
        traversalRequestFixture(),
        runtimeSessionId,
        "player",
        ports,
      );

    expect(checks.map(({ resetReadySnapshot }) =>
      resetReadySnapshot.worldSessionId)).toEqual(["world.1", "world.2"]);
    expect(checks.map(({ resetReadySnapshot }) =>
      resetReadySnapshot.world.simulationTick)).toEqual([1, 1]);
    expect(checks.map(({ fixedTicks }) => fixedTicks[0]?.tick)).toEqual([2, 2]);
    expect(resetCount()).toBe(2);
    expect(ports.awaitRenderReady).toHaveBeenCalledTimes(4);
  });

  it("accepts a mixed block check only when every frozen criterion has its own outcome", async () => {
    const runtimeSessionId = "runtime.formal.provider-mixed-block";
    const { ports } = traversalPorts(runtimeSessionId, false, [0, 1, 0.65]);
    const request = {
      semanticCaptureMap: { topologyRelations: [{
        fromNodeId: "route",
        relation: "blocks" as const,
        toNodeId: "gate",
        measurementSource: "scripted-traversal" as const,
        traversalCheckId: "blocked-gate",
      }] },
      scriptedTraversal: {
        checks: [{
          id: "blocked-gate",
          acceptanceTargetRef: "worldkit://acceptance-target/blocked-gate@1",
          checkExpectation: "block" as const,
          fixedInputSequence: [{ actions: ["move-forward" as const], ticks: 1 }],
          checkpointCriteria: [{
            kind: "reach-bounds" as const,
            checkpointId: "approach",
            expectation: "reach" as const,
            sourceVisualGroupId: "route",
            sourceBoundsMeters: {
              minimumMetersXYZ: [-1, 0, -1] as const,
              maximumMetersXYZ: [1, 2, 1] as const,
            },
            capsuleRadiusMeters: 0.35,
            toleranceMeters: 0.05,
          }, {
            kind: "block-plane" as const,
            checkpointId: "gate",
            expectation: "block" as const,
            sourceVisualGroupId: "gate",
            sourceBoundsMeters: {
              minimumMetersXYZ: [-1, 0, 1] as const,
              maximumMetersXYZ: [1, 2, 2] as const,
            },
            colliderId: "gate.collider",
            axis: "z" as const,
            sourceFace: "minimum" as const,
            planeMeters: 1,
            expectedCenterSide: "positive" as const,
            capsuleRadiusMeters: 0.35,
            toleranceMeters: 0.05,
          }, {
            kind: "pass-plane" as const,
            checkpointId: "threshold",
            expectation: "pass" as const,
            sourceVisualGroupId: "route",
            sourceBoundsMeters: {
              minimumMetersXYZ: [-1, 0, -2] as const,
              maximumMetersXYZ: [1, 2, -1] as const,
            },
            axis: "z" as const,
            sourceFace: "maximum" as const,
            planeMeters: -1,
            expectedCenterSide: "positive" as const,
            capsuleRadiusMeters: 0.35,
            toleranceMeters: 0.05,
          }],
        }],
      },
    } as unknown as Parameters<
      typeof FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1.captureTraversalChecks
    >[0];

    const checks = await FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .captureTraversalChecks(request, runtimeSessionId, "player", ports);

    expect(checks).toHaveLength(1);
    expect(checks[0]?.outcome).toBe("blocked");
    expect(checks[0]?.checkpoints).toEqual([
      { checkpointId: "approach", outcome: "reached", observedAtTick: 2 },
      { checkpointId: "gate", outcome: "blocked", observedAtTick: 2 },
      { checkpointId: "threshold", outcome: "passed", observedAtTick: 2 },
    ]);
    expect(checks[0]?.observedTopologyRelations).toEqual([{
      fromNodeId: "route",
      relation: "blocks",
      toNodeId: "gate",
    }]);
  });

  it("rejects a partial scripted run without exposing successful check payload", async () => {
    const runtimeSessionId = "runtime.formal.provider-partial-failure";
    const { ports, resetCount } = traversalPorts(runtimeSessionId, true);
    let payload: unknown;

    try {
      payload = await FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
        .captureTraversalChecks(
          traversalRequestFixture(),
          runtimeSessionId,
          "player",
          ports,
        );
    } catch (error) {
      expect(error).toEqual(new Error("injected traversal failure"));
    }

    expect(payload).toBeUndefined();
    expect(resetCount()).toBe(2);
  });

  it("publishes a measured blocked checkpoint when a pass traversal misses its target", async () => {
    const runtimeSessionId = "runtime.formal.provider-pass-blocked";
    const { ports } = traversalPorts(
      runtimeSessionId,
      false,
      [5, 1, 5],
    );
    const fixture = traversalRequestFixture();
    const checks = await FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .captureTraversalChecks(fixture, runtimeSessionId, "player", ports);

    expect(checks).toHaveLength(2);
    expect(checks.every(({ outcome }) => outcome === "passed")).toBe(true);
    expect(checks.map(({ checkpoints }) => checkpoints)).toEqual([
      [{ checkpointId: "spawn", outcome: "blocked", observedAtTick: 2 }],
      [{ checkpointId: "spawn", outcome: "blocked", observedAtTick: 2 }],
    ]);
    expect(checks.every(({ observedTopologyRelations }) =>
      observedTopologyRelations.length === 0)).toBe(true);
  });

  it("still rejects a block check that cannot prove contact with its frozen face", async () => {
    const runtimeSessionId = "runtime.formal.provider-block-unmeasured";
    const { ports } = traversalPorts(runtimeSessionId, false, [0, 1, 0]);
    const fixture = traversalRequestFixture();
    const request = {
      ...fixture,
      scriptedTraversal: {
        ...fixture.scriptedTraversal,
        checks: [{
          ...fixture.scriptedTraversal.checks[0]!,
          checkExpectation: "block" as const,
          checkpointCriteria: [{
            kind: "block-plane" as const,
            checkpointId: "gate",
            expectation: "block" as const,
            sourceVisualGroupId: "gate",
            sourceBoundsMeters: {
              minimumMetersXYZ: [-1, 0, 1] as const,
              maximumMetersXYZ: [1, 2, 2] as const,
            },
            colliderId: "gate.collider",
            axis: "z" as const,
            sourceFace: "minimum" as const,
            planeMeters: 1,
            expectedCenterSide: "positive" as const,
            capsuleRadiusMeters: 0.35,
            toleranceMeters: 0.05,
          }],
        }],
      },
    } as Parameters<
      typeof FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1.captureTraversalChecks
    >[0];

    await expect(FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .captureTraversalChecks(request, runtimeSessionId, "player", ports))
      .rejects.toThrow("BABYLON_FORMAL_CAPTURE_BLOCK_CHECKPOINT_UNMEASURED");
  });

  it("freezes the rendered controlled Subject projection for the opening gate", () => {
    const projected = FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .controlledSubjectProjection({
        projectedBoundsByEntityId: {
          player: {
            centerRatioXY: [0.5, 0.48],
            sizeRatioXY: [0.15, 0.4],
          },
        },
      } as never, "player");

    expect(projected).toEqual({
      subjectEntityId: "player",
      centerXBasisPoints: 5_000,
      centerYBasisPoints: 4_800,
      widthBasisPoints: 1_500,
      heightBasisPoints: 4_000,
      coverageBasisPoints: 600,
    });
    expect(Object.isFrozen(projected)).toBe(true);
    expect(() => FORMAL_WORLD_CAPTURE_PROVIDER_TEST_HARNESS_V1
      .controlledSubjectProjection({ projectedBoundsByEntityId: {} } as never, "player"))
      .toThrow("BABYLON_FORMAL_CAPTURE_CONTROLLED_SUBJECT_PROJECTION_MISSING");
  });
});
